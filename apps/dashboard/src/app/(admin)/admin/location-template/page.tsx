'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Edit,
  GripVertical,
  Loader2,
  MapPin,
  Merge,
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

// Super Admin -> Location Template: the platform-wide place hierarchy feed
// imports follow (Region > Province > Area > Municipality > Town > Urbanization).

const LEVELS = ['region', 'province', 'area', 'municipality', 'town', 'urbanization'] as const;
type Level = (typeof LEVELS)[number];
type Status = 'ok' | 'needs_review' | 'ai_suggested';

interface TemplateNode {
  id: number;
  parentId: number | null;
  level: Level;
  name: string;
  aliases: string[] | null;
  postcode: string | null;
  lat: string | number | null;
  lng: string | number | null;
  status: Status;
  note: string | null;
  coordsIssue: string | null;
}

type Filter = 'all' | 'needs_review' | 'ai_suggested' | 'missing_coords';

interface Unmatched {
  id: number;
  provider: string;
  province: string | null;
  area: string | null;
  name: string;
  subName: string | null;
  placedUnderNodeId: number | null;
  placedUnder: string;
  occurrences: number;
  tenantIds: number[] | null;
  lastSeenAt: string;
}

interface Client {
  id: number;
  name: string;
}

const levelColors: Record<Level, string> = {
  region: 'bg-blue-50 text-blue-700 border-blue-200',
  province: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  area: 'bg-violet-50 text-violet-700 border-violet-200',
  municipality: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  town: 'bg-slate-50 text-slate-700 border-slate-200',
  urbanization: 'bg-amber-50 text-amber-800 border-amber-200',
};

const levelIndex = (l: Level) => LEVELS.indexOf(l);
// Same rule as the API's locationKey: lower case, accents (combining marks
// U+0300..U+036F after NFD) dropped, other symbols collapsed to spaces.
const keyOf = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .split('')
    .filter((c) => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f)
    .join('')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const errorText = (e: any, fallback: string) => e?.message || fallback;

interface NodeForm {
  mode: 'add' | 'edit';
  id?: number;
  parentId: number | null;
  level: Level;
  name: string;
  aliases: string;
  postcode: string;
  lat: string;
  lng: string;
  note: string;
  fromUnmatchedId?: number;
  // Adding from the unmatched list: the picker offers places inside this one.
  scopeId?: number;
}

export default function LocationTemplatePage() {
  const api = useApi();
  const { toast } = useToast();
  const [nodes, setNodes] = useState<TemplateNode[]>([]);
  const [usage, setUsage] = useState<Record<number, number>>({});
  const [unmatchedOpen, setUnmatchedOpen] = useState(0);
  const [unmatched, setUnmatched] = useState<Unmatched[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Places closed by hand while a search had opened them.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<NodeForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState<TemplateNode | null>(null);
  const [deleting, setDeleting] = useState<TemplateNode | null>(null);
  const [reapplyOpen, setReapplyOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [reapplyTenant, setReapplyTenant] = useState<string>('');
  const [reapplying, setReapplying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [merging, setMerging] = useState<TemplateNode | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [mergeKeep, setMergeKeep] = useState<'target' | 'source'>('target');
  const [mergeBusy, setMergeBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const [list, open] = await Promise.all([
        api.get('/api/super-admin/location-template'),
        api.get('/api/super-admin/location-template/unmatched'),
      ]);
      const body = (list as any)?.data ?? list;
      setNodes(body?.nodes || []);
      setUsage(body?.usage || {});
      setUnmatchedOpen(body?.unmatchedOpen || 0);
      const um = (open as any)?.data ?? open;
      setUnmatched(Array.isArray(um) ? um : []);
    } catch (e) {
      toast({ title: 'Could not load the template', description: errorText(e, ''), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!api.isReady) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.isReady]);

  // ---------------------------------------------------------------- tree data
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const children = useMemo(() => {
    const map = new Map<number | null, TemplateNode[]>();
    for (const n of nodes) {
      const list = map.get(n.parentId) || [];
      list.push(n);
      map.set(n.parentId, list);
    }
    map.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [nodes]);
  const pathOf = (n: TemplateNode | undefined): TemplateNode[] => {
    const out: TemplateNode[] = [];
    const seen = new Set<number>();
    while (n && !seen.has(n.id)) {
      seen.add(n.id);
      out.unshift(n);
      n = n.parentId != null ? byId.get(n.parentId) : undefined;
    }
    return out;
  };
  const subtreeSize = (id: number): number =>
    1 + (children.get(id) || []).reduce((s, c) => s + subtreeSize(c.id), 0);

  // A town (or a municipality with nothing inside it) is where listings are
  // drawn, so it needs its own point. Same rule as the API's checkAllCoords.
  const missingCoords = (n: TemplateNode) =>
    levelIndex(n.level) >= levelIndex('municipality') &&
    !(children.get(n.id) || []).length &&
    (n.lat == null || n.lng == null || (Number(n.lat) === 0 && Number(n.lng) === 0));

  const stats = useMemo(() => {
    const s: Record<string, number> = { needs_review: 0, ai_suggested: 0, missing_coords: 0 };
    for (const l of LEVELS) s[l] = 0;
    for (const n of nodes) {
      s[n.level]++;
      if (n.status !== 'ok') s[n.status]++;
      if (missingCoords(n)) s.missing_coords++;
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, children]);

  // Search / filter: matches plus their ancestors are shown, ancestors open.
  const { visible, autoOpen, matches } = useMemo(() => {
    const q = keyOf(search);
    if (!q && filter === 'all') return { visible: null as Set<number> | null, autoOpen: new Set<number>(), matches: 0 };
    const vis = new Set<number>();
    const open = new Set<number>();
    let count = 0;
    for (const n of nodes) {
      const textHit = !q || keyOf(n.name).includes(q) || (n.aliases || []).some((a) => keyOf(a).includes(q));
      const statusHit = filter === 'all' || (filter === 'missing_coords' ? missingCoords(n) : n.status === filter);
      if (!textHit || !statusHit) continue;
      count++;
      const path = pathOf(n);
      path.forEach((p) => vis.add(p.id));
      path.slice(0, -1).forEach((p) => open.add(p.id));
    }
    return { visible: vis, autoOpen: open, matches: count };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, search, filter, byId]);

  const isOpen = (id: number) => expanded.has(id) || (autoOpen.has(id) && !collapsed.has(id));
  const toggle = (id: number) => {
    const open = isOpen(id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  useEffect(() => setCollapsed(new Set()), [search, filter]);

  // ---------------------------------------------------------------- actions
  const openAdd = (parent: TemplateNode | null, prefill?: Partial<NodeForm>) => {
    const level: Level = parent ? LEVELS[Math.min(levelIndex(parent.level) + 1, LEVELS.length - 1)] : 'region';
    setForm({
      mode: 'add',
      parentId: parent?.id ?? null,
      level,
      name: '',
      aliases: '',
      postcode: '',
      lat: '',
      lng: '',
      note: '',
      ...prefill,
    });
  };
  const openEdit = (n: TemplateNode) =>
    setForm({
      mode: 'edit',
      id: n.id,
      parentId: n.parentId,
      level: n.level,
      name: n.name,
      aliases: (n.aliases || []).join(', '),
      postcode: n.postcode || '',
      lat: n.lat != null ? String(Number(n.lat)) : '',
      lng: n.lng != null ? String(Number(n.lng)) : '',
      note: n.note || '',
    });

  const numberOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

  const saveForm = async () => {
    if (!form) return;
    const lat = numberOrNull(form.lat);
    const lng = numberOrNull(form.lng);
    if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
      toast({ title: 'Latitude and longitude must be numbers', variant: 'destructive' });
      return;
    }
    const aliases = form.aliases.split(',').map((a) => a.trim()).filter(Boolean);
    setSaving(true);
    try {
      if (form.mode === 'add') {
        await api.post('/api/super-admin/location-template', {
          parentId: form.parentId,
          level: form.level,
          name: form.name.trim(),
          aliases,
          postcode: form.postcode.trim() || null,
          lat,
          lng,
        });
        if (form.fromUnmatchedId) {
          await api.post(`/api/super-admin/location-template/unmatched/${form.fromUnmatchedId}/dismiss`);
        }
        toast({ title: `Added "${form.name.trim()}"`, description: 'Clients pick it up on their next sync, or use Re-apply.' });
      } else {
        const original = byId.get(form.id!);
        await api.put(`/api/super-admin/location-template/${form.id}`, {
          name: form.name.trim(),
          ...(original && original.level !== form.level ? { level: form.level } : {}),
          aliases,
          postcode: form.postcode.trim() || null,
          lat,
          lng,
          note: form.note.trim() || null,
        });
        toast({ title: 'Saved' });
      }
      setForm(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not save', description: errorText(e, ''), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (n: TemplateNode, status: Status) => {
    try {
      await api.put(`/api/super-admin/location-template/${n.id}`, { status });
      setNodes((prev) => prev.map((p) => (p.id === n.id ? { ...p, status, note: status === 'ok' ? null : p.note } : p)));
    } catch (e) {
      toast({ title: 'Could not update', description: errorText(e, ''), variant: 'destructive' });
    }
  };

  const moveTo = async (n: TemplateNode, parentId: number | null) => {
    try {
      await api.put(`/api/super-admin/location-template/${n.id}/move`, { parentId });
      const target = parentId != null ? byId.get(parentId) : undefined;
      toast({ title: `Moved "${n.name}"`, description: target ? `Now under ${pathOf(target).map((p) => p.name).join(' › ')}` : undefined });
      setMoving(null);
      if (parentId != null) setExpanded((prev) => new Set(prev).add(parentId));
      await load();
    } catch (e) {
      toast({ title: 'Could not move', description: errorText(e, ''), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      const res: any = await api.delete(`/api/super-admin/location-template/${deleting.id}`);
      const deleted = res?.data?.deleted ?? res?.deleted;
      toast({ title: `Deleted "${deleting.name}"`, description: deleted > 1 ? `${deleted} places removed in total.` : undefined });
      setDeleting(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not delete', description: errorText(e, ''), variant: 'destructive' });
    }
  };

  const dismiss = async (u: Unmatched) => {
    try {
      await api.post(`/api/super-admin/location-template/unmatched/${u.id}/dismiss`);
      setUnmatched((prev) => prev.filter((x) => x.id !== u.id));
      setUnmatchedOpen((c) => Math.max(0, c - 1));
    } catch (e) {
      toast({ title: 'Could not dismiss', description: errorText(e, ''), variant: 'destructive' });
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.getRaw('/api/super-admin/location-template/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'location-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'Export failed', description: errorText(e, ''), variant: 'destructive' });
    }
  };

  const importCsv = async (file: File) => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res: any = await api.post('/api/super-admin/location-template/import', fd);
      const r = res?.data ?? res;
      toast({
        title: `Imported ${file.name}`,
        description:
          `${r.rows} row(s): ${r.created} new place(s), ${r.coordsFilled ?? 0} point(s) and ${r.postcodesFilled ?? 0} postcode(s) filled in. ` +
          `${r.refused ?? 0} point(s) refused, ${r.missingCoords ?? 0} place(s) still without coordinates. Values already in the template were kept.`,
      });
      await load();
      if (r.missingCoords) setFilter('missing_coords');
    } catch (e) {
      toast({ title: 'Import failed', description: errorText(e, ''), variant: 'destructive' });
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
      const list = Array.isArray(body) ? body : body?.data || body?.items || [];
      setClients(list.map((c: any) => ({ id: c.id, name: c.name })).sort((a: Client, b: Client) => a.name.localeCompare(b.name)));
    } catch {
      /* the "all clients" option still works */
    }
  };

  const runReapply = async () => {
    setReapplying(true);
    try {
      const res: any = await api.post('/api/super-admin/location-template/reapply', reapplyTenant ? { tenantId: Number(reapplyTenant) } : {});
      const r = res?.data ?? res;
      toast({
        title: 'Template re-applied',
        description:
          `${r.relocated ?? 0} listing(s) moved, ${r.cleaned ?? 0} empty location(s) removed` +
          (r.tenants != null ? ` across ${r.tenants} client(s).` : '.'),
      });
      setReapplyOpen(false);
      await load();
    } catch (e) {
      toast({ title: 'Re-apply failed', description: errorText(e, ''), variant: 'destructive' });
    } finally {
      setReapplying(false);
    }
  };

  const checkCoords = async () => {
    setChecking(true);
    try {
      const res: any = await api.post('/api/super-admin/location-template/check-coords', {});
      const r = res?.data ?? res;
      toast({
        title: 'Coordinates checked',
        description: `${r.refused ?? 0} point(s) refused and cleared, ${r.missingCoords ?? 0} place(s) without coordinates.`,
      });
      await load();
    } catch (e) {
      toast({ title: 'Check failed', description: errorText(e, ''), variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

  const openMerge = (n: TemplateNode) => {
    setMerging(n);
    setMergeTargetId(null);
    setMergeKeep('target');
  };

  const runMerge = async () => {
    if (!merging || mergeTargetId == null) return;
    const target = byId.get(mergeTargetId);
    setMergeBusy(true);
    try {
      const res: any = await api.post(`/api/super-admin/location-template/${merging.id}/merge`, {
        targetId: mergeTargetId,
        keep: mergeKeep,
      });
      const r = res?.data ?? res;
      const clientRows = (r.clientRowsMerged ?? 0) + (r.clientRowsRelinked ?? 0);
      toast({
        title: `Merged "${merging.name}" into "${target?.name}"`,
        description:
          `"${merging.name}" is now an alternative spelling of it.` +
          (clientRows ? ` ${clientRows} client location(s) followed; Re-apply to re-sort their listings now.` : ''),
      });
      setMerging(null);
      if (target?.parentId != null) setExpanded((prev) => new Set(prev).add(target.parentId!));
      await load();
    } catch (e) {
      toast({ title: 'Could not merge', description: errorText(e, ''), variant: 'destructive' });
    } finally {
      setMergeBusy(false);
    }
  };

  // ---------------------------------------------------------------- drag & drop
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropId, setDropId] = useState<number | null>(null);
  const canDrop = (drag: TemplateNode | undefined, target: TemplateNode) => {
    if (!drag || drag.id === target.id || drag.parentId === target.id) return false;
    if (levelIndex(target.level) >= levelIndex(drag.level)) return false;
    return !pathOf(target).some((p) => p.id === drag.id);
  };

  // ---------------------------------------------------------------- rendering
  function Row({ node, depth }: { node: TemplateNode; depth: number }) {
    const kids = (children.get(node.id) || []).filter((c) => !visible || visible.has(c.id));
    const open = isOpen(node.id);
    const used = usage[node.id] || 0;
    const dragged = dragId != null ? byId.get(dragId) : undefined;
    return (
      <div>
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            setDragId(node.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setDropId(null);
          }}
          onDragOver={(e) => {
            if (!canDrop(dragged, node)) return;
            e.preventDefault();
            e.stopPropagation();
            if (dropId !== node.id) setDropId(node.id);
          }}
          onDragLeave={() => dropId === node.id && setDropId(null)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const d = dragged;
            setDragId(null);
            setDropId(null);
            if (d && canDrop(d, node)) moveTo(d, node.id);
          }}
          className={cn(
            'group flex items-center justify-between gap-3 rounded-md py-2 pr-2 hover:bg-muted/50',
            dropId === node.id && 'ring-2 ring-primary bg-primary/5',
          )}
          style={{ paddingLeft: depth * 20 + 8 }}
          data-node-id={node.id}
        >
          <div className="flex min-w-0 items-center gap-2">
            <GripVertical className="h-4 w-4 flex-shrink-0 cursor-grab text-muted-foreground/60" />
            {(children.get(node.id) || []).length ? (
              <button className="rounded p-0.5 hover:bg-muted" onClick={() => toggle(node.id)} aria-label={open ? 'Collapse' : 'Expand'}>
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <MapPin className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{node.name}</p>
              {node.aliases?.length ? (
                <p className="truncate text-xs text-muted-foreground">also: {node.aliases.join(', ')}</p>
              ) : null}
              {node.note && node.status !== 'ok' ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">{node.note}</p>
              ) : null}
              {node.coordsIssue && missingCoords(node) ? (
                <p className="text-xs text-red-700 dark:text-red-400">{node.coordsIssue}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {missingCoords(node) && (
              <Button size="sm" variant="outline" className="h-7 gap-1 border-red-200 text-xs text-red-700" onClick={() => openEdit(node)}>
                <MapPin className="h-3 w-3" /> Add coordinates
              </Button>
            )}
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
            {used > 0 && <span className="hidden text-xs text-muted-foreground md:inline">used by {used}</span>}
            <Badge variant="outline" className={cn('capitalize', levelColors[node.level])}>
              {node.level}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${node.name}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {node.level !== 'urbanization' && (
                  <DropdownMenuItem onClick={() => openAdd(node)}>
                    <Plus className="mr-2 h-4 w-4" /> Add inside
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => openEdit(node)}>
                  <Edit className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                {node.level !== 'region' && (
                  <DropdownMenuItem onClick={() => setMoving(node)}>
                    <MoveRight className="mr-2 h-4 w-4" /> Move to…
                  </DropdownMenuItem>
                )}
                {node.level !== 'region' && (
                  <DropdownMenuItem onClick={() => openMerge(node)}>
                    <Merge className="mr-2 h-4 w-4" /> Merge into…
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
        {open && kids.map((c) => <Row key={c.id} node={c} depth={depth + 1} />)}
      </div>
    );
  }

  const roots = (children.get(null) || []).filter((n) => !visible || visible.has(n.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Location Template</h1>
          <p className="text-muted-foreground">
            The place hierarchy every client&apos;s feed import follows. Changes reach clients on their next sync, or right away with Re-apply.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Import CSV
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
          />
          <Button variant="outline" onClick={openReapply}>
            <RefreshCw className="mr-2 h-4 w-4" /> Re-apply to clients
          </Button>
          <Button onClick={() => openAdd(null)}>
            <Plus className="mr-2 h-4 w-4" /> Add region
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-9">
        {LEVELS.map((l) => (
          <Card key={l}>
            <CardContent className="p-4">
              <p className="text-xs capitalize text-muted-foreground">{l === 'municipality' ? 'Municipalities' : l === 'urbanization' ? 'Urbanizations' : `${l}s`}</p>
              <p className="text-xl font-semibold">{stats[l].toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="cursor-pointer" onClick={() => setFilter('needs_review')}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Needs review</p>
            <p className="text-xl font-semibold text-amber-700">{stats.needs_review}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter('ai_suggested')}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">AI suggested</p>
            <p className="text-xl font-semibold text-purple-700">{stats.ai_suggested}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter('missing_coords')}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">No coordinates</p>
            <p className="text-xl font-semibold text-red-700">{stats.missing_coords.toLocaleString()}</p>
          </CardContent>
        </Card>
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
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search a place or alternative spelling…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
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
                    <SelectItem value="all">All places</SelectItem>
                    <SelectItem value="needs_review">Needs review ({stats.needs_review})</SelectItem>
                    <SelectItem value="ai_suggested">AI suggested ({stats.ai_suggested})</SelectItem>
                    <SelectItem value="missing_coords">No coordinates ({stats.missing_coords})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <CardDescription>
                {filter === 'missing_coords' ? (
                  <span className="flex flex-wrap items-center gap-3">
                    <span>
                      {matches.toLocaleString()} place(s) with no point on the map — their listings are drawn at the
                      municipality instead. Add them by hand, or import a CSV that has them.
                    </span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={checkCoords} disabled={checking}>
                      {checking && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Re-check all coordinates
                    </Button>
                  </span>
                ) : visible ? (
                  `${matches.toLocaleString()} match(es).`
                ) : (
                  'Drag a place onto another to move it inside, or use Move to… or Merge into… from its menu.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : roots.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">No places match.</p>
              ) : (
                <div className="space-y-0.5" data-testid="template-tree">
                  {roots.map((r) => (
                    <Row key={r.id} node={r} depth={0} />
                  ))}
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
                Places client feeds sent that the template doesn&apos;t know. Their listings are shown under the place in
                &quot;Placed under&quot; until you add them. AI suggests a municipality for new towns automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {unmatched.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nothing unmatched. Every feed location is in the template.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Place</TableHead>
                        <TableHead>Placed under</TableHead>
                        <TableHead className="text-right">Listings</TableHead>
                        <TableHead>Feed</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unmatched.map((u) => {
                        const anchor = u.placedUnderNodeId != null ? byId.get(u.placedUnderNodeId) : undefined;
                        return (
                          <TableRow key={u.id}>
                            <TableCell>
                              <p className="font-medium">{u.name}</p>
                              {u.subName && <p className="text-xs text-muted-foreground">sub-location: {u.subName}</p>}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{u.placedUnder || '—'}</TableCell>
                            <TableCell className="text-right">{u.occurrences}</TableCell>
                            <TableCell className="text-sm capitalize">{u.provider}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    openAdd(null, {
                                      name: u.name,
                                      level: anchor && levelIndex(anchor.level) >= levelIndex('municipality') ? 'urbanization' : 'town',
                                      parentId: null,
                                      fromUnmatchedId: u.id,
                                      scopeId: anchor?.id,
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
                        );
                      })}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.mode === 'edit' ? 'Edit place' : 'Add place'}</DialogTitle>
            <DialogDescription>
              {form?.parentId != null
                ? `Inside ${pathOf(byId.get(form.parentId)).map((p) => p.name).join(' › ')}`
                : 'Top level'}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-4">
              {form.mode === 'add' && form.fromUnmatchedId && (
                <ParentPicker
                  label="Put it inside"
                  nodes={form.scopeId != null ? nodes.filter((n) => pathOf(n).some((p) => p.id === form.scopeId)) : nodes}
                  pathOf={pathOf}
                  maxLevel={levelIndex(form.level) - 1}
                  value={form.parentId}
                  onChange={(id) => setForm({ ...form, parentId: id })}
                />
              )}
              <div className="grid gap-2">
                <Label htmlFor="tpl-name">Name</Label>
                <Input id="tpl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </div>
              <div className="grid gap-2">
                <Label>Level</Label>
                <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v as Level })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.filter((l) => {
                      const parent = form.parentId != null ? byId.get(form.parentId) : undefined;
                      if (form.fromUnmatchedId && !parent) return l === 'town' || l === 'urbanization';
                      return parent ? levelIndex(l) > levelIndex(parent.level) : l === 'region';
                    }).map((l) => (
                      <SelectItem key={l} value={l} className="capitalize">
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tpl-aliases">Other spellings feeds use</Label>
                <Input
                  id="tpl-aliases"
                  placeholder="e.g. Higueron, El Higuerón"
                  value={form.aliases}
                  onChange={(e) => setForm({ ...form, aliases: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Comma-separated. Accents and capitals never matter.</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="tpl-postcode">Postcode</Label>
                  <Input id="tpl-postcode" value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tpl-lat">Latitude</Label>
                  <Input id="tpl-lat" inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tpl-lng">Longitude</Label>
                  <Input id="tpl-lng" inputMode="decimal" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
                </div>
              </div>
              {form.mode === 'edit' && form.id != null && byId.get(form.id)?.coordsIssue && (() => {
                const issue = byId.get(form.id!)!.coordsIssue!;
                const hint = refusedValue(issue);
                return (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    <p>{issue}</p>
                    {hint && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 text-xs"
                        onClick={() => setForm({ ...form, lat: String(hint.lat), lng: String(hint.lng) })}
                      >
                        {hint.swapped ? `Use it swapped: ${hint.lat}, ${hint.lng}` : `Use ${hint.lat}, ${hint.lng} anyway`}
                      </Button>
                    )}
                  </div>
                );
              })()}
              {form.mode === 'edit' && (
                <div className="grid gap-2">
                  <Label htmlFor="tpl-note">Review note</Label>
                  <Input id="tpl-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={saveForm} disabled={saving || !form?.name.trim() || (form?.fromUnmatchedId != null && form?.parentId == null)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form?.mode === 'edit' ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move */}
      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Move &quot;{moving?.name}&quot;</DialogTitle>
            <DialogDescription>Choose where it belongs. Everything inside it moves too.</DialogDescription>
          </DialogHeader>
          {moving && (
            <ParentPicker
              label="Move inside"
              nodes={nodes.filter((n) => !pathOf(n).some((p) => p.id === moving.id))}
              pathOf={pathOf}
              maxLevel={levelIndex(moving.level) - 1}
              value={null}
              onChange={(id) => id != null && moveTo(moving, id)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Merge */}
      <Dialog open={!!merging} onOpenChange={(o) => !o && setMerging(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Merge &quot;{merging?.name}&quot; into…</DialogTitle>
            <DialogDescription>
              {merging && `${pathOf(merging).map((p) => p.name).join(' › ')}. `}
              It becomes an alternative spelling of the place you pick; what is inside it moves across, and clients&apos;
              listings follow.
            </DialogDescription>
          </DialogHeader>
          {merging && (
            <div className="grid gap-4">
              <ParentPicker
                label="Keep this place"
                nodes={nodes.filter((n) => n.id !== merging.id && !pathOf(n).some((p) => p.id === merging.id))}
                pathOf={pathOf}
                accept={(n) => Math.abs(levelIndex(n.level) - levelIndex(merging.level)) <= 1 && levelIndex(n.level) >= levelIndex('area')}
                initialQuery={merging.name}
                value={mergeTargetId}
                onChange={setMergeTargetId}
              />
              {mergeTargetId != null && byId.get(mergeTargetId) && (
                <div className="grid gap-2">
                  <Label>Postcode and map point to keep</Label>
                  {(['target', 'source'] as const).map((side) => {
                    const n = side === 'target' ? byId.get(mergeTargetId)! : merging;
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => setMergeKeep(side)}
                        className={cn(
                          'flex items-start gap-3 rounded-md border p-3 text-left text-sm hover:bg-muted',
                          mergeKeep === side && 'border-primary bg-primary/5 ring-1 ring-primary',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border',
                            mergeKeep === side && 'border-4 border-primary',
                          )}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">
                            {side === 'target' ? 'The place being kept' : 'The duplicate'}: {pathOf(n).slice(-2).map((p) => p.name).join(' › ')}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Postcode {n.postcode || '—'} · {pointText(n)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  <p className="text-xs text-muted-foreground">Blanks on the chosen side are filled from the other.</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMerging(null)}>
              Cancel
            </Button>
            <Button onClick={runMerge} disabled={mergeBusy || mergeTargetId == null}>
              {mergeBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleting?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && subtreeSize(deleting.id) > 1
                ? `This also deletes the ${subtreeSize(deleting.id) - 1} place(s) inside it. `
                : ''}
              Clients keep their own locations; on their next sync, listings here are matched again (or listed as unmatched).
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
              Re-sorts clients&apos; feed listings into the template now instead of at their next sync. Locations a client
              arranged by hand are left alone.
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

// The value the API refused, from its note: "… (36.73832, -4.47608)". A
// swapped pair comes back in the right order. "Outside Spain" offers nothing.
function refusedValue(issue: string): { lat: number; lng: number; swapped: boolean } | null {
  if (/outside Spain|is 0/.test(issue)) return null;
  const m = issue.match(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)\s*$/);
  if (!m) return null;
  const a = Number(Number(m[1]).toFixed(6));
  const b = Number(Number(m[2]).toFixed(6));
  return /swapped/.test(issue) ? { lat: b, lng: a, swapped: true } : { lat: a, lng: b, swapped: false };
}

const pointText = (n: TemplateNode) =>
  n.lat != null && n.lng != null && !(Number(n.lat) === 0 && Number(n.lng) === 0)
    ? `${Number(n.lat).toFixed(5)}, ${Number(n.lng).toFixed(5)}`
    : 'no coordinates';

// Searchable list of places: by default the ones a node can go inside (levels
// above it); `accept` picks others (e.g. places to merge into).
function ParentPicker({
  label,
  nodes,
  pathOf,
  maxLevel = 0,
  accept,
  initialQuery = '',
  value,
  onChange,
}: {
  label: string;
  nodes: TemplateNode[];
  pathOf: (n: TemplateNode | undefined) => TemplateNode[];
  maxLevel?: number;
  accept?: (n: TemplateNode) => boolean;
  initialQuery?: string;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const options = useMemo(() => {
    const k = keyOf(q);
    return nodes
      .filter((n) => (accept ? accept(n) : levelIndex(n.level) <= maxLevel && levelIndex(n.level) >= Math.max(0, maxLevel - 1)))
      .filter((n) => !k || keyOf(n.name).includes(k) || (n.aliases || []).some((a) => keyOf(a).includes(k)))
      .slice(0, 60)
      .map((n) => ({ node: n, path: pathOf(n).map((p) => p.name).join(' › ') }))
      .sort((a, b) => a.path.localeCompare(b.path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, q, maxLevel]);
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-64 overflow-y-auto rounded-md border">
        {options.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No match.</p>
        ) : (
          options.map(({ node, path }) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onChange(node.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted',
                value === node.id && 'bg-primary/10',
              )}
            >
              <span className="truncate">{path}</span>
              <Badge variant="outline" className={cn('capitalize', levelColors[node.level])}>
                {node.level}
              </Badge>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
