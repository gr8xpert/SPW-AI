'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw,
  Users,
  Clock,
  DollarSign,
  Loader2,
  Plus,
  Power,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface Webmaster {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface UnpaidSummary {
  userId: number;
  userName: string;
  totalHours: number;
  entryCount: number;
}

interface TimeEntry {
  id: number;
  userId: number;
  ticketId: number | null;
  ticketNumber?: string;
  hours: number;
  description: string;
  isPaid: boolean;
  date: string;
  createdAt: string;
}

export default function WebmastersPage() {
  const api = useApi();
  const { toast } = useToast();

  const [webmasters, setWebmasters] = useState<Webmaster[]>([]);
  const [unpaidSummary, setUnpaidSummary] = useState<UnpaidSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedWebmaster, setSelectedWebmaster] = useState<Webmaster | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(new Set());
  const [markingPaid, setMarkingPaid] = useState(false);

  // Create webmaster dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [wmRes, unpaidRes] = await Promise.all([
        api.get('/api/super-admin/webmasters'),
        api.get('/api/super-admin/webmasters/unpaid-hours'),
      ]);
      const wmBody = wmRes?.data || wmRes;
      setWebmasters(Array.isArray(wmBody) ? wmBody : wmBody?.data || []);
      const upBody = unpaidRes?.data || unpaidRes;
      setUnpaidSummary(Array.isArray(upBody) ? upBody : upBody?.data || []);
    } catch {
      toast({ title: 'Failed to load webmasters', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openDetail = async (wm: Webmaster) => {
    setSelectedWebmaster(wm);
    setSelectedEntries(new Set());
    setEntriesLoading(true);
    try {
      const res = await api.get(`/api/super-admin/webmasters/${wm.id}/time-entries`);
      const body = res?.data || res;
      setTimeEntries(Array.isArray(body) ? body : body?.data || []);
    } catch {
      toast({ title: 'Failed to load time entries', variant: 'destructive' });
      setTimeEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  };

  const toggleEntry = (id: number) => {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMarkPaid = async () => {
    if (selectedEntries.size === 0) return;
    setMarkingPaid(true);
    try {
      await api.post('/api/super-admin/webmasters/time-entries/mark-paid', {
        entryIds: Array.from(selectedEntries),
      });
      setTimeEntries((prev) =>
        prev.map((e) => (selectedEntries.has(e.id) ? { ...e, isPaid: true } : e))
      );
      setSelectedEntries(new Set());
      toast({ title: `Marked ${selectedEntries.size} entries as paid` });
      fetchData();
    } catch {
      toast({ title: 'Failed to mark as paid', variant: 'destructive' });
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleCreate = async () => {
    if (!createName.trim() || !createEmail.trim() || !createPassword.trim()) return;
    setCreating(true);
    try {
      await api.post('/api/super-admin/webmasters', {
        name: createName.trim(),
        email: createEmail.trim(),
        password: createPassword,
      });
      toast({ title: `Webmaster ${createName.trim()} created` });
      setCreateOpen(false);
      setCreateName('');
      setCreateEmail('');
      setCreatePassword('');
      fetchData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to create webmaster';
      toast({ title: msg, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (e: React.MouseEvent, wm: Webmaster) => {
    e.stopPropagation();
    try {
      await api.put(`/api/super-admin/webmasters/${wm.id}`, { isActive: !wm.isActive });
      toast({ title: `${wm.name} ${wm.isActive ? 'deactivated' : 'activated'}` });
      fetchData();
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    }
  };

  const getUnpaidHours = (userId: number) => {
    return unpaidSummary.find((s) => s.userId === userId)?.totalHours || 0;
  };

  const getUnpaidCount = (userId: number) => {
    return unpaidSummary.find((s) => s.userId === userId)?.entryCount || 0;
  };

  const totalUnpaidHours = unpaidSummary.reduce((sum, s) => sum + s.totalHours, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Webmasters</h1>
          <p className="page-description mt-1">Manage webmaster accounts and track time</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="shadow-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button className="shadow-sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Webmaster
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Webmasters</CardTitle>
            <div className="stat-card-icon bg-blue-50"><Users className="h-4 w-4 text-blue-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{webmasters.length}</div>
            <p className="text-xs text-muted-foreground">
              {webmasters.filter((w) => w.isActive).length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unpaid Hours</CardTitle>
            <div className="stat-card-icon bg-amber-50"><Clock className="h-4 w-4 text-amber-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{totalUnpaidHours.toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground">
              Across {unpaidSummary.length} webmasters
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unpaid Entries</CardTitle>
            <div className="stat-card-icon bg-green-50"><DollarSign className="h-4 w-4 text-green-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {unpaidSummary.reduce((sum, s) => sum + s.entryCount, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Time entries awaiting payment</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Webmasters</CardTitle>
          <CardDescription>Click a webmaster to view their time entries</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : webmasters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mb-2" />
              <p className="text-sm">No webmasters yet. Click &quot;Add Webmaster&quot; to create one.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Unpaid Hours</TableHead>
                  <TableHead>Unpaid Entries</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webmasters.map((wm) => (
                  <TableRow
                    key={wm.id}
                    className="cursor-pointer"
                    onClick={() => openDetail(wm)}
                  >
                    <TableCell className="font-medium">{wm.name || 'Unnamed'}</TableCell>
                    <TableCell>{wm.email}</TableCell>
                    <TableCell>
                      <Badge variant={wm.isActive ? 'default' : 'secondary'}>
                        {wm.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {getUnpaidHours(wm.id).toFixed(1)}h
                    </TableCell>
                    <TableCell className="font-mono">{getUnpaidCount(wm.id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {wm.lastLoginAt
                        ? formatDistanceToNow(new Date(wm.lastLoginAt), { addSuffix: true })
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(wm.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={wm.isActive ? 'Deactivate' : 'Activate'}
                        onClick={(e) => toggleActive(e, wm)}
                      >
                        <Power className={`h-4 w-4 ${wm.isActive ? 'text-green-600' : 'text-muted-foreground'}`} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Webmaster Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Webmaster</DialogTitle>
            <DialogDescription>
              Create a new webmaster account. They will be able to log in and manage assigned tickets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="wm-name">Full Name</Label>
              <Input
                id="wm-name"
                placeholder="John Doe"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wm-email">Email</Label>
              <Input
                id="wm-email"
                type="email"
                placeholder="john@example.com"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wm-password">Password</Label>
              <Input
                id="wm-password"
                type="password"
                placeholder="Minimum 8 characters"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !createName.trim() || !createEmail.trim() || createPassword.length < 8}
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Webmaster
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Time Entries Dialog */}
      <Dialog open={!!selectedWebmaster} onOpenChange={(open) => !open && setSelectedWebmaster(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedWebmaster?.name || 'Webmaster'} — Time Entries</DialogTitle>
            <DialogDescription>{selectedWebmaster?.email}</DialogDescription>
          </DialogHeader>

          {entriesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : timeEntries.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">No time entries found</p>
          ) : (
            <>
              {selectedEntries.size > 0 && (
                <div className="flex items-center justify-between bg-muted p-3 rounded-lg">
                  <span className="text-sm">{selectedEntries.size} entries selected</span>
                  <Button size="sm" onClick={handleMarkPaid} disabled={markingPaid}>
                    {markingPaid && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    <DollarSign className="mr-1 h-3 w-3" />
                    Mark as Paid
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {!entry.isPaid && (
                          <Checkbox
                            checked={selectedEntries.has(entry.id)}
                            onCheckedChange={() => toggleEntry(entry.id)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(entry.date || entry.createdAt), 'PP')}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {entry.ticketNumber || (entry.ticketId ? `#${entry.ticketId}` : '—')}
                      </TableCell>
                      <TableCell className="font-mono">{entry.hours.toFixed(1)}h</TableCell>
                      <TableCell className="max-w-[250px] truncate text-sm">
                        {entry.description || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.isPaid ? 'default' : 'outline'}>
                          {entry.isPaid ? 'Paid' : 'Unpaid'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
