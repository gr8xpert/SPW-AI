'use client';

import { useSession } from 'next-auth/react';

export function SessionGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
