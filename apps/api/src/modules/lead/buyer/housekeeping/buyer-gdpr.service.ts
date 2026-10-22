import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { UploadService } from '../../../upload/upload.service';
import { BuyerService } from '../buyer.service';
import type { BuyerViewer } from '../buyer-access';

// Milestone J, GDPR: consent, unsubscribe / subscribe again (agent or the
// buyer's own link) and erasure.

const CONSENT_SOURCES = ['website', 'form', 'email', 'phone', 'in_person', 'import', 'other'];

@Injectable()
export class BuyerGdprService {
  private readonly logger = new Logger(BuyerGdprService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly buyers: BuyerService,
    private readonly uploads: UploadService,
  ) {}

  async setConsent(tenantId: number, viewer: BuyerViewer, id: number, on: boolean, source?: string): Promise<{ consentAt: Date | null; consentSource: string | null }> {
    const lead = await this.buyers.get(tenantId, viewer, id);
    this.assertNotErased(lead);
    if (on && source && !CONSENT_SOURCES.includes(source)) throw new BadRequestException('Unknown consent source');
    const consentAt = on ? lead.consentAt ?? new Date() : null;
    const consentSource = on ? source ?? lead.consentSource ?? 'other' : null;
    await this.db.query('UPDATE leads SET consentAt = ?, consentSource = ? WHERE id = ?', [consentAt, consentSource, id]);
    await this.buyers.log(id, viewer.id, 'note', on ? `Consent to be contacted recorded (${consentSource})` : 'Consent withdrawn', { consent: on, source: consentSource }, false);
    return { consentAt, consentSource };
  }

  async setSubscribed(tenantId: number, viewer: BuyerViewer, id: number, subscribed: boolean): Promise<{ unsubscribedAt: Date | null }> {
    const lead = await this.buyers.get(tenantId, viewer, id);
    this.assertNotErased(lead);
    return this.apply(id, subscribed, viewer.id, 'agent');
  }

  // From the buyer's own link (public). subscribed null = only read the
  // state (the GET). Returns what the page needs.
  async fromLink(leadId: number, subscribed: boolean | null): Promise<{ agency: string; color: string; lang: string; subscribed: boolean } | null> {
    const rows: { id: number; erasedAt: Date | null; mergedIntoId: number | null; language: string | null; settings: string | TenantSettings | null; name: string; unsubscribedAt: Date | null }[] =
      await this.db.query(
        `SELECT l.id, l.erasedAt, l.mergedIntoId, l.language, l.unsubscribedAt, t.settings, t.name
         FROM leads l JOIN tenants t ON t.id = l.tenantId WHERE l.id = ?`,
        [leadId],
      );
    const row = rows[0];
    // A merged buyer's old link acts on the kept record.
    if (row?.mergedIntoId) return this.fromLink(row.mergedIntoId, subscribed);
    if (!row || row.erasedAt) return null;
    const settings = ((typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) || {}) as TenantSettings & { companyName?: string; primaryColor?: string };
    if (subscribed !== null && !!row.unsubscribedAt === subscribed) await this.apply(row.id, subscribed, null, 'link');
    return {
      agency: settings.companyName || row.name,
      color: /^#[0-9a-f]{6}$/i.test(settings.primaryColor ?? '') ? settings.primaryColor! : '#1e293b',
      lang: (row.language || settings.defaultLanguage || 'en').slice(0, 2),
      subscribed: subscribed ?? !row.unsubscribedAt,
    };
  }

  private async apply(id: number, subscribed: boolean, userId: number | null, by: 'agent' | 'link'): Promise<{ unsubscribedAt: Date | null }> {
    const unsubscribedAt = subscribed ? null : new Date();
    await this.db.query('UPDATE leads SET unsubscribedAt = ? WHERE id = ?', [unsubscribedAt, id]);
    // Unsubscribing also stops the agency's newsletters (email campaigns) to this address.
    if (!subscribed) {
      await this.db.query('UPDATE contacts c JOIN leads l ON l.contactId = c.id SET c.subscribed = 0, c.unsubscribedAt = NOW() WHERE l.id = ?', [id]);
    }
    const text = subscribed
      ? by === 'link' ? 'Subscribed again from the email link' : 'Subscribed again by the agent'
      : by === 'link' ? 'Unsubscribed from property emails (email link)' : 'Unsubscribed from property emails by the agent';
    await this.buyers.log(id, userId, 'unsubscribe', text, { subscribed, by }, false);
    return { unsubscribedAt };
  }

  // Wipes the buyer's personal data and keeps the anonymous numbers (stage,
  // source, dates, what was suggested). Cannot be undone.
  async erase(tenantId: number, viewer: BuyerViewer, id: number, confirm: string): Promise<{ erased: true }> {
    if (confirm !== 'ERASE') throw new BadRequestException({ code: 'CONFIRM', message: 'Type ERASE to confirm' });
    const lead = await this.buyers.get(tenantId, viewer, id);
    this.assertNotErased(lead);

    const files: { id: number; mediaFileId: number | null }[] = await this.db.query('SELECT id, mediaFileId FROM lead_files WHERE leadId IN (?)', [[id, ...lead.mergedIds]]);
    for (const f of files) {
      if (f.mediaFileId) {
        await this.uploads.deleteFile(tenantId, f.mediaFileId).catch((err) => this.logger.warn(`Erase ${id}: file ${f.mediaFileId} not deleted: ${(err as Error).message}`));
      }
    }

    await this.db.transaction(async (m) => {
      const ids = [id, ...lead.mergedIds];
      await m.query('DELETE FROM lead_files WHERE leadId IN (?)', [ids]);
      await m.query(
        `UPDATE leads SET firstName = NULL, lastName = NULL, phone = NULL, mobile = NULL, photoUrl = NULL, street = NULL, city = NULL, zip = NULL, state = NULL,
           idType = NULL, idNumber = NULL, lawyer = NULL, notes = NULL, referredBy = NULL, answers = NULL, relatedContacts = NULL,
           pageCode = NULL, pageEnabled = 0, waitingReplyAt = NULL, consentAt = NULL, consentSource = NULL, noteRules = NULL, noteRulesHash = NULL, aiSummary = NULL, aiSummaryHash = NULL, aiSummaryAt = NULL, aiDismissed = NULL,
           unsubscribedAt = COALESCE(unsubscribedAt, NOW()), erasedAt = IF(id = ?, NOW(), erasedAt)
         WHERE id IN (?)`,
        [id, ids],
      );
      await m.query('UPDATE leads SET erasedAt = NOW() WHERE id IN (?) AND erasedAt IS NULL', [ids]);
      await m.query('UPDATE lead_activities SET description = NULL, metadata = NULL WHERE leadId IN (?)', [ids]);
      await m.query('DELETE FROM lead_changes WHERE leadId IN (?)', [ids]);
      await m.query('UPDATE lead_suggestions SET note = NULL WHERE leadId IN (?)', [ids]);
      await m.query('UPDATE lead_suggestion_events SET note = NULL WHERE leadId IN (?)', [ids]);
      await m.query('UPDATE buyer_viewings SET feedback = NULL, meetingPoint = NULL WHERE leadId IN (?)', [ids]);
      await m.query('UPDATE buyer_trips SET notes = NULL WHERE leadId IN (?)', [ids]);
      // The contact (email address) goes too, unless another buyer still uses it.
      const contactIds = [...new Set((await m.query('SELECT contactId FROM leads WHERE id IN (?)', [ids])).map((r: { contactId: number }) => r.contactId))];
      for (const cid of contactIds) {
        const others = await m.query('SELECT COUNT(*) AS n FROM leads WHERE contactId = ? AND id NOT IN (?) AND erasedAt IS NULL', [cid, ids]);
        if (Number(others[0].n) > 0) continue;
        await m.query(
          "UPDATE contacts SET email = CONCAT('erased-', id, '@erased.invalid'), name = NULL, phone = NULL, preferences = NULL, tags = NULL, subscribed = 0, unsubscribedAt = COALESCE(unsubscribedAt, NOW()) WHERE id = ? AND tenantId = ?",
          [cid, tenantId],
        );
      }
    });
    await this.buyers.log(id, viewer.id, 'erase', null, null, false);
    return { erased: true };
  }

  private assertNotErased(lead: { erasedAt: Date | null }) {
    if (lead.erasedAt) throw new BadRequestException({ code: 'ERASED', message: "This buyer's details were erased" });
  }
}
