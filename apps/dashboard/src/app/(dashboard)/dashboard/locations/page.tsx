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
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Location {
  id: number;
  name: Record<string, string>;
  slug: string;
  level: 'country' | 'province' | 'municipality' | 'town' | 'area';
  parentId: number | null;
  propertyCount?: number;
  sortOrder?: number;
  children?: Location[];
}

const defaultLanguageNames: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
  pt: 'Portuguese', it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
};

const levelColors: Record<string, string> = {
  country: 'bg-blue-100 text-blue-800',
  province: 'bg-purple-100 text-purple-800',
  municipality: 'bg-indigo-100 text-indigo-800',
  town: 'bg-green-100 text-green-800',
  area: 'bg-amber-100 text-amber-800',
};

const levels = ['country', 'province', 'municipality', 'town', 'area'] as const;

const emptyForm = { names: { en: '', es: '' } as Record<string, string>, slug: '', level: 'country' as string, parentId: null as number | null };

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

  const api = useApi();
  const { toast } = useToast();

  const fetchLocations = useCallback(async () => {
    try {
      const res = await api.get('/api/dashboard/locations/tree');
      const data: Location[] = res?.data || [];
      setLocations(data);
    } catch {
      toast({ title: 'Failed to load locations', variant: 'destructive' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api.isReady) return;
    fetchLocations();
    api.get('/api/dashboard/tenant').then((res: any) => {
      const langs = res?.data?.settings?.languages;
      if (langs?.length) setLanguages(langs);
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
        ...(form.parentId ? { parentId: form.parentId } : {}),
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
        ...(form.parentId ? { parentId: form.parentId } : {}),
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
      ? levels[Math.min(levels.indexOf(level as any) + 1, levels.length - 1)]
      : 'country';
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

  const handleReorderSiblings = async (siblings: Location[], fromIndex: number, toIndex: number, parentArray: Location[], setParentArray: (arr: Location[]) => void) => {
    if (fromIndex === toIndex) return;
    const reordered = [...siblings];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const items = reordered.map((loc, i) => ({ id: loc.id, sortOrder: i }));
    try {
      await api.put('/api/dashboard/locations/reorder', { items });
      toast({ title: 'Order updated' });
      fetchLocations();
    } catch {
      toast({ title: 'Failed to reorder', variant: 'destructive' });
      fetchLocations();
    }
  };

  const openDelete = (location: Location) => {
    setDeletingLocation(location);
    setIsDeleteOpen(true);
  };

  const countLocations = (locs: Location[]): { total: number; countries: number; provinces: number; towns: number; areas: number } => {
    const stats = { total: 0, countries: 0, provinces: 0, towns: 0, areas: 0 };
    const walk = (list: Location[]) => {
      for (const l of list) {
        stats.total++;
        if (l.level === 'country') stats.countries++;
        if (l.level === 'province') stats.provinces++;
        if (l.level === 'town') stats.towns++;
        if (l.level === 'area') stats.areas++;
        if (l.children) walk(l.children);
      }
    };
    walk(locs);
    return stats;
  };

  const stats = countLocations(locations);

  function LocationItem({ location, depth = 0, siblings, siblingIndex }: { location: Location; depth?: number; siblings?: Location[]; siblingIndex?: number }) {
    const [isExpanded, setIsExpanded] = useState(depth < 2);
    const [dragOverThis, setDragOverThis] = useState(false);
    const hasChildren = location.children && location.children.length > 0;

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
                handleReorderSiblings(siblings, data.siblingIndex, siblingIndex, locations, setLocations);
              }
            } catch { /* ignore invalid drag data */ }
          }}
          className={cn(
            'flex items-center justify-between py-3 px-4 hover:bg-muted/50 rounded-md transition-colors',
            depth > 0 && 'border-l-2 border-muted ml-4',
            dragOverThis && 'ring-2 ring-primary'
          )}
          style={{ paddingLeft: `${depth * 16 + 16}px` }}
        >
          <div className="flex items-center gap-3">
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
            {hasChildren ? (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(!isExpanded)}>
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
            {location.children!.map((child, ci) => (
              <LocationItem key={child.id} location={child} depth={depth + 1} siblings={location.children!} siblingIndex={ci} />
            ))}
          </div>
        )}
      </div>
    );
  }

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
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Locations</h1>
          <p className="text-muted-foreground">Manage your location hierarchy for property filtering</p>
        </div>
        <Button onClick={() => openAdd()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Location
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {[
          ['Total Locations', stats.total],
          ['Countries', stats.countries],
          ['Provinces', stats.provinces],
          ['Towns', stats.towns],
          ['Areas', stats.areas],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search locations..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            <CardTitle>Location Hierarchy</CardTitle>
          </div>
          <CardDescription>Click the chevron to expand/collapse</CardDescription>
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
              {locations.map((location, i) => (
                <LocationItem key={location.id} location={location} siblings={locations} siblingIndex={i} />
              ))}
            </div>
          )}
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
