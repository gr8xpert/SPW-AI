'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SessionProvider, useSession } from 'next-auth/react';
import type { Session } from 'next-auth';
import { readServerSession } from '@/lib/session-check';

// next-auth's SessionProvider turns ANY failed /api/auth/session request
// (dropped connection, proxy error page, browser extension) into "signed out"
// and never retries. The whole client then behaves as logged out until a
// manual refresh: avatar "U", no credit chip, useApi never ready so pages stay
// empty.
//
// This wrapper removes those failure points:
// - the session the server already read is handed in, so a page load needs no
//   session request at all;
// - no refetch on tab focus (the request that most often failed); expired
//   access tokens are still renewed through the 401 -> update() path in useApi
//   and lib/api;
// - if the session is lost anyway on a signed-in page, it is re-read with
//   backoff until the server answers. A real session remounts the provider with
//   it; a real "no session" (signed out in another tab, expired) goes to login.
const PROTECTED_PATH = /^\/(dashboard|admin)(\/|$)/;
const RECOVERY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

export function ResilientSessionProvider({
  session,
  children,
}: {
  session: Session | null;
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState({ session, generation: 0 });

  const recover = useCallback((fresh: Session) => {
    setCurrent((prev) => ({ session: fresh, generation: prev.generation + 1 }));
  }, []);

  return (
    <SessionProvider key={current.generation} session={current.session} refetchOnWindowFocus={false}>
      <SessionRecovery onRecovered={recover} />
      {children}
    </SessionProvider>
  );
}

function SessionRecovery({ onRecovered }: { onRecovered: (session: Session) => void }) {
  const { status } = useSession();
  const pathname = usePathname();
  const onProtectedPage = PROTECTED_PATH.test(pathname ?? '');

  useEffect(() => {
    if (status !== 'unauthenticated' || !onProtectedPage) return;
    let cancelled = false;

    (async () => {
      for (let attempt = 0; !cancelled; attempt++) {
        const delay = RECOVERY_DELAYS_MS[Math.min(attempt, RECOVERY_DELAYS_MS.length - 1)];
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (cancelled) return;

        let fresh: Session | null;
        try {
          fresh = await readServerSession();
        } catch {
          continue; // the server hasn't answered yet
        }
        if (cancelled) return;

        if (fresh) {
          onRecovered(fresh);
        } else {
          window.location.assign('/login');
        }
        return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, onProtectedPage, onRecovered]);

  return null;
}
