'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ImpersonationSession,
  clearImpersonationSession,
  getImpersonationSession,
  subscribeToImpersonation,
} from '@/lib/impersonation';

// Reactive read of the current impersonation state. Every component that
// cares about it (banner, sidebar, use-api's token selection) subscribes
// through this hook so a start/end action propagates in the same tab.
export function useImpersonation(): {
  session: ImpersonationSession | null;
  isImpersonating: boolean;
  end: () => void;
} {
  const [session, setSession] = useState<ImpersonationSession | null>(() =>
    getImpersonationSession(),
  );

  useEffect(() => {
    const unsub = subscribeToImpersonation(() => {
      setSession(getImpersonationSession());
    });
    return unsub;
  }, []);

  const end = useCallback(() => {
    clearImpersonationSession();
    setSession(null);
  }, []);

  return {
    session,
    isImpersonating: !!session,
    end,
  };
}
