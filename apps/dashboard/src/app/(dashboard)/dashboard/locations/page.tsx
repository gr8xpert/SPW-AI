'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  ChevronRight,
  ChevronDown,
  MapPin,
  FolderTree,
  Loader2,
  GripVertical,
  Eye,
  EyeOff,
  Settings2,
  Save,
  Sparkles,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Location {
  id: number;
  name: Record<string, string>;
  slug: string;
  level: 'region' | 'province' | 'area' | 'municipality' | 'town' | 'urbanization';
  parentId: number | null;
  propertyCount?: number;
  sortOrder?: number;
  isActive?: boolean;
  aiAssigned?: boolean;
  children?: Location[];
}

const defaultLanguageNames: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
  pt: 'Portuguese', it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
};

interface DropdownConfig {
  levels: string[];
  visible: boolean;
}

interface LocationSearchConfig {
  dropdown1: DropdownConfig;
  dropdown2: DropdownConfig;
  dropdown3: DropdownConfig;
}

const defaultSearchConfig: LocationSearchConfig = {
  dropdown1: { levels: ['area'], visible: true },
  dropdown2: { levels: ['municipality'], visible: true },
  dropdown3: { levels: ['town'], visible: false },
};

const levelColors: Record<string, string> = {
  region: 'bg-secondary text-primary',
  province: 'bg-secondary/85 text-primary',
  area: 'bg-secondary/70 text-primary',
  municipality: 'bg-secondary/60 text-primary',
  town: 'bg-secondary/50 text-primary',
  urbanization: 'bg-secondary/40 text-primary',
};

const levels = ['region', 'province', 'area', 'municipality', 'town', 'urbanization'] as const;

const emptyForm = { names: { en: '', es: '' } as Record<string, string>, slug: '', level: 'region' as string, parentId: null as number | null };

export default function LocationsPage() {
  const [search, setSearch] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [languages, setLanguages] = useState<string[]>(['en']);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [searchConfig, setSearchConfig] = useState<LocationSearchConfig>(defaultSearchConfig);
  const [savingConfig, setSavingConfig] = useState(false);
  // Lift expand state to parent so reorder/refresh doesn't collapse open branches.
  // LocationItem is defined inside this component (closes over many vars) so it
  // remounts on every parent render — local useState would reset each time.
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkMoveOpen, setIsBulkMoveOpen] = useState(false);
  const [bulkParentId, setBulkParentId] = useState<number | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [isAiOrganizing, setIsAiOrganizing] = useState(false);

  const api = useApi();
  const { toast } = useToast();

  const runAiOrganize = async () => {
    setIsAiOrganizing(true);
    try {
      const res: any = await api.post('/api/dashboard/ai-enrichment/run', { scope: 'locations' });
      const r = res?.data?.locations ?? res?.locations;
      if (r) {
        toast({
          title: 'AI organize complete',
          description: `+${r.regionsCreated} regions, ${r.provincesAttached} provinces grouped, ${r.skipped} skipped`,
        });
      } else {
        toast({ title: 'AI organize finished', description: 'No changes needed' });
      }
      fetchLocations();
    } catch (e: any) {
      toast({ title: 'AI organize failed', description: e?.message, variant: 'destructive' });
    } finally {
      setIsAiOrganizing(false);
    }
  };

  // Silent retry on first failure — hard-refresh hits this page before the
  // auth/tenant context is fully hydrated about 1 in 5 times; one retry
  // after 800ms is enough to get past the race without a noisy toast.
  const fetchLocations = useCallback(async (retriesLeft = 1) => {
    try {
      const res = await api.get('/api/dashboard/locations/tree?includeInactive=true');
      const data: Location[] = res?.data || [];
      setLocations(data);
      setExpandedIds((prev) => {
        if (prev.size > 0) return prev;
        const next = new Set<number>();
        const walk = (nodes: Location[], depth: number) => {
          for (const n of nodes) {
            if (depth < 2) next.add(n.id);
            if (n.children?.length) walk(n.children, depth + 1);
          }
        };
        walk(data, 0);
        return next;
      });
    } catch {
      if (retriesLeft > 0) {
        setTimeout(() => fetchLocations(retriesLeft - 1), 800);
        return;
      }
      toast({ title: 'Failed to load locations', variant: 'destructive' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api.isReady) return;
    fetchLocations();
    api.get('/api/dashboard/tenant').then((res: any) => {
      const settings = res?.data?.settings;
      const langs = settings?.languages;
      if (langs?.length) setLanguages(langs);
      if (settings?.locationSearchConfig) {
        setSearchConfig({
          dropdown1: { ...defaultSearchConfig.dropdown1, ...settings.locationSearchConfig.dropdown1 },
          dropdown2: { ...defaultSearchConfig.dropdown2, ...settings.locationSearchConfig.dropdown2 },
          dropdown3: { ...defaultSearchConfig.dropdown3, ...settings.locationSearchConfig.dropdown3 },
        });
      }
    }).catch(() => {});
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildName = () => {
    const name: Record<string, string> = {};
    for (const [lang, val] of Object.entries(form.names)) {
      if (val.trim()) name[lang] = val.trim();
    }
    return name;
  };

  const handleCreate = async () => {
    try {
      await api.post('/api/dashboard/locations', {
        name: buildName(),
        slug: form.slug,
        level: form.level,
        parentId: form.parentId ?? null,
      });
      toast({ title: 'Location created' });
      setIsAddOpen(false);
      setForm(emptyForm);
      fetchLocations();
    } catch (e: any) {
      toast({ title: 'Failed to create', description: e.message, variant: 'destructive' });
    }
  };

  const handleUpdate = async () => {
    if (!editingLocation) return;
    try {
      await api.put(`/api/dashboard/locations/${editingLocation.id}`, {
        name: buildName(),
        slug: form.slug,
        level: form.level,
        parentId: form.parentId ?? null,
      });
      toast({ title: 'Location updated' });
      setIsEditOpen(false);
      setEditingLocation(null);
      setForm(emptyForm);
      fetchLocations();
    } catch (e: any) {
      toast({ title: 'Failed to update', description: e.message, variant: 'destructive' });
    }
  };

  const handleBulkMove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await api.put('/api/dashboard/locations/bulk-move', { ids, parentId: bulkParentId });
      const body = res?.data || res;
      const mergedCount = Number(body?.merged ?? 0);
      const reparentedCount = ids.length - mergedCount;
      const parts: string[] = [];
      if (reparentedCount > 0) parts.push(`Moved ${reparentedCount} location${reparentedCount === 1 ? '' : 's'}`);
      if (mergedCount > 0) parts.push(`merged ${mergedCount} duplicate${mergedCount === 1 ? '' : 's'}`);
      toast({ title: parts.join(' · ') || `Moved ${ids.length} location${ids.length === 1 ? '' : 's'}` });
      setIsBulkMoveOpen(false);
      setSelectedIds(new Set());
      fetchLocations();
    } catch (e: any) {
      toast({ title: 'Bulk move failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await api.put('/api/dashboard/locations/bulk-delete', { ids });
      toast({ title: `Deleted ${ids.length} location${ids.length === 1 ? '' : 's'}` });
      setIsBulkDeleteOpen(false);
      setSelectedIds(new Set());
      fetchLocations();
    } catch (e: any) {
      toast({ title: 'Bulk delete failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingLocation) return;
    try {
      await api.delete(`/api/dashboard/locations/${deletingLocation.id}`);
      toast({ title: 'Location deleted' });
      setIsDeleteOpen(false);
      setDeletingLocation(null);
      fetchLocations();
    } catch (e: any) {
      toast({ title: 'Failed to delete', description: e.message, variant: 'destructive' });
    }
  };

  const openAdd = (parentId?: number, level?: string) => {
    const nextLevel = level
      ? levels[Math.min(levels.indexOf(level as typeof levels[number]) + 1, levels.length - 1)]
      : 'region';
    setForm({ ...emptyForm, parentId: parentId || null, level: nextLevel });
    setIsAddOpen(true);
  };

  const openEdit = (location: Location) => {
    setEditingLocation(location);
    const names: Record<string, string> = {};
    languages.forEach((lang) => { names[lang] = location.name[lang] || ''; });
    setForm({ names, slug: location.slug, level: location.level, parentId: location.parentId });
    setIsEditOpen(true);
  };

  // Reorders siblings within the same parent. Updates state in place so the
  // accordion's local expand state doesn't reset. Only refetches on error.
  const handleReorderSiblings = async (
    _siblings: Location[],
    fromIndex: number,
    toIndex: number,
    parentId: number | null,
  ) => {
    if (fromIndex === toIndex) return;

    const reorderInTree = (nodes: Location[]): Location[] =>
      nodes.map((n) => {
        if (n.id === parentId) {
          const children = [...(n.children || [])];
          const [moved] = children.splice(fromIndex, 1);
          children.splice(toIndex, 0, moved);
          return { ...n, children };
        }
        if (n.children?.length) return { ...n, children: reorderInTree(n.children) };
        return n;
      });

    let updated: Location[];
    if (parentId === null) {
      const top = [...locations];
      const [moved] = top.splice(fromIndex, 1);
      top.splice(toIndex, 0, moved);
      updated = top;
    } else {
      updated = reorderInTree(locations);
    }
    setLocations(updated);

    // Build items from the reordered set so the persisted sortOrder matches what the user sees.
    const findSiblings = (nodes: Location[]): Location[] | null => {
      if (parentId === null) return nodes;
      for (const n of nodes) {
        if (n.id === parentId) return n.children || [];
        if (n.children?.length) {
          const found = findSiblings(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    const finalSiblings = findSiblings(updated) || [];
    const items = finalSiblings.map((loc, i) => ({ id: loc.id, sortOrder: i }));

    try {
      await api.put('/api/dashboard/locations/reorder', { items });
    } catch {
      toast({ title: 'Failed to reorder', variant: 'destructive' });
      fetchLocations();
    }
  };

  const handleToggleVisibility = async (location: Location) => {
    const newActive = !(location.isActive ?? true);
    try {
      await api.put(`/api/dashboard/locations/${location.id}`, { isActive: newActive });
      toast({ title: newActive ? 'Location visible on website' : 'Location hidden from website' });
      fetchLocations();
    } catch {
      toast({ title: 'Failed to update visibility', variant: 'destructive' });
    }
  };

  const handleSaveSearchConfig = async () => {
    setSavingConfig(true);
    try {
      await api.put('/api/dashboard/tenant/settings', { locationSearchConfig: searchConfig });
      toast({ title: 'Search configuration saved' });
    } catch {
      toast({ title: 'Failed to save configuration', variant: 'destructive' });
    } finally {
      setSavingConfig(false);
    }
  };

  const updateDropdownConfig = (key: 'dropdown1' | 'dropdown2' | 'dropdown3', field: string, value: any) => {
    setSearchConfig(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const toggleDropdownLevel = (key: 'dropdown1' | 'dropdown2' | 'dropdown3', level: string) => {
    setSearchConfig(prev => {
      const dd = prev[key];
      const has = dd.levels.includes(level);
      return {
        ...prev,
        [key]: {
          ...dd,
          levels: has ? dd.levels.filter(l => l !== level) : [...dd.levels, level],
        },
      };
    });
  };

  const openDelete = (location: Location) => {
    setDeletingLocation(location);
    setIsDeleteOpen(true);
  };

  const countLocations = (locs: Location[]): { total: number; regions: number; provinces: number; areas: number; municipalities: number; towns: number; urbanizations: number } => {
    const stats = { total: 0, regions: 0, provinces: 0, areas: 0, municipalities: 0, towns: 0, urbanizations: 0 };
    const walk = (list: Location[]) => {
      for (const l of list) {
        stats.total++;
        if (l.level === 'region') stats.regions++;
        if (l.level === 'province') stats.provinces++;
        if (l.level === 'area') stats.areas++;
        if (l.level === 'municipality') stats.municipalities++;
        if (l.level === 'town') stats.towns++;
        if (l.level === 'urbanization') stats.urbanizations++;
        if (l.children) walk(l.children);
      }
    };
    walk(locs);
    return stats;
  };

  const stats = countLocations(locations);

  // hideEmpty filter: a node is visible if it has properties OR any descendant does.
  const hasAnyProperties = (loc: Location): boolean => {
    if ((loc.propertyCount ?? 0) > 0) return true;
    if (loc.children?.length) return loc.children.some((c) => hasAnyProperties(c));
    return false;
  };

  function LocationItem({ location, depth = 0, siblings, siblingIndex }: { location: Location; depth?: number; siblings?: Location[]; siblingIndex?: number }) {
    const isExpanded = expandedIds.has(location.id);
    const [dragOverThis, setDragOverThis] = useState(false);
    const hasChildren = location.children && location.children.length > 0;
    const isSelected = selectedIds.has(location.id);

    return (
      <div>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({ id: location.id, parentId: location.parentId, siblingIndex }));
            e.stopPropagation();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOverThis(true);
          }}
          onDragLeave={() => setDragOverThis(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOverThis(false);
            try {
              const data = JSON.parse(e.dataTransfer.getData('text/plain'));
              if (data.parentId === location.parentId && siblings && siblingIndex !== undefined && data.siblingIndex !== undefined) {
                handleReorderSiblings(siblings, data.siblingIndex, siblingIndex, location.parentId);
              }
            } catch { /* ignore invalid drag data */ }
          }}
          className={cn(
            'flex items-center justify-between py-3 px-4 hover:bg-muted/50 rounded-md transition-colors',
            depth > 0 && 'border-l-2 border-muted ml-4',
            dragOverThis && 'ring-2 ring-primary',
            isSelected && 'bg-primary/5',
            location.isActive === false && 'opacity-50'
          )}
          style={{ paddingLeft: `${depth * 16 + 16}px` }}
        >
          <div className="flex items-center gap-3">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(location.id)) next.delete(location.id);
                  else next.add(location.id);
                  return next;
                });
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
            {hasChildren ? (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleExpand(location.id)}>
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            ) : (
              <div className="w-6" />
            )}
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{location.name.en}</p>
              {languages.filter((l) => l !== 'en' && location.name[l]).map((l) => (
                <p key={l} className="text-xs text-muted-foreground">
                  <span className="uppercase font-medium">{l}</span>: {location.name[l]}
                </p>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className={levelColors[location.level]}>
              {location.level}
            </Badge>
            <span className="text-sm text-muted-foreground min-w-[80px] text-right">
              {location.propertyCount ?? 0} properties
            </span>
            <div
              className="flex items-center gap-1.5"
              title={location.isActive !== false ? 'Visible on website' : 'Hidden from website'}
              onClick={(e) => e.stopPropagation()}
            >
              {location.isActive !== false ? (
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <Switch
                checked={location.isActive !== false}
                onCheckedChange={() => handleToggleVisibility(location)}
                className="scale-75"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openAdd(location.id, location.level)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Child Location
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openEdit(location)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => openDelete(location)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div>
            {location.children!
              .filter((c) => !hideEmpty || hasAnyProperties(c))
              .map((child, ci, arr) => (
                <LocationItem key={child.id} location={child} depth={depth + 1} siblings={arr} siblingIndex={ci} />
              ))}
          </div>
        )}
      </div>
    );
  }

  // Flatten the tree for the parent picker; indent the label by depth so the
  // hierarchy is visible inside the dropdown.
  const flatLocations = (() => {
    const out: Array<{ id: number; label: string; level: string }> = [];
    const walk = (nodes: Location[], depth: number) => {
      for (const n of nodes) {
        out.push({ id: n.id, label: `${'  '.repeat(depth)}${n.name.en || Object.values(n.name)[0] || `#${n.id}`}`, level: n.level });
        if (n.children?.length) walk(n.children, depth + 1);
      }
    };
    walk(locations, 0);
    return out;
  })();

  const formFields = (
    <div className="space-y-4 py-4">
      {languages.map((lang) => (
        <div key={lang} className="space-y-2">
          <Label>Name ({defaultLanguageNames[lang] || lang.toUpperCase()})</Label>
          <Input placeholder={lang === 'en' ? 'Spain' : ''} value={form.names[lang] || ''} onChange={(e) => setForm({ ...form, names: { ...form.names, [lang]: e.target.value } })} />
        </div>
      ))}
      <div className="space-y-2">
        <Label>Slug</Label>
        <Input placeholder="spain" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Level</Label>
        <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {levels.map((l) => (
              <SelectItem key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Parent Location <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
        <Select
          value={form.parentId == null ? 'none' : String(form.parentId)}
          onValueChange={(v) => setForm({ ...form, parentId: v === 'none' ? null : Number(v) })}
        >
          <SelectTrigger><SelectValue placeholder="No parent (top level)" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="none">— No parent (top level) —</SelectItem>
            {flatLocations
              .filter((l) => !editingLocation || l.id !== editingLocation.id)
              .map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>{l.label}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Locations</h1>
          <p className="page-description mt-1">Manage your location hierarchy for property filtering</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runAiOrganize} disabled={isAiOrganizing}>
            {isAiOrganizing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            AI Organize
          </Button>
          <Button className="shadow-sm" onClick={() => openAdd()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Location
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        {[
          ['Total', stats.total],
          ['Regions', stats.regions],
          ['Provinces', stats.provinces],
          ['Areas', stats.areas],
          ['Municipalities', stats.municipalities],
          ['Towns', stats.towns],
          ['Urbanizations', stats.urbanizations],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <div className="stat-card-icon">
                <MapPin className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search locations..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch checked={hideEmpty} onCheckedChange={setHideEmpty} />
            Hide locations with 0 properties
          </label>
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-3 flex items-center justify-between gap-4">
            <div className="text-sm">
              <strong>{selectedIds.size}</strong> location{selectedIds.size === 1 ? '' : 's'} selected
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Clear</Button>
              <Button size="sm" onClick={() => { setBulkParentId(null); setIsBulkMoveOpen(true); }}>
                Move under parent…
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setIsBulkDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              <CardTitle>Location Hierarchy</CardTitle>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={(() => {
                  const visible: number[] = [];
                  const walk = (nodes: Location[]) => {
                    for (const n of nodes) {
                      if (!hideEmpty || hasAnyProperties(n)) {
                        visible.push(n.id);
                        if (n.children?.length) walk(n.children);
                      }
                    }
                  };
                  walk(locations);
                  return visible.length > 0 && visible.every((id) => selectedIds.has(id));
                })()}
                onCheckedChange={(v) => {
                  const visible = new Set<number>();
                  const walk = (nodes: Location[]) => {
                    for (const n of nodes) {
                      if (!hideEmpty || hasAnyProperties(n)) {
                        visible.add(n.id);
                        if (n.children?.length) walk(n.children);
                      }
                    }
                  };
                  walk(locations);
                  if (v) setSelectedIds(visible);
                  else setSelectedIds(new Set());
                }}
              />
              Select all visible
            </label>
          </div>
          <CardDescription>Click the chevron to expand/collapse. Tick checkboxes to bulk-move or bulk-delete.</CardDescription>
        </CardHeader>
        <CardContent>
          {api.isLoading && locations.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : locations.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No locations yet. Click &quot;Add Location&quot; to create one.</p>
          ) : (
            <div className="space-y-1">
              {locations
                .filter((l) => !hideEmpty || hasAnyProperties(l))
                .map((location, i, arr) => (
                  <LocationItem key={location.id} location={location} siblings={arr} siblingIndex={i} />
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Location Search Config */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              <div>
                <CardTitle>Website Search Dropdowns</CardTitle>
                <CardDescription>Configure which location levels appear in each dropdown on your website (Variation 2)</CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={handleSaveSearchConfig} disabled={savingConfig}>
              {savingConfig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {(['dropdown1', 'dropdown2', 'dropdown3'] as const).map((ddKey, ddIdx) => {
              const dd = searchConfig[ddKey];
              const ddNum = ddIdx + 1;
              return (
                <div key={ddKey} className={cn('rounded-lg border p-4 space-y-3', dd.visible ? '' : 'opacity-60')}>
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Dropdown {ddNum}</h4>
                    {ddIdx === 2 && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Visible</Label>
                        <Switch
                          checked={dd.visible}
                          onCheckedChange={(v) => updateDropdownConfig(ddKey, 'visible', v)}
                          className="scale-75"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {levels.map((level) => (
                      <label key={level} className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={dd.levels.includes(level)}
                          onCheckedChange={() => toggleDropdownLevel(ddKey, level)}
                        />
                        <span className="text-sm capitalize">{level}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setForm(emptyForm); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Location</DialogTitle>
            <DialogDescription>Create a new location in the hierarchy</DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.names.en || !form.slug || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingLocation(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Location</DialogTitle>
            <DialogDescription>Update the location details</DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!form.names.en || !form.slug || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Move Dialog */}
      <Dialog open={isBulkMoveOpen} onOpenChange={setIsBulkMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedIds.size} location{selectedIds.size === 1 ? '' : 's'} under a parent</DialogTitle>
            <DialogDescription>Pick a parent location. Selected items become its children. Choose &quot;No parent&quot; to move them back to the top level.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>Parent Location</Label>
            <Select
              value={bulkParentId == null ? 'none' : String(bulkParentId)}
              onValueChange={(v) => setBulkParentId(v === 'none' ? null : Number(v))}
            >
              <SelectTrigger><SelectValue placeholder="No parent (top level)" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">— No parent (top level) —</SelectItem>
                {flatLocations
                  .filter((l) => !selectedIds.has(l.id))
                  .map((l) => (<SelectItem key={l.id} value={String(l.id)}>{l.label}</SelectItem>))}
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
            <AlertDialogTitle>Delete {selectedIds.size} location{selectedIds.size === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Child locations will become top-level. Properties referencing these will have their location cleared. This action cannot be undone.
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
            <AlertDialogTitle>Delete Location</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingLocation?.name.en}&quot;? This will also delete all child locations. This action cannot be undone.
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
