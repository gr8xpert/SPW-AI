import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { EmailTemplate, EmailTemplateVersion, type VersionSource } from '../../../database/entities';

export const MAX_VERSIONS = 50;

export interface VersionSummary {
  id: number;
  source: VersionSource;
  subject: string;
  bytes: number;
  createdAt: Date;
}

// Every saved state of a template, so the editor can undo and restore.
@Injectable()
export class TemplateVersionService {
  constructor(
    @InjectRepository(EmailTemplateVersion)
    private readonly versions: Repository<EmailTemplateVersion>,
    @InjectRepository(EmailTemplate)
    private readonly templates: Repository<EmailTemplate>,
  ) {}

  // The new version and the pruning of old ones are one transaction. Pass
  // `em` to join a transaction the caller already runs (template save).
  async record(
    tenantId: number,
    templateId: number,
    v: { bodyHtml: string; subject: string; source: VersionSource },
    em?: EntityManager,
  ): Promise<EmailTemplateVersion | null> {
    if (!em) return this.versions.manager.transaction((m) => this.record(tenantId, templateId, v, m));
    const repo = em.getRepository(EmailTemplateVersion);
    const latest = await repo.findOne({ where: { tenantId, templateId }, order: { id: 'DESC' } });
    if (latest && latest.bodyHtml === v.bodyHtml && latest.subject === v.subject) return null;
    const saved = await repo.save(repo.create({ tenantId, templateId, ...v }));
    const old = await repo.find({ where: { tenantId, templateId }, order: { id: 'DESC' }, skip: MAX_VERSIONS, take: 1000, select: ['id'] });
    if (old.length) await repo.delete(old.map((o) => o.id));
    return saved;
  }

  async hasAny(tenantId: number, templateId: number, em?: EntityManager): Promise<boolean> {
    const repo = em ? em.getRepository(EmailTemplateVersion) : this.versions;
    return !!(await repo.findOne({ where: { tenantId, templateId }, order: { id: 'DESC' }, select: ['id'] }));
  }

  // Sizes come from the database (OCTET_LENGTH): the bodies are not loaded.
  async list(tenantId: number, templateId: number): Promise<VersionSummary[]> {
    // Same answer as the other template endpoints for a template that is not the client's.
    const own = await this.templates.findOne({ where: { id: templateId, tenantId }, select: ['id'] });
    if (!own) throw new NotFoundException('Template not found');
    const rows: Array<{ id: unknown; source: VersionSource; subject: string; bytes: unknown; createdAt: unknown }> = await this.versions
      .createQueryBuilder('v')
      .select('v.id', 'id')
      .addSelect('v.source', 'source')
      .addSelect('v.subject', 'subject')
      .addSelect('OCTET_LENGTH(v.bodyHtml)', 'bytes')
      .addSelect('v.createdAt', 'createdAt')
      .where('v.tenantId = :tenantId AND v.templateId = :templateId', { tenantId, templateId })
      .orderBy('v.id', 'DESC')
      .limit(MAX_VERSIONS)
      .getRawMany();
    return rows.map((r) => ({
      id: Number(r.id),
      source: r.source,
      subject: r.subject,
      bytes: Number(r.bytes) || 0,
      createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(String(r.createdAt)),
    }));
  }

  async get(tenantId: number, templateId: number, versionId: number): Promise<EmailTemplateVersion> {
    const row = await this.versions.findOne({ where: { id: versionId, tenantId, templateId } });
    if (!row) throw new NotFoundException('Version not found');
    return row;
  }

  // The template and its "restore" version are saved together.
  async restore(tenantId: number, templateId: number, versionId: number): Promise<EmailTemplate> {
    const v = await this.get(tenantId, templateId, versionId);
    const template = await this.templates.findOne({ where: { id: templateId, tenantId } });
    if (!template) throw new NotFoundException('Template not found');
    await this.templates.manager.transaction(async (em) => {
      await em.getRepository(EmailTemplate).update({ id: templateId, tenantId }, { bodyHtml: v.bodyHtml, subject: v.subject });
      await this.record(tenantId, templateId, { bodyHtml: v.bodyHtml, subject: v.subject, source: 'restore' }, em);
    });
    template.bodyHtml = v.bodyHtml;
    template.subject = v.subject;
    return template;
  }
}
