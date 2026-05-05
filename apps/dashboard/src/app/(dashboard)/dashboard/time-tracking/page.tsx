'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  RefreshCw,
  Clock,
  Timer,
  Ticket,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface WebmasterStats {
  totalHoursThisMonth: number;
  totalHoursAllTime: number;
  activeTickets: number;
  completedTickets: number;
}

interface TimeEntry {
  id: number;
  ticketId: number;
  hours: number;
  description: string;
  isPaid: boolean;
  workDate: string;
  createdAt: string;
  ticket?: {
    id: number;
    ticketNumber: string;
    subject: string;
    status: string;
    tenant?: { name: string };
  };
}

interface TimeEntrySummary {
  totalHours: number;
  paidHours: number;
  unpaidHours: number;
  entries: TimeEntry[];
}

interface AssignedTicket {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  tenant?: { name: string };
  user?: { name: string; email: string };
  createdAt: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-primary text-primary-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-primary/70 text-primary-foreground' },
  waiting_customer: { label: 'Awaiting Reply', className: 'bg-primary/50 text-primary-foreground' },
  resolved: { label: 'Resolved', className: 'bg-primary/80 text-primary-foreground' },
  closed: { label: 'Closed', className: '' },
};

export default function TimeTrackingPage() {
  const api = useApi();
  const { toast } = useToast();

  const [stats, setStats] = useState<WebmasterStats | null>(null);
  const [summary, setSummary] = useState<TimeEntrySummary | null>(null);
  const [assignedTickets, setAssignedTickets] = useState<AssignedTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [formTicketId, setFormTicketId] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const fetchData = useCallback(async () => {
    if (!api.isReady) return;
    setLoading(true);
    try {
      const [statsRes, entriesRes, ticketsRes] = await Promise.all([
        api.get('/api/webmaster/dashboard'),
        api.get('/api/webmaster/time-entries'),
        api.get('/api/webmaster/tickets'),
      ]);
      setStats(statsRes?.data || statsRes);
      setSummary(entriesRes?.data || entriesRes);
      const t = ticketsRes?.data || ticketsRes;
      setAssignedTickets(Array.isArray(t) ? t : []);
    } catch {
      toast({ title: 'Failed to load data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.isReady]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setFormTicketId('');
    setFormHours('');
    setFormDescription('');
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const openCreate = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const openEdit = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setFormTicketId(String(entry.ticketId));
    setFormHours(String(entry.hours));
    setFormDescription(entry.description || '');
    setFormDate(entry.workDate ? format(new Date(entry.workDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
    setShowEditDialog(true);
  };

  const handleCreate = async () => {
    if (!formTicketId || !formHours) return;
    setSaving(true);
    try {
      await api.post('/api/webmaster/time-entries', {
        ticketId: parseInt(formTicketId),
        hours: parseFloat(formHours),
        description: formDescription || undefined,
        workDate: formDate || undefined,
      });
      toast({ title: 'Time entry created' });
      setShowCreateDialog(false);
      fetchData();
    } catch (e: any) {
      toast({ title: 'Failed to create entry', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingEntry || !formHours) return;
    setSaving(true);
    try {
      await api.put(`/api/webmaster/time-entries/${editingEntry.id}`, {
        hours: parseFloat(formHours),
        description: formDescription || undefined,
        workDate: formDate || undefined,
      });
      toast({ title: 'Time entry updated' });
      setShowEditDialog(false);
      setEditingEntry(null);
      fetchData();
    } catch (e: any) {
      toast({ title: 'Failed to update entry', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entryId: number) => {
    setDeleting(entryId);
    try {
      await api.delete(`/api/webmaster/time-entries/${entryId}`);
      toast({ title: 'Time entry deleted' });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Failed to delete entry', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  const entries = summary?.entries || [];
  const activeTickets = assignedTickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved');

  return (
    <div className="space-y-6">
      {/* Header - snappy for webmaster */}
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">Time Tracking</h1>
          <p className="page-description mt-1">Log and manage your work hours</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="shadow-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate} disabled={activeTickets.length === 0}>
            <Plus className="mr-2 h-4 w-4" />
            Log Time
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <div className="stat-card-icon"><Calendar className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{(stats?.totalHoursThisMonth || 0).toFixed(1)}h</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">All Time</CardTitle>
            <div className="stat-card-icon"><Timer className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{(stats?.totalHoursAllTime || 0).toFixed(1)}h</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Tickets</CardTitle>
            <div className="stat-card-icon"><Ticket className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{stats?.activeTickets || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unpaid Hours</CardTitle>
            <div className="stat-card-icon"><Clock className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{(summary?.unpaidHours || 0).toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground">
              {(summary?.paidHours || 0).toFixed(1)}h paid
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Assigned Tickets */}
      {activeTickets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Assigned Tickets</CardTitle>
            <CardDescription>Tickets currently assigned to you</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeTickets.map((t) => {
                  const sc = statusConfig[t.status] || { label: t.status, className: '' };
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-sm">{t.ticketNumber}</TableCell>
                      <TableCell className="font-medium max-w-[250px] truncate">{t.subject}</TableCell>
                      <TableCell className="text-sm">{t.tenant?.name || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="default" className={sc.className}>{sc.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{t.priority}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Time Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Time Entries</CardTitle>
          <CardDescription>
            {entries.length} entries &middot; {(summary?.totalHours || 0).toFixed(1)}h total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Timer className="h-8 w-8 mb-2" />
              <p className="text-sm">No time entries yet</p>
              {activeTickets.length > 0 && (
                <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Log your first entry
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(entry.workDate || entry.createdAt), 'PP')}
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-mono text-sm">{entry.ticket?.ticketNumber || `#${entry.ticketId}`}</span>
                        {entry.ticket?.subject && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{entry.ticket.subject}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{Number(entry.hours).toFixed(1)}h</TableCell>
                    <TableCell className="max-w-[250px] truncate text-sm">{entry.description || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={entry.isPaid ? 'default' : 'outline'}>
                        {entry.isPaid ? 'Paid' : 'Unpaid'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {!entry.isPaid && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(entry)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(entry.id)}
                            disabled={deleting === entry.id}
                          >
                            {deleting === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Time</DialogTitle>
            <DialogDescription>Record time worked on a ticket</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Ticket</Label>
              <Select value={formTicketId} onValueChange={setFormTicketId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ticket" />
                </SelectTrigger>
                <SelectContent>
                  {activeTickets.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.ticketNumber} — {t.subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input
                  type="number"
                  min="0.25"
                  step="0.25"
                  placeholder="1.0"
                  value={formHours}
                  onChange={(e) => setFormHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="What did you work on?"
                rows={3}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !formTicketId || !formHours}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Log Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) { setShowEditDialog(false); setEditingEntry(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
            <DialogDescription>
              {editingEntry?.ticket?.ticketNumber || `Ticket #${editingEntry?.ticketId}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={formHours}
                  onChange={(e) => setFormHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingEntry(null); }}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving || !formHours}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
