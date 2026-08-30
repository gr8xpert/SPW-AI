'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Coins, ShoppingCart, Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { formatHM } from '@/lib/time';

// Header widget that surfaces the tenant's support-hours credit balance on
// every dashboard page. When balance ≤ 0 the "Buy Credits" CTA replaces the
// passive chip so the user has a one-click path to the billing page before
// they hit a "Insufficient credits" error when a webmaster tries to book time.
//
// Hidden for webmasters — they don't own the tenant billing account, so a
// credit chip in their header would be misleading.
export function CreditBalanceBadge() {
  const { data: session } = useSession();
  const api = useApi();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const role = session?.user?.role as string | undefined;
  const showChip = role === 'admin' || role === 'user';

  useEffect(() => {
    if (!showChip || !api.isReady) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/dashboard/credits/balance');
        const body = res?.data || res;
        if (!cancelled) setBalance(Number(body?.balance ?? 0));
      } catch {
        if (!cancelled) setBalance(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showChip, api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!showChip) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  }

  const isEmpty = balance === null || balance <= 0;

  if (isEmpty) {
    return (
      <Link href="/dashboard/billing">
        <Button size="sm" variant="default" className="h-8 gap-1.5 text-xs">
          <ShoppingCart className="h-3.5 w-3.5" />
          Buy Credit Hours
        </Button>
      </Link>
    );
  }

  return (
    <Link
      href="/dashboard/billing"
      className="flex items-center gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
      title="Support credit hours remaining"
    >
      <Coins className="h-3.5 w-3.5 text-primary" />
      <span>{formatHM(balance)}</span>
    </Link>
  );
}
