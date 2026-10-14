'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, Download, Edit, Languages, Loader2, RefreshCw, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

// Super Admin -> Translation Memory: label, feature and property type
// translations shared by every client. Translated once (by AI or here),
// reused for every client and feed import. A correction saved here reaches
// every client still showing the old wording; a client's own wording stays.

type Kind = 'label' | 'feature' | 'property_type';

interface MemoryItem {
  kind: Kind;
  sourceKey: string;
  english: string;
  translations: Record<string, { text: string; source: string }>;
}

interface FillStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  languages: string[];
  terms: number;
  total: number;
  done: number;
  translated: number;
  failed: number;
  push: PushResult | null;
  error: string | null;
}

interface PushResult {
  rowsUpdated: number;
  clientsUpdated: number;
  customisedKept: number;
}

const KIND_LABELS: Record<Kind, string> = { label: 'Label', feature: 'Feature', property_type: 'Property type' };
const PAGE_SIZE = 50;
const errorText = (e: any) => e?.message || '';
const pushText = (r: PushResult) =>
  `${r.rowsUpdated} row(s) updated for ${r.clientsUpdated} client(s)` +
  (r.customisedKept ? `; ${r.customisedKept} kept because the client wrote their own` : '');

export default function TranslationMemoryPage() {
  const api = useApi();
  const { toast } = useToast();
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [languages, setLanguages] = useState<string[]>([]);
  const [lang, setLang] = useState('es');
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ item: MemoryItem; lang: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MemoryItem | null>(null);
  const [busy, setBusy] = useState<'' | 'import' | 'apply' | 'learn'>('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [fill, setFill] = useState<FillStatus | null>(null);
  const [allLangs, setAllLangs] = useState<Record<string, string>>({});
  const [fillLangs, setFillLangs] = useState<string[]>([]);

  const loadFill = async (initial = false) => {
    try {
      const res: any = await api.get('/api/super-admin/translation-memory/fill');
      const body = res?.data ?? res;
      setFill(body?.status || null);
      setAllLangs(body?.allLanguages || {});
      if (initial) setFillLangs(body?.status?.running ? body.status.languages : body?.clientLanguages || []);
      return body?.status as FillStatus | undefined;
    } catch {
      return undefined;
    }
  };

  useEffect(() => {
    if (!api.isReady) return;
    loadFill(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.isReady]);

  // While a fill runs, follow its progress; reload the list when it ends.
  useEffect(() => {
    if (!fill?.running) return;
    const t = setInterval(async () => {
      const st = await loadFill();
      if (st && !st.running) {
        toast({
          title: st.error ? 'Translation stopped' : 'Everything translated',
          description: st.error || `${st.translated} translation(s) added${st.failed ? `, ${st.failed} failed` : ''}. ${st.push ? pushText(st.push) : ''}`,
          variant: st.error ? 'destructive' : undefined,
        });
        load();
      }
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill?.running]);

  const startFill = async () => {
    try {
      const res: any = await api.post('/api/super-admin/translation-memory/fill', { languages: fillLangs });
      setFill(res?.data ?? res);
    } catch (e) {
      toast({ title: 'Could not start', description: errorText(e), variant: 'destructive' });
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (kind !== 'all') params.set('kind', kind);
      if (query) params.set('q', query);
      const res: any = await api.get(`/api/super-admin/translation-memory?${params}`);
      const body = res?.data ?? res;
      setItems(body?.items || []);
      setTotal(body?.total || 0);
      setLanguages(body?.languages || []);
    } catch (e) {
      toast({ title: 'Could not load the translation memory', description: errorText(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!api.isReady) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.isReady, page, kind, query]);

  // Search as you type, without a request per key.
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const langOptions = Array.from(new Set(['es', ...languages])).sort();

  const save = async () => {
    if (!editing || !editing.text.trim()) return;
    setSaving(true);
    try {
      const res: any = await api.post('/api/super-admin/translation-memory/save', {
        kind: editing.item.kind,
        english: editing.item.english,
        lang: editing.lang,
        text: editing.text.trim(),
      });
      toast({ title: `Saved "${editing.item.english}" (${editing.lang})`, description: pushText(res?.data ?? res) });
      setEditing(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not save', description: errorText(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.post('/api/super-admin/translation-memory/remove', { kind: deleting.kind, sourceKey: deleting.sourceKey });
      toast({ title: `Removed "${deleting.english}" from memory`, description: 'Clients keep the text they already have.' });
      setDeleting(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not remove', description: errorText(e), variant: 'destructive' });
    }
  };

  const applyAll = async () => {
    setBusy('apply');
    try {
      const res: any = await api.post('/api/super-admin/translation-memory/apply-all');
      toast({ title: 'Missing translations filled', description: pushText(res?.data ?? res) });
    } catch (e) {
      toast({ title: 'Apply failed', description: errorText(e), variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  const learn = async () => {
    setBusy('learn');
    try {
      const res: any = await api.post('/api/super-admin/translation-memory/learn');
      const r = res?.data ?? res;
      toast({ title: 'Learned from clients', description: `${r.added} new entr${r.added === 1 ? 'y' : 'ies'}. Existing entries were not changed.` });
      await load();
    } catch (e) {
      toast({ title: 'Could not learn from clients', description: errorText(e), variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.getRaw('/api/super-admin/translation-memory/export');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'translation-memory.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'Export failed', description: errorText(e), variant: 'destructive' });
    }
  };

  const importCsv = async (file: File) => {
    setBusy('import');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res: any = await api.post('/api/super-admin/translation-memory/import', fd);
      const r = res?.data ?? res;
      toast({ title: `Imported ${file.name}`, description: `${r.changed} correction(s) from ${r.rows} row(s). ${pushText(r)}` });
      await load();
    } catch (e) {
      toast({ title: 'Import failed', description: errorText(e), variant: 'destructive' });
    } finally {
      setBusy('');
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Translation Memory</h1>
          <p className="max-w-3xl text-muted-foreground">
            Label, feature and property type translations shared by every client. A word is translated once, then reused by
            every client and feed import without AI. Corrections you save here reach every client still showing the old
            wording; wording a client wrote themselves is kept.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={!!busy}>
            {busy === 'import' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Import CSV
          </Button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          <Button variant="outline" onClick={learn} disabled={!!busy}>
            {busy === 'learn' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Learn from clients
          </Button>
          <Button onClick={applyAll} disabled={!!busy}>
            {busy === 'apply' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Fill all clients
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-medium">
                <Languages className="h-4 w-4" /> Translate everything
              </p>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Every label, feature and property type any client uses, into the languages ticked below, by AI on the
                platform key (many words per call, only what is missing). Afterwards every client gets the languages its
                website uses. Runs by itself every night for new words.
              </p>
            </div>
            <Button onClick={startFill} disabled={!!fill?.running || fillLangs.length === 0}>
              {fill?.running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {fill?.running ? 'Translating…' : 'Translate everything'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(allLangs).map(([code, name]) => {
              const on = fillLangs.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  disabled={!!fill?.running}
                  onClick={() => setFillLangs(on ? fillLangs.filter((l) => l !== code) : [...fillLangs, code])}
                  className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          {fill && (fill.running || fill.finishedAt) && (
            <div className="space-y-1">
              {fill.running && (
                <div className="h-2 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${fill.total ? Math.round((fill.done / fill.total) * 100) : 0}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {fill.running && !fill.total
                  ? 'Preparing: collecting every word clients use…'
                  : fill.running
                  ? `${fill.terms} words · ${fill.done}/${fill.total} AI calls · ${fill.translated} translated${fill.failed ? ` · ${fill.failed} failed` : ''}`
                  : `Last run ${new Date(fill.finishedAt!).toLocaleString()}: ${fill.translated} translated${fill.failed ? `, ${fill.failed} failed` : ''}${fill.push ? ` · ${pushText(fill.push)}` : ''}${fill.error ? ` · ${fill.error}` : ''}`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search English or translation…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="w-44">
            <Label className="text-xs">Kind</Label>
            <Select
              value={kind}
              onValueChange={(v) => {
                setPage(1);
                setKind(v as any);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Label className="text-xs">Language</Label>
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {langOptions.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>English</TableHead>
                <TableHead className="w-36">Kind</TableHead>
                <TableHead>{lang.toUpperCase()}</TableHead>
                <TableHead className="hidden md:table-cell">Other languages</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    <BookOpen className="mx-auto mb-2 h-6 w-6" />
                    {query || kind !== 'all'
                      ? 'Nothing matches.'
                      : 'The memory is empty. It fills as clients translate, or use Learn from clients.'}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const t = item.translations[lang];
                  const others = Object.keys(item.translations).filter((l) => l !== 'en' && l !== lang);
                  return (
                    <TableRow key={`${item.kind}:${item.sourceKey}`}>
                      <TableCell className="font-medium">{item.english}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>
                      </TableCell>
                      <TableCell>
                        {t ? (
                          <span className="flex items-center gap-2">
                            {t.text}
                            {t.source === 'admin' && (
                              <Badge variant="outline" className="border-green-300 bg-green-50 text-[10px] text-green-800">
                                corrected
                              </Badge>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {others.length ? `${others.length + (t ? 1 : 0)} languages: ${others.map((l) => l.toUpperCase()).join(', ')}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Edit ${item.english}`}
                          onClick={() => setEditing({ item, lang, text: t?.text || '' })}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label={`Remove ${item.english}`}
                          onClick={() => setDeleting(item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} term(s)</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct translation</DialogTitle>
            <DialogDescription>
              {editing && KIND_LABELS[editing.item.kind]} &ldquo;{editing?.item.english}&rdquo;. Saving updates every client
              still showing the old wording (or missing this language), and their websites refresh. Wording a client wrote
              themselves is kept.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="w-32">
                <Label className="text-xs">Language</Label>
                <Select
                  value={editing.lang}
                  onValueChange={(l) => setEditing({ ...editing, lang: l, text: editing.item.translations[l]?.text || '' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {langOptions.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Translation</Label>
                <Input
                  autoFocus
                  value={editing.text}
                  onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !editing?.text.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save and update clients
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove &ldquo;{deleting?.english}&rdquo; from memory?</AlertDialogTitle>
            <AlertDialogDescription>
              Every language of this term is removed from the memory. Clients keep the text they already have; the next
              translation of this word asks the AI again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
