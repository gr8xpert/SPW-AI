'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import {
  Building2,
  Users,
  Eye,
  MessageSquare,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { useLanguage, useText } from '@/i18n/i18n-provider';
import { useDashboardAddons } from '@/hooks/use-dashboard-addons';
import { useNewLeadCount } from './leads/use-new-leads';
import { homeText } from './_i18n/home';

interface DashboardStats {
  properties: number;
  contacts: number;
  views: number;
  leads: number;
}

interface TopProperty {
  reference: string;
  title: string;
  views: number;
}

interface RecentView {
  propertyTitle: string;
  propertyReference: string;
  viewedAt: string;
}

// The numbers come from four different endpoints with three shapes:
// { data: [...], meta: { total } } (properties), { data: [...], total }
// (contacts) and { data: { total } } (buyer stats). Until 10-22 the card read
// data.total on all of them, so Properties and Contacts always showed 0.
const totalOf = (res: any): number => Number(res?.meta?.total ?? res?.total ?? res?.data?.total ?? 0) || 0;

async function loadDashboard(api: ReturnType<typeof useApi>) {
  const [propsRes, contactsRes, analyticsRes, leadsRes, topRes, recentRes] = await Promise.allSettled([
    api.get('/api/dashboard/properties?limit=1'),
    api.get('/api/dashboard/contacts?limit=1'),
    api.get('/api/dashboard/analytics/overview?range=30d'),
    api.get('/api/dashboard/leads/stats'),
    api.get('/api/dashboard/analytics/properties?range=30d&limit=5'),
    api.get('/api/dashboard/analytics/recent-views?range=7d&limit=5'),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);

  const stats: DashboardStats = {
    properties: totalOf(ok(propsRes)),
    contacts: totalOf(ok(contactsRes)),
    views: Number((ok(analyticsRes) as any)?.data?.views ?? 0) || 0,
    leads: totalOf(ok(leadsRes)),
  };
  const top = (ok(topRes) as any)?.data;
  const topProperties: TopProperty[] = Array.isArray(top)
    ? top.slice(0, 5).map((p: any) => ({ reference: p.reference || '', title: p.title || p.reference || '', views: Number(p.views) || 0 }))
    : [];
  const recent = (ok(recentRes) as any)?.data;
  const recentViews: RecentView[] = Array.isArray(recent)
    ? recent.map((e: any) => ({ propertyTitle: e.title || e.reference || '', propertyReference: e.reference || '', viewedAt: e.viewedAt || '' }))
    : [];
  return { stats, topProperties, recentViews };
}

export function DashboardContent() {
  const { data: session } = useSession();
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  const t = useText(homeText);
  const { locale } = useLanguage();
  // Keyed by login + impersonated client, so switching client refetches;
  // refreshes every minute and when the tab comes back into view.
  const query = useQuery({
    queryKey: ['dashboard-home', ...scope],
    queryFn: () => loadDashboard(api),
    enabled: ready,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const loading = query.isLoading;
  const stats = query.data?.stats ?? { properties: 0, contacts: 0, views: 0, leads: 0 };
  const topProperties = query.data?.topProperties ?? [];
  const recentViews = query.data?.recentViews ?? [];

  // Contacts is Buyer Match. Without it, Tier 2+ clients see how many
  // website enquiries wait on New Leads instead; Tier 1 has neither.
  // Decided after mount: the server renders before the add-ons are known.
  const { addons, tier, known } = useDashboardAddons();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const contactsLocked = mounted && known && !addons.buyerMatch;
  const enquiries = useNewLeadCount(contactsLocked && tier >= 2).data ?? 0;

  const statCards = [
    // contacts = the email subscriber list; leads = Contacts (Buyer Match).
    { name: t.properties, value: stats.properties, icon: Building2 },
    ...(!contactsLocked
      ? [{ name: t.contacts, value: stats.leads, icon: MessageSquare }]
      : tier >= 2
        ? [{ name: t.enquiriesWaiting, value: enquiries, icon: MessageSquare }]
        : []),
    { name: t.subscribers, value: stats.contacts, icon: Users },
    { name: t.views, value: stats.views, icon: Eye },
  ];

  // "5 min ago" in the dashboard language.
  function timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 60) return rtf.format(-mins, 'minute');
    const hours = Math.floor(mins / 60);
    if (hours < 24) return rtf.format(-hours, 'hour');
    return rtf.format(-Math.floor(hours / 24), 'day');
  }

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">{t.welcome(session?.user?.name || '')}</p>
        </div>
      </div>

      <motion.div
        variants={staggerContainer}
        initial={false}
        animate="animate"
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        {statCards.map((stat) => (
          <motion.div key={stat.name} variants={staggerItem}>
            <Card className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.name}</CardTitle>
                <div className="stat-card-icon bg-primary/5">
                  <stat.icon className="h-5 w-5 text-primary/70" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">
                  <AnimatedNumber value={stat.value} formatOptions={{ useGrouping: true }} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 animate-fade-in">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>{t.recentActivity}</CardTitle>
            <CardDescription>{t.recentHint}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t.loading}</p>
            ) : recentViews.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t.noActivity}</p>
            ) : (
              <div className="space-y-1">
                {recentViews.map((v, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/40">
                        <Eye className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{v.propertyTitle}</p>
                        <p className="text-xs text-muted-foreground">{v.propertyReference}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{timeAgo(v.viewedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>{t.topProperties}</CardTitle>
            <CardDescription>{t.topHint}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t.loading}</p>
            ) : topProperties.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t.noData}</p>
            ) : (
              <div className="space-y-1">
                {topProperties.map((property, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{property.title}</p>
                        <p className="text-xs text-muted-foreground">{property.reference}</p>
                      </div>
                    </div>
                    <span className="text-sm tabular-nums font-medium text-muted-foreground">{property.views}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
