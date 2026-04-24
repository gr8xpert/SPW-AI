'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { ArrowLeft, Loader2, Save, X, Upload, GripVertical, Image as ImageIcon, Languages } from 'lucide-react';
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
import { useApi } from '@/hooks/use-api';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'da', label: 'Danish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'ru', label: 'Russian' },
];

interface PropertyType { id: number; name: Record<string, string> | string; }
interface Location { id: number; name: Record<string, string> | string; level?: string; }
interface Feature { id: number; name: Record<string, string> | string; category?: string; }
interface TeamMember { id: number; name: string | null; email: string; }

interface MediaFileItem {
  id: number;
  url: string;
  originalFilename: string;
  sortOrder: number;
  isUploading?: boolean;
  tempId?: string;
}

function displayName(name: Record<string, string> | string): string {
  if (typeof name === 'string') return name;
  return name?.en || name?.es || Object.values(name)[0] || '';
}

type MultilingualField = 'title' | 'description' | 'metaTitle' | 'metaDescription' | 'metaKeywords' | 'pageTitle';

interface FormData {
  reference: string;
  agentReference: string;
  listingType: string;
  propertyTypeId: string;
  locationId: string;
  urbanization: string;
  status: string;
  price: string;
  priceTo: string;
  currency: string;
  priceOnRequest: boolean;
  bedrooms: string;
  bedroomsTo: string;
  bathrooms: string;
  bathroomsTo: string;
  buildSize: string;
  buildSizeTo: string;
  plotSize: string;
  plotSizeTo: string;
  terraceSize: string;
  terraceSizeTo: string;
  gardenSize: string;
  solariumSize: string;
  title: Record<string, string>;
  description: Record<string, string>;
  features: number[];
  videoUrl: string;
  virtualTourUrl: string;
  floorPlanUrl: string;
  lat: string;
  lng: string;
  geoLocationLabel: string;
  isFeatured: boolean;
  isPublished: boolean;
  floor: string;
  street: string;
  streetNumber: string;
  postcode: string;
  cadastralReference: string;
  communityFees: string;
  basuraTax: string;
  ibiFees: string;
  commission: string;
  sharedCommission: boolean;
  builtYear: string;
  energyConsumption: string;
  distanceToBeach: string;
  externalLink: string;
  blogUrl: string;
  mapLink: string;
  websiteUrl: string;
  slug: string;
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
  metaKeywords: Record<string, string>;
  pageTitle: Record<string, string>;
  agentId: string;
  salesAgentId: string;
  project: string;
  isOwnProperty: boolean;
  villaSelection: boolean;
  luxurySelection: boolean;
  apartmentSelection: boolean;
  deliveryDate: string;
  completionDate: string;
  propertyTypeReference: string;
  syncEnabled: boolean;
}

function LanguageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px]">
        <Languages className="h-4 w-4 mr-2" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>{lang.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultilingualInput({
  label, lang, value, onChange, placeholder,
}: { label: string; lang: string; value: Record<string, string>; onChange: (lang: string, val: string) => void; placeholder?: string; }) {
  const langLabel = LANGUAGES.find((l) => l.code === lang)?.label || lang.toUpperCase();
  return (
    <div className="space-y-2">
      <Label>{label} ({langLabel})</Label>
      <Input placeholder={placeholder || `${label} in ${langLabel}`} value={value[lang] || ''} onChange={(e) => onChange(lang, e.target.value)} />
    </div>
  );
}

function MultilingualTextarea({
  label, lang, value, onChange, rows = 6,
}: { label: string; lang: string; value: Record<string, string>; onChange: (lang: string, val: string) => void; rows?: number; }) {
  const langLabel = LANGUAGES.find((l) => l.code === lang)?.label || lang.toUpperCase();
  return (
    <div className="space-y-2">
      <Label>{label} ({langLabel})</Label>
      <Textarea placeholder={`${label} in ${langLabel}`} rows={rows} value={value[lang] || ''} onChange={(e) => onChange(lang, e.target.value)} />
    </div>
  );
}

function SortableImage({
  image, index, onRemove,
}: { image: MediaFileItem; index: number; onRemove: (id: number) => void; }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

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
            <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">Main</div>
          )}
        </>
      )}
    </div>
  );
}

const emptyMultilingual: Record<string, string> = {};

export default function EditPropertyPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;
  const propertyId = Number(id);
  const api = useApi();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [tenantLanguages, setTenantLanguages] = useState<string[]>([]);
  const [propertySource, setPropertySource] = useState<string>('manual');
  const [activeTab, setActiveTab] = useState('basic');
  const [contentLang, setContentLang] = useState('en');
  const [seoLang, setSeoLang] = useState('en');

  const [locations, setLocations] = useState<Location[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [allFeatures, setAllFeatures] = useState<Feature[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [images, setImages] = useState<MediaFileItem[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [formData, setFormData] = useState<FormData>({
    reference: '', agentReference: '', listingType: 'sale', propertyTypeId: '', locationId: '',
    urbanization: '', status: 'draft', price: '', priceTo: '', currency: 'EUR', priceOnRequest: false,
    bedrooms: '', bedroomsTo: '', bathrooms: '', bathroomsTo: '', buildSize: '', buildSizeTo: '',
    plotSize: '', plotSizeTo: '', terraceSize: '', terraceSizeTo: '', gardenSize: '',
    solariumSize: '', title: { ...emptyMultilingual }, description: { ...emptyMultilingual },
    features: [], videoUrl: '', virtualTourUrl: '', floorPlanUrl: '', lat: '', lng: '',
    geoLocationLabel: '', isFeatured: false, isPublished: false, floor: '', street: '',
    streetNumber: '', postcode: '', cadastralReference: '', communityFees: '', basuraTax: '',
    ibiFees: '', commission: '', sharedCommission: false, builtYear: '', energyConsumption: '',
    distanceToBeach: '', externalLink: '', blogUrl: '', mapLink: '', websiteUrl: '', slug: '',
    metaTitle: { ...emptyMultilingual }, metaDescription: { ...emptyMultilingual },
    metaKeywords: { ...emptyMultilingual }, pageTitle: { ...emptyMultilingual },
    agentId: '', salesAgentId: '', project: '', isOwnProperty: false, villaSelection: false,
    luxurySelection: false, apartmentSelection: false, deliveryDate: '', completionDate: '',
    propertyTypeReference: '', syncEnabled: true,
  });

  useEffect(() => {
    if (!api.isReady) return;
    async function fetchData() {
      try {
        const [propertyRes, locationsRes, typesRes, featuresRes, teamRes, filesRes, tenantRes] =
          await Promise.all([
            api.get(`/api/dashboard/properties/${id}`),
            api.get('/api/dashboard/locations'),
            api.get('/api/dashboard/property-types'),
            api.get('/api/dashboard/features'),
            api.get('/api/dashboard/team'),
            api.get(`/api/dashboard/upload/property/${id}`),
            api.get('/api/dashboard/tenant'),
          ].map(p => p.catch(() => null)));

        const property = propertyRes?.data || propertyRes;
        const locs = locationsRes?.data || locationsRes;
        const types = typesRes?.data || typesRes;
        const feats = featuresRes?.data || featuresRes;
        const team = teamRes?.data || teamRes;
        const files = filesRes?.data || filesRes;
        const tenant = tenantRes?.data || tenantRes;

        if (tenant?.settings?.languages?.length > 1) {
          setTenantLanguages(tenant.settings.languages);
        }

        if (Array.isArray(locs)) setLocations(locs);
        if (Array.isArray(types)) setPropertyTypes(types);
        if (Array.isArray(feats)) setAllFeatures(feats);
        if (Array.isArray(team)) setTeamMembers(team);
        if (Array.isArray(files)) {
          setImages(files.map((f: any) => ({
            id: f.id,
            url: f.url,
            originalFilename: f.originalFilename,
            sortOrder: f.sortOrder,
          })));
        }

        if (property) {
          setPropertySource(property.source || 'manual');
          const str = (v: any) => (v != null ? String(v) : '');
          const dateStr = (v: any) => (v ? v.substring(0, 10) : '');
          const ml = (v: any) => v || { ...emptyMultilingual };
          setFormData({
            reference: property.reference || '',
            agentReference: property.agentReference || '',
            listingType: property.listingType || 'sale',
            propertyTypeId: str(property.propertyTypeId),
            locationId: str(property.locationId),
            urbanization: property.urbanization || '',
            status: property.status || 'draft',
            price: str(property.price),
            priceTo: str(property.priceTo),
            currency: property.currency || 'EUR',
            priceOnRequest: property.priceOnRequest || false,
            bedrooms: str(property.bedrooms),
            bedroomsTo: str(property.bedroomsTo),
            bathrooms: str(property.bathrooms),
            bathroomsTo: str(property.bathroomsTo),
            buildSize: str(property.buildSize),
            buildSizeTo: str(property.buildSizeTo),
            plotSize: str(property.plotSize),
            plotSizeTo: str(property.plotSizeTo),
            terraceSize: str(property.terraceSize),
            terraceSizeTo: str(property.terraceSizeTo),
            gardenSize: str(property.gardenSize),
            solariumSize: str(property.solariumSize),
            title: ml(property.title),
            description: ml(property.description),
            features: Array.isArray(property.features)
              ? property.features.map((f: any) => (typeof f === 'object' ? f.id : f))
              : [],
            videoUrl: property.videoUrl || '',
            virtualTourUrl: property.virtualTourUrl || '',
            floorPlanUrl: property.floorPlanUrl || '',
            lat: str(property.lat),
            lng: str(property.lng),
            geoLocationLabel: property.geoLocationLabel || '',
            isFeatured: property.isFeatured || false,
            isPublished: property.isPublished || false,
            floor: property.floor || '',
            street: property.street || '',
            streetNumber: property.streetNumber || '',
            postcode: property.postcode || '',
            cadastralReference: property.cadastralReference || '',
            communityFees: str(property.communityFees),
            basuraTax: str(property.basuraTax),
            ibiFees: str(property.ibiFees),
            commission: str(property.commission),
            sharedCommission: property.sharedCommission || false,
            builtYear: str(property.builtYear),
            energyConsumption: str(property.energyConsumption),
            distanceToBeach: str(property.distanceToBeach),
            externalLink: property.externalLink || '',
            blogUrl: property.blogUrl || '',
            mapLink: property.mapLink || '',
            websiteUrl: property.websiteUrl || '',
            slug: property.slug || '',
            metaTitle: ml(property.metaTitle),
            metaDescription: ml(property.metaDescription),
            metaKeywords: ml(property.metaKeywords),
            pageTitle: ml(property.pageTitle),
            agentId: str(property.agentId),
            salesAgentId: str(property.salesAgentId),
            project: property.project || '',
            isOwnProperty: property.isOwnProperty || false,
            villaSelection: property.villaSelection || false,
            luxurySelection: property.luxurySelection || false,
            apartmentSelection: property.apartmentSelection || false,
            deliveryDate: dateStr(property.deliveryDate),
            completionDate: dateStr(property.completionDate),
            propertyTypeReference: property.propertyTypeReference || '',
            syncEnabled: property.syncEnabled !== false,
          });
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to load property data.', variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, api.isReady]);

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

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
        ? prev.features.filter((fid) => fid !== featureId)
        : [...prev.features, featureId],
    }));
  };

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const tempId = Math.random().toString(36).substring(7);
      const localUrl = URL.createObjectURL(file);

      setImages((prev) => [
        ...prev,
        { id: -1, url: localUrl, originalFilename: file.name, sortOrder: prev.length, isUploading: true, tempId },
      ]);

      try {
        const formPayload = new FormData();
        formPayload.append('file', file);
        const result = await api.post(`/api/dashboard/upload?propertyId=${propertyId}`, formPayload);
        const uploaded = result.data || result;
        URL.revokeObjectURL(localUrl);
        setImages((prev) =>
          prev.map((img) =>
            img.tempId === tempId
              ? { id: uploaded.id, url: uploaded.url, originalFilename: uploaded.originalFilename, sortOrder: img.sortOrder }
              : img
          )
        );
      } catch {
        setImages((prev) => prev.filter((img) => img.tempId !== tempId));
        toast({ title: 'Upload failed', description: `Failed to upload ${file.name}`, variant: 'destructive' });
      }
    }
    e.target.value = '';
  }, [api, toast, propertyId]);

  const handleRemoveImage = useCallback(async (fileId: number) => {
    try {
      await api.delete(`/api/dashboard/upload/${fileId}`);
      setImages((prev) => prev.filter((img) => img.id !== fileId));
    } catch {
      toast({ title: 'Error', description: 'Failed to delete image.', variant: 'destructive' });
    }
  }, [api, toast]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setImages((prev) => {
      const oldIndex = prev.findIndex((img) => img.id === active.id);
      const newIndex = prev.findIndex((img) => img.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      // Persist new order to server
      const fileIds = reordered.map((img) => img.id);
      api.put(`/api/dashboard/upload/property/${propertyId}/order`, { fileIds }).catch(() => {
        toast({ title: 'Error', description: 'Failed to save image order.', variant: 'destructive' });
      });
      return reordered;
    });
  }, [api, propertyId, toast]);

  const handleTranslate = async () => {
    if (tenantLanguages.length < 2) {
      toast({ title: 'Multiple languages required', description: 'Enable at least 2 languages in Settings → General to use AI translation.', variant: 'destructive' });
      return;
    }
    setIsTranslating(true);
    try {
      const res = await api.post(`/api/dashboard/translate/property/${propertyId}`, {
        targetLanguages: tenantLanguages,
      });
      const translated = (res as any)?.data || res;
      if (translated) {
        const multiFields: MultilingualField[] = ['title', 'description', 'metaTitle', 'metaDescription', 'metaKeywords', 'pageTitle'];
        const updates: Partial<FormData> = {};
        for (const field of multiFields) {
          if (translated[field]) {
            updates[field] = translated[field];
          }
        }
        setFormData((prev) => ({ ...prev, ...updates }));
      }
      toast({ title: 'Translation complete', description: `Translated to ${tenantLanguages.length - 1} language(s). Review and save to keep changes.` });
    } catch (err) {
      toast({ title: 'Translation failed', description: (err as any)?.response?.data?.message || (err as Error).message || 'Unexpected error', variant: 'destructive' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: Record<string, any> = {
        listingType: formData.listingType,
        status: formData.status,
        currency: formData.currency,
        priceOnRequest: formData.priceOnRequest,
        isFeatured: formData.isFeatured,
        isPublished: formData.isPublished,
        title: formData.title,
        description: formData.description,
        features: formData.features,
        sharedCommission: formData.sharedCommission,
        isOwnProperty: formData.isOwnProperty,
        villaSelection: formData.villaSelection,
        luxurySelection: formData.luxurySelection,
        apartmentSelection: formData.apartmentSelection,
        syncEnabled: formData.syncEnabled,
      };

      if (propertySource === 'manual') payload.reference = formData.reference;

      const stringFields = [
        'agentReference', 'urbanization', 'floor', 'street', 'streetNumber',
        'postcode', 'cadastralReference', 'videoUrl', 'virtualTourUrl',
        'floorPlanUrl', 'externalLink', 'blogUrl', 'mapLink', 'websiteUrl',
        'slug', 'project', 'geoLocationLabel', 'propertyTypeReference',
      ];
      for (const f of stringFields) {
        const val = formData[f as keyof FormData];
        if (val !== undefined) payload[f] = val || undefined;
      }

      const numberFields = [
        'price', 'priceTo', 'bedrooms', 'bedroomsTo', 'bathrooms', 'bathroomsTo',
        'buildSize', 'buildSizeTo', 'plotSize', 'plotSizeTo',
        'terraceSize', 'terraceSizeTo', 'gardenSize', 'solariumSize',
        'communityFees', 'basuraTax', 'ibiFees', 'commission', 'builtYear',
        'energyConsumption', 'distanceToBeach', 'lat', 'lng',
      ];
      for (const f of numberFields) {
        const val = formData[f as keyof FormData];
        if (val !== '' && val !== undefined) payload[f] = Number(val);
      }

      if (formData.propertyTypeId) payload.propertyTypeId = Number(formData.propertyTypeId);
      if (formData.locationId) payload.locationId = Number(formData.locationId);
      if (formData.agentId) payload.agentId = Number(formData.agentId);
      else payload.agentId = null;
      if (formData.salesAgentId) payload.salesAgentId = Number(formData.salesAgentId);
      else payload.salesAgentId = null;

      if (formData.deliveryDate) payload.deliveryDate = formData.deliveryDate;
      if (formData.completionDate) payload.completionDate = formData.completionDate;

      const seoFields: MultilingualField[] = ['metaTitle', 'metaDescription', 'metaKeywords', 'pageTitle'];
      for (const f of seoFields) {
        const obj = formData[f] as Record<string, string>;
        payload[f] = Object.values(obj).some(v => v) ? obj : undefined;
      }

      // Sync images JSON on property
      if (images.length > 0) {
        payload.images = images
          .filter((img) => img.id > 0)
          .map((img, idx) => ({ url: img.url, order: idx, alt: '' }));
      } else {
        payload.images = null;
      }

      await api.put(`/api/dashboard/properties/${id}`, payload);

      toast({ title: 'Property updated', description: 'Your changes have been saved successfully.' });
      router.push(`/dashboard/properties/${id}`);
    } catch {
      toast({ title: 'Error', description: 'Failed to update property. Please try again.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const detailUrl = `/dashboard/properties/${id}`;

  const featuresByCategory = allFeatures.reduce(
    (acc, feature) => {
      const cat = feature.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(feature);
      return acc;
    },
    {} as Record<string, Feature[]>
  );

  const featureCategories = ['interior', 'exterior', 'community', 'climate', 'views', 'security', 'parking', 'other'];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={detailUrl}><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Property {formData.reference || id}</h1>
            <p className="text-muted-foreground">Update property details</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={detailUrl}><Button variant="outline"><X className="h-4 w-4 mr-2" /> Cancel</Button></Link>
          {tenantLanguages.length > 1 && (
            <Button variant="outline" onClick={handleTranslate} disabled={isTranslating || isLoading}>
              {isTranslating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Languages className="h-4 w-4 mr-2" />}
              {isTranslating ? 'Translating…' : 'AI Translate'}
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="media">Media Links</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Basic Info */}
        <TabsContent value="basic" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Basic Info</CardTitle><CardDescription>Reference, listing type, status, and classification</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference</Label>
                  <Input id="reference" value={formData.reference} onChange={(e) => handleInputChange('reference', e.target.value)} readOnly={propertySource !== 'manual'} maxLength={50} className={propertySource !== 'manual' ? 'bg-muted' : ''} />
                  {propertySource !== 'manual' && <p className="text-xs text-muted-foreground">Read-only (sourced externally)</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agentReference">Agent Reference</Label>
                  <Input id="agentReference" value={formData.agentReference} onChange={(e) => handleInputChange('agentReference', e.target.value)} maxLength={100} placeholder="Agent ref" />
                </div>
                <div className="space-y-2">
                  <Label>Listing Type</Label>
                  <Select value={formData.listingType} onValueChange={(v) => handleInputChange('listingType', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sale">For Sale</SelectItem>
                      <SelectItem value="rent">For Rent</SelectItem>
                      <SelectItem value="holiday_rent">Holiday Rent</SelectItem>
                      <SelectItem value="development">Development</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => handleInputChange('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="sold">Sold</SelectItem>
                      <SelectItem value="rented">Rented</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Property Type</Label>
                  <Select value={formData.propertyTypeId} onValueChange={(v) => handleInputChange('propertyTypeId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {propertyTypes.map((type) => (<SelectItem key={type.id} value={String(type.id)}>{displayName(type.name)}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select value={formData.locationId} onValueChange={(v) => handleInputChange('locationId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (<SelectItem key={loc.id} value={String(loc.id)}>{displayName(loc.name)}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="urbanization">Urbanization</Label>
                  <Input id="urbanization" value={formData.urbanization} onChange={(e) => handleInputChange('urbanization', e.target.value)} placeholder="e.g., La Zagaleta" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project">Project</Label>
                  <Input id="project" value={formData.project} onChange={(e) => handleInputChange('project', e.target.value)} placeholder="e.g., Beach Residences" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="propertyTypeReference">Property Type Reference</Label>
                  <Input id="propertyTypeReference" value={formData.propertyTypeReference} onChange={(e) => handleInputChange('propertyTypeReference', e.target.value)} placeholder="External type code" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="priceOnRequest" checked={formData.priceOnRequest} onCheckedChange={(c) => handleInputChange('priceOnRequest', !!c)} />
                <Label htmlFor="priceOnRequest">Price on Request</Label>
              </div>
              {!formData.priceOnRequest && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2"><Label htmlFor="price">Price From</Label><Input id="price" type="number" placeholder="250000" value={formData.price} onChange={(e) => handleInputChange('price', e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="priceTo">Price To</Label><Input id="priceTo" type="number" placeholder="500000" value={formData.priceTo} onChange={(e) => handleInputChange('priceTo', e.target.value)} /></div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={formData.currency} onValueChange={(v) => handleInputChange('currency', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="EUR">EUR</SelectItem><SelectItem value="GBP">GBP</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Agent / Assignment</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Agent</Label>
                  <Select value={formData.agentId || 'none'} onValueChange={(v) => handleInputChange('agentId', v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">&mdash; None &mdash;</SelectItem>
                      {teamMembers.map((m) => (<SelectItem key={m.id} value={m.id.toString()}>{m.name || m.email}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sales Agent</Label>
                  <Select value={formData.salesAgentId || 'none'} onValueChange={(v) => handleInputChange('salesAgentId', v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Select sales agent" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">&mdash; None &mdash;</SelectItem>
                      {teamMembers.map((m) => (<SelectItem key={m.id} value={m.id.toString()}>{m.name || m.email}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Description with language dropdown */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Languages className="h-5 w-5" /> Content</CardTitle>
                  <CardDescription>Title and description in multiple languages</CardDescription>
                </div>
                <LanguageSelect value={contentLang} onChange={setContentLang} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <MultilingualInput label="Title" lang={contentLang} value={formData.title} onChange={(lang, val) => handleMultilingualChange('title', lang, val)} />
              <MultilingualTextarea label="Description" lang={contentLang} value={formData.description} onChange={(lang, val) => handleMultilingualChange('description', lang, val)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Details */}
        <TabsContent value="details" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Dimensions & Building</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                {[
                  ['bedrooms', 'bedroomsTo', 'Bedrooms'],
                  ['bathrooms', 'bathroomsTo', 'Bathrooms'],
                  ['buildSize', 'buildSizeTo', 'Build Size (m²)'],
                  ['plotSize', 'plotSizeTo', 'Plot Size (m²)'],
                  ['terraceSize', 'terraceSizeTo', 'Terrace (m²)'],
                ].map(([from, to, label]) => (
                  <div key={from} className="space-y-2 md:col-span-2">
                    <Label>{label}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" placeholder="From" value={formData[from as keyof FormData] as string} onChange={(e) => handleInputChange(from, e.target.value)} />
                      <Input type="number" placeholder="To" value={formData[to as keyof FormData] as string} onChange={(e) => handleInputChange(to, e.target.value)} />
                    </div>
                  </div>
                ))}
                {[
                  ['gardenSize', 'Garden (m²)'], ['solariumSize', 'Solarium (m²)'], ['builtYear', 'Built Year'],
                  ['energyConsumption', 'Energy (kWh/m²)'], ['distanceToBeach', 'Distance to Beach (m)'],
                ].map(([field, label]) => (
                  <div key={field} className="space-y-2"><Label>{label}</Label><Input type="number" value={formData[field as keyof FormData] as string} onChange={(e) => handleInputChange(field, e.target.value)} /></div>
                ))}
                <div className="space-y-2"><Label>Delivery Date</Label><Input type="date" value={formData.deliveryDate} onChange={(e) => handleInputChange('deliveryDate', e.target.value)} /></div>
                <div className="space-y-2"><Label>Completion Date</Label><Input type="date" value={formData.completionDate} onChange={(e) => handleInputChange('completionDate', e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Address */}
        <TabsContent value="address" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Property Address</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[['street', 'Street', 'Calle del Valle'], ['streetNumber', 'Street No.', '12'], ['floor', 'Floor', '3A'], ['postcode', 'Postcode', '29660'], ['cadastralReference', 'Cadastral Reference', '1234567AB1234C0001XX']].map(([field, label, ph]) => (
                  <div key={field} className="space-y-2"><Label>{label}</Label><Input value={formData[field as keyof FormData] as string} onChange={(e) => handleInputChange(field, e.target.value)} placeholder={ph} /></div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financial */}
        <TabsContent value="financial" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Fees & Taxes</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[['communityFees', 'Community Fees (€/month)', '450'], ['basuraTax', 'Basura Tax (€/year)', '120'], ['ibiFees', 'IBI Fees (€/year)', '3200'], ['commission', 'Commission (%)', '5.00']].map(([field, label, ph]) => (
                  <div key={field} className="space-y-2"><Label>{label}</Label><Input type="number" step={field === 'commission' ? '0.01' : undefined} value={formData[field as keyof FormData] as string} onChange={(e) => handleInputChange(field, e.target.value)} placeholder={ph} /></div>
                ))}
                <div className="flex items-end pb-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="sharedCommission" checked={formData.sharedCommission} onCheckedChange={(c) => handleInputChange('sharedCommission', !!c)} />
                    <Label htmlFor="sharedCommission">Shared Commission</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features */}
        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Property Features</CardTitle></CardHeader>
            <CardContent>
              {Object.keys(featuresByCategory).length === 0 ? (
                <p className="text-sm text-muted-foreground">No features available.</p>
              ) : (
                <div className="space-y-6">
                  {featureCategories.map((category) => {
                    const catFeatures = featuresByCategory[category];
                    if (!catFeatures?.length) return null;
                    return (
                      <div key={category}>
                        <h4 className="font-medium capitalize mb-3">{category}</h4>
                        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                          {catFeatures.map((feature) => (
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
              <CardTitle>Property Images</CardTitle>
              <CardDescription>Upload images and drag to reorder. The first image becomes the main photo.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, WebP up to 10MB</p>
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
                    <p>No images uploaded yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Media Links */}
        <TabsContent value="media" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Media & Link URLs</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ['videoUrl', 'Video URL', 'https://youtube.com/...'], ['virtualTourUrl', 'Virtual Tour URL', 'https://matterport.com/...'],
                  ['floorPlanUrl', 'Floor Plan URL', 'https://...'], ['externalLink', 'External Link', 'https://...'],
                  ['blogUrl', 'Blog URL', 'https://blog.example.com/...'], ['mapLink', 'Map Link', 'https://maps.google.com/...'],
                  ['websiteUrl', 'Website URL', 'https://yoursite.com/...'],
                ].map(([field, label, ph]) => (
                  <div key={field} className="space-y-2"><Label>{label}</Label><Input value={formData[field as keyof FormData] as string} onChange={(e) => handleInputChange(field, e.target.value)} placeholder={ph} /></div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Location */}
        <TabsContent value="location" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Coordinates</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2"><Label>Latitude</Label><Input type="number" step="any" value={formData.lat} onChange={(e) => handleInputChange('lat', e.target.value)} /></div>
                <div className="space-y-2"><Label>Longitude</Label><Input type="number" step="any" value={formData.lng} onChange={(e) => handleInputChange('lng', e.target.value)} /></div>
                <div className="space-y-2"><Label>Location Label</Label><Input value={formData.geoLocationLabel} onChange={(e) => handleInputChange('geoLocationLabel', e.target.value)} placeholder="Nueva Andalucia, Marbella" /></div>
              </div>
              <div className="aspect-video rounded-lg border bg-muted flex items-center justify-center">
                <p className="text-muted-foreground">Map integration will be displayed here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEO */}
        <TabsContent value="seo" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>SEO Settings</CardTitle>
                  <CardDescription>Search engine optimization fields</CardDescription>
                </div>
                <LanguageSelect value={seoLang} onChange={setSeoLang} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={formData.slug} onChange={(e) => handleInputChange('slug', e.target.value)} placeholder="luxury-villa-nueva-andalucia" />
                <p className="text-xs text-muted-foreground">Leave empty to use the default format from Settings. Enter a custom slug to override for this property only.</p>
              </div>
              <MultilingualInput label="Page Title" lang={seoLang} value={formData.pageTitle} onChange={(lang, val) => handleMultilingualChange('pageTitle', lang, val)} />
              <MultilingualInput label="Meta Title" lang={seoLang} value={formData.metaTitle} onChange={(lang, val) => handleMultilingualChange('metaTitle', lang, val)} />
              <MultilingualTextarea label="Meta Description" lang={seoLang} value={formData.metaDescription} onChange={(lang, val) => handleMultilingualChange('metaDescription', lang, val)} rows={3} />
              <MultilingualInput label="Meta Keywords" lang={seoLang} value={formData.metaKeywords} onChange={(lang, val) => handleMultilingualChange('metaKeywords', lang, val)} placeholder="Keywords separated by commas" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Visibility & Flags</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                ['isFeatured', 'Featured Property', 'Appears at top of search results'],
                ['isPublished', 'Published', 'Visible on public website'],
                ['isOwnProperty', 'Own Property', ''],
                ['villaSelection', 'Villa Selection', ''],
                ['luxurySelection', 'Luxury Selection', ''],
                ['apartmentSelection', 'Apartment Selection', ''],
              ].map(([field, label, desc]) => (
                <div key={field} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{label}</Label>
                    {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
                  </div>
                  <Switch checked={formData[field as keyof FormData] as boolean} onCheckedChange={(c) => handleInputChange(field, c)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Feed Sync</CardTitle>
              <CardDescription>
                {propertySource !== 'manual'
                  ? <>Imported from <span className="font-medium capitalize">{propertySource}</span>. Control whether feed imports can update this property.</>
                  : 'Control whether feed imports can overwrite this property if a matching record is found.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Feed Sync</Label>
                  <p className="text-xs text-muted-foreground">
                    When turned off, this property will be skipped during feed imports — your manual edits will be preserved.
                  </p>
                </div>
                <Switch
                  checked={formData.syncEnabled}
                  onCheckedChange={(c) => handleInputChange('syncEnabled', c)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-end gap-2 pb-8">
        <Link href={detailUrl}><Button variant="outline">Cancel</Button></Link>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
