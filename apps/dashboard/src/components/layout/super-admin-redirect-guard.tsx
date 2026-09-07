'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useImpersonation } from '@/hooks/use-impersonation';

// Client-side guard for the (dashboard) layout. When a super-admin
// lands on /dashboard directly (fresh tab, bookmarked link, etc.) we
// send them to /admin — the client dashboard isn't meant for them.
//
// EXCEPT during an active impersonation session: super-admin acting as
// a client stays on /dashboard so they can see exactly what the client
// sees. The impersonation state is client-only (localStorage sidecar),
// which is why this guard runs on the client — the server layout can't
// see localStorage and can't tell impersonation apart from a direct
// visit.
//
// Renders nothing; effect fires after mount to trigger the redirect.
export function SuperAdminRedirectGuard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { isImpersonating } = useImpersonation();

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (session?.user?.role !== 'super_admin') return;
    if (isImpersonating) return;
    router.replace('/admin');
  }, [status, session?.user?.role, isImpersonating, router]);

  return null;
}
