'use client';

import { useState } from 'react';
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
  Search,
  Edit,
  Check,
  X,
  Languages,
  RefreshCw,
} from 'lucide-react';

interface Label {
  id: number;
  key: string;
  translations: { en: string; es?: string; de?: string; fr?: string };
  isCustom: boolean;
}

const labelCategories = [
  { id: 'search', name: 'Search Form' },
  { id: 'detail', name: 'Property Detail' },
  { id: 'common', name: 'Common' },
  { id: 'filters', name: 'Filters' },
];

const sampleLabels: Label[] = [
  { id: 1, key: 'search.bedrooms', translations: { en: 'Bedrooms', es: 'Dormitorios', de: 'Schlafzimmer' }, isCustom: false },
  { id: 2, key: 'search.bathrooms', translations: { en: 'Bathrooms', es: 'Baños', de: 'Badezimmer' }, isCustom: false },
  { id: 3, key: 'search.location', translations: { en: 'Location', es: 'Ubicación', de: 'Lage' }, isCustom: false },
  { id: 4, key: 'search.price_range', translations: { en: 'Price Range', es: 'Rango de precios', de: 'Preisspanne' }, isCustom: false },
  { id: 5, key: 'search.property_type', translations: { en: 'Property Type', es: 'Tipo de propiedad', de: 'Immobilientyp' }, isCustom: false },
  { id: 6, key: 'detail.features', translations: { en: 'Features', es: 'Características', de: 'Merkmale' }, isCustom: false },
  { id: 7, key: 'detail.description', translations: { en: 'Description', es: 'Descripción', de: 'Beschreibung' }, isCustom: false },
  { id: 8, key: 'detail.contact_agent', translations: { en: 'Contact Agent', es: 'Contactar agente' }, isCustom: true },
  { id: 9, key: 'common.search', translations: { en: 'Search', es: 'Buscar', de: 'Suchen' }, isCustom: false },
  { id: 10, key: 'common.view_details', translations: { en: 'View Details', es: 'Ver detalles', de: 'Details anzeigen' }, isCustom: false },
];

const languages = ['en', 'es', 'de', 'fr'];
const languageNames: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
};

export default function LabelsPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('search');
  const [editingId, setEditingId] = useState<number | null>(null);

  const filteredLabels = sampleLabels.filter((label) => {
    const matchesSearch =
      label.key.toLowerCase().includes(search.toLowerCase()) ||
      Object.values(label.translations).some((t) =>
        t?.toLowerCase().includes(search.toLowerCase())
      );
    const matchesCategory = label.key.startsWith(activeCategory);
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Labels</h1>
          <p className="text-muted-foreground">
            Manage UI text translations for your widget
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            AI Translate
          </Button>
          <Button variant="outline">
            <Languages className="h-4 w-4 mr-2" />
            Add Language
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Labels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sampleLabels.length}</div>
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
            <div className="text-2xl font-bold">
              {sampleLabels.filter((l) => l.isCustom).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Missing Translations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">3</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search labels by key or translation..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Labels by Category */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList>
          {labelCategories.map((cat) => (
            <TabsTrigger key={cat.id} value={cat.id}>
              {cat.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {labelCategories.find((c) => c.id === activeCategory)?.name} Labels
              </CardTitle>
              <CardDescription>
                Click on a translation to edit it inline
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Key</TableHead>
                    {languages.map((lang) => (
                      <TableHead key={lang}>{languageNames[lang]}</TableHead>
                    ))}
                    <TableHead className="w-[100px]">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLabels.map((label) => (
                    <TableRow key={label.id}>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {label.key}
                        </code>
                      </TableCell>
                      {languages.map((lang) => (
                        <TableCell key={lang}>
                          {editingId === label.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                defaultValue={label.translations[lang as keyof typeof label.translations] || ''}
                                className="h-8"
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setEditingId(null)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setEditingId(null)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              className="text-left hover:bg-muted px-2 py-1 rounded -mx-2 transition-colors w-full"
                              onClick={() => setEditingId(label.id)}
                            >
                              {label.translations[lang as keyof typeof label.translations] || (
                                <span className="text-muted-foreground italic">
                                  Missing
                                </span>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
