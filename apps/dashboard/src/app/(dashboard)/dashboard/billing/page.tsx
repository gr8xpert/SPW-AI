'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api';
import { useDashboardAddons } from '@/hooks/use-dashboard-addons';
import { RefreshCw, Clock, CreditCard, ShoppingCart, Layers } from 'lucide-react';

interface CreditPackage {
  id: number;
  name: string;
  hours: number;
  pricePerHour: number;
  totalPrice: number;
  currency: string;
  isActive: boolean;
}

interface CreditBalance {
  balance: number;
  tenantId: number;
}

const TIER_NAMES: Record<1 | 2 | 3, string> = {
  1: 'Tier 1 — Support only',
  2: 'Tier 2 — Support + Property management',
  3: 'Tier 3 — Everything (all premium add-ons)',
};

export default function BillingPage() {
  const { toast } = useToast();
  const { tier } = useDashboardAddons();
  const [loading, setLoading] = useState(true);

  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [purchasingPkgId, setPurchasingPkgId] = useState<number | null>(null);
  const [pkgQuantity, setPkgQuantity] = useState<Record<number, number>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeStatus = params.get('stripe');
    if (stripeStatus === 'success') {
      toast({ title: 'Payment successful', description: 'Your credit hours have been added to your account.' });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (stripeStatus === 'cancel') {
      toast({ title: 'Payment cancelled', description: 'Your credit purchase was cancelled.', variant: 'destructive' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [packagesResult, balanceResult] = await Promise.allSettled([
          apiGet<{ data: CreditPackage[] }>('/api/billing/credits/packages'),
          apiGet<{ data: CreditBalance }>('/api/dashboard/credits/balance'),
        ]);
        if (packagesResult.status === 'fulfilled') {
          const raw = packagesResult.value as { data: CreditPackage[] } | CreditPackage[];
          setCreditPackages(Array.isArray(raw) ? raw : raw.data ?? []);
        }
        if (balanceResult.status === 'fulfilled') {
          const raw = balanceResult.value as { data: CreditBalance } | CreditBalance;
          setCreditBalance('data' in raw ? raw.data : raw);
        }

        const failures = [packagesResult, balanceResult].filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
          toast({
            title: 'Some billing data failed to load',
            description: 'Parts of the page may be incomplete. Try refreshing.',
            variant: 'destructive',
          });
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [toast]);

  const handlePurchaseCredits = async (pkg: CreditPackage) => {
    const quantity = Math.max(1, Math.min(99, pkgQuantity[pkg.id] ?? 1));
    setPurchasingPkgId(pkg.id);
    try {
      const raw = await apiPost<{ url: string; sessionId: string } | { data: { url: string; sessionId: string } }>(
        '/api/billing/credits/checkout',
        { packageId: pkg.id, quantity },
      );
      const url = (raw as any)?.data?.url ?? (raw as any)?.url;
      if (!url) throw new Error('Checkout session returned no redirect URL');
      window.location.href = url;
    } catch (err: any) {
      toast({
        title: 'Checkout failed',
        description: err?.response?.data?.message ?? err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
      setPurchasingPkgId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-description mt-1">
            Buy credit hours for webmaster support
          </p>
        </div>
      </div>

      {/* Your plan (tier) — read-only. Tier changes are handled by the
          super-admin on request; there is no self-serve tier purchase. */}
      <Card>
        <CardHeader>
          <CardTitle>Your plan</CardTitle>
          <CardDescription>Your current commercial tier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-lg font-semibold">{TIER_NAMES[tier]}</div>
                <div className="text-sm text-muted-foreground">
                  Contact your account manager to upgrade your tier.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit Hours */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Credit Hours</CardTitle>
              <CardDescription>
                Purchase credit hours for webmaster support. Credits are consumed when work is done on your tickets.
              </CardDescription>
            </div>
            {creditBalance && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Balance:</span>
                <span className="text-lg font-bold">{Number(creditBalance.balance).toLocaleString()}h</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : creditPackages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <CreditCard className="h-8 w-8 mb-2" />
              <p className="text-sm">No credit packages available at this time.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {creditPackages.map((pkg) => {
                const qty = Math.max(1, Math.min(99, pkgQuantity[pkg.id] ?? 1));
                const totalHours = Number(pkg.hours) * qty;
                const totalCost = Number(pkg.totalPrice) * qty;
                return (
                  <div
                    key={pkg.id}
                    className="flex flex-col rounded-lg border p-6"
                  >
                    <h3 className="text-lg font-semibold">{pkg.name}</h3>
                    <div className="mt-2 text-3xl font-bold">{pkg.hours}h</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {pkg.currency} {Number(pkg.pricePerHour).toFixed(2)}/hour
                    </div>
                    <div className="mt-4 text-xl font-semibold">
                      {pkg.currency} {Number(pkg.totalPrice).toFixed(2)} / pack
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <label
                        htmlFor={`qty-${pkg.id}`}
                        className="text-sm text-muted-foreground"
                      >
                        Qty
                      </label>
                      <input
                        id={`qty-${pkg.id}`}
                        type="number"
                        min={1}
                        max={99}
                        value={qty}
                        onChange={(e) =>
                          setPkgQuantity((prev) => ({
                            ...prev,
                            [pkg.id]: Math.max(
                              1,
                              Math.min(99, parseInt(e.target.value, 10) || 1),
                            ),
                          }))
                        }
                        className="w-20 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      />
                      <span className="text-sm text-muted-foreground">
                        = {totalHours}h, {pkg.currency}{' '}
                        {totalCost.toFixed(2)}
                      </span>
                    </div>

                    <div className="mt-4">
                      <Button
                        className="w-full shadow-sm"
                        disabled={purchasingPkgId === pkg.id}
                        onClick={() => handlePurchaseCredits(pkg)}
                      >
                        {purchasingPkgId === pkg.id ? (
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ShoppingCart className="mr-2 h-4 w-4" />
                        )}
                        Buy {totalHours} Hours
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
