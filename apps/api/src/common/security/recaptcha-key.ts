// Google reCAPTCHA keys (site and secret) are 40 characters starting "6L".
// Anything else is not a key — 2026-10-06: a browser auto-filled a saved
// login into the dashboard's reCAPTCHA fields, the site showed "Invalid site
// key" and no visitor could send the inquiry form.
const RECAPTCHA_KEY_RE = /^6L[\w-]{38}$/;

export function isRecaptchaKey(value: unknown): value is string {
  return typeof value === 'string' && RECAPTCHA_KEY_RE.test(value.trim());
}
