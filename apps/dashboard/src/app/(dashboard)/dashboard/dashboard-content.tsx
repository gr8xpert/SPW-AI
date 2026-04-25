'use client';

import { useSession } from 'next-auth/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Building2,
  Users,
  Eye,
  MessageSquare,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

const stats = [
  {
    name: 'Total Properties',
    value: '156',
    change: '+12',
    changeType: 'positive',
    icon: Building2,
  },
  {
    name: 'Total Contacts',
    value: '2,340',
    change: '+180',
    changeType: 'positive',
    icon: Users,
  },
  {
    name: 'Property Views',
    value: '12,450',
    change: '+15%',
    changeType: 'positive',
    icon: Eye,
  },
  {
    name: 'Active Leads',
    value: '89',
    change: '+12',
    changeType: 'positive',
    icon: MessageSquare,
  },
];

export function DashboardContent() {
  const { data: session } = useSession();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description mt-1">
            Welcome back, {session?.user?.name || 'User'}! Here&apos;s what&apos;s
            happening with your properties.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.name}</CardTitle>
              <div className="stat-card-icon bg-primary/5">
                <stat.icon className="h-5 w-5 text-primary/70" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">{stat.value}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs">
                {stat.changeType === 'positive' ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-green-700 font-medium">
                    <TrendingUp className="h-3 w-3" />
                    {stat.change}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-red-700 font-medium">
                    <TrendingDown className="h-3 w-3" />
                    {stat.change}
                  </span>
                )}
                <span className="text-muted-foreground">from last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Activity */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Your latest property views and inquiries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                      <Eye className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Villa in Marbella (REF-00{i})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Property viewed
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {i}h ago
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Properties */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Top Properties</CardTitle>
            <CardDescription>Most viewed properties this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {[
                { ref: 'REF-1234', title: 'Villa in Marbella', views: 456 },
                { ref: 'REF-1235', title: 'Apartment Nueva Andalucia', views: 389 },
                { ref: 'REF-1236', title: 'Penthouse Puerto Banus', views: 312 },
                { ref: 'REF-1237', title: 'Townhouse Estepona', views: 287 },
                { ref: 'REF-1238', title: 'Villa Benahavis', views: 245 },
              ].map((property, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{property.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {property.ref}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm tabular-nums font-medium text-muted-foreground">{property.views}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
