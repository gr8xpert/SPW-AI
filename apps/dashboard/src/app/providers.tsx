'use client';

import type { Session } from 'next-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { MotionProvider } from '@/components/providers/reduced-motion';
import { NavigationProgress } from '@/components/layout/navigation-progress';
import { AuthTokenSync } from '@/components/providers/auth-token-sync';
import { ResilientSessionProvider } from '@/components/providers/resilient-session-provider';

export function Providers({ session, children }: { session: Session | null; children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ResilientSessionProvider session={session}>
      <AuthTokenSync />
      <QueryClientProvider client={queryClient}>
        <MotionProvider>
          <NavigationProgress />
          {children}
        </MotionProvider>
        <Toaster />
      </QueryClientProvider>
    </ResilientSessionProvider>
  );
}
