'use client';

import { useEffect, useRef, useState } from 'react';
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
import { formatHM, formatSignedHM } from '@/lib/time';
import { formatMoney } from '@/lib/utils';
import { useLanguage } from '@/i18n/i18n-provider';
import { useBillingText } from './_i18n';
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

// A price in the dashboard language's number format; the currency code from
// the package stays as sent (falls back to the plain helper if it is unknown).
function formatPrice(amount: number | string, currency: string, locale: string): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return formatMoney(amount, currency);
  const whole = Math.round(value * 100) % 100 === 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(value);
  } catch {
    return formatMoney(amount, currency);
  }
}

// "Credit Hours" page. The route stays /dashboard/billing because the Stripe
// checkout success/cancel URLs (api payment module) return here.
export default function CreditHoursPage() {
  const { toast } = useToast();
  const t = useBillingText();
  const { locale } = useLanguage();
  // Effects below run once; they read the current wording through this ref.
  const tRef = useRef(t);
  tRef.current = t;
  const { tier, known: tierKnown } = useDashboardAddons();
  const [loading, setLoading] = useState(true);

  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [purchasingPkgId, setPurchasingPkgId] = useState<number | null>(null);
  const [pkgQuantity, setPkgQuantity] = useState<Record<number, number>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeStatus = params.get('stripe');
    if (stripeStatus === 'success') {
      toast({ title: tRef.current.paymentSuccess, description: tRef.current.paymentSuccessText });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (stripeStatus === 'cancel') {
      toast({ title: tRef.current.paymentCancelled, description: tRef.current.paymentCancelledText, variant: 'destructive' });
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
            title: tRef.current.loadFailed,
            description: tRef.current.loadFailedText,
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
        // A dropped connection must not fail the purchase; a repeated request
        // only creates a second, unused checkout session.
        { retryOnNetworkError: true },
      );
      const url = (raw as any)?.data?.url ?? (raw as any)?.url;
      if (!url) throw new Error('Checkout session returned no redirect URL');
      window.location.href = url;
    } catch (err: any) {
      toast({
        title: t.checkoutFailed,
        description: err?.response?.data?.message ?? err?.message ?? t.unknownError,
        variant: 'destructive',
      });
      setPurchasingPkgId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">
            {t.description}
          </p>
        </div>
      </div>

      {/* Your plan (tier) — read-only. Tier changes are handled by the
          super-admin on request; there is no self-serve tier purchase. */}
      <Card>
        <CardHeader>
          <CardTitle>{t.planTitle}</CardTitle>
          <CardDescription>{t.planDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-lg font-semibold">{tierKnown ? t.tierNames[tier] : '…'}</div>
                <div className="text-sm text-muted-foreground">
                  {t.contactManager}
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
              <CardTitle>{t.buyTitle}</CardTitle>
              <CardDescription>
                {t.buyDescription}
              </CardDescription>
            </div>
            {creditBalance && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t.balance}</span>
                <span className="text-lg font-bold">{formatSignedHM(creditBalance.balance)}</span>
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
              <p className="text-sm">{t.noPackages}</p>
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
                    <div className="mt-2 text-3xl font-bold">{formatHM(pkg.hours)}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {t.perHour(formatPrice(pkg.pricePerHour, pkg.currency, locale))}
                    </div>
                    <div className="mt-4 text-xl font-semibold">
                      {formatPrice(pkg.totalPrice, pkg.currency, locale)}
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <label
                        htmlFor={`qty-${pkg.id}`}
                        className="text-sm text-muted-foreground"
                      >
                        {t.qty}
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
                        = {formatHM(totalHours)}, {formatPrice(totalCost, pkg.currency, locale)}
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
                        {Number.isInteger(totalHours)
                          ? t.buyHours(totalHours)
                          : t.buyAmount(formatHM(totalHours))}
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
