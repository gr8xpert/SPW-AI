'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
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
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Ticket,
  Clock,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/* ---------- Types ---------- */

interface TicketItem {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  tenantId: number;
  tenantName?: string;
  clientName?: string;
  assignedTo: number | null;
  assignedToName?: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketStats {
  open: number;
  inProgress: number;
  waitingCustomer: number;
  resolved: number;
  closed: number;
}

/* ---------- Colour maps ---------- */

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  open:              { label: 'Open',            variant: 'default',     className: 'bg-primary hover:bg-primary text-primary-foreground' },
  in_progress:       { label: 'In Progress',     variant: 'default',     className: 'bg-primary/70 hover:bg-primary/70 text-primary-foreground' },
  waiting_customer:  { label: 'Awaiting Reply',  variant: 'default',     className: 'bg-primary/50 hover:bg-primary/50 text-primary-foreground' },
  resolved:          { label: 'Resolved',        variant: 'default',     className: 'bg-primary/80 hover:bg-primary/80 text-primary-foreground' },
  closed:            { label: 'Closed',          variant: 'secondary' },
};

const priorityConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  low:      { label: 'Low',      variant: 'outline' },
  medium:   { label: 'Medium',   variant: 'secondary' },
  high:     { label: 'High',     variant: 'default' },
  critical: { label: 'Critical', variant: 'destructive' },
};

const statCardConfig: { key: string; statsKey: keyof TicketStats; label: string; icon: React.ReactNode }[] = [
  { key: 'open', statsKey: 'open', label: 'Open', icon: <div className="stat-card-icon"><AlertCircle className="h-4 w-4" /></div> },
  { key: 'in_progress', statsKey: 'inProgress', label: 'In Progress', icon: <div className="stat-card-icon"><Clock className="h-4 w-4" /></div> },
  { key: 'waiting_customer', statsKey: 'waitingCustomer', label: 'Awaiting Reply', icon: <div className="stat-card-icon"><MessageSquare className="h-4 w-4" /></div> },
  { key: 'resolved', statsKey: 'resolved', label: 'Resolved', icon: <div className="stat-card-icon"><CheckCircle2 className="h-4 w-4" /></div> },
  { key: 'closed', statsKey: 'closed', label: 'Closed', icon: <div className="stat-card-icon"><XCircle className="h-4 w-4" /></div> },
];

/* ---------- Helpers ---------- */

function unwrap<T>(response: any): T {
  const body = response?.data ?? response;
  return body as T;
}

function unwrapArray<T>(response: any): T[] {
  const body = response?.data ?? response;
  return Array.isArray(body) ? body : (body?.data ?? []);
}

/* ---------- Component ---------- */

export default function AdminTicketsPage() {
  const api = useApi();
  const { toast } = useToast();
  const router = useRouter();

  /* State */
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  /* Filters */
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  /* Fetch stats */
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await api.get('/api/super-admin/tickets/stats');
      const body = unwrap<TicketStats>(response);
      setStats(body);
    } catch (err: any) {
      toast({
        title: 'Failed to load ticket stats',
        description: err?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setStatsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Fetch tickets */
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      const response = await api.get(`/api/super-admin/tickets?${params.toString()}`);
      const body = response?.data ?? response;

      if (Array.isArray(body)) {
        setTickets(body);
        setTotal(body.length);
      } else {
        setTickets(body?.data ?? []);
        setTotal(body?.total ?? 0);
      }
    } catch (err: any) {
      toast({
        title: 'Failed to load tickets',
        description: err?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  /* Client-side search filter */
  const filteredTickets = useMemo(() => {
    if (!searchQuery.trim()) return tickets;
    const q = searchQuery.toLowerCase();
    return tickets.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        t.ticketNumber.toLowerCase().includes(q)
    );
  }, [tickets, searchQuery]);

  const totalPages = Math.ceil(total / limit);

  /* Event handlers */
  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleRefresh = () => {
    fetchStats();
    fetchTickets();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Support Tickets</h1>
          <p className="page-description mt-1">
            Manage customer support tickets across all clients
          </p>
        </div>
        <Button variant="outline" size="sm" className="shadow-sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        {statCardConfig.map((card) => (
          <Card key={card.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {card.label}
              </CardTitle>
              {card.icon}
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-2xl font-bold tracking-tight">{stats?.[card.statsKey] ?? 0}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by subject or ticket number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="waiting_customer">Awaiting Reply</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Ticket Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {statusFilter === 'all' ? 'All Tickets' : statusConfig[statusFilter]?.label + ' Tickets'}{' '}
            ({total})
          </CardTitle>
          <CardDescription>
            Viewing page {page} of {Math.max(totalPages, 1)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Ticket className="h-8 w-8 mb-2" />
              <p className="text-sm">
                {searchQuery
                  ? 'No tickets match your search.'
                  : 'No tickets found.'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Assigned To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map((ticket) => {
                    const sc = statusConfig[ticket.status] ?? { label: ticket.status, variant: 'outline' as const };
                    const pc = priorityConfig[ticket.priority] ?? { label: ticket.priority, variant: 'outline' as const };

                    return (
                      <TableRow key={ticket.id} className="cursor-pointer" onClick={() => router.push(`/admin/tickets/${ticket.id}`)}>
                        <TableCell className="font-mono text-sm">
                          {ticket.ticketNumber}
                        </TableCell>
                        <TableCell className="font-medium max-w-[300px] truncate">
                          {ticket.subject}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="text-sm">
                              {ticket.clientName || ticket.tenantName || `Client ${ticket.tenantId}`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={sc.variant} className={sc.className}>
                            {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={pc.variant}>
                            {pc.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-sm">
                          {ticket.assignedToName || (ticket.assignedTo ? `User ${ticket.assignedTo}` : <span className="text-muted-foreground">Unassigned</span>)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} tickets
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
                    <span className="text-sm">
                      Page {page} of {totalPages}
                    </span>
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
