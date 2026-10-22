'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

// The agency requires two-factor login and this user has not set it up: the
// API refuses everything else, so keep them on the profile page.
export function MfaSetupGuard() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const mustSetUp = !!session?.user?.mfaSetup;
  useEffect(() => {
    if (mustSetUp && pathname !== '/dashboard/profile') router.replace('/dashboard/profile');
  }, [mustSetUp, pathname, router]);
  return null;
}
