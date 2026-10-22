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
  Lock,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useAiTranslationGuard } from '@/hooks/use-ai-translation-guard';
import { useBulkJob } from '@/hooks/use-bulk-job';
import { useLabelsText, nameOf } from './_i18n';

interface Label {
  id: number;
  key: string;
  translations: Record<string, string>;
  isCustom: boolean;
}

// Tab names come from t.categories by id.
const labelCategories = [
  { id: 'search' },
  { id: 'results' },
  { id: 'card' },
  { id: 'detail' },
  { id: 'inquiry' },
  { id: 'wishlist' },
  { id: 'map' },
  { id: 'chat' },
  { id: 'pagination' },
  { id: 'mortgage' },
  { id: 'calculator' },
  { id: 'buyer' },
  { id: 'wishlist_form' },
  { id: 'buyer_page' },
  { id: 'general' },
];

const CATEGORY_PREFIXES: Record<string, string[]> = {
  search: ['search_', 'reset_', 'advanced_', 'location_', 'listing_type_', 'property_type', 'bedrooms_', 'bathrooms_', 'price_', 'built_area_', 'plot_size_', 'features_', 'reference_', 'active_filters', 'clear_all', 'quick_features', 'more_filters', 'filter_', 'ai_', 'terrace_', 'key_ready'],
  results: ['results_', 'sort_', 'view_', 'back_to_results'],
  card: ['card_'],
  detail: ['detail_'],
  inquiry: ['inquiry_'],
  wishlist: ['wishlist_', 'compare', 'share_wishlist', 'email_wishlist', 'add_note', 'add_personal_note', 'note_placeholder', 'personal_message', 'your_email_optional', 'your_name_optional'],
  map: ['map_', 'zones'],
  chat: ['chat_'],
  pagination: ['pagination_'],
  mortgage: ['mortgage_'],
  calculator: ['calc_'],
  buyer_page: ['buyer_page_'],
  buyer: ['buyer_'],
  wishlist_form: ['wishlist_form_'],
  general: ['loading', 'error', 'close', 'currency_', 'language_', 'featured', 'cancel', 'clear', 'copy', 'copied', 'save', 'edit', 'share', 'send_email', 'send_to', 'sending', 'email', 'email_error', 'email_sent', 'download_pdf', 'qr_code', 'read_less', 'read_more', 'view_all', 'view_details', 'properties', 'property_singular', 'type', 'reference', 'feature', 'no_results', 'beds', 'baths', 'bedrooms', 'bathrooms', 'location', 'price', 'wishlist', 'yes'],
};

function labelMatchesCategory(key: string, categoryId: string): boolean {
  // wishlist_form_* has its own tab, not the Wishlist one.
  if (categoryId === 'wishlist' && key.startsWith('wishlist_form_')) return false;
  // buyer_page_* likewise has its own tab, not Buyer Emails & PDF.
  if (categoryId === 'buyer' && key.startsWith('buyer_page_')) return false;
  const prefixes = CATEGORY_PREFIXES[categoryId];
  if (!prefixes) return false;
  return prefixes.some(p => key.startsWith(p));
}

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
  const aiTranslation = useAiTranslationGuard();
  const t = useLabelsText();

  const api = useApi();
  // Server-tracked, so progress survives a refresh or leaving the page and a
  // second click can't queue a duplicate (paid) run.
  const bulkTranslate = useBulkJob({
    activeUrl: '/api/dashboard/translate/jobs/active?entityType=label',
    statusUrl: (jobId) => `/api/dashboard/translate/job/${jobId}`,
    onFinished: (st) => {
      toast(
        st.status === 'completed' && st.failed === 0
          ? { title: t.toast.bulkComplete, description: t.toast.bulkCompleteText(st.completed) }
          : { title: t.toast.bulkErrors, description: t.toast.bulkErrorsText(st.failed, st.total), variant: 'destructive' },
      );
      fetchLabels();
    },
  });
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
      toast({ title: t.toast.loadFailed, variant: 'destructive' });
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
      toast({ title: t.toast.updated });
      setIsEditOpen(false);
      setEditingLabel(null);
      setEditValues({});
      fetchLabels();
    } catch (e: any) {
      toast({ title: t.toast.saveFailed, description: e.message, variant: 'destructive' });
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
      toast({ title: t.toast.created });
      setIsAddOpen(false);
      setNewLabelForm({ key: '', en: '', es: '' });
      fetchLabels();
    } catch (e: any) {
      toast({ title: t.toast.createFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingLabel) return;
    try {
      await api.delete(`/api/dashboard/labels/${deletingLabel.id}`);
      toast({ title: t.toast.deleted });
      setIsDeleteOpen(false);
      setDeletingLabel(null);
      fetchLabels();
    } catch (e: any) {
      toast({ title: t.toast.deleteFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleInitialize = async () => {
    try {
      await api.post('/api/dashboard/labels/initialize');
      toast({ title: t.toast.initialized });
      fetchLabels();
    } catch (e: any) {
      toast({ title: t.toast.initFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleAiTranslate = async () => {
    if (!editingLabel) return;
    if (!aiTranslation.check()) return;
    setIsTranslating(true);
    try {
      const translations: Record<string, string> = {};
      for (const [lang, val] of Object.entries(editValues)) {
        if (val.trim()) translations[lang] = val.trim();
      }
      await api.put(`/api/dashboard/labels/${editingLabel.id}`, { translations });

      const missingLangs = languages.filter(l => l !== 'en' && !editValues[l]?.trim());
      if (missingLangs.length === 0) {
        toast({ title: t.toast.allComplete });
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
      toast({ title: t.toast.translatedTo(missingLangs.length) });
      fetchLabels();
    } catch (e: any) {
      toast({ title: t.toast.translationFailed, description: e.message, variant: 'destructive' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleQuickTranslate = async (label: Label) => {
    if (!aiTranslation.check()) return;
    setTranslatingId(label.id);
    try {
      const missingLangs = languages.filter(l => l !== 'en' && !label.translations[l]?.trim());
      if (missingLangs.length === 0) {
        toast({ title: t.toast.allComplete });
        setTranslatingId(null);
        return;
      }
      await api.post(`/api/dashboard/translate/label/${label.id}`, {
        targetLanguages: missingLangs,
        sourceLanguage: 'en',
      });
      toast({ title: t.toast.translatedName(label.key) });
      fetchLabels();
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
      const res = await api.post('/api/dashboard/translate/labels/bulk', {
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

  const filteredLabels = labels.filter((label) => {
    const matchesSearch =
      label.key.toLowerCase().includes(search.toLowerCase()) ||
      Object.values(label.translations).some((t) =>
        t?.toLowerCase().includes(search.toLowerCase())
      );
    // A search looks through every tab: searching "Property Information"
    // while Search Form was open used to find nothing.
    const matchesCategory = search.trim() !== '' || labelMatchesCategory(label.key, activeCategory);
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
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">{t.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {languages.length > 1 && (
            <Button size="sm" onClick={() => { if (aiTranslation.check()) setIsBulkTranslateOpen(true); }} disabled={bulkTranslate.running} title={aiTranslation.locked ? t.lockedLong : undefined}>
              {bulkTranslate.running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : aiTranslation.locked ? <Lock className="h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {bulkTranslate.running ? t.translating(bulkTranslate.progress) : t.aiTranslateAll}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.totalLabels}</CardTitle>
            <div className="stat-card-icon">
              <Edit className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{labels.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.languages}</CardTitle>
            <div className="stat-card-icon">
              <Sparkles className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{languages.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.missingTranslations}</CardTitle>
            <div className="stat-card-icon">
              <Search className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{missingCount}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t.searchPlaceholder} className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList>
          {labelCategories.map((cat) => (
            <TabsTrigger key={cat.id} value={cat.id}>{nameOf(t.categories, cat.id)}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {search.trim() ? t.searchResultsAll(filteredLabels.length) : t.categoryLabels(nameOf(t.categories, activeCategory))}
              </CardTitle>
              <CardDescription>{t.clickEdit}</CardDescription>
            </CardHeader>
            <CardContent>
              {api.isLoading && labels.length === 0 ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : labels.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">{t.empty}</p>
                  <Button onClick={handleInitialize}>{t.initializeDefaults}</Button>
                </div>
              ) : filteredLabels.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">{t.noMatch}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">{t.colKey}</TableHead>
                      <TableHead>{t.colEnglish}</TableHead>
                      {languages.length > 1 && <TableHead className="w-[120px]">{t.colTranslations}</TableHead>}
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
                            {label.translations.en || <span className="text-muted-foreground italic">{t.missing}</span>}
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
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(label)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              {languages.length > 1 && (
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleQuickTranslate(label)} disabled={translatingId === label.id} title={aiTranslation.locked ? t.lockedShort : t.translateThis}>
                                  {aiTranslation.locked ? <Lock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                </Button>
                              )}
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
            <DialogTitle>{t.editTitle}</DialogTitle>
            <DialogDescription>
              <code className="text-xs bg-muted px-2 py-1 rounded">{editingLabel?.key}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <UILabel>{t.english}</UILabel>
              <Input value={editValues.en || ''} onChange={(e) => setEditValues({ ...editValues, en: e.target.value })} />
            </div>
            {languages.filter(l => l !== 'en').length > 0 && (
              <div className="border rounded-md">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
                  <span className="text-sm font-medium">
                    {t.translationsCount(languages.filter(l => l !== 'en' && editValues[l]?.trim()).length, languages.filter(l => l !== 'en').length)}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleAiTranslate} disabled={isTranslating || !editValues.en?.trim()} title={aiTranslation.locked ? t.lockedShort : undefined}>
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
                        value={editValues[lang] || ''}
                        onChange={(e) => setEditValues({ ...editValues, [lang]: e.target.value })}
                      />
                      {editValues[lang]?.trim() ? (
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
            <Button onClick={handleSaveEdit} disabled={!editValues.en?.trim() || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Label Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setNewLabelForm({ key: '', en: '', es: '' }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.addTitle}</DialogTitle>
            <DialogDescription>{t.addDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <UILabel>{t.key}</UILabel>
              <Input placeholder="search_my_label" value={newLabelForm.key} onChange={(e) => setNewLabelForm({ ...newLabelForm, key: e.target.value })} />
              <p className="text-xs text-muted-foreground">{t.keyHint}</p>
            </div>
            <div className="space-y-2">
              <UILabel>{t.english}</UILabel>
              <Input placeholder="My Label" value={newLabelForm.en} onChange={(e) => setNewLabelForm({ ...newLabelForm, en: e.target.value })} />
            </div>
            <div className="space-y-2">
              <UILabel>{t.spanish}</UILabel>
              <Input placeholder="Mi Etiqueta" value={newLabelForm.es} onChange={(e) => setNewLabelForm({ ...newLabelForm, es: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>{t.cancel}</Button>
            <Button onClick={handleCreate} disabled={!newLabelForm.key || !newLabelForm.en || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.create}
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
              {t.bulkText(labels.length, languages.filter(l => l !== 'en').length)}
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

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteText(deletingLabel?.key ?? '')}
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
