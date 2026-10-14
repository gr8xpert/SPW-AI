import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Tenant, TranslationMemory } from '../../database/entities';
import type { TranslationMemoryKind, TranslationMemorySource } from '../../database/entities';
import { DEFAULT_LABELS } from '../label/default-labels';

export type Translations = Record<string, string>;

export interface MemoryEntry {
  en: string;
  lang: string;
  text: string;
}

// The memory key for an English text: trimmed, spaces collapsed, lower-case.
// Null when there is nothing to key on (or it is too long to be a term).
export function memoryKey(text: string | null | undefined): string | null {
  const k = String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return k && k.length <= 255 ? k : null;
}

// The default labels' English: platform text, so long sentences are fine.
const DEFAULT_LABEL_KEYS = new Set(DEFAULT_LABELS.map((dl) => memoryKey(dl.translations.en)).filter(Boolean));

// What may become a shared term. A client's own English is shared only when
// it looks like a term (a feature or type name), not a sentence: text long
// enough to carry instructions could steer the AI's other answers in the
// same call, and every client would get the result.
export function isTermLike(en: string): boolean {
  const key = memoryKey(en);
  if (!key) return false;
  if (DEFAULT_LABEL_KEYS.has(key)) return true;
  return key.length <= 60 && key.split(' ').length <= 8 && !/[\r\n<>]|https?:|www\./i.test(en);
}

// Placeholders like {n} are fine when the English has the same ones.
export function isSafeShared(text: string, en = ''): boolean {
  if (text.length > 200 || /[<>]|https?:|www\./i.test(text)) return false;
  const holders = (s: string) => (s.match(/\{[^{}]*\}/g) || []).sort().join('');
  return !/[{}]/.test(text.replace(/\{[a-z_]+\}/gi, '')) && holders(text) === holders(en);
}

// A language still needs a translation when it is empty or just repeats the
// English (imports create { en: name, es: name } as a placeholder).
export function isGap(record: Translations | null | undefined, lang: string): boolean {
  if (lang === 'en') return false;
  const v = record?.[lang]?.trim();
  return !v || v === record?.en?.trim();
}

// Shared translations of labels, features and property types. Everything
// else in the system reads and writes it through here: AI results are
// remembered, imports and new clients are filled from it, and Super Admin
// corrections live in it.
@Injectable()
export class TranslationMemoryService {
  private readonly logger = new Logger(TranslationMemoryService.name);
  private readonly langCache = new Map<number, { langs: string[]; at: number }>();

  constructor(
    @InjectRepository(TranslationMemory)
    private readonly memoryRepository: Repository<TranslationMemory>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  // Remembered translations for these English texts: key → { lang: text }.
  async lookup(kind: TranslationMemoryKind, enTexts: string[]): Promise<Map<string, Translations>> {
    const keys = [...new Set(enTexts.map(memoryKey).filter((k): k is string => !!k))];
    const out = new Map<string, Translations>();
    for (let i = 0; i < keys.length; i += 500) {
      const rows = await this.memoryRepository.find({
        where: { kind, sourceKey: In(keys.slice(i, i + 500)) },
        select: ['sourceKey', 'lang', 'text'],
      });
      for (const r of rows) {
        const entry = out.get(r.sourceKey) || {};
        entry[r.lang] = r.text;
        out.set(r.sourceKey, entry);
      }
    }
    return out;
  }

  // The record with every gap in `langs` that memory knows filled in.
  // Text a client already has is never replaced.
  applyTo(record: Translations, remembered: Translations | undefined, langs: string[]): { record: Translations; filled: string[] } {
    if (!remembered) return { record, filled: [] };
    const next = { ...record };
    const filled: string[] = [];
    for (const lang of langs) {
      const text = remembered[lang];
      if (!text || !isGap(next, lang) || next[lang] === text) continue;
      next[lang] = text;
      filled.push(lang);
    }
    return { record: next, filled };
  }

  async fill(kind: TranslationMemoryKind, record: Translations, langs: string[]): Promise<Translations> {
    const key = memoryKey(record.en);
    if (!key) return record;
    try {
      const found = await this.lookup(kind, [record.en]);
      return this.applyTo(record, found.get(key), langs).record;
    } catch (err) {
      // Memory is a saving, never a reason for an import or save to fail.
      this.logger.warn(`Translation memory lookup failed: ${(err as Error).message}`);
      return record;
    }
  }

  // Fill for a client: every language its website uses.
  async fillForTenant(tenantId: number, kind: TranslationMemoryKind, record: Translations): Promise<Translations> {
    return this.fill(kind, record, await this.tenantLanguages(tenantId));
  }

  // The languages a client's website uses (Settings → Languages), plus
  // Spanish, which every row has carried since the start.
  async tenantLanguages(tenantId: number): Promise<string[]> {
    const cached = this.langCache.get(tenantId);
    if (cached && Date.now() - cached.at < 60_000) return cached.langs;
    let langs = ['en', 'es'];
    try {
      const tenant = await this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
      const set = (tenant?.settings as any)?.languages;
      if (Array.isArray(set)) langs = [...new Set([...langs, ...set.filter((l: unknown) => typeof l === 'string')])];
    } catch (err) {
      this.logger.warn(`Could not read languages for tenant ${tenantId}: ${(err as Error).message}`);
    }
    this.langCache.set(tenantId, { langs, at: Date.now() });
    return langs;
  }

  // Saves translations. An 'admin' entry (a Super Admin correction) is only
  // replaced by another admin edit; 'seed' only adds what is missing.
  async remember(kind: TranslationMemoryKind, entries: MemoryEntry[], source: TranslationMemorySource = 'ai'): Promise<void> {
    const rows = new Map<string, [string, string, string]>();
    const english = new Map<string, [string, string, string]>();
    for (const e of entries) {
      const key = memoryKey(e.en);
      const text = String(e.text ?? '').trim();
      const lang = String(e.lang ?? '').trim().toLowerCase();
      if (!key || !text || !lang || lang === 'en' || lang.length > 10) continue;
      // Shared with every client: nothing that could carry markup or a link,
      // and nothing longer than a label (an AI answer steered by injected
      // text tends to be neither).
      if (source !== 'admin' && !this.acceptable(String(e.en), text)) continue;
      rows.set(`${key}\u0000${lang}`, [key, lang, text]);
      // The English as written, so Super Admin shows "Swimming Pool", not the key.
      if (!english.has(key)) english.set(key, [key, 'en', String(e.en).replace(/\s+/g, ' ').trim()]);
    }
    if (!rows.size) return;
    // Same order everywhere, so parallel saves lock rows in the same order.
    const all = [...rows.values()].sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1));
    try {
      await this.insertIgnore(kind, [...english.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1)), source);
      for (let i = 0; i < all.length; i += 200) {
        const chunk = all.slice(i, i + 200);
        const values = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const params = chunk.flatMap(([key, lang, text]) => [kind, key, lang, text, source]);
        // AI answers and seeds only add what is missing: the first wording
        // stays until Super Admin changes it, so one client's run can't
        // rewrite what every other client gets.
        if (source !== 'admin') {
          await this.insertIgnore(kind, chunk, source);
          continue;
        }
        await this.query(
          `INSERT INTO translation_memory (kind, sourceKey, lang, text, source) VALUES ${values}
           ON DUPLICATE KEY UPDATE
             text = VALUES(text),
             source = VALUES(source)`,
          params,
        );
      }
    } catch (err) {
      this.logger.warn(`Translation memory save failed: ${(err as Error).message}`);
    }
  }

  // Saves running side by side (a fill runs 4 at once) can deadlock on the
  // unique key; MySQL rolls one back, and running it again succeeds.
  private async query(sql: string, params: unknown[]): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.memoryRepository.query(sql, params);
        return;
      } catch (err) {
        const code = (err as { errno?: number }).errno;
        if ((code !== 1213 && code !== 1205) || attempt >= 4) throw err;
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt + Math.random() * 200));
      }
    }
  }

  // An AI or seeded translation fit to share: a term, safe text, and about
  // as long as its English (a hijacked answer rarely is).
  private acceptable(en: string, text: string): boolean {
    return isTermLike(en) && isSafeShared(text, en) && text.length <= en.length * 3 + 20;
  }

  // English terms with no translation yet, so a fill knows to translate them.
  async addTerms(kind: TranslationMemoryKind, enTexts: string[]): Promise<void> {
    const rows = new Map<string, [string, string, string]>();
    for (const en of enTexts) {
      const key = memoryKey(en);
      if (key && isTermLike(en) && !rows.has(key)) rows.set(key, [key, 'en', String(en).replace(/\s+/g, ' ').trim()]);
    }
    await this.insertIgnore(kind, [...rows.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1)), 'seed');
  }

  private async insertIgnore(kind: TranslationMemoryKind, rows: [string, string, string][], source: TranslationMemorySource): Promise<void> {
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await this.query(
        `INSERT IGNORE INTO translation_memory (kind, sourceKey, lang, text, source) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
        chunk.flatMap(([key, lang, text]) => [kind, key, lang, text, source]),
      );
    }
  }
}
