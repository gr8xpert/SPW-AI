'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AGENT_HOME, isAgentPath } from '@/lib/agent-access';

// An agent who types another dashboard URL lands back on their day.
export function AgentRouteGuard({ isAgent }: { isAgent: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const blocked = isAgent && !isAgentPath(pathname);
  useEffect(() => {
    if (blocked) router.replace(AGENT_HOME);
  }, [blocked, router]);
  return null;
}
