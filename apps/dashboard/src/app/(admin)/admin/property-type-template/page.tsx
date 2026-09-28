'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  Edit,
  Home,
  Loader2,
  MoreHorizontal,
  MoveRight,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Super Admin -> Property Type Template: the groups and types every client's
// feed import follows, matched by the provider's type code (Resales "1-4")
// before the name.

type Status = 'ok' | 'needs_review' | 'ai_suggested';

interface TypeNode {
  id: number;
  parentId: number | null;
  name: string;
  codes: string[] | null;
  translations: Record<string, string> | null;
  aliases: string[] | null;
  status: Status;
  note: string | null;
}

interface Unmatched {
  id: number;
  provider: string;
  name: string;
  code: string | null;
  parentName: string | null;
  placedUnderNodeId: number | null;
  placedUnder: string;
  occurrences: number;
}

interface Client {
  id: number;
  name: string;
}

// Languages offered in the editor: the platform's, plus any a node already has.
const LANGS = ['es', 'de', 'fr', 'nl', 'sv', 'no', 'da', 'fi', 'ru', 'pl', 'it', 'pt'];

const keyOf = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .split('')
    .filter((c) => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f)
    .join('')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const errorText = (e: any) => e?.message || '';
const list = (s: string) => s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);

interface TypeForm {
  mode: 'add' | 'edit';
  id?: number;
  parentId: number | null;
  name: string;
  codes: string;
  aliases: string;
  translations: Record<string, string>;
  note: string;
  fromUnmatchedId?: number;
}

export default function PropertyTypeTemplatePage() {
  const api = useApi();
  const { toast } = useToast();
  const [nodes, setNodes] = useState<TypeNode[]>([]);
  const [usage, setUsage] = useState<Record<number, number>>({});
  const [unmatched, setUnmatched] = useState<Unmatched[]>([]);
  const [unmatchedOpen, setUnmatchedOpen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'needs_review' | 'ai_suggested'>('all');
  const [form, setForm] = useState<TypeForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState<TypeNode | null>(null);
  const [deleting, setDeleting] = useState<TypeNode | null>(null);
  const [reapplyOpen, setReapplyOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [reapplyTenant, setReapplyTenant] = useState('');
  const [reapplying, setReapplying] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const [res, um] = await Promise.all([
        api.get('/api/super-admin/property-type-template'),
        api.get('/api/super-admin/property-type-template/unmatched'),
      ]);
      const body = (res as any)?.data ?? res;
      setNodes(body?.nodes || []);
      setUsage(body?.usage || {});
      setUnmatchedOpen(body?.unmatchedOpen || 0);
      const u = (um as any)?.data ?? um;
      setUnmatched(Array.isArray(u) ? u : []);
    } catch (e) {
      toast({ title: 'Could not load the template', description: errorText(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!api.isReady) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.isReady]);

  const groups = useMemo(() => nodes.filter((n) => n.parentId == null), [nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const typesOf = (groupId: number) =>
    nodes.filter((n) => n.parentId === groupId).sort((a, b) => a.name.localeCompare(b.name));

  const matches = (n: TypeNode) => {
    const q = keyOf(search);
    const textHit =
      !q ||
      keyOf(n.name).includes(q) ||
      (n.aliases || []).some((a) => keyOf(a).includes(q)) ||
      (n.codes || []).some((c) => c.includes(search.trim())) ||
      Object.values(n.translations || {}).some((t) => keyOf(t).includes(q));
    return textHit && (filter === 'all' || n.status === filter);
  };
  const filtering = !!search.trim() || filter !== 'all';

  const counts = useMemo(
    () => ({
      groups: groups.length,
      types: nodes.length - groups.length,
      needs_review: nodes.filter((n) => n.status === 'needs_review').length,
      ai_suggested: nodes.filter((n) => n.status === 'ai_suggested').length,
    }),
    [nodes, groups],
  );

  // ------------------------------------------------------------- actions
  const openAdd = (parentId: number | null, prefill: Partial<TypeForm> = {}) =>
    setForm({ mode: 'add', parentId, name: '', codes: '', aliases: '', translations: {}, note: '', ...prefill });
  const openEdit = (n: TypeNode) =>
    setForm({
      mode: 'edit',
      id: n.id,
      parentId: n.parentId,
      name: n.name,
      codes: (n.codes || []).join(', '),
      aliases: (n.aliases || []).join(', '),
      translations: Object.fromEntries(Object.entries(n.translations || {}).filter(([l]) => l !== 'en')),
      note: n.note || '',
    });

  const saveForm = async () => {
    if (!form) return;
    setSaving(true);
    const translations = Object.fromEntries(Object.entries(form.translations).filter(([, v]) => v.trim()));
    try {
      if (form.mode === 'add') {
        await api.post('/api/super-admin/property-type-template', {
          parentId: form.parentId,
          name: form.name.trim(),
          codes: list(form.codes),
          aliases: list(form.aliases),
          translations,
        });
        if (form.fromUnmatchedId) await api.post(`/api/super-admin/property-type-template/unmatched/${form.fromUnmatchedId}/dismiss`);
        toast({ title: `Added "${form.name.trim()}"`, description: 'Clients pick it up on their next sync, or use Re-apply.' });
      } else {
        await api.put(`/api/super-admin/property-type-template/${form.id}`, {
          name: form.name.trim(),
          codes: list(form.codes),
          aliases: list(form.aliases),
          translations,
          note: form.note.trim() || null,
        });
        toast({ title: 'Saved' });
      }
      setForm(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not save', description: errorText(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (n: TypeNode, status: Status) => {
    try {
      await api.put(`/api/super-admin/property-type-template/${n.id}`, { status });
      setNodes((prev) => prev.map((p) => (p.id === n.id ? { ...p, status, note: status === 'ok' ? null : p.note } : p)));
    } catch (e) {
      toast({ title: 'Could not update', description: errorText(e), variant: 'destructive' });
    }
  };

  const moveTo = async (n: TypeNode, parentId: number) => {
    try {
      await api.put(`/api/super-admin/property-type-template/${n.id}/move`, { parentId });
      toast({ title: `Moved "${n.name}" to ${byId.get(parentId)?.name}` });
      setMoving(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not move', description: errorText(e), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/api/super-admin/property-type-template/${deleting.id}`);
      toast({ title: `Deleted "${deleting.name}"` });
      setDeleting(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not delete', description: errorText(e), variant: 'destructive' });
    }
  };

  const dismiss = async (u: Unmatched) => {
    try {
      await api.post(`/api/super-admin/property-type-template/unmatched/${u.id}/dismiss`);
      setUnmatched((prev) => prev.filter((x) => x.id !== u.id));
      setUnmatchedOpen((c) => Math.max(0, c - 1));
    } catch (e) {
      toast({ title: 'Could not dismiss', description: errorText(e), variant: 'destructive' });
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.getRaw('/api/super-admin/property-type-template/export');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'property-type-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'Export failed', description: errorText(e), variant: 'destructive' });
    }
  };

  const importCsv = async (file: File) => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res: any = await api.post('/api/super-admin/property-type-template/import', fd);
      const r = res?.data ?? res;
      toast({ title: `Imported ${file.name}`, description: `${r.created} added, ${r.updated} filled in from ${r.rows} row(s). Nothing was deleted or moved.` });
      await load();
    } catch (e) {
      toast({ title: 'Import failed', description: errorText(e), variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const openReapply = async () => {
    setReapplyOpen(true);
    if (clients.length) return;
    try {
      const res: any = await api.get('/api/super-admin/clients?limit=100');
      const body = res?.data ?? res;
      const rows = Array.isArray(body) ? body : body?.data || body?.items || [];
      setClients(rows.map((c: any) => ({ id: c.id, name: c.name })).sort((a: Client, b: Client) => a.name.localeCompare(b.name)));
    } catch {
      /* "All clients" still works */
    }
  };

  const runReapply = async () => {
    setReapplying(true);
    try {
      const res: any = await api.post('/api/super-admin/property-type-template/reapply', reapplyTenant ? { tenantId: Number(reapplyTenant) } : {});
      const r = res?.data ?? res;
      toast({
        title: 'Template re-applied',
        description: `${r.relocated ?? 0} listing(s) re-typed, ${r.cleaned ?? 0} unused type(s) removed` + (r.tenants != null ? ` across ${r.tenants} client(s).` : '.'),
      });
      setReapplyOpen(false);
      await load();
    } catch (e) {
      toast({ title: 'Re-apply failed', description: errorText(e), variant: 'destructive' });
    } finally {
      setReapplying(false);
    }
  };

  // ------------------------------------------------------------- rendering
  function Row({ node, isGroup }: { node: TypeNode; isGroup: boolean }) {
    const es = node.translations?.es;
    const extraLangs = Object.keys(node.translations || {}).filter((l) => l !== 'en' && l !== 'es');
    return (
      <div
        className={cn('flex items-center justify-between gap-3 rounded-md py-2 pr-2 hover:bg-muted/50', isGroup ? 'pl-2' : 'pl-10')}
        data-node-id={node.id}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isGroup && <Home className="h-4 w-4 text-muted-foreground" />}
            <span className={cn('text-sm', isGroup ? 'font-semibold' : 'font-medium')}>{node.name}</span>
            {(node.codes || []).map((c) => (
              <Badge key={c} variant="outline" className="font-mono text-[11px]">
                {c}
              </Badge>
            ))}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {es ? `es: ${es}` : 'no Spanish name'}
            {extraLangs.length ? ` · +${extraLangs.length} language(s)` : ''}
            {node.aliases?.length ? ` · also: ${node.aliases.join(', ')}` : ''}
          </p>
          {node.note && node.status !== 'ok' && <p className="text-xs text-amber-700">{node.note}</p>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {node.status === 'needs_review' && (
            <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800">
              <AlertTriangle className="h-3 w-3" /> Needs review
            </Badge>
          )}
          {node.status === 'ai_suggested' && (
            <Badge variant="outline" className="gap-1 border-purple-300 bg-purple-50 text-purple-800">
              <Sparkles className="h-3 w-3" /> AI suggested
            </Badge>
          )}
          {node.status !== 'ok' && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setStatus(node, 'ok')}>
              <Check className="h-3 w-3" /> {node.status === 'ai_suggested' ? 'Approve' : 'Mark reviewed'}
            </Button>
          )}
          {usage[node.id] ? <span className="hidden text-xs text-muted-foreground md:inline">used by {usage[node.id]}</span> : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${node.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isGroup && (
                <DropdownMenuItem onClick={() => openAdd(node.id)}>
                  <Plus className="mr-2 h-4 w-4" /> Add type
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => openEdit(node)}>
                <Edit className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              {!isGroup && (
                <DropdownMenuItem onClick={() => setMoving(node)}>
                  <MoveRight className="mr-2 h-4 w-4" /> Move to group…
                </DropdownMenuItem>
              )}
              {node.status === 'ok' && (
                <DropdownMenuItem onClick={() => setStatus(node, 'needs_review')}>
                  <AlertTriangle className="mr-2 h-4 w-4" /> Flag for review
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(node)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  const formLangs = form ? Array.from(new Set([...LANGS, ...Object.keys(form.translations)])) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Property Type Template</h1>
          <p className="text-muted-foreground">
            Groups and types every client&apos;s feed import follows, matched by the feed&apos;s type code (e.g. Resales 1-4) before the name.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Import CSV
          </Button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          <Button variant="outline" onClick={openReapply}>
            <RefreshCw className="mr-2 h-4 w-4" /> Re-apply to clients
          </Button>
          <Button onClick={() => openAdd(null)}>
            <Plus className="mr-2 h-4 w-4" /> Add group
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Groups', counts.groups, ''],
          ['Types', counts.types, ''],
          ['Needs review', counts.needs_review, 'text-amber-700'],
          ['AI suggested', counts.ai_suggested, 'text-purple-700'],
        ].map(([label, value, color]) => (
          <Card key={label as string}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn('text-xl font-semibold', color as string)}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="template">
        <TabsList>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="unmatched">
            Unmatched from feeds {unmatchedOpen > 0 && <Badge variant="secondary" className="ml-2">{unmatchedOpen}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="template">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search a type, code or translation…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                  {search && (
                    <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch('')} aria-label="Clear search">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                  <SelectTrigger className="w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="needs_review">Needs review ({counts.needs_review})</SelectItem>
                    <SelectItem value="ai_suggested">AI suggested ({counts.ai_suggested})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4" data-testid="type-template">
                  {groups.map((g) => {
                    const types = typesOf(g.id).filter((t) => !filtering || matches(t));
                    if (filtering && !types.length && !matches(g)) return null;
                    return (
                      <div key={g.id} className="rounded-lg border">
                        <Row node={g} isGroup />
                        <div className="border-t">
                          {types.map((t) => (
                            <Row key={t.id} node={t} isGroup={false} />
                          ))}
                          {!types.length && <p className="px-10 py-2 text-xs text-muted-foreground">No types{filtering ? ' match' : ''}.</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unmatched">
          <Card>
            <CardHeader>
              <CardTitle>Unmatched from feeds</CardTitle>
              <CardDescription>
                Types client feeds sent that the template doesn&apos;t know. Their listings sit under the group shown until
                you add the type. AI suggests a group for new types automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {unmatched.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nothing unmatched. Every feed type is in the template.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Placed under</TableHead>
                        <TableHead className="text-right">Listings</TableHead>
                        <TableHead>Feed</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unmatched.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell className="font-mono text-xs">{u.code || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u.placedUnder || u.parentName || '—'}</TableCell>
                          <TableCell className="text-right">{u.occurrences}</TableCell>
                          <TableCell className="text-sm capitalize">{u.provider}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  openAdd(u.placedUnderNodeId ?? groups[0]?.id ?? null, {
                                    name: u.name,
                                    codes: u.code || '',
                                    fromUnmatchedId: u.id,
                                  })
                                }
                              >
                                <Plus className="mr-1 h-3 w-3" /> Add to template
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => dismiss(u)}>
                                Dismiss
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add / Edit */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {form?.mode === 'edit' ? 'Edit' : 'Add'} {form?.parentId == null ? 'group' : 'type'}
            </DialogTitle>
            <DialogDescription>
              {form?.parentId != null ? `In ${byId.get(form.parentId)?.name}` : 'A top-level group, e.g. Apartment or House.'}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-4">
              {form.mode === 'add' && form.fromUnmatchedId && (
                <div className="grid gap-2">
                  <Label>Group</Label>
                  <Select value={form.parentId != null ? String(form.parentId) : ''} onValueChange={(v) => setForm({ ...form, parentId: Number(v) })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a group" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="type-name">English name</Label>
                <Input id="type-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="type-codes">Feed codes</Label>
                  <Input id="type-codes" placeholder="e.g. 1-4" value={form.codes} onChange={(e) => setForm({ ...form, codes: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="type-aliases">Other names feeds use</Label>
                  <Input id="type-aliases" placeholder="comma-separated" value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Translations</Label>
                <p className="text-xs text-muted-foreground">
                  Applied to every client&apos;s type name on sync. Leave a language empty to keep each client&apos;s own translation.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {formLangs.map((l) => (
                    <div key={l} className="flex items-center gap-2">
                      <span className="w-6 text-xs font-medium uppercase text-muted-foreground">{l}</span>
                      <Input
                        aria-label={`Name in ${l}`}
                        data-lang={l}
                        value={form.translations[l] || ''}
                        onChange={(e) => setForm({ ...form, translations: { ...form.translations, [l]: e.target.value } })}
                        className="h-8"
                      />
                    </div>
                  ))}
                </div>
              </div>
              {form.mode === 'edit' && (
                <div className="grid gap-2">
                  <Label htmlFor="type-note">Review note</Label>
                  <Input id="type-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={saveForm} disabled={saving || !form?.name.trim() || (!!form?.fromUnmatchedId && form?.parentId == null)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form?.mode === 'edit' ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move */}
      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move &quot;{moving?.name}&quot;</DialogTitle>
            <DialogDescription>Choose its group.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {groups
              .filter((g) => g.id !== moving?.parentId)
              .map((g) => (
                <Button key={g.id} variant="outline" className="justify-start" onClick={() => moving && moveTo(moving, g.id)}>
                  {g.name}
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleting?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.parentId == null && typesOf(deleting.id).length
                ? `This also deletes the ${typesOf(deleting.id).length} type(s) in this group. `
                : ''}
              Clients keep their own types; on their next sync, listings of this type are matched again or listed as unmatched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Re-apply */}
      <Dialog open={reapplyOpen} onOpenChange={setReapplyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Re-apply the template</DialogTitle>
            <DialogDescription>
              Re-types clients&apos; feed listings now instead of at their next sync, and pushes names and translations.
              Types a client arranged by hand are left alone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Client</Label>
            <Select value={reapplyTenant || 'all'} onValueChange={(v) => setReapplyTenant(v === 'all' ? '' : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReapplyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runReapply} disabled={reapplying}>
              {reapplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Re-apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
