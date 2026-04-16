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

export default function DashboardPage() {
  const { data: session } = useSession();

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {session?.user?.name || 'User'}! Here&apos;s what&apos;s
          happening with your properties.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.name}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {stat.changeType === 'positive' ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span
                  className={
                    stat.changeType === 'positive'
                      ? 'text-green-500'
                      : 'text-red-500'
                  }
                >
                  {stat.change}
                </span>{' '}
                from last month
              </p>
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
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                      <Eye className="h-5 w-5 text-muted-foreground" />
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
                    {i} hour{i > 1 ? 's' : ''} ago
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
            <div className="space-y-4">
              {[
                { ref: 'REF-1234', title: 'Villa in Marbella', views: 456 },
                { ref: 'REF-1235', title: 'Apartment Nueva Andalucia', views: 389 },
                { ref: 'REF-1236', title: 'Penthouse Puerto Banus', views: 312 },
                { ref: 'REF-1237', title: 'Townhouse Estepona', views: 287 },
                { ref: 'REF-1238', title: 'Villa Benahavis', views: 245 },
              ].map((property, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-6">
                      {i + 1}.
                    </span>
                    <div>
                      <p className="text-sm font-medium">{property.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {property.ref}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-medium">{property.views} views</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
