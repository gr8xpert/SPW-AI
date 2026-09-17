import type { Session } from 'next-auth';

export class SessionUnavailableError extends Error {
  constructor() {
    super('Session could not be checked');
    this.name = 'SessionUnavailableError';
  }
}

// next-auth's getSession() returns null both when the user is signed out and
// when the request simply failed, so callers deciding whether to sign someone
// out can't use it. This resolves null only when the server answered "no
// session" and throws SessionUnavailableError when it didn't answer.
export async function readServerSession(): Promise<Session | null> {
  let res: Response;
  try {
    res = await fetch('/api/auth/session', { cache: 'no-store' });
  } catch {
    throw new SessionUnavailableError();
  }
  if (!res.ok) throw new SessionUnavailableError();
  let body: Partial<Session> | null;
  try {
    body = await res.json();
  } catch {
    throw new SessionUnavailableError(); // e.g. a proxy error page instead of JSON
  }
  return body?.user ? (body as Session) : null;
}
