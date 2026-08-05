'use client';

import { useEffect, useState, useMemo } from 'react';
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
  Ticket,
  Clock,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TicketItem {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  tenantId: number;
  tenant?: { id: number; name: string };
  user?: { id: number; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  open:              { label: 'Open',            variant: 'default',   className: 'bg-primary hover:bg-primary text-primary-foreground' },
  in_progress:       { label: 'In Progress',     variant: 'default',   className: 'bg-primary/70 hover:bg-primary/70 text-primary-foreground' },
  waiting_customer:  { label: 'Awaiting Reply',  variant: 'default',   className: 'bg-primary/50 hover:bg-primary/50 text-primary-foreground' },
  resolved:          { label: 'Resolved',        variant: 'default',   className: 'bg-primary/80 hover:bg-primary/80 text-primary-foreground' },
  closed:            { label: 'Closed',          variant: 'secondary' },
};

const priorityConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  low:      { label: 'Low',      variant: 'outline' },
  medium:   { label: 'Medium',   variant: 'secondary' },
  high:     { label: 'High',     variant: 'default' },
  urgent:   { label: 'Urgent',   variant: 'destructive' },
  critical: { label: 'Critical', variant: 'destructive' },
};

export default function WebmasterTicketsPage() {
  const api = useApi();
  const { toast } = useToast();
  const router = useRouter();

  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/webmaster/tickets');
      const body = response?.data ?? response;
      setTickets(Array.isArray(body) ? body : []);
    } catch (err: any) {
      toast({
        title: 'Failed to load tickets',
        description: err?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (api.isReady) fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.isReady]);

  const filteredTickets = useMemo(() => {
    let list = tickets;
    if (statusFilter !== 'all') list = list.filter((t) => t.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.ticketNumber.toLowerCase().includes(q),
      );
    }
    return list;
  }, [tickets, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, waiting_customer: 0, resolved: 0, closed: 0 };
    tickets.forEach((t) => {
      if (t.status in c) c[t.status as keyof typeof c]++;
    });
    return c;
  }, [tickets]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assigned Tickets</h1>
          <p className="page-description mt-1">Tickets currently assigned to you</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTickets} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.open}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.in_progress}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Reply</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.waiting_customer}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.resolved}</div></CardContent>
        </Card>
      </div>

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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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

      <Card>
        <CardHeader>
          <CardTitle>
            {statusFilter === 'all' ? 'All Tickets' : statusConfig[statusFilter]?.label + ' Tickets'}{' '}
            ({filteredTickets.length})
          </CardTitle>
          <CardDescription>Click a row to view details</CardDescription>
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
                {searchQuery ? 'No tickets match your search.' : 'No tickets assigned to you.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket #</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((ticket) => {
                  const sc = statusConfig[ticket.status] ?? { label: ticket.status, variant: 'outline' as const };
                  const pc = priorityConfig[ticket.priority] ?? { label: ticket.priority, variant: 'outline' as const };
                  return (
                    <TableRow
                      key={ticket.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/webmaster/tickets/${ticket.id}`)}
                    >
                      <TableCell className="font-mono text-sm">{ticket.ticketNumber}</TableCell>
                      <TableCell className="font-medium max-w-[300px] truncate">{ticket.subject}</TableCell>
                      <TableCell className="text-sm">
                        {ticket.tenant?.name || `Client ${ticket.tenantId}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant={sc.variant} className={sc.className}>
                          {sc.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={pc.variant}>{pc.label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
