import { Contact } from '../../database/entities';
import { realEmail } from '../lead/buyer/real-email';
import type { MailerLiteSubscriber } from './mailerlite.client';

export const MAIN_GROUP = 'SPM contacts';
export const TAG_PREFIX = 'SPM: ';
export const LANGUAGE_FIELD = 'SPM language';
// What to search group names for: finds MAIN_GROUP and every tag group.
export const GROUP_SEARCH = 'SPM';

const MAX_GROUP_NAME = 255;
// A contact erased for privacy keeps a placeholder address like this one.
const ERASED_DOMAIN = '@erased.invalid';
// In MailerLite, these people left and must stay out.
const LEFT_STATUSES = new Set(['unsubscribed', 'bounced', 'junk']);

export type ContactRow = Pick<Contact, 'id' | 'email' | 'name' | 'subscribed' | 'unsubscribedAt' | 'bounceCount' | 'tags' | 'preferences'>;

// What a sync does with a contact in SPM:
//  - send: subscribed and mailable.
//  - leave: unsubscribed in SPM, so unsubscribed in MailerLite if they are there.
//  - skip: nothing to do. Made-up and erased addresses, bounced addresses, and
//    contacts who were never subscribed (some imported buyers: no unsubscribe
//    date). Those are not "left": another list of the client's may hold them.
export type ContactPlan = { kind: 'send'; email: string } | { kind: 'leave'; email: string } | { kind: 'skip' };

export function planContact(c: ContactRow): ContactPlan {
  const email = realEmail(c.email);
  if (!email || email.toLowerCase().endsWith(ERASED_DOMAIN)) return { kind: 'skip' };
  if (!c.subscribed) return c.unsubscribedAt ? { kind: 'leave', email } : { kind: 'skip' };
  if (c.bounceCount > 0) return { kind: 'skip' };
  return { kind: 'send', email };
}

export function hasLeft(sub: Pick<MailerLiteSubscriber, 'status'>): boolean {
  return LEFT_STATUSES.has(sub.status);
}

export function tagGroupName(tag: string): string {
  return `${TAG_PREFIX}${tag}`.slice(0, MAX_GROUP_NAME);
}

export function isTagGroup(name: string): boolean {
  return name.toLowerCase().startsWith(TAG_PREFIX.toLowerCase());
}

export function contactTags(c: Pick<Contact, 'tags'>): string[] {
  let tags: unknown = c.tags;
  if (typeof tags === 'string') {
    try {
      tags = JSON.parse(tags);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(tags)) return [];
  const out = new Set<string>();
  for (const t of tags) if (typeof t === 'string' && t.trim()) out.add(t.trim());
  return [...out];
}

// "Anna van Dijk" → name "Anna", last_name "van Dijk". MailerLite doesn't
// remove a value that is left out, so an empty part is left out.
export function subscriberFields(c: Pick<Contact, 'name' | 'preferences'>, languageField: string | null): Record<string, string> {
  const fields: Record<string, string> = {};
  const parts = (c.name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length) fields.name = parts[0];
  if (parts.length > 1) fields.last_name = parts.slice(1).join(' ');
  const language = c.preferences?.language?.trim();
  if (languageField && language) fields[languageField] = language;
  return fields;
}

export function fieldsMatch(wanted: Record<string, string>, existing: MailerLiteSubscriber['fields']): boolean {
  return Object.entries(wanted).every(([k, v]) => String(existing?.[k] ?? '') === v);
}

// Tag groups the subscriber is in but no longer has the tag for. Only ours:
// their other groups are the client's own business.
export function groupsToLeave(sub: MailerLiteSubscriber, wantedNames: string[]): string[] {
  const wanted = new Set(wantedNames.map((n) => n.toLowerCase()));
  return (sub.groups ?? []).filter((g) => isTagGroup(g.name) && !wanted.has(g.name.toLowerCase())).map((g) => g.id);
}
