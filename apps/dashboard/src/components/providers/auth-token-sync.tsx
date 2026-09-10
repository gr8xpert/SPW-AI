'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { clearAuthToken, primeAuthToken } from '@/lib/api';

// Keeps the axios client's cached access token in sync with the NextAuth
// session.
//
// Without this, `lib/api.ts` would have to call `getSession()` — an HTTP
// round-trip to /api/auth/session — before every request. SessionProvider
// already holds the token in context, so we push it into the module cache on
// every change and the interceptor reads it for free.
//
// Renders nothing; mounted once inside SessionProvider (see providers.tsx).
export function AuthTokenSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'loading') return;
    primeAuthToken(session?.accessToken ?? null);
  }, [session?.accessToken, status]);

  // Drop the token on unmount so a signed-out session can't leave a live
  // token behind in the module cache.
  useEffect(() => clearAuthToken, []);

  return null;
}
