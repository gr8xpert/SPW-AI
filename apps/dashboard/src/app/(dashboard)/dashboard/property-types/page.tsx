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
  Languages,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

interface PropertyType {
  id: number;
  name: Record<string, string>;
  slug: string;
  icon?: string;
  propertyCount?: number;
  sortOrder?: number;
}

const defaultLanguageNames: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
  pt: 'Portuguese', it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
};

const iconMap: Record<string, React.ReactNode> = {
  castle: <Castle className="h-4 w-4" />,
  building: <Building className="h-4 w-4" />,
  home: <Home className="h-4 w-4" />,
  map: <div className="h-4 w-4 bg-muted rounded" />,
};

const emptyForm = { names: { en: '', es: '' } as Record<string, string>, slug: '', icon: '' };

export default function PropertyTypesPage() {
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState<PropertyType[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isAddLangOpen, setIsAddLangOpen] = useState(false);
  const [newLang, setNewLang] = useState('');
  const [languages, setLanguages] = useState<string[]>(['en', 'es']);
  const [editingType, setEditingType] = useState<PropertyType | null>(null);
  const [deletingType, setDeletingType] = useState<PropertyType | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const api = useApi();
  const { toast } = useToast();

  const fetchTypes = async () => {
    try {
      const res = await api.get('/api/dashboard/property-types');
      const data: PropertyType[] = res?.data || [];
      setTypes(data);
      const allLangs = new Set(languages);
      data.forEach((t) => Object.keys(t.name).forEach((k) => allLangs.add(k)));
      setLanguages(Array.from(allLangs));
    } catch {
      toast({ title: 'Failed to load property types', variant: 'destructive' });
    }
  };

  useEffect(() => { fetchTypes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        ...(form.icon ? { icon: form.icon } : {}),
      });
      toast({ title: 'Property type created' });
      setIsAddOpen(false);
      setForm(emptyForm);
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
        ...(form.icon ? { icon: form.icon } : {}),
      });
      toast({ title: 'Property type updated' });
      setIsEditOpen(false);
      setEditingType(null);
      setForm(emptyForm);
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
    setForm({ names, slug: type.slug, icon: type.icon || '' });
    setIsEditOpen(true);
  };

  const openDelete = (type: PropertyType) => {
    setDeletingType(type);
    setIsDeleteOpen(true);
  };

  const handleAddLanguage = () => {
    const code = newLang.toLowerCase().trim();
    if (!code || languages.includes(code)) {
      toast({ title: 'Language already exists or is empty', variant: 'destructive' });
      return;
    }
    setLanguages([...languages, code]);
    setIsAddLangOpen(false);
    setNewLang('');
    toast({ title: `Added ${defaultLanguageNames[code] || code} column` });
  };

  const filteredTypes = types.filter((type) =>
    Object.values(type.name).some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  );

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
    // Optimistic update
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Property Types</h1>
          <p className="text-muted-foreground">
            Manage property type classifications
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsAddLangOpen(true)}>
            <Languages className="h-4 w-4 mr-2" />
            Add Language
          </Button>
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setForm(emptyForm); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Type
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Property Type</DialogTitle>
              <DialogDescription>Create a new property type classification</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {languages.map((lang) => (
                <div key={lang} className="space-y-2">
                  <Label>Name ({defaultLanguageNames[lang] || lang.toUpperCase()})</Label>
                  <Input placeholder={lang === 'en' ? 'Villa' : ''} value={form.names[lang] || ''} onChange={(e) => setForm({ ...form, names: { ...form.names, [lang]: e.target.value } })} />
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="add-slug">Slug</Label>
                <Input id="add-slug" placeholder="villa" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-icon">Icon</Label>
                <Input id="add-icon" placeholder="home" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
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
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search property types..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

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
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Properties</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTypes.map((type, i) => (
                  <TableRow
                    key={type.id}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    className={dragOverIndex === i ? 'border-t-2 border-primary' : ''}
                  >
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                          {iconMap[type.icon || ''] || <Home className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="font-medium">{type.name.en}</p>
                          {languages.filter((l) => l !== 'en' && type.name[l]).map((l) => (
                            <p key={l} className="text-xs text-muted-foreground">
                              <span className="uppercase font-medium">{l}</span>: {type.name[l]}
                            </p>
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">{type.slug}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{type.propertyCount ?? 0}</Badge>
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
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => openDelete(type)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingType(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Property Type</DialogTitle>
            <DialogDescription>Update the property type details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {languages.map((lang) => (
              <div key={lang} className="space-y-2">
                <Label>Name ({defaultLanguageNames[lang] || lang.toUpperCase()})</Label>
                <Input value={form.names[lang] || ''} onChange={(e) => setForm({ ...form, names: { ...form.names, [lang]: e.target.value } })} />
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input id="edit-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-icon">Icon</Label>
              <Input id="edit-icon" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </div>
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

      {/* Add Language Dialog */}
      <Dialog open={isAddLangOpen} onOpenChange={setIsAddLangOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Language</DialogTitle>
            <DialogDescription>Add a new language for translations</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Language Code</Label>
              <Input placeholder="de, fr, nl, pt, it..." value={newLang} onChange={(e) => setNewLang(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Available: {Object.entries(defaultLanguageNames)
                  .filter(([code]) => !languages.includes(code))
                  .map(([code, name]) => `${name} (${code})`)
                  .join(', ')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddLangOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLanguage} disabled={!newLang.trim()}>Add Language</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
