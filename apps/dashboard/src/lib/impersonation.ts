'use client';

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

// Event dispatched on window when the impersonation state changes so
// components subscribed via `useImpersonation()` re-render immediately
// (localStorage's `storage` event only fires cross-tab, not same-tab).
const IMPERSONATION_EVENT = 'spm:impersonation-change';

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
  window.dispatchEvent(new Event(IMPERSONATION_EVENT));
}

export function clearImpersonationSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
  window.dispatchEvent(new Event(IMPERSONATION_EVENT));
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
