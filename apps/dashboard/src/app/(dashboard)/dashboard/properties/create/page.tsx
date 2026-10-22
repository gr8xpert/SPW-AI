'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  ArrowLeft,
  Plus,
  Upload,
  X,
  GripVertical,
  Image as ImageIcon,
  Languages,
  Save,
  Eye,
  Loader2,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { propertyKeys } from '@/hooks/use-tenant-query-scope';
import { agentChoices } from '@/hooks/use-agents';
import { labelOf, usePropertiesText } from '../_i18n';

// Content languages a property can hold; names come from the text file.
const LANGUAGES = ['en', 'es', 'de', 'fr', 'nl', 'sv', 'no', 'da', 'fi', 'ru'];

interface LocationItem {
  id: number;
  name: Record<string, string> | string;
  level?: string;
}

interface PropertyTypeItem {
  id: number;
  name: Record<string, string> | string;
}

interface FeatureItem {
  id: number;
  name: Record<string, string> | string;
  category?: string;
}

// A person from GET /api/dashboard/agents (Agents page).
interface TeamMember {
  id: number;
  name: string | null;
  email: string | null;
  showOnWebsite?: boolean;
  canLogin?: boolean;
  isActive?: boolean;
}

interface UploadedImage {
  id: number;
  url: string;
  originalFilename: string;
  isUploading?: boolean;
  tempId?: string;
}

function displayName(name: Record<string, string> | string): string {
  if (typeof name === 'string') return name;
  return name?.en || name?.es || Object.values(name)[0] || '';
}

const featureCategories = [
  'interior', 'exterior', 'community', 'climate', 'views', 'security', 'parking', 'other',
];

function SortableImage({
  image,
  index,
  onRemove,
}: {
  image: UploadedImage;
  index: number;
  onRemove: (id: number) => void;
}) {
  const t = usePropertiesText();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group aspect-square rounded-lg overflow-hidden border">
      {image.isUploading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <img src={image.url} alt={image.originalFilename} className="object-cover w-full h-full" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button variant="secondary" size="icon" className="h-8 w-8 cursor-grab" {...attributes} {...listeners}>
              <GripVertical className="h-4 w-4" />
            </Button>
            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => onRemove(image.id)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {index === 0 && (
            <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">{t.common.main}</div>
          )}
        </>
      )}
    </div>
  );
}

function LanguageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = usePropertiesText();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px]">
        <Languages className="h-4 w-4 mr-2" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((lang) => (
          <SelectItem key={lang} value={lang}>{labelOf(t.languages, lang)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultilingualInput({
  label,
  lang,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  lang: string;
  value: Record<string, string>;
  onChange: (lang: string, val: string) => void;
  placeholder?: string;
}) {
  const t = usePropertiesText();
  const langLabel = labelOf(t.languages, lang, lang.toUpperCase());
  return (
    <div className="space-y-2">
      <Label>{label} ({langLabel})</Label>
      <Input
        placeholder={placeholder || t.form.inLanguage(label, langLabel)}
        value={value[lang] || ''}
        onChange={(e) => onChange(lang, e.target.value)}
      />
    </div>
  );
}

function MultilingualTextarea({
  label,
  lang,
  value,
  onChange,
  rows = 6,
}: {
  label: string;
  lang: string;
  value: Record<string, string>;
  onChange: (lang: string, val: string) => void;
  rows?: number;
}) {
  const t = usePropertiesText();
  const langLabel = labelOf(t.languages, lang, lang.toUpperCase());
  return (
    <div className="space-y-2">
      <Label>{label} ({langLabel})</Label>
      <Textarea
        placeholder={t.form.inLanguage(label, langLabel)}
        rows={rows}
        value={value[lang] || ''}
        onChange={(e) => onChange(lang, e.target.value)}
      />
    </div>
  );
}

function CreatePropertyPageInner() {
  const router = useRouter();
  const { toast } = useToast();
  const t = usePropertiesText();
  const queryClient = useQueryClient();
  const api = useApi();
  const [activeTab, setActiveTab] = useState('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isAddTypeOpen, setIsAddTypeOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeNameEs, setNewTypeNameEs] = useState('');
  const [newTypeLoading, setNewTypeLoading] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [newLocLevel, setNewLocLevel] = useState<string>('area');
  const [newLocLoading, setNewLocLoading] = useState(false);

  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyTypeItem[]>([]);
  const [allFeatures, setAllFeatures] = useState<FeatureItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [contentLang, setContentLang] = useState('en');
  const [seoLang, setSeoLang] = useState('en');

  const [formData, setFormData] = useState({
    reference: '',
    listingType: 'sale',
    propertyTypeId: '',
    locationId: '',
    urbanization: '',
    status: 'draft',
    price: '',
    priceTo: '',
    rentalPeriod: '',
    currency: 'EUR',
    priceOnRequest: false,
    bedrooms: '',
    bedroomsTo: '',
    bathrooms: '',
    bathroomsTo: '',
    buildSize: '',
    buildSizeTo: '',
    plotSize: '',
    plotSizeTo: '',
    terraceSize: '',
    terraceSizeTo: '',
    gardenSize: '',
    solariumSize: '',
    title: {} as Record<string, string>,
    description: {} as Record<string, string>,
    features: [] as number[],
    lat: '',
    lng: '',
    geoLocationLabel: '',
    videoUrl: '',
    virtualTourUrl: '',
    isFeatured: false,
    isPublished: false,
    floor: '',
    street: '',
    streetNumber: '',
    postcode: '',
    cadastralReference: '',
    communityFees: '',
    basuraTax: '',
    ibiFees: '',
    commission: '',
    sharedCommission: false,
    builtYear: '',
    energyConsumption: '',
    energyRating: '',
    developmentName: '',
    keyReady: false,
    distanceToBeach: '',
    externalLink: '',
    blogUrl: '',
    mapLink: '',
    websiteUrl: '',
    slug: '',
    metaTitle: {} as Record<string, string>,
    metaDescription: {} as Record<string, string>,
    metaKeywords: {} as Record<string, string>,
    pageTitle: {} as Record<string, string>,
    agentId: '',
    salesAgentId: '',
    project: '',
    isOwnProperty: false,
    villaSelection: false,
    luxurySelection: false,
    apartmentSelection: false,
    deliveryDate: '',
    completionDate: '',
    propertyTypeReference: '',
    syncEnabled: true,
    brochureVariant: 'inherit' as 'inherit' | 'branded' | 'unbranded',
  });

  const [images, setImages] = useState<UploadedImage[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!api.isReady) return;
    async function fetchDropdowns() {
      try {
        const [locsRes, typesRes, featsRes, teamRes] = await Promise.all([
          api.get('/api/dashboard/locations'),
          api.get('/api/dashboard/property-types'),
          api.get('/api/dashboard/features'),
          api.get('/api/dashboard/agents'),
        ].map(p => p.catch(() => null)));

        const locs = locsRes?.data || locsRes;
        const types = typesRes?.data || typesRes;
        const feats = featsRes?.data || featsRes;
        const team = teamRes?.data || teamRes;

        if (Array.isArray(locs)) setLocations(locs);
        if (Array.isArray(types)) setPropertyTypes(types);
        if (Array.isArray(feats)) setAllFeatures(feats);
        if (Array.isArray(team)) setTeamMembers(team);
      } catch { /* dropdowns load silently */ }
    }
    fetchDropdowns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.isReady]);

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  type MultilingualField = 'title' | 'description' | 'metaTitle' | 'metaDescription' | 'metaKeywords' | 'pageTitle';

  const handleMultilingualChange = (field: MultilingualField, lang: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: { ...(prev[field] as Record<string, string>), [lang]: value },
    }));
  };

  const handleFeatureToggle = (featureId: number) => {
    setFormData((prev) => ({
      ...prev,
      features: prev.features.includes(featureId)
        ? prev.features.filter((id) => id !== featureId)
        : [...prev.features, featureId],
    }));
  };

  const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const handleAddPropertyType = async () => {
    if (!newTypeName.trim()) return;
    setNewTypeLoading(true);
    try {
      const slug = slugify(newTypeName);
      const name: Record<string, string> = { en: newTypeName.trim() };
      if (newTypeNameEs.trim()) name.es = newTypeNameEs.trim();
      const res = await api.post('/api/dashboard/property-types', { name, slug });
      const created = res?.data || res;
      setPropertyTypes((prev) => [...prev, created]);
      handleInputChange('propertyTypeId', String(created.id));
      setNewTypeName('');
      setNewTypeNameEs('');
      setIsAddTypeOpen(false);
      toast({ title: t.create.typeCreated });
    } catch {
      toast({ title: t.create.typeFailed, variant: 'destructive' });
    } finally {
      setNewTypeLoading(false);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocName.trim()) return;
    setNewLocLoading(true);
    try {
      const slug = slugify(newLocName);
      const name: Record<string, string> = { en: newLocName.trim() };
      const res = await api.post('/api/dashboard/locations', { name, slug, level: newLocLevel });
      const created = res?.data || res;
      setLocations((prev) => [...prev, created]);
      handleInputChange('locationId', String(created.id));
      setNewLocName('');
      setNewLocLevel('area');
      setIsAddLocationOpen(false);
      toast({ title: t.create.locationCreated });
    } catch {
      toast({ title: t.create.locationFailed, variant: 'destructive' });
    } finally {
      setNewLocLoading(false);
    }
  };

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const tempId = Math.random().toString(36).substring(7);
      const localUrl = URL.createObjectURL(file);

      setImages((prev) => [
        ...prev,
        { id: -1, url: localUrl, originalFilename: file.name, isUploading: true, tempId },
      ]);

      try {
        const formPayload = new FormData();
        formPayload.append('file', file);
        const result = await api.post('/api/dashboard/upload', formPayload);
        const uploaded = result.data || result;
        URL.revokeObjectURL(localUrl);
        setImages((prev) =>
          prev.map((img) =>
            img.tempId === tempId
              ? { id: uploaded.id, url: uploaded.url, originalFilename: uploaded.originalFilename, tempId: undefined }
              : img
          )
        );
      } catch {
        setImages((prev) => prev.filter((img) => img.tempId !== tempId));
        toast({ title: t.common.uploadFailed, description: t.common.uploadFailedFile(file.name), variant: 'destructive' });
      }
    }
    e.target.value = '';
  }, [api, toast, t]);

  const handleRemoveImage = useCallback(async (id: number) => {
    try {
      await api.delete(`/api/dashboard/upload/${id}`);
    } catch { /* ignore delete failure for unassigned files */ }
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, [api]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setImages((prev) => {
        const oldIndex = prev.findIndex((img) => img.id === active.id);
        const newIndex = prev.findIndex((img) => img.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleSave = async (publish: boolean = false) => {
    setIsSaving(true);

    try {
      const payload: Record<string, any> = {
        reference: formData.reference,
        listingType: formData.listingType,
        status: publish ? 'active' : formData.status,
        currency: formData.currency,
        priceOnRequest: formData.priceOnRequest,
        isFeatured: formData.isFeatured,
        isPublished: publish || formData.isPublished,
        syncEnabled: formData.syncEnabled,
        brochureVariant: formData.brochureVariant,
        title: formData.title,
        description: formData.description,
        features: formData.features,
        sharedCommission: formData.sharedCommission,
        isOwnProperty: formData.isOwnProperty,
        villaSelection: formData.villaSelection,
        luxurySelection: formData.luxurySelection,
        apartmentSelection: formData.apartmentSelection,
      };

      const stringFields = [
        'urbanization', 'floor', 'street', 'streetNumber', 'postcode',
        'cadastralReference', 'videoUrl', 'virtualTourUrl', 'externalLink',
        'blogUrl', 'mapLink', 'websiteUrl', 'slug', 'project',
        'geoLocationLabel', 'propertyTypeReference', 'energyRating', 'developmentName',
      ];
      for (const f of stringFields) {
        if (formData[f as keyof typeof formData]) payload[f] = formData[f as keyof typeof formData];
      }

      const numberFields = [
        'price', 'priceTo', 'bedrooms', 'bedroomsTo', 'bathrooms', 'bathroomsTo',
        'buildSize', 'buildSizeTo', 'plotSize', 'plotSizeTo',
        'terraceSize', 'terraceSizeTo', 'gardenSize', 'solariumSize',
        'communityFees', 'basuraTax', 'ibiFees', 'commission', 'builtYear',
        'energyConsumption', 'distanceToBeach', 'lat', 'lng',
      ];
      for (const f of numberFields) {
        const val = formData[f as keyof typeof formData];
        if (val !== '' && val !== undefined) payload[f] = Number(val);
      }

      if (formData.rentalPeriod) payload.rentalPeriod = formData.rentalPeriod;
      if (formData.keyReady) payload.keyReady = true;
      if (formData.propertyTypeId) payload.propertyTypeId = Number(formData.propertyTypeId);
      if (formData.locationId) payload.locationId = Number(formData.locationId);
      if (formData.agentId) payload.agentId = Number(formData.agentId);
      if (formData.salesAgentId) payload.salesAgentId = Number(formData.salesAgentId);

      if (formData.deliveryDate) payload.deliveryDate = formData.deliveryDate;
      if (formData.completionDate) payload.completionDate = formData.completionDate;

      const seoFields: MultilingualField[] = ['metaTitle', 'metaDescription', 'metaKeywords', 'pageTitle'];
      for (const f of seoFields) {
        const obj = formData[f] as Record<string, string>;
        if (Object.values(obj).some(v => v)) payload[f] = obj;
      }

      // Include uploaded image URLs in property images JSON
      if (images.length > 0) {
        payload.images = images
          .filter((img) => img.id > 0)
          .map((img, idx) => ({ url: img.url, order: idx, alt: '' }));
      }

      const result = await api.post('/api/dashboard/properties', payload);
      const created = result.data || result;

      // Assign uploaded files to the newly created property
      for (const img of images) {
        if (img.id > 0) {
          try {
            await api.put(`/api/dashboard/upload/${img.id}/assign`, { propertyId: created.id });
          } catch { /* best-effort assignment */ }
        }
      }

      toast({
        title: publish ? t.create.published : t.create.saved,
        description: publish ? t.create.publishedDescription : t.create.savedDescription,
      });

      // The list is cached; make it load the new row.
      void queryClient.invalidateQueries({ queryKey: propertyKeys.all });
      router.push('/dashboard/properties');
    } catch {
      toast({ title: t.common.error, description: t.create.createFailed, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const featuresByCategory = allFeatures.reduce(
    (acc, feature) => {
      const cat = feature.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(feature);
      return acc;
    },
    {} as Record<string, FeatureItem[]>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/properties">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="page-title">{t.create.title}</h1>
            <p className="page-description mt-1">{t.create.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" /> {t.create.saveDraft}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={isSaving} className="shadow-sm">
            <Eye className="h-4 w-4 mr-2" /> {t.create.publish}
          </Button>
        </div>
      </div>

      {/* Form */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="basic">{t.tabs.basic}</TabsTrigger>
          <TabsTrigger value="details">{t.tabs.details}</TabsTrigger>
          <TabsTrigger value="address">{t.tabs.address}</TabsTrigger>
          <TabsTrigger value="financial">{t.tabs.financial}</TabsTrigger>
          <TabsTrigger value="features">{t.tabs.features}</TabsTrigger>
          <TabsTrigger value="images">{t.tabs.images}</TabsTrigger>
          <TabsTrigger value="media">{t.tabs.media}</TabsTrigger>
          <TabsTrigger value="location">{t.tabs.location}</TabsTrigger>
          <TabsTrigger value="seo">{t.tabs.seo}</TabsTrigger>
          <TabsTrigger value="settings">{t.tabs.settings}</TabsTrigger>
        </TabsList>

        {/* Basic Info Tab */}
        <TabsContent value="basic" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t.create.propertyInformation}</CardTitle>
                <CardDescription>{t.create.propertyInformationDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reference">{t.fields.referenceRequired}</Label>
                  <Input id="reference" placeholder={t.common.eg('PROP-001')} value={formData.reference} onChange={(e) => handleInputChange('reference', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t.fields.listingTypeRequired}</Label>
                  <Select value={formData.listingType} onValueChange={(v) => handleInputChange('listingType', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sale">{t.listingType.sale}</SelectItem>
                      <SelectItem value="rent">{t.listingType.rent}</SelectItem>
                      <SelectItem value="holiday_rent">{t.listingType.holiday_rent}</SelectItem>
                      <SelectItem value="development">{t.listingType.development}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t.fields.propertyType}</Label>
                    <Dialog open={isAddTypeOpen} onOpenChange={setIsAddTypeOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm"><Plus className="h-3 w-3 mr-1" /> {t.create.addNew}</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>{t.create.addType}</DialogTitle><DialogDescription>{t.create.addTypeDescription}</DialogDescription></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2"><Label>{t.create.nameEnglish}</Label><Input placeholder={t.common.eg('Duplex')} value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} /></div>
                          <div className="space-y-2"><Label>{t.create.nameSpanish}</Label><Input placeholder={t.common.eg('Dúplex')} value={newTypeNameEs} onChange={(e) => setNewTypeNameEs(e.target.value)} /></div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAddTypeOpen(false)}>{t.common.cancel}</Button>
                          <Button onClick={handleAddPropertyType} disabled={!newTypeName.trim() || newTypeLoading} loading={newTypeLoading}>{t.create.addTypeButton}</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={formData.propertyTypeId} onValueChange={(v) => handleInputChange('propertyTypeId', v)}>
                    <SelectTrigger><SelectValue placeholder={t.form.selectType} /></SelectTrigger>
                    <SelectContent>
                      {propertyTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id.toString()}>{displayName(type.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t.fields.location}</Label>
                    <Dialog open={isAddLocationOpen} onOpenChange={setIsAddLocationOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm"><Plus className="h-3 w-3 mr-1" /> {t.create.addNew}</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>{t.create.addLocation}</DialogTitle><DialogDescription>{t.create.addLocationDescription}</DialogDescription></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2"><Label>{t.create.name}</Label><Input placeholder={t.common.eg('Golden Mile')} value={newLocName} onChange={(e) => setNewLocName(e.target.value)} /></div>
                          <div className="space-y-2">
                            <Label>{t.create.level}</Label>
                            <Select value={newLocLevel} onValueChange={setNewLocLevel}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="country">{t.create.levels.country}</SelectItem>
                                <SelectItem value="province">{t.create.levels.province}</SelectItem>
                                <SelectItem value="municipality">{t.create.levels.municipality}</SelectItem>
                                <SelectItem value="town">{t.create.levels.town}</SelectItem>
                                <SelectItem value="area">{t.create.levels.area}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAddLocationOpen(false)}>{t.common.cancel}</Button>
                          <Button onClick={handleAddLocation} disabled={!newLocName.trim() || newLocLoading} loading={newLocLoading}>{t.create.addLocation}</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={formData.locationId} onValueChange={(v) => handleInputChange('locationId', v)}>
                    <SelectTrigger><SelectValue placeholder={t.form.selectLocation} /></SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id.toString()}>{displayName(loc.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="urbanization">{t.fields.urbanization}</Label>
                  <Input id="urbanization" placeholder={t.common.eg('La Zagaleta')} value={formData.urbanization} onChange={(e) => handleInputChange('urbanization', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t.fields.status}</Label>
                  <Select value={formData.status} onValueChange={(v) => handleInputChange('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">{t.status.draft}</SelectItem>
                      <SelectItem value="active">{t.status.active}</SelectItem>
                      <SelectItem value="sold">{t.status.sold}</SelectItem>
                      <SelectItem value="rented">{t.status.rented}</SelectItem>
                      <SelectItem value="archived">{t.status.archived}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project">{t.fields.project}</Label>
                  <Input id="project" placeholder={t.common.eg('Beach Residences')} value={formData.project} onChange={(e) => handleInputChange('project', e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t.form.pricing}</CardTitle>
                  <CardDescription>{t.create.pricingDescription}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="priceOnRequest" checked={formData.priceOnRequest} onCheckedChange={(c) => handleInputChange('priceOnRequest', c)} />
                    <Label htmlFor="priceOnRequest">{t.fields.priceOnRequest}</Label>
                  </div>
                  {!formData.priceOnRequest && (
                    <div className="grid gap-4 sm:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="price">{t.fields.priceFrom}</Label>
                        <Input id="price" type="number" placeholder="250000" value={formData.price} onChange={(e) => handleInputChange('price', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceTo">{t.fields.priceTo} <span className="font-normal text-muted-foreground">{t.common.optional}</span></Label>
                        <Input id="priceTo" type="number" placeholder={t.form.priceToPlaceholder} value={formData.priceTo} onChange={(e) => handleInputChange('priceTo', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t.fields.pricePer}</Label>
                        <Select value={formData.rentalPeriod || 'none'} onValueChange={(v) => handleInputChange('rentalPeriod', v === 'none' ? '' : v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{formData.listingType === 'rent' ? t.pricePer.monthDefault : t.pricePer.whole}</SelectItem>
                            <SelectItem value="night">{t.pricePer.night}</SelectItem>
                            <SelectItem value="week">{t.pricePer.week}</SelectItem>
                            <SelectItem value="month">{t.pricePer.month}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t.fields.currency}</Label>
                        <Select value={formData.currency} onValueChange={(v) => handleInputChange('currency', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="GBP">GBP</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t.form.agentAssignment}</CardTitle>
                  <CardDescription>{t.create.agentDescription}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t.fields.agent}</Label>
                    <Select value={formData.agentId || 'none'} onValueChange={(v) => handleInputChange('agentId', v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder={t.form.selectAgent} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t.common.none}</SelectItem>
                        {agentChoices(teamMembers, 'website', formData.agentId).map((m) => (
                          <SelectItem key={m.id} value={m.id.toString()}>{m.name || m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t.form.agentHint}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t.fields.salesAgent}</Label>
                    <Select value={formData.salesAgentId || 'none'} onValueChange={(v) => handleInputChange('salesAgentId', v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder={t.form.selectSalesAgent} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t.common.none}</SelectItem>
                        {agentChoices(teamMembers, 'sales', formData.salesAgentId).map((m) => (
                          <SelectItem key={m.id} value={m.id.toString()}>{m.name || m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="propertyTypeReference">{t.fields.propertyTypeReference}</Label>
                    <Input id="propertyTypeReference" placeholder={t.form.externalTypeCode} value={formData.propertyTypeReference} onChange={(e) => handleInputChange('propertyTypeReference', e.target.value)} />
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>

          {/* Multilingual Content */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Languages className="h-5 w-5" /> {t.form.content}</CardTitle>
                  <CardDescription>{t.form.contentDescription}</CardDescription>
                </div>
                <LanguageSelect value={contentLang} onChange={setContentLang} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <MultilingualInput label={t.fields.title} lang={contentLang} value={formData.title} onChange={(lang, val) => handleMultilingualChange('title', lang, val)} />
              <MultilingualTextarea label={t.fields.description} lang={contentLang} value={formData.description} onChange={(lang, val) => handleMultilingualChange('description', lang, val)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.create.metrics}</CardTitle>
              <CardDescription>{t.create.metricsDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                {[
                  ['bedrooms', 'bedroomsTo', t.fields.bedrooms, '2', '4'],
                  ['bathrooms', 'bathroomsTo', t.fields.bathrooms, '1', '3'],
                  ['buildSize', 'buildSizeTo', t.fields.buildSize, '150', '300'],
                  ['plotSize', 'plotSizeTo', t.fields.plotSize, '500', '2000'],
                  ['terraceSize', 'terraceSizeTo', t.fields.terrace, '30', '80'],
                ].map(([from, to, label, phFrom, phTo]) => (
                  <div key={from} className="space-y-2 md:col-span-2">
                    <Label>{label}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" step="any" placeholder={t.common.fromN(phFrom)} value={formData[from as keyof typeof formData] as string} onChange={(e) => handleInputChange(from, e.target.value)} />
                      <Input type="number" step="any" placeholder={t.common.toN(phTo)} value={formData[to as keyof typeof formData] as string} onChange={(e) => handleInputChange(to, e.target.value)} />
                    </div>
                  </div>
                ))}
                {[
                  ['gardenSize', t.fields.garden, '200'],
                  ['solariumSize', t.fields.solarium, '30'],
                  ['builtYear', t.fields.builtYear, '2020'],
                  ['energyConsumption', t.fields.energy, '85'],
                  ['distanceToBeach', t.fields.distanceToBeach, '500'],
                ].map(([field, label, ph]) => (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={field}>{label}</Label>
                    <Input id={field} type="number" placeholder={ph} value={formData[field as keyof typeof formData] as string} onChange={(e) => handleInputChange(field, e.target.value)} />
                  </div>
                ))}
                <div className="space-y-2">
                  <Label htmlFor="energyRating">{t.fields.energyRating}</Label>
                  <select
                    id="energyRating"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.energyRating}
                    onChange={(e) => handleInputChange('energyRating', e.target.value)}
                  >
                    <option value="">—</option>
                    {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deliveryDate">{t.fields.deliveryDate}</Label>
                  <Input id="deliveryDate" type="date" value={formData.deliveryDate} onChange={(e) => handleInputChange('deliveryDate', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="completionDate">{t.fields.completionDate}</Label>
                  <Input id="completionDate" type="date" value={formData.completionDate} onChange={(e) => handleInputChange('completionDate', e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="developmentName">{t.fields.developmentName}</Label>
                  <Input id="developmentName" value={formData.developmentName} onChange={(e) => handleInputChange('developmentName', e.target.value)} placeholder={t.form.newDevelopmentsOnly} />
                </div>
                <div className="flex items-end pb-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="keyReady" checked={formData.keyReady} onCheckedChange={(c) => handleInputChange('keyReady', !!c)} />
                    <Label htmlFor="keyReady">{t.fields.keyReady}</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Address Tab */}
        <TabsContent value="address" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t.form.propertyAddress}</CardTitle><CardDescription>{t.create.addressDescription}</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[
                  ['street', t.fields.street, 'Calle del Valle'],
                  ['streetNumber', t.fields.streetNo, '12'],
                  ['floor', t.fields.floor, '3A'],
                  ['postcode', t.fields.postcode, '29660'],
                  ['cadastralReference', t.fields.cadastralReference, '1234567AB1234C0001XX'],
                ].map(([field, label, ph]) => (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={field}>{label}</Label>
                    <Input id={field} placeholder={ph} value={formData[field as keyof typeof formData] as string} onChange={(e) => handleInputChange(field, e.target.value)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t.form.feesTaxes}</CardTitle><CardDescription>{t.create.financialDescription}</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[
                  ['communityFees', t.fields.communityFees, '450'],
                  ['basuraTax', t.fields.basuraTax, '120'],
                  ['ibiFees', t.fields.ibiFees, '3200'],
                  ['commission', t.fields.commission, '5.00'],
                ].map(([field, label, ph]) => (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={field}>{label}</Label>
                    <Input id={field} type="number" step={field === 'commission' ? '0.01' : undefined} placeholder={ph} value={formData[field as keyof typeof formData] as string} onChange={(e) => handleInputChange(field, e.target.value)} />
                  </div>
                ))}
                <div className="flex items-end pb-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="sharedCommission" checked={formData.sharedCommission} onCheckedChange={(c) => handleInputChange('sharedCommission', c)} />
                    <Label htmlFor="sharedCommission">{t.fields.sharedCommission}</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t.form.propertyFeatures}</CardTitle><CardDescription>{t.create.featuresDescription}</CardDescription></CardHeader>
            <CardContent>
              {Object.keys(featuresByCategory).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.form.noFeatures}</p>
              ) : (
                <div className="space-y-6">
                  {featureCategories.map((category) => {
                    const categoryFeatures = featuresByCategory[category];
                    if (!categoryFeatures?.length) return null;
                    return (
                      <div key={category}>
                        <h4 className="font-medium capitalize mb-3">{labelOf(t.form.featureCategories, category)}</h4>
                        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                          {categoryFeatures.map((feature) => (
                            <div key={feature.id} className="flex items-center space-x-2">
                              <Checkbox id={`feature-${feature.id}`} checked={formData.features.includes(feature.id)} onCheckedChange={() => handleFeatureToggle(feature.id)} />
                              <Label htmlFor={`feature-${feature.id}`} className="font-normal">{displayName(feature.name)}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Images Tab */}
        <TabsContent value="images" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.form.propertyImages}</CardTitle>
              <CardDescription>{t.form.imagesDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground"><span className="font-semibold">{t.form.clickToUpload}</span>{t.form.orDragDrop}</p>
                    <p className="text-xs text-muted-foreground">{t.form.fileTypes}</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                </label>

                {images.length > 0 ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={images.map((img) => img.id)} strategy={rectSortingStrategy}>
                      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                        {images.map((image, index) => (
                          <SortableImage key={image.tempId || image.id} image={image} index={index} onRemove={handleRemoveImage} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>{t.create.noImagesYet}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Media Links Tab */}
        <TabsContent value="media" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t.create.mediaTitle}</CardTitle><CardDescription>{t.create.mediaDescription}</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ['videoUrl', t.fields.videoUrl, 'https://youtube.com/watch?v=...'],
                  ['virtualTourUrl', t.fields.virtualTourUrl, 'https://matterport.com/...'],
                  ['externalLink', t.fields.externalLink, 'https://...'],
                  ['blogUrl', t.fields.blogUrl, 'https://yourblog.com/...'],
                  ['mapLink', t.fields.mapLink, 'https://maps.google.com/...'],
                  ['websiteUrl', t.fields.websiteUrl, 'https://yoursite.com/property/...'],
                ].map(([field, label, ph]) => (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={field}>{label}</Label>
                    <Input id={field} placeholder={ph} value={formData[field as keyof typeof formData] as string} onChange={(e) => handleInputChange(field, e.target.value)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Location Tab */}
        <TabsContent value="location" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t.form.coordinates}</CardTitle><CardDescription>{t.create.coordinatesDescription}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="lat">{t.fields.latitude}</Label>
                  <Input id="lat" type="number" step="any" placeholder="36.5126" value={formData.lat} onChange={(e) => handleInputChange('lat', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lng">{t.fields.longitude}</Label>
                  <Input id="lng" type="number" step="any" placeholder="-4.8829" value={formData.lng} onChange={(e) => handleInputChange('lng', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="geoLocationLabel">{t.fields.locationLabel}</Label>
                  <Input id="geoLocationLabel" placeholder="Nueva Andalucia, Marbella" value={formData.geoLocationLabel} onChange={(e) => handleInputChange('geoLocationLabel', e.target.value)} />
                </div>
              </div>
              <div className="aspect-video rounded-lg border bg-muted flex items-center justify-center">
                <p className="text-muted-foreground">{t.form.mapPlaceholder}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEO Tab */}
        <TabsContent value="seo" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t.form.seoSettings}</CardTitle>
                  <CardDescription>{t.form.seoDescription}</CardDescription>
                </div>
                <LanguageSelect value={seoLang} onChange={setSeoLang} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="slug">{t.fields.slug}</Label>
                <Input id="slug" placeholder="luxury-villa-nueva-andalucia" value={formData.slug} onChange={(e) => handleInputChange('slug', e.target.value)} />
                <p className="text-xs text-muted-foreground">{t.form.slugHint}</p>
              </div>
              <MultilingualInput label={t.fields.pageTitle} lang={seoLang} value={formData.pageTitle} onChange={(lang, val) => handleMultilingualChange('pageTitle', lang, val)} />
              <MultilingualInput label={t.fields.metaTitle} lang={seoLang} value={formData.metaTitle} onChange={(lang, val) => handleMultilingualChange('metaTitle', lang, val)} />
              <MultilingualTextarea label={t.fields.metaDescription} lang={seoLang} value={formData.metaDescription} onChange={(lang, val) => handleMultilingualChange('metaDescription', lang, val)} rows={3} />
              <MultilingualInput label={t.fields.metaKeywords} lang={seoLang} value={formData.metaKeywords} onChange={(lang, val) => handleMultilingualChange('metaKeywords', lang, val)} placeholder={t.form.keywordsPlaceholder} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t.form.visibility}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                ['isFeatured', t.form.flags.isFeatured, t.form.flags.isFeaturedHint],
                ['isPublished', t.form.flags.isPublished, t.form.flags.isPublishedHint],
                ['isOwnProperty', t.form.flags.isOwnProperty, ''],
                ['villaSelection', t.form.flags.villaSelection, ''],
                ['luxurySelection', t.form.flags.luxurySelection, ''],
                ['apartmentSelection', t.form.flags.apartmentSelection, ''],
              ].map(([field, label, desc]) => (
                <div key={field} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{label}</Label>
                    {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
                  </div>
                  <Switch
                    checked={formData[field as keyof typeof formData] as boolean}
                    onCheckedChange={(c) => handleInputChange(field, c)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.form.feedSync}</CardTitle>
              <CardDescription>{t.form.feedSyncDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t.form.enableFeedSync}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t.form.feedSyncHint}
                  </p>
                </div>
                <Switch
                  checked={formData.syncEnabled}
                  onCheckedChange={(c) => handleInputChange('syncEnabled', c)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.form.brochure}</CardTitle>
              <CardDescription>
                {t.form.brochureBefore}<em>{t.form.brochureInherit}</em>{t.form.brochureAfter}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>{t.form.brochureVariant}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.brochureVariant}
                  onChange={(e) => handleInputChange('brochureVariant', e.target.value as 'inherit' | 'branded' | 'unbranded')}
                >
                  <option value="inherit">{t.form.brochureOptions.inherit}</option>
                  <option value="branded">{t.form.brochureOptions.branded}</option>
                  <option value="unbranded">{t.form.brochureOptions.unbranded}</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { LockedRouteGuard } from '@/components/locked-route-guard';

export default function CreatePropertyPage() {
  const t = usePropertiesText();
  return (
    <LockedRouteGuard addon="addProperty" featureName={t.list.addProperty}>
      <CreatePropertyPageInner />
    </LockedRouteGuard>
  );
}
