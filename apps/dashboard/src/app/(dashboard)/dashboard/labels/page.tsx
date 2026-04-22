'use client';

import { useState, useEffect, useRef } from 'react';
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
  Check,
  X,
  Languages,
  RefreshCw,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

interface Label {
  id: number;
  key: string;
  translations: Record<string, string>;
  isCustom: boolean;
}

const defaultLanguages = ['en', 'es'];

const defaultLanguageNames: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
  nl: 'Dutch',
  pt: 'Portuguese',
  it: 'Italian',
  ru: 'Russian',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  pl: 'Polish',
  tr: 'Turkish',
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
  const [languages, setLanguages] = useState<string[]>(defaultLanguages);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddLangOpen, setIsAddLangOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingLabel, setDeletingLabel] = useState<Label | null>(null);
  const [newLabelForm, setNewLabelForm] = useState({ key: '', en: '', es: '' });
  const [newLang, setNewLang] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const api = useApi();
  const { toast } = useToast();

  const fetchLabels = async () => {
    try {
      const res = await api.get('/api/dashboard/labels');
      const data: Label[] = res?.data || [];
      setLabels(data);
      const allLangs = new Set(languages);
      data.forEach((l) => Object.keys(l.translations).forEach((k) => allLangs.add(k)));
      setLanguages(Array.from(allLangs));
    } catch {
      toast({ title: 'Failed to load labels', variant: 'destructive' });
    }
  };

  useEffect(() => { fetchLabels(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startEditing = (label: Label) => {
    setEditingId(label.id);
    setEditValues({ ...label.translations });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEditing = async (label: Label) => {
    setIsSaving(true);
    try {
      await api.put(`/api/dashboard/labels/${label.id}`, { translations: editValues });
      toast({ title: 'Label updated' });
      setEditingId(null);
      setEditValues({});
      fetchLabels();
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
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

  const handleInitialize = async () => {
    try {
      await api.post('/api/dashboard/labels/initialize');
      toast({ title: 'Default labels initialized' });
      fetchLabels();
    } catch (e: any) {
      toast({ title: 'Failed to initialize', description: e.message, variant: 'destructive' });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Labels</h1>
          <p className="text-muted-foreground">Manage UI text translations for your widget</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleInitialize}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Initialize Defaults
          </Button>
          <Button variant="outline" onClick={() => setIsAddLangOpen(true)}>
            <Languages className="h-4 w-4 mr-2" />
            Add Language
          </Button>
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Label
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Labels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{labels.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Languages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{languages.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Custom Labels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{labels.filter((l) => l.isCustom).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Missing Translations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{missingCount}</div>
          </CardContent>
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
              <CardDescription>Click on a translation to edit it inline</CardDescription>
            </CardHeader>
            <CardContent>
              {api.isLoading && labels.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
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
                      {languages.map((lang) => (
                        <TableHead key={lang}>{defaultLanguageNames[lang] || lang.toUpperCase()}</TableHead>
                      ))}
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLabels.map((label) => (
                      <TableRow key={label.id}>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">{label.key}</code>
                        </TableCell>
                        {languages.map((lang) => (
                          <TableCell key={lang}>
                            {editingId === label.id ? (
                              <Input
                                value={editValues[lang] || ''}
                                onChange={(e) => setEditValues({ ...editValues, [lang]: e.target.value })}
                                className="h-8"
                                placeholder={`${defaultLanguageNames[lang] || lang} translation`}
                              />
                            ) : (
                              <button
                                className="text-left hover:bg-muted px-2 py-1 rounded -mx-2 transition-colors w-full"
                                onClick={() => startEditing(label)}
                              >
                                {label.translations[lang] || (
                                  <span className="text-muted-foreground italic">Missing</span>
                                )}
                              </button>
                            )}
                          </TableCell>
                        ))}
                        <TableCell>
                          <Badge variant={label.isCustom ? 'default' : 'secondary'}>
                            {label.isCustom ? 'Custom' : 'Default'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {editingId === label.id ? (
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveEditing(label)} disabled={isSaving}>
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEditing}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => { setDeletingLabel(label); setIsDeleteOpen(true); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

      {/* Add Language Dialog */}
      <Dialog open={isAddLangOpen} onOpenChange={setIsAddLangOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Language</DialogTitle>
            <DialogDescription>Add a new language column for translations</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <UILabel>Language Code</UILabel>
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
