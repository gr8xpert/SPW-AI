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
  EyeOff,
  Home,
  Loader2,
  GripVertical,
  Sparkles,
  Check,
  Lock,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useAiTranslationGuard } from '@/hooks/use-ai-translation-guard';
import { useBulkJob } from '@/hooks/use-bulk-job';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useFeaturesText, nameOf } from './_i18n';

interface Feature {
  id: number;
  name: Record<string, string>;
  category: string;
  icon?: string;
  propertyCount?: number;
  sortOrder?: number;
  isActive?: boolean;
}

// Category names come from t.categories by id.
const categories = [
  { id: 'all' },
  { id: 'interior' },
  { id: 'exterior' },
  { id: 'community' },
  { id: 'climate' },
  { id: 'views' },
  { id: 'security' },
  { id: 'parking' },
  { id: 'other' },
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
  const aiTranslation = useAiTranslationGuard();
  const [hideEmpty, setHideEmpty] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isAiOrganizing, setIsAiOrganizing] = useState(false);
  const t = useFeaturesText();

  const api = useApi();
  // Server-tracked, so progress survives a refresh or leaving the page and a
  // second click can't queue a duplicate (paid) run.
  const bulkTranslate = useBulkJob({
    activeUrl: '/api/dashboard/translate/jobs/active?entityType=feature',
    statusUrl: (jobId) => `/api/dashboard/translate/job/${jobId}`,
    onFinished: (st) => {
      toast(
        st.status === 'completed' && st.failed === 0
          ? { title: t.toast.bulkComplete, description: t.toast.bulkCompleteText(st.completed) }
          : { title: t.toast.bulkErrors, description: t.toast.bulkErrorsText(st.failed, st.total), variant: 'destructive' },
      );
      fetchFeatures();
    },
  });
  const { toast } = useToast();

  const runAiOrganize = async () => {
    setIsAiOrganizing(true);
    try {
      const res: any = await api.post('/api/dashboard/ai-enrichment/run', { scope: 'features' });
      const r = res?.data?.features ?? res?.features;
      if (r) {
        toast({
          title: t.toast.organizeComplete,
          description: t.toast.organizeResult(r.recategorised, r.skipped),
        });
      } else {
        toast({ title: t.toast.organizeFinished, description: t.toast.noChanges });
      }
      fetchFeatures();
    } catch (e: any) {
      toast({ title: t.toast.organizeFailed, description: e?.message, variant: 'destructive' });
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
    fetchFeatures();
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFeatures = async (retriesLeft = 1) => {
    try {
      const res = await api.get('/api/dashboard/features?includeInactive=1');
      setFeatures(res?.data || []);
    } catch {
      if (retriesLeft > 0) {
        setTimeout(() => fetchFeatures(retriesLeft - 1), 800);
        return;
      }
      toast({ title: t.toast.loadFailed, variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await api.put('/api/dashboard/features/bulk-delete', { ids });
      toast({ title: t.toast.bulkDeleted(ids.length) });
      setIsBulkDeleteOpen(false);
      setSelectedIds(new Set());
      fetchFeatures();
    } catch (e: any) {
      toast({ title: t.toast.bulkDeleteFailed, description: e.message, variant: 'destructive' });
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
      toast({ title: t.toast.created });
      setIsAddOpen(false);
      setForm({ names: {}, category: 'interior', icon: '' });
      fetchFeatures();
    } catch (e: any) {
      toast({ title: t.toast.createFailed, description: e.message, variant: 'destructive' });
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
      toast({ title: t.toast.updated });
      setIsEditOpen(false);
      setEditingFeature(null);
      setForm({ names: {}, category: 'interior', icon: '' });
      fetchFeatures();
    } catch (e: any) {
      toast({ title: t.toast.updateFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingFeature) return;
    try {
      await api.delete(`/api/dashboard/features/${deletingFeature.id}`);
      toast({ title: t.toast.deleted });
      setIsDeleteOpen(false);
      setDeletingFeature(null);
      fetchFeatures();
    } catch (e: any) {
      toast({ title: t.toast.deleteFailed, description: e.message, variant: 'destructive' });
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
    if (!aiTranslation.check()) return;
    setIsTranslating(true);
    try {
      await api.put(`/api/dashboard/features/${editingFeature.id}`, {
        name: buildName(),
        category: form.category,
        ...(form.icon ? { icon: form.icon } : {}),
      });
      const missingLangs = languages.filter(l => l !== 'en' && !form.names[l]?.trim());
      if (missingLangs.length === 0) {
        toast({ title: t.toast.allComplete });
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
      toast({ title: t.toast.translatedTo(missingLangs.length) });
      fetchFeatures();
    } catch (e: any) {
      toast({ title: t.toast.translationFailed, description: e.message, variant: 'destructive' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleQuickTranslate = async (feature: Feature) => {
    if (!aiTranslation.check()) return;
    setTranslatingId(feature.id);
    try {
      const missingLangs = languages.filter(l => l !== 'en' && !feature.name[l]?.trim());
      if (missingLangs.length === 0) {
        toast({ title: t.toast.allComplete });
        setTranslatingId(null);
        return;
      }
      await api.post(`/api/dashboard/translate/feature/${feature.id}`, {
        targetLanguages: missingLangs,
        sourceLanguage: 'en',
      });
      toast({ title: t.toast.translatedName(feature.name.en) });
      fetchFeatures();
    } catch (e: any) {
      toast({ title: t.toast.translationFailed, description: e.message, variant: 'destructive' });
    } finally {
      setTranslatingId(null);
    }
  };

  const handleBulkTranslate = async () => {
    if (!aiTranslation.check()) return;
    setIsBulkTranslating(true);
    try {
      const targetLangs = languages.filter(l => l !== 'en');
      if (targetLangs.length === 0) {
        toast({ title: t.toast.noTargetLanguages });
        return;
      }
      const res = await api.post('/api/dashboard/translate/features/bulk', {
        targetLanguages: targetLangs,
        sourceLanguage: 'en',
      });
      const jobId = res?.data?.jobId;
      setIsBulkTranslateOpen(false);
      if (jobId) bulkTranslate.track(jobId);
      toast(
        res?.data?.alreadyRunning
          ? { title: t.toast.bulkAlready, description: t.toast.bulkAlreadyText }
          : { title: t.toast.bulkStarted, description: t.toast.bulkStartedText },
      );
    } catch (e: any) {
      toast({ title: t.toast.bulkFailed, description: e.message, variant: 'destructive' });
    } finally {
      setIsBulkTranslating(false);
    }
  };

  const filteredFeatures = features.filter((feature) => {
    const matchesSearch =
      Object.values(feature.name).some((v) => v?.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory =
      activeCategory === 'all' || feature.category === activeCategory;
    const matchesEmpty = !hideEmpty || (feature.propertyCount ?? 0) > 0;
    return matchesSearch && matchesCategory && matchesEmpty;
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
      toast({ title: t.toast.orderUpdated });
    } catch {
      toast({ title: t.toast.reorderFailed, variant: 'destructive' });
      fetchFeatures();
    }
  };

  const translationCount = (names: Record<string, string>) => {
    const filled = languages.filter(l => names[l]?.trim()).length;
    return { filled, total: languages.length };
  };

  const handleToggleVisibility = async (feature: Feature) => {
    const newActive = !(feature.isActive ?? true);
    try {
      await api.put(`/api/dashboard/features/${feature.id}`, { isActive: newActive });
      toast({ title: newActive ? t.toast.shown : t.toast.hidden });
      fetchFeatures();
    } catch {
      toast({ title: t.toast.visibilityFailed, variant: 'destructive' });
    }
  };

  // The switch at the top: every feature shown on the website, or none.
  const shownCount = features.filter((f) => f.isActive !== false).length;
  const allShown = features.length > 0 && shownCount === features.length;
  const [savingAll, setSavingAll] = useState(false);
  const handleToggleAll = async (isActive: boolean) => {
    setSavingAll(true);
    try {
      await api.put('/api/dashboard/features/bulk-visibility', { isActive });
      toast({
        title: isActive ? t.toast.allShown : t.toast.allHidden,
        description: isActive ? undefined : t.toast.allHiddenText,
      });
      fetchFeatures();
    } catch {
      toast({ title: t.toast.visibilityFailed, variant: 'destructive' });
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">{t.description}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runAiOrganize} disabled={isAiOrganizing}>
            {isAiOrganizing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {t.aiOrganize}
          </Button>
          {languages.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => { if (aiTranslation.check()) setIsBulkTranslateOpen(true); }} disabled={bulkTranslate.running} title={aiTranslation.locked ? t.lockedLong : undefined}>
              {bulkTranslate.running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : aiTranslation.locked ? <Lock className="h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {bulkTranslate.running ? t.translating(bulkTranslate.progress) : t.aiTranslateAll}
            </Button>
          )}
          <Button className="shadow-sm" onClick={() => { setForm({ names: {}, category: 'interior', icon: '' }); setIsAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {t.addFeature}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.totalFeatures}</CardTitle>
            <div className="stat-card-icon">
              <Home className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{features.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.categoriesUsed}</CardTitle>
            <div className="stat-card-icon">
              <Sun className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{new Set(features.map((f) => f.category)).size}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.active}</CardTitle>
            <div className="stat-card-icon">
              <Check className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{features.filter((f) => f.isActive !== false).length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t.searchPlaceholder} className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={allShown} onCheckedChange={handleToggleAll} disabled={savingAll || features.length === 0} />
              {t.showAll}
              <span className="text-muted-foreground">{t.shownCount(shownCount, features.length)}</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={hideEmpty} onCheckedChange={setHideEmpty} />
              {t.hideEmpty}
            </label>
          </div>
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-3 flex items-center justify-between gap-4">
            <div className="text-sm"><strong>{selectedIds.size}</strong> {t.selected(selectedIds.size)}</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>{t.clear}</Button>
              <Button size="sm" variant="destructive" onClick={() => setIsBulkDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1" /> {t.delete}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="flex-wrap h-auto gap-2 bg-transparent p-0">
          {categories.map((cat) => (
            <TabsTrigger key={cat.id} value={cat.id} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              {nameOf(t.categories, cat.id)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.categoryCount(nameOf(t.categories, activeCategory), filteredFeatures.length)}</CardTitle>
            </CardHeader>
            <CardContent>
              {api.isLoading && features.length === 0 ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : features.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">{t.empty}</p>
              ) : filteredFeatures.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">{t.noMatch}</p>
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
                        className={`flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors ${dragOverIndex === i ? 'ring-2 ring-primary' : ''} ${selectedIds.has(feature.id) ? 'bg-primary/5 border-primary/40' : ''} ${feature.isActive === false ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox
                            checked={selectedIds.has(feature.id)}
                            onCheckedChange={() => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(feature.id)) next.delete(feature.id);
                                else next.add(feature.id);
                                return next;
                              });
                            }}
                          />
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                            {iconMap[feature.icon || ''] || <Home className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{feature.name.en || Object.values(feature.name)[0]}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground capitalize">{nameOf(t.categories, feature.category)}</span>
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
                          <div
                            className="flex items-center gap-1.5"
                            title={feature.isActive !== false ? t.visibleOnWebsite : t.hiddenFromWebsite}
                          >
                            {feature.isActive !== false ? (
                              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <Switch
                              checked={feature.isActive !== false}
                              onCheckedChange={() => handleToggleVisibility(feature)}
                              className="scale-75"
                            />
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(feature)}>
                                <Edit className="h-4 w-4 mr-2" />{t.edit}
                              </DropdownMenuItem>
                              {languages.length > 1 && (
                                <DropdownMenuItem onClick={() => handleQuickTranslate(feature)}>
                                  {aiTranslation.locked ? <Lock className="h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                  {t.aiTranslate}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => { setDeletingFeature(feature); setIsDeleteOpen(true); }}>
                                <Trash2 className="h-4 w-4 mr-2" />{t.delete}
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
            <DialogTitle>{t.addTitle}</DialogTitle>
            <DialogDescription>{t.addDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.nameEnglish}</Label>
              <Input placeholder="Swimming Pool" value={form.names.en || ''} onChange={(e) => setForm({ ...form, names: { ...form.names, en: e.target.value } })} />
            </div>
            <div className="space-y-2">
              <Label>{t.category}</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryValues.map((c) => (<SelectItem key={c.id} value={c.id}>{nameOf(t.categories, c.id)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.icon}</Label>
              <Input placeholder="waves, sun, car, shield, trees, thermometer, eye, home" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>{t.cancel}</Button>
            <Button onClick={handleCreate} disabled={!form.names.en || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingFeature(null); setForm({ names: {}, category: 'interior', icon: '' }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.editTitle}</DialogTitle>
            <DialogDescription>{t.editDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.nameEnglish}</Label>
              <Input value={form.names.en || ''} onChange={(e) => setForm({ ...form, names: { ...form.names, en: e.target.value } })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.category}</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categoryValues.map((c) => (<SelectItem key={c.id} value={c.id}>{nameOf(t.categories, c.id)}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.icon}</Label>
                <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
              </div>
            </div>
            {languages.filter(l => l !== 'en').length > 0 && (
              <div className="border rounded-md">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
                  <span className="text-sm font-medium">
                    {t.translationsCount(languages.filter(l => l !== 'en' && form.names[l]?.trim()).length, languages.filter(l => l !== 'en').length)}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleAiTranslate} disabled={isTranslating || !form.names.en?.trim()} title={aiTranslation.locked ? t.lockedShort : undefined}>
                    {isTranslating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : aiTranslation.locked ? <Lock className="h-3 w-3 mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    {t.aiTranslate}
                  </Button>
                </div>
                <div className="max-h-[280px] overflow-y-auto p-3 space-y-2">
                  {languages.filter(l => l !== 'en').map(lang => (
                    <div key={lang} className="flex items-center gap-2">
                      <span className="text-xs font-medium uppercase w-8 text-muted-foreground shrink-0">{lang}</span>
                      <Input
                        className="h-8 text-sm"
                        placeholder={nameOf(t.langNames, lang)}
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
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>{t.cancel}</Button>
            <Button onClick={handleUpdate} disabled={!form.names.en || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Translate Confirmation */}
      <AlertDialog open={isBulkTranslateOpen} onOpenChange={setIsBulkTranslateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.bulkTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.bulkText(features.length, languages.filter(l => l !== 'en').length)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkTranslate} disabled={isBulkTranslating || bulkTranslate.running}>
              {isBulkTranslating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {t.startTranslation}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.bulkDeleteTitle(selectedIds.size)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.bulkDeleteText}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.deleteN(selectedIds.size)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteText(deletingFeature?.name.en ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
