'use client';

import { useState, DragEvent, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, UploadCloud, FileText, RefreshCw, PlayCircle, Copy, Check } from 'lucide-react';

// The importer runs against /api/super-admin/clients/import/{preview|execute}.
// It uses raw fetch (not useApi) because the endpoints are multipart file
// uploads — useApi is JSON-oriented and we need FormData here.

interface PreviewRow {
  index: number;
  row: Record<string, string>;
  status: string;
  message?: string;
}

interface PreviewResult {
  headers: string[];
  rows: PreviewRow[];
  totals: { total: number; ok: number; skipped: number };
}

interface ExecuteResultRow {
  index: number;
  status: string;
  message?: string;
  tenantId?: number;
  generatedPassword?: string;
}

interface ExecuteResult {
  results: ExecuteResultRow[];
  totals: { total: number; created: number; skipped: number; failed: number };
}

const statusBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' => {
  if (status === 'ok') return 'default';
  if (status === 'duplicate_slug' || status === 'duplicate_email') return 'secondary';
  return 'destructive';
};

export default function ImportClientsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const handlePreview = async (selected: File) => {
    if (!session?.accessToken) return;
    setLoading(true);
    setPreview(null);
    setExecuteResult(null);
    try {
      const fd = new FormData();
      fd.append('file', selected);
      const res = await fetch(`${apiUrl}/api/super-admin/clients/import/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.message || `Preview failed (${res.status})`);
      }
      setPreview(body.data ?? body);
    } catch (err: any) {
      toast({
        title: 'Preview failed',
        description: err?.message || 'Could not parse CSV',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!file || !session?.accessToken || !preview) return;
    if (!confirm(`Import ${preview.totals.ok} clients? Rows with errors will be skipped.`)) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${apiUrl}/api/super-admin/clients/import/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.message || `Import failed (${res.status})`);
      }
      const result: ExecuteResult = body.data ?? body;
      setExecuteResult(result);
      toast({
        title: 'Import finished',
        description: `${result.totals.created} created, ${result.totals.skipped} skipped, ${result.totals.failed} failed`,
      });
      router.refresh();
    } catch (err: any) {
      toast({
        title: 'Import failed',
        description: err?.message || 'Server error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (f: File) => {
    if (!/\.csv$/i.test(f.name)) {
      toast({
        title: 'Not a CSV',
        description: 'Please upload a .csv file.',
        variant: 'destructive',
      });
      return;
    }
    setFile(f);
    void handlePreview(f);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  };

  const zoneClass = [
    'flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors',
    isDragging ? 'border-primary bg-primary/5' : 'border-border/70 bg-muted/30 hover:bg-muted/50',
    loading ? 'opacity-70 cursor-not-allowed' : '',
  ].join(' ');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Link href="/admin/clients">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="page-title">Bulk Import Clients</h1>
            <p className="page-description mt-1">
              Upload a CSV to create tenants + admin users in one pass. Preview before executing.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CSV Format</CardTitle>
          <CardDescription>
            First row must be a header. Required columns: <code>name</code>, <code>slug</code>, <code>adminEmail</code>. Optional:{' '}
            <code>adminName</code>, <code>adminPassword</code>, <code>domain</code>, <code>siteName</code>, <code>tier</code> (1|2|3),{' '}
            <code>planId</code>, <code>existingCreditHours</code>, <code>xeroContactId</code>. Blank password → we mint a random one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={zoneClass}
            onClick={() => !loading && inputRef.current?.click()}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {loading ? (
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
            )}
            {file ? (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{file.name}</span>
                <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            ) : (
              <>
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">Drop your CSV here</span>{' '}
                  or <span className="text-primary underline underline-offset-2">browse</span>
                </div>
                <div className="text-xs text-muted-foreground">Up to 5 MB / 2000 rows</div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </CardContent>
      </Card>

      {preview && !executeResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  {preview.totals.total} rows &middot; <span className="text-emerald-600 dark:text-emerald-400">{preview.totals.ok} ok</span> &middot;{' '}
                  <span className="text-amber-600 dark:text-amber-400">{preview.totals.skipped} skipped</span>
                </CardDescription>
              </div>
              <Button
                onClick={handleExecute}
                disabled={loading || preview.totals.ok === 0}
                className="shadow-sm"
              >
                {loading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 h-4 w-4" />
                )}
                Import {preview.totals.ok} valid rows
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px]">Row</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Admin Email</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((r) => (
                  <TableRow key={r.index}>
                    <TableCell className="text-muted-foreground">{r.index + 2}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{r.row.name}</TableCell>
                    <TableCell className="font-mono text-xs">{r.row.slug}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{r.row.adminEmail}</TableCell>
                    <TableCell>{r.row.tier || '1'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
                        {r.message && (
                          <span className="text-xs text-muted-foreground max-w-[280px] truncate" title={r.message}>
                            {r.message}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {executeResult && (
        <Card>
          <CardHeader>
            <CardTitle>Import Complete</CardTitle>
            <CardDescription>
              {executeResult.totals.created} created &middot;{' '}
              {executeResult.totals.skipped} skipped &middot;{' '}
              {executeResult.totals.failed} failed. Copy any generated passwords before leaving this page — they are shown once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px]">Row</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Generated password</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executeResult.results.map((r) => (
                  <TableRow key={r.index}>
                    <TableCell className="text-muted-foreground">{r.index + 2}</TableCell>
                    <TableCell>
                      {r.tenantId ? (
                        <Link href={`/admin/clients/${r.tenantId}`} className="hover:underline">
                          #{r.tenantId}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
                        {r.message && (
                          <span className="text-xs text-muted-foreground max-w-[280px] truncate" title={r.message}>
                            {r.message}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.generatedPassword ? (
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-muted px-2 py-0.5 text-xs">
                            {r.generatedPassword}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              navigator.clipboard.writeText(r.generatedPassword!);
                              setCopiedIndex(r.index);
                              setTimeout(() => setCopiedIndex(null), 1500);
                            }}
                          >
                            {copiedIndex === r.index ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
