'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
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

export function DashboardContent() {
  const { data: session } = useSession();
  const api = useApi();
  const [stats, setStats] = useState<DashboardStats>({ properties: 0, contacts: 0, views: 0, leads: 0 });
  const [topProperties, setTopProperties] = useState<TopProperty[]>([]);
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) return;

    async function load() {
      setLoading(true);
      try {
        const [propsRes, contactsRes, analyticsRes, leadsRes, topRes, activityRes] = await Promise.allSettled([
          api.get('/api/dashboard/properties?limit=1'),
          api.get('/api/dashboard/contacts?limit=1'),
          api.get('/api/dashboard/analytics/overview?range=30d'),
          api.get('/api/dashboard/leads/stats'),
          api.get('/api/dashboard/analytics/properties?range=30d&limit=5'),
          api.get('/api/dashboard/analytics/events?range=7d'),
        ]);

        const propCount = propsRes.status === 'fulfilled' && propsRes.value?.data?.total != null
          ? propsRes.value.data.total
          : 0;
        const contactCount = contactsRes.status === 'fulfilled' && contactsRes.value?.data?.total != null
          ? contactsRes.value.data.total
          : 0;
        const viewCount = analyticsRes.status === 'fulfilled' && analyticsRes.value?.data?.views != null
          ? analyticsRes.value.data.views
          : 0;
        const leadCount = leadsRes.status === 'fulfilled' && leadsRes.value?.data?.total != null
          ? leadsRes.value.data.total
          : leadsRes.status === 'fulfilled' && typeof leadsRes.value?.data === 'number'
          ? leadsRes.value.data
          : 0;

        setStats({ properties: propCount, contacts: contactCount, views: viewCount, leads: leadCount });

        if (topRes.status === 'fulfilled' && Array.isArray(topRes.value?.data)) {
          setTopProperties(topRes.value.data.slice(0, 5).map((p: any) => ({
            reference: p.reference || p.propertyReference || '',
            title: p.title || p.propertyTitle || p.reference || '',
            views: p.views || p.count || 0,
          })));
        }

        if (activityRes.status === 'fulfilled' && Array.isArray(activityRes.value?.data)) {
          setRecentViews(activityRes.value.data.slice(0, 5).map((e: any) => ({
            propertyTitle: e.propertyTitle || e.title || e.reference || 'Property',
            propertyReference: e.propertyReference || e.reference || '',
            viewedAt: e.viewedAt || e.createdAt || e.timestamp || '',
          })));
        }
      } catch {
        // silently fail — cards will show 0
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [session?.accessToken]);

  const statCards = [
    { name: 'Total Properties', value: stats.properties, icon: Building2 },
    { name: 'Total Contacts', value: stats.contacts, icon: Users },
    { name: 'Property Views', value: stats.views, icon: Eye },
    { name: 'Active Leads', value: stats.leads, icon: MessageSquare },
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
