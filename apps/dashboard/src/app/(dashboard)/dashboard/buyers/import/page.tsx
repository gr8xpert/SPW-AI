'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { BuyersNav } from '../_components/buyers-nav';
import { buyerKeys, one } from '../use-buyers';

const MANAGER_ROLES = new Set(['admin', 'webmaster', 'super_admin']);
const SHOWN_BUYERS = 100;

interface Choice {
  value: string | number;
  label: string;
}

interface Preview {
  total: number;
  toCreate: number;
  toUpdate: number;
  noEmail: number;
  suggestions: number;
  unknownHeaders: string[];
  missingColumns: string[];
  buyers: { row: number; odooId: string; name: string; email: string | null; action: 'create' | 'update'; buyerId: number | null; unmatched: number }[];
  unmatched: { kind: string; key: string; value: string; column: string; count: number }[];
  choices: Record<string, Choice[]>;
  missingReferences: { reference: string; count: number }[];
}

interface Result {
  created: number;
  updated: number;
  suggestions: number;
  notMatched: number;
  missingReferences: { reference: string; count: number }[];
  errors: { row: number; odooId: string; message: string }[];
}

type Mapping = Record<string, Record<string, string>>;

function Stat({ label, value, help }: { label: string; value: number; help?: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      {help && value > 0 ? <div className="mt-1 text-xs text-muted-foreground">{help}</div> : null}
    </div>
  );
}

function ImportInner() {
  const t = useBuyerText();
  const s = t.importPage;
  const api = useApi();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: session } = useSession();
  const canImport = MANAGER_ROLES.has(String(session?.user?.role ?? ''));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);

  const send = async (path: string, withMapping: boolean) => {
    const form = new FormData();
    form.append('file', file as File);
    if (withMapping) form.append('mapping', JSON.stringify(mapping));
    return one(await api.post(`/api/dashboard/buyers/import/odoo/${path}`, form));
  };

  const check = async () => {
    if (!file) return;
    setBusy('preview');
    setResult(null);
    try {
      setPreview((await send('preview', false)) as Preview);
      setMapping({});
    } catch (err) {
      toast({ title: s.failed, description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    setBusy('apply');
    try {
      setResult((await send('apply', true)) as Result);
      setPreview(null);
      void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
    } catch (err) {
      toast({ title: s.failed, description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setMapping({});
  };

  const kindLabel = (kind: string) => s.kinds[kind.startsWith('option:') ? 'option' : kind] ?? kind;
  const setChoice = (kind: string, key: string, value: string) =>
    setMapping((prev) => {
      const next = { ...prev, [kind]: { ...(prev[kind] ?? {}) } };
      if (value) next[kind][key] = value;
      else delete next[kind][key];
      return next;
    });

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{s.title}</h1>
          <p className="page-description mt-1">{s.description}</p>
        </div>
      </div>
      <BuyersNav />

      {!canImport ? (
        <p className="max-w-3xl rounded-md border bg-muted/40 p-3 text-sm">{s.adminsOnly}</p>
      ) : (
        <>
          {!preview && !result ? (
            <Card className="max-w-3xl">
              <CardContent className="space-y-4 p-6">
                <p className="text-sm text-muted-foreground">{s.howTo}</p>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-4 hover:bg-muted/40">
                  <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm">
                    <span className="block font-medium">{s.file}</span>
                    <span className="text-muted-foreground">{file ? file.name : '—'}</span>
                  </span>
                  <input
                    type="file"
                    name="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="sr-only"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <Button onClick={check} disabled={!file || busy !== null}>
                  {busy === 'preview' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {busy === 'preview' ? s.checking : s.preview}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {preview ? (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{s.summary}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <Stat label={s.total} value={preview.total} />
                    <Stat label={s.toCreate} value={preview.toCreate} />
                    <Stat label={s.toUpdate} value={preview.toUpdate} />
                    <Stat label={s.noEmail} value={preview.noEmail} help={s.noEmailHelp} />
                    <Stat label={s.suggestions} value={preview.suggestions} />
                  </div>
                  {preview.missingColumns.length ? (
                    <p className="flex items-start gap-2 text-sm text-amber-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {s.missingColumns} {preview.missingColumns.join(', ')}
                    </p>
                  ) : null}
                  {preview.unknownHeaders.length ? (
                    <p className="text-sm text-muted-foreground">
                      {s.unknownHeaders} {preview.unknownHeaders.join(', ')}
                    </p>
                  ) : null}
                  {preview.missingReferences.length ? (
                    <p className="text-sm text-muted-foreground">
                      {s.missingRefs} {preview.missingReferences.map((m) => m.reference).join(', ')}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{s.unmatchedTitle}</CardTitle>
                  {preview.unmatched.length ? <p className="text-sm text-muted-foreground">{s.unmatchedHelp}</p> : null}
                </CardHeader>
                <CardContent>
                  {!preview.unmatched.length ? (
                    <p className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      {s.allMatched}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="unmatched">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-2 pr-3 font-medium">{s.column}</th>
                            <th className="py-2 pr-3 font-medium">{s.value}</th>
                            <th className="py-2 pr-3 text-right font-medium">{s.buyers}</th>
                            <th className="py-2 font-medium">{s.mapTo}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.unmatched.map((u) => (
                            <tr key={`${u.kind}|${u.key}`} className="border-b last:border-0">
                              <td className="py-2 pr-3 text-muted-foreground">{u.column}</td>
                              <td className="py-2 pr-3 font-medium">{u.value}</td>
                              <td className="py-2 pr-3 text-right tabular-nums">{u.count}</td>
                              <td className="py-2">
                                <select
                                  aria-label={`${kindLabel(u.kind)}: ${u.value}`}
                                  className="h-9 w-full min-w-0 max-w-sm rounded-md border bg-background px-2 text-sm"
                                  value={mapping[u.kind]?.[u.key] ?? ''}
                                  onChange={(e) => setChoice(u.kind, u.key, e.target.value)}
                                >
                                  <option value="">{s.keepAsNote}</option>
                                  {(preview.choices[u.kind] ?? []).map((c) => (
                                    <option key={String(c.value)} value={String(c.value)}>
                                      {kindLabel(u.kind)}: {c.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{s.buyersTitle}</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">{s.name}</th>
                        <th className="py-2 pr-3 font-medium">{s.email}</th>
                        <th className="py-2 pr-3 font-medium">{s.action}</th>
                        <th className="py-2 text-right font-medium">{s.notMatchedCount}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.buyers.slice(0, SHOWN_BUYERS).map((b) => (
                        <tr key={b.odooId} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            {b.buyerId ? (
                              <Link href={`/dashboard/buyers/${b.buyerId}`} className="text-primary hover:underline">{b.name}</Link>
                            ) : (
                              b.name
                            )}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">{b.email ?? '—'}</td>
                          <td className="py-2 pr-3">
                            <Badge variant={b.action === 'create' ? 'default' : 'secondary'}>{b.action === 'create' ? s.create : s.update}</Badge>
                          </td>
                          <td className="py-2 text-right tabular-nums">{b.unmatched || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.total > SHOWN_BUYERS ? <p className="mt-2 text-sm text-muted-foreground">{s.more(preview.total - SHOWN_BUYERS)}</p> : null}
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-2">
                <Button onClick={apply} disabled={busy !== null || !preview.total}>
                  {busy === 'apply' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {busy === 'apply' ? s.applying : s.apply(preview.total)}
                </Button>
                <Button variant="outline" onClick={reset} disabled={busy !== null}>{s.another}</Button>
              </div>
            </div>
          ) : null}

          {result ? (
            <Card className="max-w-3xl" data-testid="import-result">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  {s.done}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-1">
                  <li>{s.created(result.created)}</li>
                  <li>{s.updated(result.updated)}</li>
                  <li>{s.suggestionsDone(result.suggestions)}</li>
                  <li>{s.notMatchedDone(result.notMatched)}</li>
                </ul>
                {result.missingReferences.length ? (
                  <p className="text-muted-foreground">{s.missingRefs} {result.missingReferences.map((m) => m.reference).join(', ')}</p>
                ) : null}
                {result.errors.length ? (
                  <div className="text-destructive">
                    <p>{s.errors}</p>
                    <ul className="list-disc pl-5">
                      {result.errors.map((e) => <li key={e.odooId}>Row {e.row} ({e.odooId}): {e.message}</li>)}
                    </ul>
                  </div>
                ) : null}
                <div className="flex gap-2 pt-2">
                  <Button asChild><Link href="/dashboard/buyers">{s.toBuyers}</Link></Button>
                  <Button variant="outline" onClick={reset}>{s.another}</Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function BuyerImportPage() {
  const t = useBuyerText();
  return (
    <LockedRouteGuard addon="buyerMatch" featureName={t.featureName} description={t.featureDescription}>
      <ImportInner />
    </LockedRouteGuard>
  );
}
