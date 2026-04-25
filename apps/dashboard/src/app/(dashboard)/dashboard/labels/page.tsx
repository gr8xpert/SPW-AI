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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
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
import { Label as UILabel } from '@/components/ui/label';
import {
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Loader2,
  Edit,
  Sparkles,
  Check,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

interface Label {
  id: number;
  key: string;
  translations: Record<string, string>;
  isCustom: boolean;
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
  it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
  da: 'Danish', pl: 'Polish', cs: 'Czech', fi: 'Finnish',
};

const labelCategories = [
  { id: 'search', name: 'Search Form' },
  { id: 'results', name: 'Search Results' },
  { id: 'listing', name: 'Listing Page' },
  { id: 'detail', name: 'Property Detail' },
  { id: 'wishlist', name: 'Wishlist' },
  { id: 'unit', name: 'Units' },
];

export default function LabelsPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('search');
  const [labels, setLabels] = useState<Label[]>([]);
  const [languages, setLanguages] = useState<string[]>(['en']);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBulkTranslateOpen, setIsBulkTranslateOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [deletingLabel, setDeletingLabel] = useState<Label | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [newLabelForm, setNewLabelForm] = useState({ key: '', en: '', es: '' });
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
    fetchLabels();
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchLabels = async () => {
    try {
      const res = await api.get('/api/dashboard/labels');
      setLabels(res?.data || []);
    } catch {
      toast({ title: 'Failed to load labels', variant: 'destructive' });
    }
  };

  const openEdit = (label: Label) => {
    setEditingLabel(label);
    const vals: Record<string, string> = {};
    languages.forEach((lang) => { vals[lang] = label.translations[lang] || ''; });
    setEditValues(vals);
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingLabel) return;
    try {
      const translations: Record<string, string> = {};
      for (const [lang, val] of Object.entries(editValues)) {
        if (val.trim()) translations[lang] = val.trim();
      }
      await api.put(`/api/dashboard/labels/${editingLabel.id}`, { translations });
      toast({ title: 'Label updated' });
      setIsEditOpen(false);
      setEditingLabel(null);
      setEditValues({});
      fetchLabels();
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    try {
      const translations: Record<string, string> = {};
      if (newLabelForm.en) translations.en = newLabelForm.en;
      if (newLabelForm.es) translations.es = newLabelForm.es;
      await api.post('/api/dashboard/labels', {
        key: newLabelForm.key,
        translations,
        isCustom: true,
      });
      toast({ title: 'Label created' });
      setIsAddOpen(false);
      setNewLabelForm({ key: '', en: '', es: '' });
      fetchLabels();
    } catch (e: any) {
      toast({ title: 'Failed to create', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingLabel) return;
    try {
      await api.delete(`/api/dashboard/labels/${deletingLabel.id}`);
      toast({ title: 'Label deleted' });
      setIsDeleteOpen(false);
      setDeletingLabel(null);
      fetchLabels();
    } catch (e: any) {
      toast({ title: 'Failed to delete', description: e.message, variant: 'destructive' });
    }
  };

  const handleInitialize = async () => {
    try {
      await api.post('/api/dashboard/labels/initialize');
      toast({ title: 'Default labels initialized' });
      fetchLabels();
    } catch (e: any) {
      toast({ title: 'Failed to initialize', description: e.message, variant: 'destructive' });
    }
  };

  const handleAiTranslate = async () => {
    if (!editingLabel) return;
    setIsTranslating(true);
    try {
      const translations: Record<string, string> = {};
      for (const [lang, val] of Object.entries(editValues)) {
        if (val.trim()) translations[lang] = val.trim();
      }
      await api.put(`/api/dashboard/labels/${editingLabel.id}`, { translations });

      const missingLangs = languages.filter(l => l !== 'en' && !editValues[l]?.trim());
      if (missingLangs.length === 0) {
        toast({ title: 'All translations are already complete' });
        setIsTranslating(false);
        return;
      }
      const res = await api.post(`/api/dashboard/translate/label/${editingLabel.id}`, {
        targetLanguages: missingLangs,
        sourceLanguage: 'en',
      });
      const updated = res?.data;
      if (updated?.translations) {
        const newVals = { ...editValues };
        for (const [lang, val] of Object.entries(updated.translations as Record<string, string>)) {
          newVals[lang] = val;
        }
        setEditValues(newVals);
      }
      toast({ title: `Translated to ${missingLangs.length} languages` });
      fetchLabels();
    } catch (e: any) {
      toast({ title: 'Translation failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleQuickTranslate = async (label: Label) => {
    setTranslatingId(label.id);
    try {
      const missingLangs = languages.filter(l => l !== 'en' && !label.translations[l]?.trim());
      if (missingLangs.length === 0) {
        toast({ title: 'All translations are already complete' });
        setTranslatingId(null);
        return;
      }
      await api.post(`/api/dashboard/translate/label/${label.id}`, {
        targetLanguages: missingLangs,
        sourceLanguage: 'en',
      });
      toast({ title: `Translated "${label.key}"` });
      fetchLabels();
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
      const res = await api.post('/api/dashboard/translate/labels/bulk', {
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
                toast({ title: 'Bulk translation complete', description: `${st.completed} labels translated` });
                fetchLabels();
                return;
              }
              if (st?.status === 'failed') {
                toast({ title: 'Bulk translation had errors', variant: 'destructive' });
                fetchLabels();
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

  const filteredLabels = labels.filter((label) => {
    const matchesSearch =
      label.key.toLowerCase().includes(search.toLowerCase()) ||
      Object.values(label.translations).some((t) =>
        t?.toLowerCase().includes(search.toLowerCase())
      );
    const matchesCategory = label.key.startsWith(activeCategory);
    return matchesSearch && matchesCategory;
  });

  const missingCount = labels.reduce((acc, l) => {
    return acc + languages.filter((lang) => !l.translations[lang]).length;
  }, 0);

  const translationCount = (translations: Record<string, string>) => {
    const filled = languages.filter(l => translations[l]?.trim()).length;
    return { filled, total: languages.length };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Labels</h1>
          <p className="page-description mt-1">Manage UI text translations for your widget</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleInitialize}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Initialize Defaults
          </Button>
          {languages.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setIsBulkTranslateOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" />
              AI Translate All
            </Button>
          )}
          <Button className="shadow-sm" onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Label
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Labels</CardTitle>
            <div className="stat-card-icon bg-blue-50">
              <Edit className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{labels.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Languages</CardTitle>
            <div className="stat-card-icon bg-green-50">
              <Sparkles className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{languages.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Custom Labels</CardTitle>
            <div className="stat-card-icon bg-purple-50">
              <Plus className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{labels.filter((l) => l.isCustom).length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Missing Translations</CardTitle>
            <div className="stat-card-icon bg-amber-50">
              <Search className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight text-amber-600">{missingCount}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search labels by key or translation..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList>
          {labelCategories.map((cat) => (
            <TabsTrigger key={cat.id} value={cat.id}>{cat.name}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{labelCategories.find((c) => c.id === activeCategory)?.name} Labels</CardTitle>
              <CardDescription>Click the edit button to manage translations</CardDescription>
            </CardHeader>
            <CardContent>
              {api.isLoading && labels.length === 0 ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : labels.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No labels yet. Initialize defaults or add custom labels.</p>
                  <Button onClick={handleInitialize}>Initialize Default Labels</Button>
                </div>
              ) : filteredLabels.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No labels match the current filter.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Key</TableHead>
                      <TableHead>English</TableHead>
                      {languages.length > 1 && <TableHead className="w-[120px]">Translations</TableHead>}
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLabels.map((label) => {
                      const { filled, total } = translationCount(label.translations);
                      return (
                        <TableRow key={label.id}>
                          <TableCell>
                            <code className="text-xs bg-muted px-2 py-1 rounded">{label.key}</code>
                          </TableCell>
                          <TableCell className="text-sm">
                            {label.translations.en || <span className="text-muted-foreground italic">Missing</span>}
                          </TableCell>
                          {languages.length > 1 && (
                            <TableCell>
                              {translatingId === label.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Badge variant={filled === total ? 'default' : 'secondary'}>
                                  {filled}/{total}
                                </Badge>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            <Badge variant={label.isCustom ? 'default' : 'secondary'}>
                              {label.isCustom ? 'Custom' : 'Default'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(label)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              {languages.length > 1 && (
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleQuickTranslate(label)} disabled={translatingId === label.id}>
                                  <Sparkles className="h-4 w-4" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => { setDeletingLabel(label); setIsDeleteOpen(true); }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingLabel(null); setEditValues({}); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Label</DialogTitle>
            <DialogDescription>
              <code className="text-xs bg-muted px-2 py-1 rounded">{editingLabel?.key}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <UILabel>English</UILabel>
              <Input value={editValues.en || ''} onChange={(e) => setEditValues({ ...editValues, en: e.target.value })} />
            </div>
            {languages.filter(l => l !== 'en').length > 0 && (
              <div className="border rounded-md">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
                  <span className="text-sm font-medium">
                    Translations ({languages.filter(l => l !== 'en' && editValues[l]?.trim()).length}/{languages.filter(l => l !== 'en').length})
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleAiTranslate} disabled={isTranslating || !editValues.en?.trim()}>
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
                        value={editValues[lang] || ''}
                        onChange={(e) => setEditValues({ ...editValues, [lang]: e.target.value })}
                      />
                      {editValues[lang]?.trim() ? (
                        <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
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
            <Button onClick={handleSaveEdit} disabled={!editValues.en?.trim() || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Label Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setNewLabelForm({ key: '', en: '', es: '' }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Label</DialogTitle>
            <DialogDescription>Create a new custom label with translations</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <UILabel>Key</UILabel>
              <Input placeholder="search.my_label" value={newLabelForm.key} onChange={(e) => setNewLabelForm({ ...newLabelForm, key: e.target.value })} />
              <p className="text-xs text-muted-foreground">Use format: category.label_name (e.g. search.bedrooms, detail.price)</p>
            </div>
            <div className="space-y-2">
              <UILabel>English</UILabel>
              <Input placeholder="My Label" value={newLabelForm.en} onChange={(e) => setNewLabelForm({ ...newLabelForm, en: e.target.value })} />
            </div>
            <div className="space-y-2">
              <UILabel>Spanish</UILabel>
              <Input placeholder="Mi Etiqueta" value={newLabelForm.es} onChange={(e) => setNewLabelForm({ ...newLabelForm, es: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newLabelForm.key || !newLabelForm.en || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Translate Confirmation */}
      <AlertDialog open={isBulkTranslateOpen} onOpenChange={setIsBulkTranslateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>AI Translate All Labels</AlertDialogTitle>
            <AlertDialogDescription>
              This will translate all {labels.length} labels to {languages.filter(l => l !== 'en').length} languages using AI.
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
            <AlertDialogTitle>Delete Label</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingLabel?.key}&quot;? This action cannot be undone.
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
