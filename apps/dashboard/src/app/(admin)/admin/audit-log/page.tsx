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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { format } from 'date-fns';

interface AuditEntry {
  id: number;
  tenantId: number | null;
  tenantName: string | null;
  userId: number;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  changes: Record<string, { before: any; after: any }> | null;
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}

const actionColors: Record<string, string> = {
  create: 'bg-green-600 text-white',
  update: 'bg-blue-600 text-white',
  delete: 'bg-red-600 text-white',
  login: 'bg-purple-500 text-white',
  logout: 'bg-gray-500 text-white',
  view: 'bg-cyan-500 text-white',
  export: 'bg-amber-500 text-white',
};

export default function AuditLogPage() {
  const api = useApi();
  const { toast } = useToast();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (actionFilter !== 'all') params.append('action', actionFilter);
      if (entityTypeFilter !== 'all') params.append('entityType', entityTypeFilter);

      const response = await api.get(`/api/super-admin/audit-logs?${params.toString()}`);
      const body = response?.data || response;
      if (Array.isArray(body)) {
        setEntries(body);
        setTotal(body.length);
        setTotalPages(1);
      } else {
        setEntries(body?.data || []);
        setTotal(body?.total || 0);
        setTotalPages(body?.totalPages || 1);
      }
    } catch {
      toast({ title: 'Failed to load audit logs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, actionFilter, entityTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleActionChange = (value: string) => {
    setActionFilter(value);
    setPage(1);
  };

  const handleEntityTypeChange = (value: string) => {
    setEntityTypeFilter(value);
    setPage(1);
  };

  const entityTypes = Array.from(new Set(entries.map((e) => e.entityType))).sort();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-description mt-1">Track system activity and changes</p>
        </div>
        <Button variant="outline" className="shadow-sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Select value={actionFilter} onValueChange={handleActionChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
                <SelectItem value="view">View</SelectItem>
                <SelectItem value="export">Export</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityTypeFilter} onValueChange={handleEntityTypeChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {entityTypes.map((et) => (
                  <SelectItem key={et} value={et}>{et}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity Log ({total})</CardTitle>
          <CardDescription>Most recent actions first</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mb-2" />
              <p className="text-sm">No audit log entries found.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(entry.createdAt), 'MMM d, HH:mm:ss')}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.userName || `User ${entry.userId}`}
                      </TableCell>
                      <TableCell>
                        <Badge className={actionColors[entry.action] || 'bg-gray-500 text-white'}>
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{entry.entityType}</span>
                        {entry.entityId && (
                          <span className="text-muted-foreground"> #{entry.entityId}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.tenantName || (entry.tenantId ? `Client ${entry.tenantId}` : 'System')}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {entry.ipAddress || '—'}
                      </TableCell>
                      <TableCell>
                        {(entry.changes || entry.metadata) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDetailEntry(entry)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
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

      <Dialog open={!!detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Audit Entry #{detailEntry?.id} — {detailEntry?.action} {detailEntry?.entityType}
            </DialogTitle>
            <DialogDescription>
              {detailEntry?.createdAt && format(new Date(detailEntry.createdAt), 'PPpp')}
              {' by '}
              {detailEntry?.userName || `User ${detailEntry?.userId}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {detailEntry?.changes && Object.keys(detailEntry.changes).length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Changes</h4>
                <div className="bg-muted rounded-lg p-3 space-y-2">
                  {Object.entries(detailEntry.changes).map(([field, change]) => (
                    <div key={field} className="text-sm">
                      <span className="font-medium">{field}:</span>{' '}
                      <span className="text-red-600 line-through">
                        {JSON.stringify(change.before)}
                      </span>{' '}
                      <span className="text-green-600">
                        {JSON.stringify(change.after)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {detailEntry?.metadata && Object.keys(detailEntry.metadata).length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Metadata</h4>
                <pre className="bg-muted rounded-lg p-3 text-xs overflow-auto">
                  {JSON.stringify(detailEntry.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
