import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { EmailSend, Contact } from '../../database/entities';
import { CampaignContentService } from './campaign-content.service';
import { verifyCampaignToken } from './campaign-links';

// What campaign recipients do with an email: open it (pixel), click a
// listing, unsubscribe. Each first open/click/unsubscribe of a send moves
// the campaign's counters once.
@Injectable()
export class CampaignTrackingService {
  constructor(
    @InjectRepository(EmailSend)
    private readonly sendRepository: Repository<EmailSend>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly content: CampaignContentService,
  ) {}

  private async markOpened(send: EmailSend): Promise<void> {
    const first = await this.sendRepository.update({ id: send.id, openedAt: IsNull() }, { openedAt: new Date() });
    if (first.affected) {
      await this.sendRepository.manager.query('UPDATE email_campaigns SET openCount = openCount + 1 WHERE id = ?', [send.campaignId]);
      await this.contactRepository.update({ id: send.contactId }, { lastOpenAt: new Date() });
    }
  }

  async open(token: string): Promise<void> {
    const t = verifyCampaignToken('o', token);
    if (!t) return;
    const send = await this.sendRepository.findOne({ where: { id: t.sendId }, select: ['id', 'campaignId', 'contactId'] });
    if (send) await this.markOpened(send);
  }

  // The website address of the clicked listing, or null.
  async click(token: string): Promise<string | null> {
    const t = verifyCampaignToken('c', token);
    if (!t?.propertyId) return null;
    const send = await this.sendRepository.findOne({ where: { id: t.sendId }, relations: ['campaign', 'contact'] });
    if (!send?.campaign) return null;

    const ctx = await this.content.context(send.campaign.tenantId, [t.propertyId]);
    const card = ctx.cards[0];
    if (!card) return null;
    const url = this.content.websiteUrl(ctx, card, this.content.langFor(ctx, send.contact?.preferences?.language));
    if (!url) return null;

    // A click means the email was opened too (images are often blocked).
    await this.markOpened(send);
    const first = await this.sendRepository.update({ id: send.id, clickedAt: IsNull() }, { clickedAt: new Date() });
    if (first.affected) {
      await this.sendRepository.manager.query('UPDATE email_campaigns SET clickCount = clickCount + 1 WHERE id = ?', [send.campaignId]);
    }
    await this.contactRepository.update({ id: send.contactId }, { lastClickAt: new Date() });
    return url;
  }

  // The unsubscribe page's facts; `subscribed` (when given) is applied first.
  async unsubscribe(token: string, subscribed: boolean | null): Promise<{ agency: string; color: string; lang: string; subscribed: boolean } | null> {
    const t = verifyCampaignToken('u', token);
    if (!t) return null;
    const send = await this.sendRepository.findOne({ where: { id: t.sendId }, relations: ['campaign', 'contact'] });
    if (!send?.campaign || !send.contact) return null;
    const contact = send.contact;

    if (subscribed === false && contact.subscribed) {
      await this.contactRepository.update({ id: contact.id }, { subscribed: false, unsubscribedAt: new Date() });
      contact.subscribed = false;
      const first = await this.sendRepository.update({ id: send.id, unsubscribedAt: IsNull() }, { unsubscribedAt: new Date() });
      if (first.affected) {
        await this.sendRepository.manager.query('UPDATE email_campaigns SET unsubscribeCount = unsubscribeCount + 1 WHERE id = ?', [send.campaignId]);
      }
    } else if (subscribed === true && !contact.subscribed) {
      await this.contactRepository.update({ id: contact.id }, { subscribed: true, unsubscribedAt: null });
      contact.subscribed = true;
    }

    const ctx = await this.content.context(send.campaign.tenantId, []);
    return {
      agency: ctx.agency,
      color: ctx.color,
      lang: this.content.langFor(ctx, contact.preferences?.language),
      subscribed: contact.subscribed,
    };
  }
}
