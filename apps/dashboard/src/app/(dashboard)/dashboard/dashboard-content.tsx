'use client';

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

  const statCards = [
    { name: 'Total Properties', value: stats.properties, icon: Building2 },
    { name: 'Total Contacts', value: stats.contacts, icon: Users },
    { name: 'Property Views', value: stats.views, icon: Eye },
    { name: 'Buyers', value: stats.leads, icon: MessageSquare },
  ];

  function timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description mt-1">
            Welcome back, {session?.user?.name || 'User'}! Here&apos;s what&apos;s
            happening with your properties.
          </p>
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
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest property views this week</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
            ) : recentViews.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>
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
            <CardTitle>Top Properties</CardTitle>
            <CardDescription>Most viewed properties this month</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
            ) : topProperties.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No data yet</p>
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
