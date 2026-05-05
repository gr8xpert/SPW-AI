'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { ShimmerCard } from '@/components/ui/shimmer';
import { useApi } from '@/hooks/use-api';
import { Users, AlertTriangle, TrendingUp, Building2, Plus } from 'lucide-react';
import Link from 'next/link';
import { staggerContainer, staggerItem } from '@/lib/animations';

interface DashboardStats {
  totalClients: number;
  activeClients: number;
  expiringClients: number;
  expiredClients: number;
  recentClients: Array<{
    id: number;
    name: string;
    slug: string;
    subscriptionStatus: string;
    createdAt: string;
  }>;
  subscriptionsByStatus: Record<string, number>;
}

const statusColors: Record<string, string> = {
  active: 'bg-primary',
  grace: 'bg-primary/60',
  expired: 'bg-primary/30',
  manual: 'bg-primary/80',
  internal: 'bg-primary/50',
};

export default function AdminDashboardPage() {
  const api = useApi();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/api/super-admin/dashboard') as { data: DashboardStats };
        setStats(response.data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title">Admin Dashboard</h1>
            <p className="page-description mt-1">System overview and client management</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <ShimmerCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center text-muted-foreground">
        Failed to load dashboard data
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-description mt-1">
            System overview and client management
          </p>
        </div>
        <Link href="/admin/clients/create">
          <Button className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <motion.div
        variants={staggerContainer}
        initial={false}
        animate="animate"
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        <motion.div variants={staggerItem}>
          <Card className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
              <div className="stat-card-icon">
                <Users className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight font-mono">
                <AnimatedNumber value={stats.totalClients} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.activeClients} active
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Card className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Subscriptions</CardTitle>
              <div className="stat-card-icon">
                <TrendingUp className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight font-mono">
                <AnimatedNumber value={stats.subscriptionsByStatus.active || 0} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.subscriptionsByStatus.manual || 0} manual
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Card className={`relative overflow-hidden ${stats.expiringClients > 0 ? 'border-primary/20 bg-secondary/20' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expiring Soon</CardTitle>
              <div className={`stat-card-icon ${stats.expiringClients > 0 ? '' : 'bg-muted !text-muted-foreground'}`}>
                <AlertTriangle className={`h-5 w-5 ${stats.expiringClients > 0 ? 'animate-pulse-ring' : ''}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight font-mono">
                <AnimatedNumber value={stats.expiringClients} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Next 7 days
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Card className={`relative overflow-hidden ${stats.expiredClients > 0 ? 'border-primary/30 bg-secondary/30' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expired</CardTitle>
              <div className={`stat-card-icon ${stats.expiredClients > 0 ? '' : 'bg-muted !text-muted-foreground'}`}>
                <AlertTriangle className={`h-5 w-5 ${stats.expiredClients > 0 ? 'animate-pulse-ring' : ''}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight font-mono">
                <AnimatedNumber value={stats.expiredClients} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Need attention
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2 animate-fade-in">
        {/* Recent Clients */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Clients</CardTitle>
            <CardDescription>Latest additions to the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {stats.recentClients.map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/5">
                      <Building2 className="h-4 w-4 text-primary/70" />
                    </div>
                    <div>
                      <Link
                        href={`/admin/clients/${client.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {client.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{client.slug}</p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`${statusColors[client.subscriptionStatus]} text-white text-[11px]`}
                  >
                    {client.subscriptionStatus}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Link href="/admin/clients">
                <Button variant="outline" className="w-full">
                  View All Clients
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Subscription Status</CardTitle>
            <CardDescription>Distribution by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.subscriptionsByStatus).map(([status, count], i) => {
                const total = Object.values(stats.subscriptionsByStatus).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-2.5 w-2.5 rounded-full ${statusColors[status]}`} />
                        <span className="text-sm capitalize">{status}</span>
                      </div>
                      <span className="text-sm tabular-nums font-medium font-mono">{count}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 0.3 + i * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className={`h-full rounded-full ${statusColors[status]}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
