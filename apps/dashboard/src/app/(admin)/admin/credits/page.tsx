'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Loader2,
  RefreshCw,
  CreditCard,
  Plus,
  Minus,
  Users,
  Coins,
  History,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

/* ---------- types ---------- */

interface TenantCredit {
  tenantId: number;
  tenantName: string;
  slug: string;
  balance: number;
  lastActivity: string | null;
}

interface CreditTransaction {
  id: number;
  type: 'add' | 'deduct';
  amount: number;
  reason: string;
  performedBy: string;
  createdAt: string;
}

interface HistoryResponse {
  data: CreditTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/* ---------- component ---------- */

export default function CreditsPage() {
  const api = useApi();
  const { toast } = useToast();

  // tenant list
  const [tenants, setTenants] = useState<TenantCredit[]>([]);
  const [loading, setLoading] = useState(true);

  // history dialog
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTenant, setHistoryTenant] = useState<TenantCredit | null>(null);
  const [history, setHistory] = useState<CreditTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const historyLimit = 10;

  // adjust dialog
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTenant, setAdjustTenant] = useState<TenantCredit | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'deduct'>('add');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  /* ---------- data fetching ---------- */

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/super-admin/credits');
      const body = response?.data || response;
      setTenants(Array.isArray(body) ? body : body?.data || []);
    } catch {
      toast({
        title: 'Failed to load credits',
        description: 'Could not fetch client credit balances.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const fetchHistory = useCallback(
    async (tenantId: number, page: number) => {
      setHistoryLoading(true);
      try {
        const response = await api.get(
          `/api/super-admin/credits/${tenantId}/history?page=${page}&limit=${historyLimit}`,
        );
        const body = response?.data || response;
        if (Array.isArray(body)) {
          setHistory(body);
          setHistoryTotal(body.length);
          setHistoryTotalPages(1);
        } else {
          setHistory(body?.data || []);
          setHistoryTotal(body?.total || 0);
          setHistoryTotalPages(body?.totalPages || 1);
        }
      } catch {
        toast({
          title: 'Failed to load history',
          description: 'Could not fetch credit history for this client.',
          variant: 'destructive',
        });
      } finally {
        setHistoryLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* ---------- actions ---------- */

  const openHistory = (tenant: TenantCredit) => {
    setHistoryTenant(tenant);
    setHistoryPage(1);
    setHistory([]);
    setHistoryOpen(true);
    fetchHistory(tenant.tenantId, 1);
  };

  useEffect(() => {
    if (historyTenant && historyOpen) {
      fetchHistory(historyTenant.tenantId, historyPage);
    }
  }, [historyPage, historyTenant, historyOpen, fetchHistory]);

  const openAdjust = (tenant: TenantCredit) => {
    setAdjustTenant(tenant);
    setAdjustAmount('');
    setAdjustType('add');
    setAdjustReason('');
    setAdjustOpen(true);
  };

  const submitAdjust = async () => {
    if (!adjustTenant) return;

    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Please enter a positive number.',
        variant: 'destructive',
      });
      return;
    }
    if (!adjustReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please provide a reason for this adjustment.',
        variant: 'destructive',
      });
      return;
    }

    setAdjusting(true);
    try {
      await api.post(`/api/super-admin/credits/${adjustTenant.tenantId}/adjust`, {
        amount,
        type: adjustType,
        reason: adjustReason.trim(),
      });
      toast({
        title: 'Credits adjusted',
        description: `Successfully ${adjustType === 'add' ? 'added' : 'deducted'} ${amount} credits for ${adjustTenant.tenantName}.`,
      });
      setAdjustOpen(false);
      fetchTenants();
    } catch {
      toast({
        title: 'Adjustment failed',
        description: 'Could not adjust credits. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAdjusting(false);
    }
  };

  /* ---------- computed ---------- */

  const totalOutstanding = tenants.reduce((sum, t) => sum + (t.balance || 0), 0);
  const tenantsWithBalance = tenants.filter((t) => (t.balance || 0) > 0).length;
  const tenantsWithZero = tenants.filter((t) => (t.balance || 0) === 0).length;

  /* ---------- render ---------- */

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Credits</h1>
          <p className="page-description mt-1">
            Manage credit allocations and usage across all clients
          </p>
        </div>
        <Button variant="outline" className="shadow-sm" onClick={fetchTenants} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credits Outstanding</CardTitle>
            <div className="stat-card-icon bg-amber-50"><Coins className="h-4 w-4 text-amber-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {loading ? '...' : totalOutstanding.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Across all clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clients with Balance</CardTitle>
            <div className="stat-card-icon bg-blue-50"><Users className="h-4 w-4 text-blue-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {loading ? '...' : tenantsWithBalance}
            </div>
            <p className="text-xs text-muted-foreground">
              {tenantsWithZero} client{tenantsWithZero !== 1 ? 's' : ''} at zero
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <div className="stat-card-icon bg-green-50"><CreditCard className="h-4 w-4 text-green-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {loading ? '...' : tenants.length}
            </div>
            <p className="text-xs text-muted-foreground">With credit accounts</p>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Credits Table */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Balances</CardTitle>
          <CardDescription>
            Click a row to view transaction history. Use the adjust button to add or deduct credits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <CreditCard className="h-8 w-8 mb-2" />
              <p className="text-sm">No client credit records found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead className="w-[180px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow
                    key={tenant.tenantId}
                    className="cursor-pointer"
                    onClick={() => openHistory(tenant)}
                  >
                    <TableCell className="font-medium">{tenant.tenantName}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {tenant.slug}
                      </code>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex items-center rounded-md px-3 py-1 text-base font-bold font-mono ${
                          tenant.balance > 0
                            ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {tenant.balance.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tenant.lastActivity
                        ? formatDistanceToNow(new Date(tenant.lastActivity), {
                            addSuffix: true,
                          })
                        : 'No activity'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openHistory(tenant)}
                        >
                          <History className="mr-1 h-3 w-3" />
                          History
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => openAdjust(tenant)}
                        >
                          <Coins className="mr-1 h-3 w-3" />
                          Adjust
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Credit History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Credit History &mdash; {historyTenant?.tenantName}
            </DialogTitle>
            <DialogDescription>
              Transaction log for{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {historyTenant?.slug}
              </code>
              . Current balance:{' '}
              <strong>{historyTenant?.balance.toLocaleString()}</strong> credits.
            </DialogDescription>
          </DialogHeader>

          {historyLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <History className="h-8 w-8 mb-2" />
              <p className="text-sm">No transactions recorded yet.</p>
            </div>
          ) : (
            <>
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Performed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(tx.createdAt), 'MMM d, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          {tx.type === 'add' ? (
                            <Badge className="bg-green-600 hover:bg-green-700 text-white">
                              <Plus className="mr-1 h-3 w-3" />
                              Add
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <Minus className="mr-1 h-3 w-3" />
                              Deduct
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {tx.type === 'add' ? '+' : '-'}
                          {tx.amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {tx.reason}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {tx.performedBy}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* History Pagination */}
              {historyTotalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    Showing {(historyPage - 1) * historyLimit + 1} to{' '}
                    {Math.min(historyPage * historyLimit, historyTotal)} of {historyTotal}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((p) => p - 1)}
                      disabled={historyPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs">
                      Page {historyPage} of {historyTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((p) => p + 1)}
                      disabled={historyPage === historyTotalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Adjust Credits Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Credits</DialogTitle>
            <DialogDescription>
              {adjustType === 'add' ? 'Add credits to' : 'Deduct credits from'}{' '}
              <strong>{adjustTenant?.tenantName}</strong>. Current balance:{' '}
              <strong>{adjustTenant?.balance.toLocaleString()}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="adjust-type">Type</Label>
              <Select
                value={adjustType}
                onValueChange={(v) => setAdjustType(v as 'add' | 'deduct')}
              >
                <SelectTrigger id="adjust-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">
                    <span className="flex items-center gap-2">
                      <Plus className="h-3 w-3 text-green-600" />
                      Add Credits
                    </span>
                  </SelectItem>
                  <SelectItem value="deduct">
                    <span className="flex items-center gap-2">
                      <Minus className="h-3 w-3 text-red-600" />
                      Deduct Credits
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-amount">Amount</Label>
              <Input
                id="adjust-amount"
                type="number"
                min="1"
                step="1"
                placeholder="Enter credit amount"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-reason">Reason</Label>
              <Textarea
                id="adjust-reason"
                placeholder="Why are these credits being adjusted?"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdjustOpen(false)}
              disabled={adjusting}
            >
              Cancel
            </Button>
            <Button
              onClick={submitAdjust}
              disabled={adjusting || !adjustAmount || !adjustReason.trim()}
              variant={adjustType === 'deduct' ? 'destructive' : 'default'}
            >
              {adjusting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {adjustType === 'add' ? 'Add Credits' : 'Deduct Credits'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
