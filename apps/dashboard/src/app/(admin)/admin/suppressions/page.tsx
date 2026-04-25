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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  RefreshCw,
  Mail,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';

interface Suppression {
  id: number;
  tenantId: number;
  tenantName: string | null;
  email: string;
  reason: string | null;
  createdBy: number;
  createdByName: string | null;
  createdAt: string;
}

export default function SuppressionsPage() {
  const api = useApi();
  const { toast } = useToast();

  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Suppression | null>(null);
  const limit = 50;

  const fetchSuppressions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (search.trim()) params.append('search', search.trim());

      const response = await api.get(`/api/super-admin/suppressions?${params.toString()}`);
      const body = response?.data || response;
      if (Array.isArray(body)) {
        setSuppressions(body);
        setTotal(body.length);
        setTotalPages(1);
      } else {
        setSuppressions(body?.data || []);
        setTotal(body?.total || 0);
        setTotalPages(body?.totalPages || 1);
      }
    } catch {
      toast({ title: 'Failed to load suppressions', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  useEffect(() => {
    fetchSuppressions();
  }, [fetchSuppressions]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSuppressions();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/super-admin/suppressions/${deleteTarget.id}`);
      toast({ title: `Removed suppression for ${deleteTarget.email}` });
      setDeleteTarget(null);
      fetchSuppressions();
    } catch {
      toast({ title: 'Failed to remove suppression', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email Suppressions</h1>
          <p className="page-description mt-1">
            Manage email suppression lists across all clients
          </p>
        </div>
        <Button variant="outline" className="shadow-sm" onClick={fetchSuppressions} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by email address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="shadow-sm">
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suppressed Emails ({total})</CardTitle>
          <CardDescription>
            These email addresses will not receive any emails from the system.
            Remove a suppression to re-enable delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : suppressions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Mail className="h-8 w-8 mb-2" />
              <p className="text-sm">
                {search ? 'No suppressions match your search.' : 'No email suppressions found.'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Added By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppressions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.email}</TableCell>
                      <TableCell className="text-sm">
                        {s.tenantName || `Client ${s.tenantId}`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">
                        {s.reason || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.createdByName || `User ${s.createdBy}`}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(s.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(s)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the suppression for <strong>{deleteTarget?.email}</strong>?
              This will allow emails to be sent to this address again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Remove Suppression
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
