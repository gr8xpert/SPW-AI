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
  Sparkles,
  Check,
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

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
  it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
  da: 'Danish', pl: 'Polish', cs: 'Czech', fi: 'Finnish',
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

export default function FeaturesPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [features, setFeatures] = useState<Feature[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBulkTranslateOpen, setIsBulkTranslateOpen] = useState(false);
  const [languages, setLanguages] = useState<string[]>(['en']);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [deletingFeature, setDeletingFeature] = useState<Feature | null>(null);
  const [form, setForm] = useState({ names: {} as Record<string, string>, category: 'interior', icon: '' });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatingId, setTranslatingId] = useState<number | null>(null);
  const [isBulkTranslating, setIsBulkTranslating] = useState(false);

  const api = useApi();
  const { toast } = useToast();

  useEffect(() => {
    if (!api.isReady) return;
    api.get('/api/dashboard/tenant')
      .then((res: any) => {
        const langs = res?.data?.settings?.languages;
        if (langs?.length) setLanguages(langs);
      })
      .catch(() => {});
    fetchFeatures();
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFeatures = async () => {
    try {
      const res = await api.get('/api/dashboard/features');
      setFeatures(res?.data || []);
    } catch {
      toast({ title: 'Failed to load features', variant: 'destructive' });
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
      await api.post('/api/dashboard/features', {
        name: buildName(),
        category: form.category,
        ...(form.icon ? { icon: form.icon } : {}),
      });
      toast({ title: 'Feature created' });
      setIsAddOpen(false);
      setForm({ names: {}, category: 'interior', icon: '' });
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
      setForm({ names: {}, category: 'interior', icon: '' });
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

  const handleAiTranslate = async () => {
    if (!editingFeature) return;
    setIsTranslating(true);
    try {
      await api.put(`/api/dashboard/features/${editingFeature.id}`, {
        name: buildName(),
        category: form.category,
        ...(form.icon ? { icon: form.icon } : {}),
      });
      const missingLangs = languages.filter(l => l !== 'en' && !form.names[l]?.trim());
      if (missingLangs.length === 0) {
        toast({ title: 'All translations are already complete' });
        setIsTranslating(false);
        return;
      }
      const res = await api.post(`/api/dashboard/translate/feature/${editingFeature.id}`, {
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
      fetchFeatures();
    } catch (e: any) {
      toast({ title: 'Translation failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleQuickTranslate = async (feature: Feature) => {
    setTranslatingId(feature.id);
    try {
      const missingLangs = languages.filter(l => l !== 'en' && !feature.name[l]?.trim());
      if (missingLangs.length === 0) {
        toast({ title: 'All translations are already complete' });
        setTranslatingId(null);
        return;
      }
      await api.post(`/api/dashboard/translate/feature/${feature.id}`, {
        targetLanguages: missingLangs,
        sourceLanguage: 'en',
      });
      toast({ title: `Translated "${feature.name.en}"` });
      fetchFeatures();
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
      const res = await api.post('/api/dashboard/translate/features/bulk', {
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
                fetchFeatures();
                return;
              }
              if (st?.status === 'failed') {
                toast({ title: 'Bulk translation had errors', variant: 'destructive' });
                fetchFeatures();
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

  const translationCount = (names: Record<string, string>) => {
    const filled = languages.filter(l => names[l]?.trim()).length;
    return { filled, total: languages.length };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Features</h1>
          <p className="page-description mt-1">Manage property features and amenities</p>
        </div>
        <div className="flex gap-2">
          {languages.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setIsBulkTranslateOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" />
              AI Translate All
            </Button>
          )}
          <Button className="shadow-sm" onClick={() => { setForm({ names: {}, category: 'interior', icon: '' }); setIsAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Feature
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Features</CardTitle>
            <div className="stat-card-icon">
              <Home className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{features.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Categories Used</CardTitle>
            <div className="stat-card-icon">
              <Sun className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{new Set(features.map((f) => f.category)).size}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <div className="stat-card-icon">
              <Check className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{features.filter((f) => f.isActive !== false).length}</div></CardContent>
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
            <TabsTrigger key={cat.id} value={cat.id} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              {cat.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{categories.find((c) => c.id === activeCategory)?.name} ({filteredFeatures.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {api.isLoading && features.length === 0 ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : features.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No features yet. Click &quot;Add Feature&quot; to create one.</p>
              ) : filteredFeatures.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No features match the current filter.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredFeatures.map((feature, i) => {
                    const { filled, total } = translationCount(feature.name);
                    return (
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
                        <div className="flex items-center gap-3 min-w-0">
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                            {iconMap[feature.icon || ''] || <Home className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{feature.name.en || Object.values(feature.name)[0]}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground capitalize">{feature.category}</span>
                              {languages.length > 1 && (
                                translatingId === feature.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Badge variant={filled === total ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                                    {filled}/{total}
                                  </Badge>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline">{feature.propertyCount ?? 0}</Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(feature)}>
                                <Edit className="h-4 w-4 mr-2" />Edit
                              </DropdownMenuItem>
                              {languages.length > 1 && (
                                <DropdownMenuItem onClick={() => handleQuickTranslate(feature)}>
                                  <Sparkles className="h-4 w-4 mr-2" />AI Translate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => { setDeletingFeature(feature); setIsDeleteOpen(true); }}>
                                <Trash2 className="h-4 w-4 mr-2" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setForm({ names: {}, category: 'interior', icon: '' }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Feature</DialogTitle>
            <DialogDescription>Create a new property feature</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name (English)</Label>
              <Input placeholder="Swimming Pool" value={form.names.en || ''} onChange={(e) => setForm({ ...form, names: { ...form.names, en: e.target.value } })} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryValues.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <Input placeholder="waves, sun, car, shield, trees, thermometer, eye, home" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </div>
          </div>
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
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingFeature(null); setForm({ names: {}, category: 'interior', icon: '' }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Feature</DialogTitle>
            <DialogDescription>Update details and translations</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name (English)</Label>
              <Input value={form.names.en || ''} onChange={(e) => setForm({ ...form, names: { ...form.names, en: e.target.value } })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categoryValues.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Icon</Label>
                <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
              </div>
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
            <Button onClick={handleUpdate} disabled={!form.names.en || api.isLoading}>
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
            <AlertDialogTitle>AI Translate All Features</AlertDialogTitle>
            <AlertDialogDescription>
              This will translate all {features.length} features to {languages.filter(l => l !== 'en').length} languages using AI.
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
