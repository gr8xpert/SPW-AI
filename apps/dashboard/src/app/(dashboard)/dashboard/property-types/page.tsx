'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  GripVertical,
  Home,
  Building,
  Castle,
  Loader2,
  Sparkles,
  Check,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

interface PropertyType {
  id: number;
  name: Record<string, string>;
  slug: string;
  icon?: string;
  parentId?: number | null;
  propertyCount?: number;
  sortOrder?: number;
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
  it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
  da: 'Danish', pl: 'Polish', cs: 'Czech', fi: 'Finnish',
};

const iconMap: Record<string, React.ReactNode> = {
  castle: <Castle className="h-4 w-4" />,
  building: <Building className="h-4 w-4" />,
  home: <Home className="h-4 w-4" />,
  map: <div className="h-4 w-4 bg-muted rounded" />,
};

export default function PropertyTypesPage() {
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState<PropertyType[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBulkTranslateOpen, setIsBulkTranslateOpen] = useState(false);
  const [languages, setLanguages] = useState<string[]>(['en']);
  const [editingType, setEditingType] = useState<PropertyType | null>(null);
  const [deletingType, setDeletingType] = useState<PropertyType | null>(null);
  const [form, setForm] = useState({ names: {} as Record<string, string>, slug: '', icon: '', parentId: null as number | null });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatingId, setTranslatingId] = useState<number | null>(null);
  const [isBulkTranslating, setIsBulkTranslating] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkMoveOpen, setIsBulkMoveOpen] = useState(false);
  const [bulkParentId, setBulkParentId] = useState<number | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isAiOrganizing, setIsAiOrganizing] = useState(false);

  const api = useApi();
  const { toast } = useToast();

  const runAiOrganize = async () => {
    setIsAiOrganizing(true);
    try {
      const res: any = await api.post('/api/dashboard/ai-enrichment/run', { scope: 'property-types' });
      const r = res?.data?.propertyTypes ?? res?.propertyTypes;
      if (r) {
        toast({
          title: 'AI organize complete',
          description: `+${r.parentsCreated} parent groups, ${r.childrenAttached} types grouped, ${r.skipped} skipped`,
        });
      } else {
        toast({ title: 'AI organize finished', description: 'No changes needed' });
      }
      fetchTypes();
    } catch (e: any) {
      toast({ title: 'AI organize failed', description: e?.message, variant: 'destructive' });
    } finally {
      setIsAiOrganizing(false);
    }
  };

  useEffect(() => {
    if (!api.isReady) return;
    api.get('/api/dashboard/tenant')
      .then((res: any) => {
        const langs = res?.data?.settings?.languages;
        if (langs?.length) setLanguages(langs);
      })
      .catch(() => {});
    fetchTypes();
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTypes = async (retriesLeft = 1) => {
    try {
      const res = await api.get('/api/dashboard/property-types');
      setTypes(res?.data || []);
    } catch {
      if (retriesLeft > 0) {
        setTimeout(() => fetchTypes(retriesLeft - 1), 800);
        return;
      }
      toast({ title: 'Failed to load property types', variant: 'destructive' });
    }
  };

  const buildName = () => {
    const name: Record<string, string> = {};
    for (const [lang, val] of Object.entries(form.names)) {
      if (val.trim()) name[lang] = val.trim();
    }
    return name;
  };

  const handleCreate = async () => {
    try {
      await api.post('/api/dashboard/property-types', {
        name: buildName(),
        slug: form.slug,
        parentId: form.parentId ?? null,
        ...(form.icon ? { icon: form.icon } : {}),
      });
      toast({ title: 'Property type created' });
      setIsAddOpen(false);
      setForm({ names: {}, slug: '', icon: '', parentId: null });
      fetchTypes();
    } catch (e: any) {
      toast({ title: 'Failed to create', description: e.message, variant: 'destructive' });
    }
  };

  const handleUpdate = async () => {
    if (!editingType) return;
    try {
      await api.put(`/api/dashboard/property-types/${editingType.id}`, {
        name: buildName(),
        slug: form.slug,
        parentId: form.parentId ?? null,
        ...(form.icon ? { icon: form.icon } : {}),
      });
      toast({ title: 'Property type updated' });
      setIsEditOpen(false);
      setEditingType(null);
      setForm({ names: {}, slug: '', icon: '', parentId: null });
      fetchTypes();
    } catch (e: any) {
      toast({ title: 'Failed to update', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingType) return;
    try {
      await api.delete(`/api/dashboard/property-types/${deletingType.id}`);
      toast({ title: 'Property type deleted' });
      setIsDeleteOpen(false);
      setDeletingType(null);
      fetchTypes();
    } catch (e: any) {
      toast({ title: 'Failed to delete', description: e.message, variant: 'destructive' });
    }
  };

  const openEdit = (type: PropertyType) => {
    setEditingType(type);
    const names: Record<string, string> = {};
    languages.forEach((lang) => { names[lang] = type.name[lang] || ''; });
    setForm({ names, slug: type.slug, icon: type.icon || '', parentId: type.parentId ?? null });
    setIsEditOpen(true);
  };

  const handleAiTranslate = async () => {
    if (!editingType) return;
    setIsTranslating(true);
    try {
      await api.put(`/api/dashboard/property-types/${editingType.id}`, {
        name: buildName(),
        slug: form.slug,
        ...(form.icon ? { icon: form.icon } : {}),
      });
      const missingLangs = languages.filter(l => l !== 'en' && !form.names[l]?.trim());
      if (missingLangs.length === 0) {
        toast({ title: 'All translations are already complete' });
        setIsTranslating(false);
        return;
      }
      const res = await api.post(`/api/dashboard/translate/property-type/${editingType.id}`, {
        targetLanguages: missingLangs,
        sourceLanguage: 'en',
      });
      const updated = res?.data;
      if (updated?.name) {
        const newNames = { ...form.names };
        for (const [lang, val] of Object.entries(updated.name as Record<string, string>)) {
          newNames[lang] = val;
        }
        setForm(prev => ({ ...prev, names: newNames }));
      }
      toast({ title: `Translated to ${missingLangs.length} languages` });
      fetchTypes();
    } catch (e: any) {
      toast({ title: 'Translation failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleQuickTranslate = async (type: PropertyType) => {
    setTranslatingId(type.id);
    try {
      const missingLangs = languages.filter(l => l !== 'en' && !type.name[l]?.trim());
      if (missingLangs.length === 0) {
        toast({ title: 'All translations are already complete' });
        setTranslatingId(null);
        return;
      }
      await api.post(`/api/dashboard/translate/property-type/${type.id}`, {
        targetLanguages: missingLangs,
        sourceLanguage: 'en',
      });
      toast({ title: `Translated "${type.name.en}"` });
      fetchTypes();
    } catch (e: any) {
      toast({ title: 'Translation failed', description: e.message, variant: 'destructive' });
    } finally {
      setTranslatingId(null);
    }
  };

  const handleBulkTranslate = async () => {
    setIsBulkTranslating(true);
    try {
      const targetLangs = languages.filter(l => l !== 'en');
      if (targetLangs.length === 0) {
        toast({ title: 'No target languages configured. Add languages in Settings.' });
        return;
      }
      const res = await api.post('/api/dashboard/translate/property-types/bulk', {
        targetLanguages: targetLangs,
        sourceLanguage: 'en',
      });
      const jobId = res?.data?.jobId;
      toast({ title: 'Bulk translation started' });
      setIsBulkTranslateOpen(false);
      if (jobId) {
        const poll = () => {
          setTimeout(async () => {
            try {
              const s = await api.get(`/api/dashboard/translate/job/${jobId}`);
              const st = s?.data;
              if (st?.status === 'completed') {
                toast({ title: 'Bulk translation complete', description: `${st.completed} items translated` });
                fetchTypes();
                return;
              }
              if (st?.status === 'failed') {
                toast({ title: 'Bulk translation had errors', variant: 'destructive' });
                fetchTypes();
                return;
              }
              poll();
            } catch { poll(); }
          }, 3000);
        };
        poll();
      }
    } catch (e: any) {
      toast({ title: 'Bulk translation failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsBulkTranslating(false);
    }
  };

  // Build a tree-ordered flat list: parents first, children indented underneath.
  // Search still filters but preserves the parent-child grouping.
  const orderedTypes = (() => {
    const byParent = new Map<number | null, PropertyType[]>();
    for (const t of types) {
      const key = t.parentId ?? null;
      const arr = byParent.get(key) || [];
      arr.push(t);
      byParent.set(key, arr);
    }
    byParent.forEach((arr) => arr.sort((a: PropertyType, b: PropertyType) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    const out: Array<PropertyType & { _depth: number }> = [];
    const walk = (parentId: number | null, depth: number) => {
      for (const t of byParent.get(parentId) || []) {
        out.push({ ...t, _depth: depth });
        walk(t.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  })();

  const filteredTypes = orderedTypes.filter((type) => {
    const matchesSearch = Object.values(type.name).some((v) => v?.toLowerCase().includes(search.toLowerCase()));
    if (!matchesSearch) return false;
    // Hide empties: skip types with 0 properties UNLESS they have children with properties.
    if (hideEmpty) {
      const hasDescendantWithProps = (parentId: number): boolean => {
        return orderedTypes.some((t) => t.parentId === parentId && ((t.propertyCount ?? 0) > 0 || hasDescendantWithProps(t.id)));
      };
      if ((type.propertyCount ?? 0) === 0 && !hasDescendantWithProps(type.id)) return false;
    }
    return true;
  });

  const handleBulkMove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await api.put('/api/dashboard/property-types/bulk-move', { ids, parentId: bulkParentId });
      toast({ title: `Moved ${ids.length} type${ids.length === 1 ? '' : 's'}` });
      setIsBulkMoveOpen(false);
      setSelectedIds(new Set());
      fetchTypes();
    } catch (e: any) {
      toast({ title: 'Bulk move failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await api.put('/api/dashboard/property-types/bulk-delete', { ids });
      toast({ title: `Deleted ${ids.length} type${ids.length === 1 ? '' : 's'}` });
      setIsBulkDeleteOpen(false);
      setSelectedIds(new Set());
      fetchTypes();
    } catch (e: any) {
      toast({ title: 'Bulk delete failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleDrop = async (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const reordered = [...filteredTypes];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const items = reordered.map((t, i) => ({ id: t.id, sortOrder: i }));
    setDragIndex(null);
    setDragOverIndex(null);
    setTypes((prev) => {
      const updated = [...prev];
      items.forEach(({ id, sortOrder }) => {
        const found = updated.find((t) => t.id === id);
        if (found) found.sortOrder = sortOrder;
      });
      return updated.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    });
    try {
      await api.put('/api/dashboard/property-types/reorder', { items });
      toast({ title: 'Order updated' });
    } catch {
      toast({ title: 'Failed to reorder', variant: 'destructive' });
      fetchTypes();
    }
  };

  const translationCount = (names: Record<string, string>) => {
    const filled = languages.filter(l => names[l]?.trim()).length;
    return { filled, total: languages.length };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Property Types</h1>
          <p className="page-description mt-1">Manage property type classifications</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runAiOrganize} disabled={isAiOrganizing}>
            {isAiOrganizing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            AI Organize
          </Button>
          {languages.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setIsBulkTranslateOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" />
              AI Translate All
            </Button>
          )}
          <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setForm({ names: {}, slug: '', icon: '', parentId: null }); }}>
            <DialogTrigger asChild>
              <Button className="shadow-sm"><Plus className="h-4 w-4 mr-2" />Add Type</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Property Type</DialogTitle>
                <DialogDescription>Create a new property type classification</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name (English)</Label>
                  <Input placeholder="Villa" value={form.names.en || ''} onChange={(e) => setForm({ ...form, names: { ...form.names, en: e.target.value } })} />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input placeholder="villa" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Icon</Label>
                  <Input placeholder="home, building, castle" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Parent Type <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                  <Select
                    value={form.parentId == null ? 'none' : String(form.parentId)}
                    onValueChange={(v) => setForm({ ...form, parentId: v === 'none' ? null : Number(v) })}
                  >
                    <SelectTrigger><SelectValue placeholder="No parent (top level)" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="none">— No parent (top level) —</SelectItem>
                      {orderedTypes.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{'  '.repeat(t._depth)}{t.name.en || Object.values(t.name)[0]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!form.names.en || !form.slug || api.isLoading}>
                  {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search property types..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={hideEmpty} onCheckedChange={setHideEmpty} />
              Hide types with 0 properties
            </label>
          </div>
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-3 flex items-center justify-between gap-4">
            <div className="text-sm"><strong>{selectedIds.size}</strong> type{selectedIds.size === 1 ? '' : 's'} selected</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Clear</Button>
              <Button size="sm" onClick={() => { setBulkParentId(null); setIsBulkMoveOpen(true); }}>Move under parent…</Button>
              <Button size="sm" variant="destructive" onClick={() => setIsBulkDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Property Types ({filteredTypes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {api.isLoading && types.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : types.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No property types yet. Click &quot;Add Type&quot; to create one.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={selectedIds.size > 0 && filteredTypes.every((t) => selectedIds.has(t.id))}
                      onCheckedChange={(v) => {
                        if (v) setSelectedIds(new Set(filteredTypes.map((t) => t.id)));
                        else setSelectedIds(new Set());
                      }}
                    />
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  {languages.length > 1 && <TableHead>Translations</TableHead>}
                  <TableHead>Properties</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTypes.map((type, i) => {
                  const { filled, total } = translationCount(type.name);
                  return (
                    <TableRow
                      key={type.id}
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                      onDragLeave={() => setDragOverIndex(null)}
                      onDrop={() => handleDrop(i)}
                      onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                      className={`${dragOverIndex === i ? 'border-t-2 border-primary' : ''} ${selectedIds.has(type.id) ? 'bg-primary/5' : ''}`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(type.id)}
                          onCheckedChange={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(type.id)) next.delete(type.id);
                              else next.add(type.id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3" style={{ paddingLeft: `${(type._depth || 0) * 24}px` }}>
                          {type._depth > 0 && <span className="text-muted-foreground">↳</span>}
                          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                            {iconMap[type.icon || ''] || <Home className="h-4 w-4" />}
                          </div>
                          <span className="font-medium">{type.name.en || Object.values(type.name)[0]}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-sm bg-muted px-2 py-1 rounded">{type.slug}</code>
                      </TableCell>
                      {languages.length > 1 && (
                        <TableCell>
                          {translatingId === type.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Badge variant={filled === total ? 'default' : 'secondary'}>
                              {filled}/{total}
                            </Badge>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant="outline">{type.propertyCount ?? 0}</Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(type)}>
                              <Edit className="h-4 w-4 mr-2" />Edit
                            </DropdownMenuItem>
                            {languages.length > 1 && (
                              <DropdownMenuItem onClick={() => handleQuickTranslate(type)}>
                                <Sparkles className="h-4 w-4 mr-2" />AI Translate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => { setDeletingType(type); setIsDeleteOpen(true); }}>
                              <Trash2 className="h-4 w-4 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingType(null); setForm({ names: {}, slug: '', icon: '', parentId: null }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Property Type</DialogTitle>
            <DialogDescription>Update details and translations</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name (English)</Label>
              <Input value={form.names.en || ''} onChange={(e) => setForm({ ...form, names: { ...form.names, en: e.target.value } })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Icon</Label>
                <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Parent Type <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Select
                value={form.parentId == null ? 'none' : String(form.parentId)}
                onValueChange={(v) => setForm({ ...form, parentId: v === 'none' ? null : Number(v) })}
              >
                <SelectTrigger><SelectValue placeholder="No parent (top level)" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">— No parent (top level) —</SelectItem>
                  {orderedTypes
                    .filter((t) => !editingType || t.id !== editingType.id)
                    .map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{'  '.repeat(t._depth)}{t.name.en || Object.values(t.name)[0]}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {languages.filter(l => l !== 'en').length > 0 && (
              <div className="border rounded-md">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
                  <span className="text-sm font-medium">
                    Translations ({languages.filter(l => l !== 'en' && form.names[l]?.trim()).length}/{languages.filter(l => l !== 'en').length})
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleAiTranslate} disabled={isTranslating || !form.names.en?.trim()}>
                    {isTranslating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    AI Translate
                  </Button>
                </div>
                <div className="max-h-[280px] overflow-y-auto p-3 space-y-2">
                  {languages.filter(l => l !== 'en').map(lang => (
                    <div key={lang} className="flex items-center gap-2">
                      <span className="text-xs font-medium uppercase w-8 text-muted-foreground shrink-0">{lang}</span>
                      <Input
                        className="h-8 text-sm"
                        placeholder={LANG_NAMES[lang] || lang}
                        value={form.names[lang] || ''}
                        onChange={(e) => setForm({ ...form, names: { ...form.names, [lang]: e.target.value } })}
                      />
                      {form.names[lang]?.trim() ? (
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!form.names.en || !form.slug || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Translate Confirmation */}
      <AlertDialog open={isBulkTranslateOpen} onOpenChange={setIsBulkTranslateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>AI Translate All Property Types</AlertDialogTitle>
            <AlertDialogDescription>
              This will translate all {types.length} property types to {languages.filter(l => l !== 'en').length} languages using AI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkTranslate} disabled={isBulkTranslating}>
              {isBulkTranslating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Start Translation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Move Dialog */}
      <Dialog open={isBulkMoveOpen} onOpenChange={setIsBulkMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedIds.size} type{selectedIds.size === 1 ? '' : 's'} under a parent</DialogTitle>
            <DialogDescription>Choose a parent type. Selected items become its children. Select &quot;No parent&quot; to make them top-level.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>Parent Type</Label>
            <Select
              value={bulkParentId == null ? 'none' : String(bulkParentId)}
              onValueChange={(v) => setBulkParentId(v === 'none' ? null : Number(v))}
            >
              <SelectTrigger><SelectValue placeholder="No parent (top level)" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">— No parent (top level) —</SelectItem>
                {orderedTypes
                  .filter((t) => !selectedIds.has(t.id))
                  .map((t) => (<SelectItem key={t.id} value={String(t.id)}>{'  '.repeat(t._depth)}{t.name.en || Object.values(t.name)[0]}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkMoveOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkMove}>Move {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} type{selectedIds.size === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Properties using these types will have their type cleared. Child types will become top-level. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Property Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingType?.name.en}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
