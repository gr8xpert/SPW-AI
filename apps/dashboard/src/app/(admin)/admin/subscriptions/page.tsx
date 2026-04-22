'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  RefreshCw,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Client {
  id: number;
  name: string;
  slug: string;
  subscriptionStatus: string;
  billingCycle: string | null;
  billingSource: string | null;
  expiresAt: string | null;
  adminOverride: boolean;
  isInternal: boolean;
  planName?: string;
  planId: number;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-500',
  grace: 'bg-yellow-500',
  expired: 'bg-red-500',
  manual: 'bg-blue-500',
  internal: 'bg-purple-500',
};

const statusIcons: Record<string, React.ReactNode> = {
  active: <CheckCircle className="h-4 w-4 text-green-500" />,
  grace: <Clock className="h-4 w-4 text-yellow-500" />,
  expired: <AlertTriangle className="h-4 w-4 text-red-500" />,
  manual: <CreditCard className="h-4 w-4 text-blue-500" />,
  internal: <CreditCard className="h-4 w-4 text-purple-500" />,
};

export default function SubscriptionsPage() {
  const api = useApi();
  const { toast } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('subscriptionStatus', statusFilter);
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      const response = await api.get(`/api/super-admin/clients?${params.toString()}`);
      const body = response?.data || response;
      if (Array.isArray(body)) {
        setClients(body);
        setTotal(body.length);
      } else {
        setClients(body?.data || []);
        setTotal(body?.total || 0);
      }
    } catch {
      toast({ title: 'Failed to load subscriptions', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  const statusCounts = clients.reduce(
    (acc, c) => {
      acc[c.subscriptionStatus] = (acc[c.subscriptionStatus] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">Manage client subscriptions and billing status</p>
        </div>
        <Button variant="outline" onClick={fetchClients} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {(['active', 'manual', 'grace', 'expired', 'internal'] as const).map((status) => (
          <Card
            key={status}
            className={`cursor-pointer transition-colors ${statusFilter === status ? 'ring-2 ring-primary' : ''}`}
            onClick={() => handleStatusChange(statusFilter === status ? 'all' : status)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium capitalize">{status}</CardTitle>
              {statusIcons[status]}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statusCounts[status] || 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Subscriptions ({total})</CardTitle>
              <CardDescription>Click a client to view full details</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="grace">Grace Period</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : clients.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">
              No subscriptions found for this filter.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="font-medium hover:underline"
                        >
                          {client.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{client.slug}</p>
                      </TableCell>
                      <TableCell>{client.planName || `Plan ${client.planId}`}</TableCell>
                      <TableCell>
                        <Badge className={`${statusColors[client.subscriptionStatus]} text-white`}>
                          {client.subscriptionStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize text-sm">
                        {client.billingCycle || '—'}
                      </TableCell>
                      <TableCell className="capitalize text-sm">
                        {client.billingSource || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {client.expiresAt
                          ? formatDistanceToNow(new Date(client.expiresAt), { addSuffix: true })
                          : 'Never'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {client.adminOverride && (
                            <Badge variant="outline" className="text-xs">Override</Badge>
                          )}
                          {client.isInternal && (
                            <Badge variant="outline" className="text-xs">Internal</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm">Page {page} of {totalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
