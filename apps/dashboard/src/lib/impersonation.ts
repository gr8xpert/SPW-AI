'use client';

import { readServerSession } from './session-check';

// Client-side impersonation session state. Uses localStorage as a sidecar
// so we don't have to reach into NextAuth's signed JWT session cookie to
// swap the access token — that would require a bespoke provider and a full
// re-auth cycle. Instead:
//
//   1. Super-admin hits Login-as → API returns a scoped impersonation JWT.
//   2. We stash the JWT + metadata under IMPERSONATION_STORAGE_KEY.
//   3. `useApi` prefers this token over session.accessToken while present.
//   4. Return-to-admin clears the entry; session.accessToken takes over
//      again untouched.
//
// The original super-admin's NextAuth session is never mutated, so
// Return-to-admin is a pure client-side clear plus a router refresh —
// no re-login and no lost refresh token.

const IMPERSONATION_STORAGE_KEY = 'spm.impersonation';

// Cookie mirror of the localStorage flag so server-side layouts can
// see impersonation state on the initial request — needed to skip the
// super-admin → /admin redirect for impersonation sessions without a
// paint-then-redirect flash. Value is just "1" — the actual JWT stays
// in localStorage since we send it as a Bearer header (not a cookie).
const IMPERSONATION_COOKIE_KEY = 'spm.impersonating';

// Event dispatched on window when the impersonation state changes so
// components subscribed via `useImpersonation()` re-render immediately
// (localStorage's `storage` event only fires cross-tab, not same-tab).
const IMPERSONATION_EVENT = 'spm:impersonation-change';

function writeImpersonationCookie(active: boolean): void {
  if (typeof document === 'undefined') return;
  if (active) {
    // Session cookie (no Max-Age) — cleared when browser closes.
    // SameSite=Lax so it survives normal top-level navigations but
    // not cross-site subrequests. path=/ so the layout can read it
    // on any dashboard route.
    document.cookie = `${IMPERSONATION_COOKIE_KEY}=1; path=/; SameSite=Lax`;
  } else {
    document.cookie = `${IMPERSONATION_COOKIE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax`;
  }
}

export interface ImpersonationSession {
  accessToken: string;
  tenant: { id: number; name: string; slug: string };
  impersonatedUser: { id: number; email: string; role: string };
  sessionId: string;
  startedAt: number; // Date.now() when swap happened; used for "started N min ago"
}

export function getImpersonationSession(): ImpersonationSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(IMPERSONATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImpersonationSession;
  } catch {
    return null;
  }
}

export function setImpersonationSession(session: ImpersonationSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(session));
  writeImpersonationCookie(true);
  window.dispatchEvent(new Event(IMPERSONATION_EVENT));
}

export function clearImpersonationSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
  writeImpersonationCookie(false);
  window.dispatchEvent(new Event(IMPERSONATION_EVENT));
}

// ── Renewal ───────────────────────────────────────────────────────────────
// The API issues impersonation tokens for 1 hour. Without renewal, a client
// dashboard left idle past that point got 401 on every call and pages kept
// spinning until the super-admin clicked Return to admin and started again.
// We now swap in a new token (same audit session) a couple of minutes before
// expiry, and once more after any 401, using the super-admin's own NextAuth
// token — which /api/auth/session refreshes on read.

const RENEW_BEFORE_EXPIRY_MS = 2 * 60 * 1000;
let inFlightRenewal: Promise<string | null> | null = null;

function tokenExpiryMs(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Ask the API for a new impersonation token for the same client and audit
 * session. Concurrent callers share one request. Resolves the new token, or
 * null when it couldn't be renewed (the caller then fails as before).
 */
export function renewImpersonationToken(): Promise<string | null> {
  if (inFlightRenewal) return inFlightRenewal;
  inFlightRenewal = (async () => {
    const current = getImpersonationSession();
    if (!current) return null;
    try {
      const adminSession = await readServerSession();
      const adminToken = adminSession?.accessToken;
      if (!adminToken) return null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/super-admin/impersonate/${current.tenant.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ continueSessionId: current.sessionId }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { accessToken?: string; sessionId?: string };
      if (!body?.accessToken) return null;
      // The super-admin may have returned to admin while this was in flight.
      const latest = getImpersonationSession();
      if (!latest || latest.tenant.id !== current.tenant.id) return null;
      setImpersonationSession({
        ...latest,
        accessToken: body.accessToken,
        sessionId: body.sessionId ?? latest.sessionId,
      });
      return body.accessToken;
    } catch {
      return null;
    }
  })().finally(() => {
    inFlightRenewal = null;
  });
  return inFlightRenewal;
}

/**
 * The impersonation token to send now, renewed first when it is about to
 * expire. Null when not impersonating.
 */
export async function getFreshImpersonationToken(): Promise<string | null> {
  const current = getImpersonationSession();
  if (!current) return null;
  const exp = tokenExpiryMs(current.accessToken);
  if (exp !== null && exp - Date.now() < RENEW_BEFORE_EXPIRY_MS) {
    return (await renewImpersonationToken()) ?? current.accessToken;
  }
  return current.accessToken;
}

// Subscribe to impersonation state changes (start + end). Returns an
// unsubscribe fn. Fires on same-tab writes AND cross-tab via `storage`.
export function subscribeToImpersonation(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === IMPERSONATION_STORAGE_KEY) cb();
  };
  window.addEventListener(IMPERSONATION_EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(IMPERSONATION_EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}
