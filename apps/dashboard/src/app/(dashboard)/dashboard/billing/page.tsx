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
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api';
import { RefreshCw, CheckCircle2, Sparkles, Clock, CreditCard, ShoppingCart } from 'lucide-react';

interface BillingPlan {
  id: number;
  name: string;
  slug: string;
  priceMonthly: number | null;
  priceYearly: number | null;
  paddlePriceIdMonthly: string | null;
  paddlePriceIdYearly: string | null;
  maxProperties: number;
  maxUsers: number;
  isActive: boolean;
}

interface TenantSummary {
  id: number;
  name: string;
  planId: number;
  subscriptionStatus: 'active' | 'grace' | 'expired' | 'manual' | 'internal';
  billingCycle: 'monthly' | 'yearly' | null;
  billingSource: 'manual' | 'paddle' | 'internal' | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
}

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

type Cycle = 'monthly' | 'yearly';

export default function BillingPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [upgradingPlanId, setUpgradingPlanId] = useState<number | null>(null);

  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [purchasingPkgId, setPurchasingPkgId] = useState<number | null>(null);

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
        const [plansResult, tenantResult, packagesResult, balanceResult] = await Promise.allSettled([
          apiGet<{ data: BillingPlan[] }>('/api/billing/plans'),
          apiGet<{ data: TenantSummary }>('/api/dashboard/tenant'),
          apiGet<{ data: CreditPackage[] }>('/api/billing/credits/packages'),
          apiGet<{ data: CreditBalance }>('/api/dashboard/credits/balance'),
        ]);
        if (plansResult.status === 'fulfilled') {
          const raw = plansResult.value as { data: BillingPlan[] } | BillingPlan[];
          const arr = Array.isArray(raw) ? raw : raw.data ?? [];
          setPlans(arr.filter((p: BillingPlan) => p.isActive));
        }
        if (tenantResult.status === 'fulfilled') {
          const raw = tenantResult.value as { data: TenantSummary } | TenantSummary;
          setTenant('data' in raw ? raw.data : raw);
        }
        if (packagesResult.status === 'fulfilled') {
          const raw = packagesResult.value as { data: CreditPackage[] } | CreditPackage[];
          setCreditPackages(Array.isArray(raw) ? raw : raw.data ?? []);
        }
        if (balanceResult.status === 'fulfilled') {
          const raw = balanceResult.value as { data: CreditBalance } | CreditBalance;
          setCreditBalance('data' in raw ? raw.data : raw);
        }

        const failures = [plansResult, tenantResult, packagesResult, balanceResult].filter((r) => r.status === 'rejected');
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

  const handleUpgrade = async (plan: BillingPlan) => {
    const priceId =
      cycle === 'yearly' ? plan.paddlePriceIdYearly : plan.paddlePriceIdMonthly;
    if (!priceId) {
      toast({
        title: 'Checkout unavailable',
        description: `${plan.name} is not available for ${cycle} billing right now.`,
        variant: 'destructive',
      });
      return;
    }
    setUpgradingPlanId(plan.id);
    try {
      const res = await apiPost<{ url: string; transactionId: string }>(
        '/api/billing/checkout',
        { planId: plan.id, billingCycle: cycle },
      );
      // Redirect to Paddle's hosted checkout. A full navigation is the
      // simplest path — Paddle handles card capture + 3DS, then returns
      // the user to the success URL configured in the Paddle dashboard.
      window.location.href = res.url;
    } catch (err: any) {
      toast({
        title: 'Checkout failed',
        description: err?.response?.data?.message ?? err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
      setUpgradingPlanId(null);
    }
  };

  const handlePurchaseCredits = async (pkg: CreditPackage) => {
    setPurchasingPkgId(pkg.id);
    try {
      const res = await apiPost<{ url: string; sessionId: string }>(
        '/api/billing/credits/checkout',
        { packageId: pkg.id },
      );
      window.location.href = res.url;
    } catch (err: any) {
      toast({
        title: 'Checkout failed',
        description: err?.response?.data?.message ?? err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
      setPurchasingPkgId(null);
    }
  };

  const currentPlanId = tenant?.planId ?? null;
  const onPaddle = tenant?.billingSource === 'paddle';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-description mt-1">
            Manage your subscription and upgrade your plan
          </p>
        </div>
      </div>

      {/* Current subscription */}
      <Card>
        <CardHeader>
          <CardTitle>Current subscription</CardTitle>
          <CardDescription>Status, renewal, and billing source</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || !tenant ? (
            <div className="flex h-16 items-center text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Plan: </span>
                <span className="font-medium">
                  {plans.find((p) => p.id === tenant.planId)?.name ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Status: </span>
                <Badge
                  variant={
                    tenant.subscriptionStatus === 'active'
                      ? 'default'
                      : tenant.subscriptionStatus === 'grace'
                        ? 'secondary'
                        : 'destructive'
                  }
                >
                  {tenant.subscriptionStatus}
                </Badge>
              </div>
              {tenant.billingCycle && (
                <div>
                  <span className="text-muted-foreground">Cycle: </span>
                  <span className="font-medium capitalize">{tenant.billingCycle}</span>
                </div>
              )}
              {tenant.billingSource && (
                <div>
                  <span className="text-muted-foreground">Source: </span>
                  <span className="font-medium capitalize">{tenant.billingSource}</span>
                </div>
              )}
              {tenant.expiresAt && (
                <div>
                  <span className="text-muted-foreground">Renews: </span>
                  <span className="font-medium">
                    {new Date(tenant.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          )}
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
              {creditPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex flex-col rounded-lg border p-6"
                >
                  <h3 className="text-lg font-semibold">{pkg.name}</h3>
                  <div className="mt-2 text-3xl font-bold">
                    {pkg.hours}h
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {pkg.currency} {Number(pkg.pricePerHour).toFixed(2)}/hour
                  </div>
                  <div className="mt-4 text-xl font-semibold">
                    {pkg.currency} {Number(pkg.totalPrice).toFixed(2)}
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
                      Buy {pkg.hours} Hours
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan grid */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Available plans</CardTitle>
              <CardDescription>Upgrade via Paddle secure checkout</CardDescription>
            </div>
            <Tabs value={cycle} onValueChange={(v) => setCycle(v as Cycle)}>
              <TabsList>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">Yearly</TabsTrigger>
              </TabsList>
              <TabsContent value="monthly" />
              <TabsContent value="yearly" />
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan) => {
                const price =
                  cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
                const priceId =
                  cycle === 'yearly'
                    ? plan.paddlePriceIdYearly
                    : plan.paddlePriceIdMonthly;
                const isCurrent =
                  plan.id === currentPlanId &&
                  onPaddle &&
                  tenant?.billingCycle === cycle &&
                  tenant?.subscriptionStatus === 'active';
                const canCheckout = !!priceId && !isCurrent;
                return (
                  <div
                    key={plan.id}
                    className="flex flex-col rounded-lg border p-6"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {isCurrent && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Current
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 text-3xl font-bold">
                      {price == null ? 'Free' : `€${price}`}
                      {price != null && (
                        <span className="text-sm font-normal text-muted-foreground">
                          /{cycle === 'yearly' ? 'yr' : 'mo'}
                        </span>
                      )}
                    </div>
                    <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                      <li>{plan.maxProperties.toLocaleString()} properties</li>
                      <li>{plan.maxUsers} team members</li>
                    </ul>
                    <div className="mt-6">
                      <Button
                        className="w-full shadow-sm"
                        disabled={!canCheckout || upgradingPlanId === plan.id}
                        onClick={() => handleUpgrade(plan)}
                      >
                        {upgradingPlanId === plan.id && (
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {isCurrent
                          ? 'Current plan'
                          : !priceId
                            ? 'Not available'
                            : (
                              <>
                                <Sparkles className="mr-2 h-4 w-4" />
                                Upgrade
                              </>
                            )}
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
