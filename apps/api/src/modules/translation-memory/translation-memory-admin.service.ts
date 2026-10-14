import { BadRequestException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PropertyTypeTemplateNode, TranslationMemory } from '../../database/entities';
import type { TranslationMemoryKind } from '../../database/entities';
import { TenantService } from '../tenant/tenant.service';
import { parseCsv } from '../location-template/location-template.service';
import { TranslationMemoryService, Translations, isGap, memoryKey } from './translation-memory.service';

export const MEMORY_KINDS: TranslationMemoryKind[] = ['label', 'feature', 'property_type'];

// Where each kind lives in the client tables.
const TABLES: Record<TranslationMemoryKind, { table: string; column: string }> = {
  label: { table: 'labels', column: 'translations' },
  feature: { table: 'features', column: 'name' },
  property_type: { table: 'property_types', column: 'name' },
};

export interface MemoryChange {
  key: string;
  lang: string;
  // The memory text before the edit: clients still showing it get the new
  // text. Null fills gaps only.
  oldText: string | null;
  newText: string;
}

export interface PushResult {
  rowsUpdated: number;
  clientsUpdated: number;
  customisedKept: number;
}

export interface MemoryListItem {
  kind: TranslationMemoryKind;
  sourceKey: string;
  english: string;
  translations: Record<string, { text: string; source: string }>;
}

interface TenantRow {
  id: number;
  tenantId: number;
  tr: Translations;
}

// Super Admin → Translation Memory: browse and correct the shared
// translations, and push corrections to every client that still shows the
// old wording. A client's own wording is never touched.
@Injectable()
export class TranslationMemoryAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TranslationMemoryAdminService.name);

  constructor(
    @InjectRepository(TranslationMemory)
    private readonly memoryRepository: Repository<TranslationMemory>,
    @InjectRepository(PropertyTypeTemplateNode)
    private readonly typeNodeRepository: Repository<PropertyTypeTemplateNode>,
    private readonly dataSource: DataSource,
    private readonly memory: TranslationMemoryService,
    private readonly tenantService: TenantService,
  ) {}

  // An empty memory learns from what clients already have, once, so it saves
  // tokens from the first import after deploy.
  onApplicationBootstrap(): void {
    setTimeout(() => {
      this.memoryRepository
        .count()
        .then((n) => (n === 0 ? this.seedFromClients() : null))
        .then((r) => r && this.logger.log(`Translation memory seeded: ${r.added} entries`))
        .catch((err) => this.logger.warn(`Translation memory seed skipped: ${(err as Error).message}`));
    }, 30_000).unref?.();
  }

  async list(opts: { kind?: string; q?: string; page?: number; limit?: number }): Promise<{
    items: MemoryListItem[];
    total: number;
    languages: string[];
  }> {
    const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
    const page = Math.max(Number(opts.page) || 1, 1);
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.kind && MEMORY_KINDS.includes(opts.kind as TranslationMemoryKind)) {
      where.push('kind = ?');
      params.push(opts.kind);
    }
    const q = String(opts.q ?? '').trim();
    if (q) {
      where.push('(sourceKey LIKE ? OR text LIKE ?)');
      params.push(`%${q.toLowerCase()}%`, `%${q}%`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [{ total }] = await this.memoryRepository.query(
      `SELECT COUNT(*) AS total FROM (SELECT 1 FROM translation_memory ${w} GROUP BY kind, sourceKey) t`,
      params,
    );
    const keys: { kind: TranslationMemoryKind; sourceKey: string }[] = await this.memoryRepository.query(
      `SELECT kind, sourceKey FROM translation_memory ${w} GROUP BY kind, sourceKey ORDER BY sourceKey, kind LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    const rows = keys.length
      ? await this.memoryRepository.find({ where: { sourceKey: In(keys.map((k) => k.sourceKey)) } })
      : [];
    const items = keys.map((k) => {
      const translations: MemoryListItem['translations'] = {};
      for (const r of rows) {
        if (r.kind === k.kind && r.sourceKey === k.sourceKey) translations[r.lang] = { text: r.text, source: r.source };
      }
      return { kind: k.kind, sourceKey: k.sourceKey, english: translations.en?.text || k.sourceKey, translations };
    });
    const langs: { lang: string }[] = await this.memoryRepository.query(
      `SELECT DISTINCT lang FROM translation_memory WHERE lang <> 'en' ORDER BY lang`,
    );
    return { items, total: Number(total), languages: langs.map((l) => l.lang) };
  }

  // A Super Admin correction: saved as 'admin' (AI never overwrites it) and
  // pushed to every client still showing the old text or missing it.
  async save(kind: TranslationMemoryKind, english: string, lang: string, text: string): Promise<PushResult> {
    const key = memoryKey(english);
    const l = String(lang ?? '').trim().toLowerCase();
    const t = String(text ?? '').trim();
    if (!key || !/^[a-z]{2}(-[a-z]{2})?$/.test(l) || l === 'en') throw new BadRequestException('Unknown term or language');
    if (!t) throw new BadRequestException('Enter a translation');
    const old = await this.memoryRepository.findOne({ where: { kind, sourceKey: key, lang: l } });
    await this.memory.remember(kind, [{ en: english, lang: l, text: t }], 'admin');
    return this.push(kind, [{ key, lang: l, oldText: old?.text ?? null, newText: t }]);
  }

  async remove(kind: TranslationMemoryKind, sourceKey: string, lang?: string): Promise<{ removed: number }> {
    const where: Record<string, string> = { kind, sourceKey };
    if (lang) where.lang = lang;
    const res = await this.memoryRepository.delete(where);
    return { removed: res.affected ?? 0 };
  }

  // Fills every client's missing translations from memory (the languages its
  // website uses). Existing text is left as it is.
  async applyAll(): Promise<PushResult> {
    const total: PushResult = { rowsUpdated: 0, clientsUpdated: 0, customisedKept: 0 };
    const tenants = new Set<number>();
    for (const kind of MEMORY_KINDS) {
      const rows = await this.memoryRepository.find({ where: { kind } });
      const changes = rows
        .filter((r) => r.lang !== 'en')
        .map((r) => ({ key: r.sourceKey, lang: r.lang, oldText: null, newText: r.text }));
      const res = await this.push(kind, changes, tenants, false);
      total.rowsUpdated += res.rowsUpdated;
      total.customisedKept += res.customisedKept;
    }
    await this.bump(tenants, 'translation memory apply');
    total.clientsUpdated = tenants.size;
    return total;
  }

  // Writes memory changes into client rows. A language is replaced when the
  // client still has the old memory text, or fills a gap in a language its
  // website uses. Anything else is the client's own wording and stays.
  async push(
    kind: TranslationMemoryKind,
    changes: MemoryChange[],
    tenants = new Set<number>(),
    bump = true,
  ): Promise<PushResult> {
    const byKey = new Map<string, MemoryChange[]>();
    for (const c of changes) byKey.set(c.key, [...(byKey.get(c.key) || []), c]);
    if (!byKey.size) return { rowsUpdated: 0, clientsUpdated: 0, customisedKept: 0 };

    const rows = await this.loadRows(kind, byKey.size <= 100 ? [...byKey.keys()] : null);
    const { table, column } = TABLES[kind];
    let rowsUpdated = 0;
    let customisedKept = 0;
    for (const row of rows) {
      const list = byKey.get(memoryKey(row.tr.en) || '');
      if (!list) continue;
      const langs = await this.memory.tenantLanguages(row.tenantId);
      const next = { ...row.tr };
      let changed = false;
      for (const c of list) {
        const cur = next[c.lang]?.trim();
        if (cur === c.newText) continue;
        const wasMemory = c.oldText != null && cur === c.oldText.trim();
        if (wasMemory || (isGap(next, c.lang) && langs.includes(c.lang))) {
          next[c.lang] = c.newText;
          changed = true;
        } else if (cur && !isGap(next, c.lang)) {
          customisedKept++;
        }
      }
      if (!changed) continue;
      await this.dataSource.query(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [JSON.stringify(next), row.id]);
      rowsUpdated++;
      tenants.add(row.tenantId);
    }
    if (bump) await this.bump(tenants, 'translation memory edit');
    return { rowsUpdated, clientsUpdated: tenants.size, customisedKept };
  }

  // Learns from every client's existing translations: for each term and
  // language the wording most clients use. Only adds what memory lacks.
  async seedFromClients(): Promise<{ added: number }> {
    const before = await this.memoryRepository.count();
    for (const kind of MEMORY_KINDS) {
      const votes = new Map<string, Map<string, number>>();
      const english = new Map<string, string>();
      // One vote per client for each wording, so a client with many copies
      // of a term can't outvote the rest.
      const voted = new Set<string>();
      for (const row of await this.loadRows(kind, null)) {
        const key = memoryKey(row.tr.en);
        if (!key) continue;
        if (!english.has(key)) english.set(key, row.tr.en);
        for (const [lang, text] of Object.entries(row.tr)) {
          if (lang === 'en' || isGap(row.tr, lang)) continue;
          const id = `${key}\u0000${lang}`;
          const ballot = `${row.tenantId}\u0000${id}`;
          if (voted.has(ballot)) continue;
          voted.add(ballot);
          const v = votes.get(id) || new Map<string, number>();
          v.set(text.trim(), (v.get(text.trim()) || 0) + 1);
          votes.set(id, v);
        }
      }
      if (kind === 'property_type') {
        // The type template's translations are curated: they win the vote.
        for (const n of await this.typeNodeRepository.find({ select: ['id', 'name', 'translations'] })) {
          const key = memoryKey(n.name);
          if (!key) continue;
          english.set(key, n.name);
          for (const [lang, text] of Object.entries(n.translations || {})) {
            if (text?.trim()) votes.set(`${key}\u0000${lang}`, new Map([[text.trim(), Number.MAX_SAFE_INTEGER]]));
          }
        }
      }
      const entries = [...votes.entries()].map(([id, v]) => {
        const [key, lang] = id.split('\u0000');
        const best = [...v.entries()].sort((a, b) => b[1] - a[1])[0][0];
        return { en: english.get(key) || key, lang, text: best };
      });
      await this.memory.remember(kind, entries, 'seed');
    }
    return { added: (await this.memoryRepository.count()) - before };
  }

  async exportCsv(): Promise<string> {
    const rows = await this.memoryRepository.find({ order: { kind: 'ASC', sourceKey: 'ASC' } });
    const langs = [...new Set(rows.map((r) => r.lang))].filter((l) => l !== 'en').sort();
    const terms = new Map<string, { kind: string; tr: Translations }>();
    for (const r of rows) {
      const id = `${r.kind}\u0000${r.sourceKey}`;
      const t = terms.get(id) || { kind: r.kind, tr: { en: r.sourceKey } };
      t.tr[r.lang] = r.text;
      terms.set(id, t);
    }
    const lines = [['Kind', 'English', ...langs].map(csvCell).join(',')];
    for (const t of terms.values()) {
      lines.push([t.kind, t.tr.en, ...langs.map((l) => t.tr[l] ?? '')].map(csvCell).join(','));
    }
    return lines.join('\r\n');
  }

  // Kind, English, then one column per language. Every filled cell that
  // differs from memory becomes a correction and is pushed to clients.
  async importCsv(text: string): Promise<{ rows: number; changed: number } & PushResult> {
    const records = parseCsv(text);
    if (records.length < 2) throw new BadRequestException('The file has no rows');
    const header = records[0].map((h) => h.trim().toLowerCase());
    const iKind = header.indexOf('kind');
    const iEn = header.indexOf('english');
    if (iKind < 0 || iEn < 0) throw new BadRequestException('Expected Kind and English columns (see Export CSV)');
    const langCols = header
      .map((h, i) => ({ i, lang: h }))
      .filter((c) => c.i !== iKind && c.i !== iEn && /^[a-z]{2}(-[a-z]{2})?$/.test(c.lang) && c.lang !== 'en');

    const total: PushResult = { rowsUpdated: 0, clientsUpdated: 0, customisedKept: 0 };
    const tenants = new Set<number>();
    let changed = 0;
    for (const kind of MEMORY_KINDS) {
      const recs = records.slice(1).filter((r) => (r[iKind] || '').trim() === kind && memoryKey(r[iEn]));
      if (!recs.length) continue;
      const existing = await this.memory.lookup(kind, recs.map((r) => r[iEn]));
      const entries: { en: string; lang: string; text: string }[] = [];
      const changes: MemoryChange[] = [];
      for (const r of recs) {
        const key = memoryKey(r[iEn])!;
        for (const { i, lang } of langCols) {
          const t = (r[i] || '').trim();
          const old = existing.get(key)?.[lang] ?? null;
          if (!t || t === old) continue;
          entries.push({ en: r[iEn], lang, text: t });
          changes.push({ key, lang, oldText: old, newText: t });
        }
      }
      if (!entries.length) continue;
      await this.memory.remember(kind, entries, 'admin');
      const res = await this.push(kind, changes, tenants, false);
      total.rowsUpdated += res.rowsUpdated;
      total.customisedKept += res.customisedKept;
      changed += entries.length;
    }
    await this.bump(tenants, 'translation memory import');
    total.clientsUpdated = tenants.size;
    return { rows: records.length - 1, changed, ...total };
  }

  // Client rows of a kind, optionally only those whose English matches keys.
  private async loadRows(kind: TranslationMemoryKind, keys: string[] | null): Promise<TenantRow[]> {
    const { table, column } = TABLES[kind];
    const en = `LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(${column}, '$.en'))))`;
    const raw: { id: number; tenantId: number; tr: unknown }[] = keys
      ? await this.dataSource.query(`SELECT id, tenantId, ${column} AS tr FROM ${table} WHERE ${en} IN (?)`, [keys])
      : await this.dataSource.query(`SELECT id, tenantId, ${column} AS tr FROM ${table}`);
    const out: TenantRow[] = [];
    for (const r of raw) {
      let tr = r.tr;
      if (typeof tr === 'string') {
        try {
          tr = JSON.parse(tr);
        } catch {
          continue;
        }
      }
      if (tr && typeof tr === 'object' && !Array.isArray(tr)) out.push({ id: r.id, tenantId: r.tenantId, tr: tr as Translations });
    }
    return out;
  }

  private async bump(tenants: Set<number>, reason: string): Promise<void> {
    for (const id of tenants) await this.tenantService.bumpSyncVersionSafely(id, reason);
  }
}

function csvCell(v: string): string {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
