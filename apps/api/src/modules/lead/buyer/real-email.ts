// A buyer with no email still has a contact row with a made-up address (email
// is the buyer's key, see odoo/buyer-import.service.ts). It can't receive mail
// and must never be shown, exported or mailed.
export const NO_EMAIL_DOMAIN = '@no-email.invalid';

export function realEmail(email: string | null | undefined): string | null {
  return email && !email.toLowerCase().endsWith(NO_EMAIL_DOMAIN) ? email : null;
}
