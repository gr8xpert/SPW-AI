'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCog, LogOut, RefreshCw } from 'lucide-react';
import { useImpersonation } from '@/hooks/use-impersonation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

// Sticky top bar shown to a super-admin while running as a client tenant.
// Rendered inside the dashboard layout so it appears on every authenticated
// page — the operator can always find their way back regardless of the
// route they navigate to during the session.
export function ImpersonationBanner() {
  const { session, end } = useImpersonation();
  const router = useRouter();
  const { toast } = useToast();
  const [ending, setEnding] = useState(false);

  if (!session) return null;

  const handleReturn = async () => {
    setEnding(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      // Tell the API to close out the session's audit row. Fire-and-forget
      // is intentional: if the network call fails we still clear the local
      // sidecar so the super-admin isn't stuck. The audit table will show
      // a session with no 'end' row, which is itself signal (abandoned).
      await fetch(`${apiUrl}/api/auth/end-impersonation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      }).catch(() => undefined);
    } finally {
      end();
      toast({
        title: 'Returned to admin',
        description: `You are back to your super-admin session.`,
      });
      // Force a hard refresh so any cached client-side data scoped to the
      // impersonated tenant gets torn down.
      router.push('/admin/clients');
      router.refresh();
      setEnding(false);
    }
  };

  // z-[60] sits above the sidebar's z-50 so the banner is never obscured
  // by the sidebar strip. Rendered as a fixed bar at the very top so it
  // takes zero flow height and never fights the sticky positioning of
  // other elements below.
  return (
    <>
      <div
        className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-3 border-b-2 border-amber-500 bg-amber-100 px-4 py-2 text-sm text-amber-900 shadow-md dark:border-amber-600 dark:bg-amber-950/80 dark:text-amber-100"
      >
        <div className="flex items-center gap-2 min-w-0">
          <UserCog className="h-4 w-4 shrink-0" />
          <span className="truncate">
            <span className="font-semibold uppercase tracking-wide text-xs opacity-80">
              Super-admin session ·
            </span>{' '}
            Viewing as{' '}
            <span className="font-semibold">{session.tenant.name}</span>
            <span className="text-amber-800/80 dark:text-amber-300/80">
              {' '}
              ({session.impersonatedUser.email})
            </span>
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReturn}
          disabled={ending}
          className="shrink-0 border-amber-500 bg-white text-amber-900 hover:bg-amber-50 dark:bg-amber-900 dark:text-amber-100"
        >
          {ending ? (
            <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="mr-2 h-3.5 w-3.5" />
          )}
          Return to admin
        </Button>
      </div>
      {/* Spacer so the fixed banner doesn't overlap page content. Matches
          the banner's py-2 + text-sm line height (~38px in practice). */}
      <div aria-hidden className="h-10" />
    </>
  );
}
