import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PropertyTypeTemplateNode, Tenant, TranslationMemory } from '../../database/entities';
import type { TranslationMemoryKind } from '../../database/entities';
import { AiService, ChatMessage } from '../ai/ai.service';
import { DEFAULT_LABELS } from '../label/default-labels';
import { MemoryEntry, TranslationMemoryService, isTermLike, memoryKey } from './translation-memory.service';
import { MEMORY_KINDS, PushResult, TranslationMemoryAdminService } from './translation-memory-admin.service';

// Every language a client can switch on (Settings → Languages).
export const MEMORY_LANGUAGES: Record<string, string> = {
  es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch', it: 'Italian', ru: 'Russian',
  sv: 'Swedish', no: 'Norwegian', da: 'Danish', pl: 'Polish', cs: 'Czech', fi: 'Finnish',
};

export const FILL_QUEUE = 'translation-memory-fill';
const TERMS_PER_CALL = 40;
const PARALLEL = 4;

export interface FillStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  languages: string[];
  terms: number;
  total: number;
  done: number;
  translated: number;
  failed: number;
  push: PushResult | null;
  error: string | null;
}

const IDLE: FillStatus = {
  running: false, startedAt: null, finishedAt: null, languages: [], terms: 0,
  total: 0, done: 0, translated: 0, failed: 0, push: null, error: null,
};

// Fills the memory itself: every term clients use (and every default
// label), in every language, translated by AI on the platform key, many
// terms per call. Then every client gets the languages its website uses.
// Paid once for the whole platform instead of once per client.
//
// Runs as a BullMQ job: the API is two processes (pm2 cluster), so the job
// and its progress live in Redis - one process runs it, both report it.
@Injectable()
export class TranslationMemoryFillService {
  private readonly logger = new Logger(TranslationMemoryFillService.name);

  constructor(
    @InjectRepository(TranslationMemory)
    private readonly memoryRepository: Repository<TranslationMemory>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(PropertyTypeTemplateNode)
    private readonly typeNodeRepository: Repository<PropertyTypeTemplateNode>,
    private readonly dataSource: DataSource,
    private readonly memory: TranslationMemoryService,
    private readonly admin: TranslationMemoryAdminService,
    private readonly aiService: AiService,
    @InjectQueue(FILL_QUEUE)
    private readonly queue: Queue,
  ) {}

  // The newest run: in progress, or the last one that finished.
  async getStatus(): Promise<FillStatus> {
    const jobs = await this.queue.getJobs(['active', 'waiting', 'delayed', 'completed', 'failed'], 0, 20);
    const job = jobs.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp)[0];
    return job ? this.toStatus(job) : IDLE;
  }

  private async toStatus(job: Job): Promise<FillStatus> {
    const state = await job.getState();
    const running = ['active', 'waiting', 'delayed', 'prioritized', 'waiting-children'].includes(state);
    const progress = (typeof job.progress === 'object' && job.progress) || {};
    const result = (job.returnvalue as Partial<FillStatus> | null) || {};
    return {
      ...IDLE,
      languages: job.data?.languages || [],
      ...progress,
      ...result,
      running,
      startedAt: new Date(job.processedOn || job.timestamp).toISOString(),
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      error: state === 'failed' ? job.failedReason || 'Failed' : null,
    } as FillStatus;
  }

  // The languages a fill covers by default (page and nightly run): every
  // language any client has switched on, plus every language the memory
  // already holds, so a language translated once stays covered.
  async defaultLanguages(): Promise<string[]> {
    const held: { lang: string }[] = await this.memoryRepository.query(
      `SELECT lang FROM translation_memory WHERE lang <> 'en' GROUP BY lang HAVING COUNT(*) >= 20`,
    );
    const set = new Set([...(await this.clientLanguages()), ...held.map((h) => h.lang)]);
    return [...set].filter((l) => MEMORY_LANGUAGES[l]).sort();
  }

  // Languages any client has switched on.
  async clientLanguages(): Promise<string[]> {
    const rows: { langs: unknown }[] = await this.tenantRepository.query(
      `SELECT JSON_EXTRACT(settings, '$.languages') AS langs FROM tenants`,
    );
    const set = new Set<string>(['es']);
    for (const r of rows) {
      let v = r.langs;
      if (typeof v === 'string') {
        try {
          v = JSON.parse(v);
        } catch {
          continue;
        }
      }
      if (Array.isArray(v)) for (const l of v) if (typeof l === 'string' && MEMORY_LANGUAGES[l]) set.add(l);
    }
    return [...set].sort();
  }

  // Queues a fill; a second click while one runs just returns its progress.
  async start(languages?: string[], jobId?: string): Promise<FillStatus> {
    const current = await this.getStatus();
    if (current.running) return current;
    const langs = (languages?.length ? languages : await this.defaultLanguages()).filter((l) => MEMORY_LANGUAGES[l]);
    const job = await this.queue.add('fill', { languages: langs }, {
      jobId,
      attempts: 1,
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 20 },
    });
    return this.toStatus(job);
  }

  // Nightly: terms that arrived during the day (new feed features, new
  // types) get translated, and clients get them. Both API processes fire
  // the cron; the dated job id lets only the first one queue it.
  @Cron('15 4 * * *')
  async nightly(): Promise<void> {
    if (!this.aiService.hasPlatformKey()) return;
    await this.start(undefined, `nightly-${new Date().toISOString().slice(0, 10)}`);
  }

  // The work itself, called by the queue worker. `report` saves progress
  // into the job, where both processes can read it.
  async run(langs: string[], report: (s: Partial<FillStatus>) => Promise<void>): Promise<Partial<FillStatus>> {
    const status: Partial<FillStatus> = { languages: langs, terms: 0, total: 0, done: 0, translated: 0, failed: 0 };
    await report(status);
    await this.collectTerms();
    const jobs: { kind: TranslationMemoryKind; lang: string; terms: string[] }[] = [];
    let terms = 0;
    for (const kind of MEMORY_KINDS) {
      const rows: { sourceKey: string; lang: string; text: string }[] = await this.memoryRepository.query(
        'SELECT sourceKey, lang, text FROM translation_memory WHERE kind = ?',
        [kind],
      );
      const english = new Map<string, string>();
      const have = new Set<string>();
      for (const r of rows) {
        // Only terms go into a shared call (see isTermLike).
        if (r.lang === 'en') {
          if (isTermLike(r.text)) english.set(r.sourceKey, r.text);
        }
        else have.add(`${r.sourceKey}\u0000${r.lang}`);
      }
      terms += english.size;
      for (const lang of langs) {
        const missing = [...english.entries()].filter(([key]) => !have.has(`${key}\u0000${lang}`)).map(([, en]) => en);
        for (let i = 0; i < missing.length; i += TERMS_PER_CALL) {
          jobs.push({ kind, lang, terms: missing.slice(i, i + TERMS_PER_CALL) });
        }
      }
    }
    status.terms = terms;
    status.total = jobs.length;
    await report(status);
    this.logger.log(`Translation memory fill: ${terms} terms, ${jobs.length} AI call(s) for [${langs.join(', ')}]`);

    let next = 0;
    const lanes = Array.from({ length: Math.min(PARALLEL, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          const learned = await this.translateBatch(job.terms, job.lang);
          await this.memory.remember(job.kind, learned);
          status.translated! += learned.length;
          status.failed! += job.terms.length - learned.length;
        } catch (err) {
          status.failed! += job.terms.length;
          this.logger.warn(`Translation memory fill: ${job.kind} → ${job.lang} failed: ${(err as Error).message}`);
        }
        status.done!++;
        await report(status).catch(() => undefined);
      }
    });
    await Promise.all(lanes);

    // Every client gets what is now known, in the languages it uses.
    status.push = await this.admin.applyAll();
    this.logger.log(
      `Translation memory fill done: ${status.translated} translated, ${status.failed} failed; ` +
        `${status.push.rowsUpdated} client row(s) updated`,
    );
    return status;
  }

  // Every English term clients use, the default labels and the type
  // template, so the fill covers words nobody has translated yet.
  private async collectTerms(): Promise<void> {
    const terms: Record<TranslationMemoryKind, string[]> = {
      label: DEFAULT_LABELS.map((dl) => dl.translations.en),
      feature: [],
      property_type: (await this.typeNodeRepository.find({ select: ['id', 'name'] })).map((n) => n.name),
    };
    const sources: [TranslationMemoryKind, string, string][] = [
      ['label', 'labels', 'translations'],
      ['feature', 'features', 'name'],
      ['property_type', 'property_types', 'name'],
    ];
    for (const [kind, table, column] of sources) {
      const rows: { en: string | null }[] = await this.dataSource.query(
        `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(${column}, '$.en')) AS en FROM ${table}`,
      );
      for (const r of rows) if (r.en && r.en !== 'null') terms[kind].push(r.en);
    }
    for (const kind of MEMORY_KINDS) {
      await this.memory.addTerms(kind, terms[kind]);
    }
  }

  // One AI call: up to 40 English terms into one language, on the platform
  // key (this is platform work, not a client's).
  private async translateBatch(terms: string[], lang: string): Promise<MemoryEntry[]> {
    const input: Record<string, string> = {};
    terms.forEach((t, i) => (input[String(i + 1)] = t));
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          `You are a translator for a real estate website. Translate each value (a UI label, property feature or property type) ` +
          `from English to ${MEMORY_LANGUAGES[lang] || lang}. Keep it short, as it would appear on a property portal. ` +
          `Keep placeholders like {n} exactly as they are. Return ONLY valid JSON with the same keys. No markdown.`,
      },
      { role: 'user', content: JSON.stringify(input) },
    ];
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await this.aiService.chatCompletion(0, messages, { temperature: 0.2, keySource: 'platform' });
        const parsed = JSON.parse(response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
        const out: MemoryEntry[] = [];
        terms.forEach((en, i) => {
          const text = parsed?.[String(i + 1)];
          if (typeof text === 'string' && text.trim() && memoryKey(en)) out.push({ en, lang, text: text.trim() });
        });
        return out;
      } catch (err) {
        if (attempt >= 2) throw err;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }
}
