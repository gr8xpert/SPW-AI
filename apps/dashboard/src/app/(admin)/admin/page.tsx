'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { Users, AlertTriangle, TrendingUp, Building2, Plus } from 'lucide-react';
import Link from 'next/link';

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
  active: 'bg-green-500',
  grace: 'bg-yellow-500',
  expired: 'bg-red-500',
  manual: 'bg-blue-500',
  internal: 'bg-purple-500',
};

export default function AdminDashboardPage() {
  const api = useApi();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/api/super-admin/dashboard');
        setStats((response as any).data);
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted border-t-primary"></div>
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
            <div className="stat-card-icon bg-blue-50">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{stats.totalClients}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.activeClients} active
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Subscriptions</CardTitle>
            <div className="stat-card-icon bg-green-50">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{stats.subscriptionsByStatus.active || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.subscriptionsByStatus.manual || 0} manual
            </p>
          </CardContent>
        </Card>

        <Card className={`relative overflow-hidden ${stats.expiringClients > 0 ? 'border-yellow-200 bg-yellow-50/30' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expiring Soon</CardTitle>
            <div className={`stat-card-icon ${stats.expiringClients > 0 ? 'bg-yellow-100' : 'bg-muted'}`}>
              <AlertTriangle className={`h-5 w-5 ${stats.expiringClients > 0 ? 'text-yellow-600' : 'text-muted-foreground'}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{stats.expiringClients}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Next 7 days
            </p>
          </CardContent>
        </Card>

        <Card className={`relative overflow-hidden ${stats.expiredClients > 0 ? 'border-red-200 bg-red-50/30' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expired</CardTitle>
            <div className={`stat-card-icon ${stats.expiredClients > 0 ? 'bg-red-100' : 'bg-muted'}`}>
              <AlertTriangle className={`h-5 w-5 ${stats.expiredClients > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{stats.expiredClients}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Need attention
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Clients */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Clients</CardTitle>
            <CardDescription>Latest additions to the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {stats.recentClients.map((client) => (
                <div key={client.id} className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted/50">
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
              {Object.entries(stats.subscriptionsByStatus).map(([status, count]) => {
                const total = Object.values(stats.subscriptionsByStatus).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-2.5 w-2.5 rounded-full ${statusColors[status]}`} />
                        <span className="text-sm capitalize">{status}</span>
                      </div>
                      <span className="text-sm tabular-nums font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${statusColors[status]} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
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
