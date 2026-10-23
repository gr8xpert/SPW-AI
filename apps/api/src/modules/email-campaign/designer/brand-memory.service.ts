import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantBrandMemory } from '../../../database/entities';

export const MAX_NOTES = 20;
export const MAX_NOTE_CHARS = 200;

// Short notes about one client's taste ("dark blue and gold", "no emojis")
// that every new design starts with. The client can read and edit them.
@Injectable()
export class BrandMemoryService {
  constructor(@InjectRepository(TenantBrandMemory) private readonly repo: Repository<TenantBrandMemory>) {}

  async get(tenantId: number): Promise<string[]> {
    const row = await this.repo.findOne({ where: { tenantId } });
    return Array.isArray(row?.notes) ? row!.notes.filter((n) => typeof n === 'string') : [];
  }

  // One line each (line breaks collapsed), at most MAX_NOTE_CHARS, no
  // case-insensitive duplicates (the first one wins), newest MAX_NOTES kept.
  async set(tenantId: number, notes: string[]): Promise<string[]> {
    const clean: string[] = [];
    for (const raw of notes) {
      const n = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_CHARS).trim();
      if (n && !clean.some((c) => c.toLowerCase() === n.toLowerCase())) clean.push(n);
    }
    const kept = clean.slice(-MAX_NOTES);
    await this.repo.save({ tenantId, notes: kept } as TenantBrandMemory);
    return kept;
  }

  async add(tenantId: number, notes: string[]): Promise<void> {
    if (!notes.length) return;
    await this.set(tenantId, [...(await this.get(tenantId)), ...notes]);
  }
}
