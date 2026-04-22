'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Waves,
  Sun,
  Car,
  Shield,
  Trees,
  Thermometer,
  Eye,
  Home,
  Loader2,
  GripVertical,
  Languages,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

interface Feature {
  id: number;
  name: Record<string, string>;
  category: string;
  icon?: string;
  propertyCount?: number;
  sortOrder?: number;
  isActive?: boolean;
}

const defaultLanguageNames: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
  pt: 'Portuguese', it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
};

const categories = [
  { id: 'all', name: 'All Features' },
  { id: 'interior', name: 'Interior' },
  { id: 'exterior', name: 'Exterior' },
  { id: 'community', name: 'Community' },
  { id: 'climate', name: 'Climate' },
  { id: 'views', name: 'Views' },
  { id: 'security', name: 'Security' },
  { id: 'parking', name: 'Parking' },
  { id: 'other', name: 'Other' },
];

const categoryValues = categories.filter((c) => c.id !== 'all');

const iconMap: Record<string, React.ReactNode> = {
  waves: <Waves className="h-4 w-4" />,
  eye: <Eye className="h-4 w-4" />,
  trees: <Trees className="h-4 w-4" />,
  thermometer: <Thermometer className="h-4 w-4" />,
  car: <Car className="h-4 w-4" />,
  shield: <Shield className="h-4 w-4" />,
  sun: <Sun className="h-4 w-4" />,
  home: <Home className="h-4 w-4" />,
};

const emptyForm = { names: { en: '', es: '' } as Record<string, string>, category: 'interior', icon: '' };

export default function FeaturesPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [features, setFeatures] = useState<Feature[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isAddLangOpen, setIsAddLangOpen] = useState(false);
  const [newLang, setNewLang] = useState('');
  const [languages, setLanguages] = useState<string[]>(['en', 'es']);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [deletingFeature, setDeletingFeature] = useState<Feature | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const api = useApi();
  const { toast } = useToast();

  const fetchFeatures = async () => {
    try {
      const res = await api.get('/api/dashboard/features');
      const data: Feature[] = res?.data || [];
      setFeatures(data);
      const allLangs = new Set(languages);
      data.forEach((f) => Object.keys(f.name).forEach((k) => allLangs.add(k)));
      setLanguages(Array.from(allLangs));
    } catch {
      toast({ title: 'Failed to load features', variant: 'destructive' });
    }
  };

  useEffect(() => { fetchFeatures(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const buildName = () => {
    const name: Record<string, string> = {};
    for (const [lang, val] of Object.entries(form.names)) {
      if (val.trim()) name[lang] = val.trim();
    }
    return name;
  };

  const handleCreate = async () => {
    try {
      await api.post('/api/dashboard/features', {
        name: buildName(),
        category: form.category,
        ...(form.icon ? { icon: form.icon } : {}),
      });
      toast({ title: 'Feature created' });
      setIsAddOpen(false);
      setForm(emptyForm);
      fetchFeatures();
    } catch (e: any) {
      toast({ title: 'Failed to create', description: e.message, variant: 'destructive' });
    }
  };

  const handleUpdate = async () => {
    if (!editingFeature) return;
    try {
      await api.put(`/api/dashboard/features/${editingFeature.id}`, {
        name: buildName(),
        category: form.category,
        ...(form.icon ? { icon: form.icon } : {}),
      });
      toast({ title: 'Feature updated' });
      setIsEditOpen(false);
      setEditingFeature(null);
      setForm(emptyForm);
      fetchFeatures();
    } catch (e: any) {
      toast({ title: 'Failed to update', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingFeature) return;
    try {
      await api.delete(`/api/dashboard/features/${deletingFeature.id}`);
      toast({ title: 'Feature deleted' });
      setIsDeleteOpen(false);
      setDeletingFeature(null);
      fetchFeatures();
    } catch (e: any) {
      toast({ title: 'Failed to delete', description: e.message, variant: 'destructive' });
    }
  };

  const openEdit = (feature: Feature) => {
    setEditingFeature(feature);
    const names: Record<string, string> = {};
    languages.forEach((lang) => { names[lang] = feature.name[lang] || ''; });
    setForm({ names, category: feature.category, icon: feature.icon || '' });
    setIsEditOpen(true);
  };

  const openDelete = (feature: Feature) => {
    setDeletingFeature(feature);
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

  const filteredFeatures = features.filter((feature) => {
    const matchesSearch =
      Object.values(feature.name).some((v) => v?.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory =
      activeCategory === 'all' || feature.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleDrop = async (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const reordered = [...filteredFeatures];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const items = reordered.map((f, i) => ({ id: f.id, sortOrder: i }));
    setDragIndex(null);
    setDragOverIndex(null);
    setFeatures((prev) => {
      const updated = [...prev];
      items.forEach(({ id, sortOrder }) => {
        const found = updated.find((f) => f.id === id);
        if (found) found.sortOrder = sortOrder;
      });
      return updated.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    });
    try {
      await api.put('/api/dashboard/features/reorder', { items });
      toast({ title: 'Order updated' });
    } catch {
      toast({ title: 'Failed to reorder', variant: 'destructive' });
      fetchFeatures();
    }
  };

  const formFields = (
    <div className="space-y-4 py-4">
      {languages.map((lang) => (
        <div key={lang} className="space-y-2">
          <Label>Name ({defaultLanguageNames[lang] || lang.toUpperCase()})</Label>
          <Input placeholder={lang === 'en' ? 'Swimming Pool' : ''} value={form.names[lang] || ''} onChange={(e) => setForm({ ...form, names: { ...form.names, [lang]: e.target.value } })} />
        </div>
      ))}
      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {categoryValues.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Icon</Label>
        <Input placeholder="waves, sun, car, shield, trees, thermometer, eye, home" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Features</h1>
          <p className="text-muted-foreground">Manage property features and amenities</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsAddLangOpen(true)}>
            <Languages className="h-4 w-4 mr-2" />
            Add Language
          </Button>
          <Button onClick={() => { setForm(emptyForm); setIsAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Feature
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{features.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Categories Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{new Set(features.map((f) => f.category)).size}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{features.filter((f) => f.isActive !== false).length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search features..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="flex-wrap h-auto gap-2 bg-transparent p-0">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat.id}
              value={cat.id}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {cat.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {categories.find((c) => c.id === activeCategory)?.name} ({filteredFeatures.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {api.isLoading && features.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : features.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No features yet. Click &quot;Add Feature&quot; to create one.</p>
              ) : filteredFeatures.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No features match the current filter.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredFeatures.map((feature, i) => (
                    <div
                      key={feature.id}
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                      onDragLeave={() => setDragOverIndex(null)}
                      onDrop={() => handleDrop(i)}
                      onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                      className={`flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors ${dragOverIndex === i ? 'ring-2 ring-primary' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                          {iconMap[feature.icon || ''] || <Home className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="font-medium">{feature.name.en}</p>
                          {languages.filter((l) => l !== 'en' && feature.name[l]).map((l) => (
                            <p key={l} className="text-xs text-muted-foreground">
                              <span className="uppercase font-medium">{l}</span>: {feature.name[l]}
                            </p>
                          ))}
                          <p className="text-xs text-muted-foreground capitalize">{feature.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{feature.propertyCount ?? 0}</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(feature)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => openDelete(feature)}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setForm(emptyForm); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Feature</DialogTitle>
            <DialogDescription>Create a new property feature</DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.names.en || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingFeature(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Feature</DialogTitle>
            <DialogDescription>Update the feature details</DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!form.names.en || api.isLoading}>
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
            <AlertDialogTitle>Delete Feature</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingFeature?.name.en}&quot;? This action cannot be undone.
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
