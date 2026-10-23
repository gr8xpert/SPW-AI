import { createHmac } from 'crypto';
import { linkSecret, signLinkToken, verifyLinkToken, type LinkPurpose } from '../lead/buyer/tracking/link-token';

// Signed links in campaign emails: the open pixel ('o'), each property link
// ('c', send id + property id) and the unsubscribe link ('u', send id).
// Same token format as the buyer emails, under a key of their own, so a
// buyer-email token never works on a campaign address (both sign send ids
// from different tables).

let cached: Buffer | null = null;
function key(): Buffer {
  if (!cached) cached = createHmac('sha256', linkSecret()).update('spm-campaign-link-v1').digest();
  return cached;
}

export function apiBase(): string {
  return (process.env.API_URL || 'http://localhost:3001').replace(/\/+$/, '');
}

export function campaignLinks(sendId: number) {
  const base = apiBase();
  return {
    pixelUrl: `${base}/api/e/o/${signLinkToken(key(), 'o', sendId)}`,
    unsubscribeUrl: `${base}/api/e/u/${signLinkToken(key(), 'u', sendId)}`,
    propertyUrl: (propertyId: number) => `${base}/api/e/c/${signLinkToken(key(), 'c', sendId, propertyId)}`,
  };
}

export function verifyCampaignToken(purpose: LinkPurpose, token: string): { sendId: number; propertyId?: number } | null {
  return verifyLinkToken(key(), purpose, token);
}
