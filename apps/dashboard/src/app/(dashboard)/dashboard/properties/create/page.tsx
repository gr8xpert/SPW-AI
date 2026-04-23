'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  { code: 'pt', label: 'Portuguese' },
  { code: 'ar', label: 'Arabic' },
];

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

interface TeamMember {
  id: number;
  name: string | null;
  email: string;
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
            <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">Main</div>
          )}
        </>
      )}
    </div>
  );
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
  const langLabel = LANGUAGES.find((l) => l.code === lang)?.label || lang.toUpperCase();
  return (
    <div className="space-y-2">
      <Label>{label} ({langLabel})</Label>
      <Input
        placeholder={placeholder || `${label} in ${langLabel}`}
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
  const langLabel = LANGUAGES.find((l) => l.code === lang)?.label || lang.toUpperCase();
  return (
    <div className="space-y-2">
      <Label>{label} ({langLabel})</Label>
      <Textarea
        placeholder={`${label} in ${langLabel}`}
        rows={rows}
        value={value[lang] || ''}
        onChange={(e) => onChange(lang, e.target.value)}
      />
    </div>
  );
}

export default function CreatePropertyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const api = useApi();
  const [activeTab, setActiveTab] = useState('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isAddTypeOpen, setIsAddTypeOpen] = useState(false);

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
          api.get('/api/dashboard/team'),
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
        toast({ title: 'Upload failed', description: `Failed to upload ${file.name}`, variant: 'destructive' });
      }
    }
    e.target.value = '';
  }, [api, toast]);

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
        'geoLocationLabel', 'propertyTypeReference',
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
        title: publish ? 'Property published' : 'Property saved',
        description: publish ? 'Your property is now live.' : 'Your property has been saved as a draft.',
      });

      router.push('/dashboard/properties');
    } catch {
      toast({ title: 'Error', description: 'Failed to create property. Please try again.', variant: 'destructive' });
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/properties">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Create Property</h1>
            <p className="text-muted-foreground">Add a new property to your portfolio</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" /> Save Draft
          </Button>
          <Button onClick={() => handleSave(true)} disabled={isSaving}>
            <Eye className="h-4 w-4 mr-2" /> Publish
          </Button>
        </div>
      </div>

      {/* Form */}
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
        </TabsList>

        {/* Basic Info Tab */}
        <TabsContent value="basic" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Property Information</CardTitle>
                <CardDescription>Basic details about the property</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference *</Label>
                  <Input id="reference" placeholder="e.g., PROP-001" value={formData.reference} onChange={(e) => handleInputChange('reference', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Listing Type *</Label>
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
                  <div className="flex items-center justify-between">
                    <Label>Property Type</Label>
                    <Dialog open={isAddTypeOpen} onOpenChange={setIsAddTypeOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm"><Plus className="h-3 w-3 mr-1" /> Add New</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Add Property Type</DialogTitle><DialogDescription>Create a new property type.</DialogDescription></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2"><Label>Name (English)</Label><Input placeholder="e.g., Duplex" /></div>
                          <div className="space-y-2"><Label>Name (Spanish)</Label><Input placeholder="e.g., Dúplex" /></div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAddTypeOpen(false)}>Cancel</Button>
                          <Button onClick={() => setIsAddTypeOpen(false)}>Add Type</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={formData.propertyTypeId} onValueChange={(v) => handleInputChange('propertyTypeId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {propertyTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id.toString()}>{displayName(type.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Location</Label>
                    <Dialog open={isAddLocationOpen} onOpenChange={setIsAddLocationOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm"><Plus className="h-3 w-3 mr-1" /> Add New</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Add Location</DialogTitle><DialogDescription>Create a new location.</DialogDescription></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2"><Label>Name</Label><Input placeholder="e.g., Golden Mile" /></div>
                          <div className="space-y-2">
                            <Label>Level</Label>
                            <Select defaultValue="area">
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="country">Country</SelectItem>
                                <SelectItem value="province">Province</SelectItem>
                                <SelectItem value="municipality">Municipality</SelectItem>
                                <SelectItem value="town">Town</SelectItem>
                                <SelectItem value="area">Area</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAddLocationOpen(false)}>Cancel</Button>
                          <Button onClick={() => setIsAddLocationOpen(false)}>Add Location</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={formData.locationId} onValueChange={(v) => handleInputChange('locationId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id.toString()}>{displayName(loc.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="urbanization">Urbanization</Label>
                  <Input id="urbanization" placeholder="e.g., La Zagaleta" value={formData.urbanization} onChange={(e) => handleInputChange('urbanization', e.target.value)} />
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
                  <Label htmlFor="project">Project</Label>
                  <Input id="project" placeholder="e.g., Beach Residences" value={formData.project} onChange={(e) => handleInputChange('project', e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Pricing</CardTitle>
                  <CardDescription>Set the price for this property</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="priceOnRequest" checked={formData.priceOnRequest} onCheckedChange={(c) => handleInputChange('priceOnRequest', c)} />
                    <Label htmlFor="priceOnRequest">Price on Request</Label>
                  </div>
                  {!formData.priceOnRequest && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="price">Price From</Label>
                        <Input id="price" type="number" placeholder="250000" value={formData.price} onChange={(e) => handleInputChange('price', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceTo">Price To</Label>
                        <Input id="priceTo" type="number" placeholder="500000" value={formData.priceTo} onChange={(e) => handleInputChange('priceTo', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Currency</Label>
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
                  <CardTitle>Agent / Assignment</CardTitle>
                  <CardDescription>Assign agents to this property</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Agent</Label>
                    <Select value={formData.agentId || 'none'} onValueChange={(v) => handleInputChange('agentId', v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {teamMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id.toString()}>{m.name || m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sales Agent</Label>
                    <Select value={formData.salesAgentId || 'none'} onValueChange={(v) => handleInputChange('salesAgentId', v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Select sales agent" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {teamMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id.toString()}>{m.name || m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="propertyTypeReference">Property Type Reference</Label>
                    <Input id="propertyTypeReference" placeholder="External type code" value={formData.propertyTypeReference} onChange={(e) => handleInputChange('propertyTypeReference', e.target.value)} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Selection & Flags</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {[
                    ['isFeatured', 'Featured Property'],
                    ['isOwnProperty', 'Own Property'],
                    ['villaSelection', 'Villa Selection'],
                    ['luxurySelection', 'Luxury Selection'],
                    ['apartmentSelection', 'Apartment Selection'],
                  ].map(([field, label]) => (
                    <div key={field} className="flex items-center space-x-2">
                      <Checkbox id={field} checked={formData[field as keyof typeof formData] as boolean} onCheckedChange={(c) => handleInputChange(field, c)} />
                      <Label htmlFor={field}>{label}</Label>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Multilingual Content */}
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

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Property Metrics</CardTitle>
              <CardDescription>Bedrooms, bathrooms, sizes, and building details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                {[
                  ['bedrooms', 'bedroomsTo', 'Bedrooms', '2', '4'],
                  ['bathrooms', 'bathroomsTo', 'Bathrooms', '1', '3'],
                  ['buildSize', 'buildSizeTo', 'Build Size (m²)', '150', '300'],
                  ['plotSize', 'plotSizeTo', 'Plot Size (m²)', '500', '2000'],
                  ['terraceSize', 'terraceSizeTo', 'Terrace (m²)', '30', '80'],
                ].map(([from, to, label, phFrom, phTo]) => (
                  <div key={from} className="space-y-2 md:col-span-2">
                    <Label>{label}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" placeholder={`From ${phFrom}`} value={formData[from as keyof typeof formData] as string} onChange={(e) => handleInputChange(from, e.target.value)} />
                      <Input type="number" placeholder={`To ${phTo}`} value={formData[to as keyof typeof formData] as string} onChange={(e) => handleInputChange(to, e.target.value)} />
                    </div>
                  </div>
                ))}
                {[
                  ['gardenSize', 'Garden (m²)', '200'],
                  ['solariumSize', 'Solarium (m²)', '30'],
                  ['builtYear', 'Built Year', '2020'],
                  ['energyConsumption', 'Energy (kWh/m²)', '85'],
                  ['distanceToBeach', 'Distance to Beach (m)', '500'],
                ].map(([field, label, ph]) => (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={field}>{label}</Label>
                    <Input id={field} type="number" placeholder={ph} value={formData[field as keyof typeof formData] as string} onChange={(e) => handleInputChange(field, e.target.value)} />
                  </div>
                ))}
                <div className="space-y-2">
                  <Label htmlFor="deliveryDate">Delivery Date</Label>
                  <Input id="deliveryDate" type="date" value={formData.deliveryDate} onChange={(e) => handleInputChange('deliveryDate', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="completionDate">Completion Date</Label>
                  <Input id="completionDate" type="date" value={formData.completionDate} onChange={(e) => handleInputChange('completionDate', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Address Tab */}
        <TabsContent value="address" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Property Address</CardTitle><CardDescription>Street address and registry details</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[
                  ['street', 'Street', 'Calle del Valle'],
                  ['streetNumber', 'Street No.', '12'],
                  ['floor', 'Floor', '3A'],
                  ['postcode', 'Postcode', '29660'],
                  ['cadastralReference', 'Cadastral Reference', '1234567AB1234C0001XX'],
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
            <CardHeader><CardTitle>Fees & Taxes</CardTitle><CardDescription>Community fees, taxes, and commission details</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[
                  ['communityFees', 'Community Fees (€/month)', '450'],
                  ['basuraTax', 'Basura Tax (€/year)', '120'],
                  ['ibiFees', 'IBI Fees (€/year)', '3200'],
                  ['commission', 'Commission (%)', '5.00'],
                ].map(([field, label, ph]) => (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={field}>{label}</Label>
                    <Input id={field} type="number" step={field === 'commission' ? '0.01' : undefined} placeholder={ph} value={formData[field as keyof typeof formData] as string} onChange={(e) => handleInputChange(field, e.target.value)} />
                  </div>
                ))}
                <div className="flex items-end pb-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="sharedCommission" checked={formData.sharedCommission} onCheckedChange={(c) => handleInputChange('sharedCommission', c)} />
                    <Label htmlFor="sharedCommission">Shared Commission</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Property Features</CardTitle><CardDescription>Select all features that apply</CardDescription></CardHeader>
            <CardContent>
              {Object.keys(featuresByCategory).length === 0 ? (
                <p className="text-sm text-muted-foreground">No features available.</p>
              ) : (
                <div className="space-y-6">
                  {featureCategories.map((category) => {
                    const categoryFeatures = featuresByCategory[category];
                    if (!categoryFeatures?.length) return null;
                    return (
                      <div key={category}>
                        <h4 className="font-medium capitalize mb-3">{category}</h4>
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

        {/* Media Links Tab */}
        <TabsContent value="media" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Videos, Links & URLs</CardTitle><CardDescription>Add external media and link URLs</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ['videoUrl', 'Video URL', 'https://youtube.com/watch?v=...'],
                  ['virtualTourUrl', 'Virtual Tour URL', 'https://matterport.com/...'],
                  ['externalLink', 'External Link', 'https://...'],
                  ['blogUrl', 'Blog URL', 'https://blog.example.com/...'],
                  ['mapLink', 'Map Link', 'https://maps.google.com/...'],
                  ['websiteUrl', 'Website URL', 'https://yoursite.com/property/...'],
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
            <CardHeader><CardTitle>Coordinates</CardTitle><CardDescription>Set the exact location on the map</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="lat">Latitude</Label>
                  <Input id="lat" type="number" step="any" placeholder="36.5126" value={formData.lat} onChange={(e) => handleInputChange('lat', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lng">Longitude</Label>
                  <Input id="lng" type="number" step="any" placeholder="-4.8829" value={formData.lng} onChange={(e) => handleInputChange('lng', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="geoLocationLabel">Location Label</Label>
                  <Input id="geoLocationLabel" placeholder="Nueva Andalucia, Marbella" value={formData.geoLocationLabel} onChange={(e) => handleInputChange('geoLocationLabel', e.target.value)} />
                </div>
              </div>
              <div className="aspect-video rounded-lg border bg-muted flex items-center justify-center">
                <p className="text-muted-foreground">Map integration will be displayed here</p>
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
                  <CardTitle>SEO Settings</CardTitle>
                  <CardDescription>Search engine optimization fields</CardDescription>
                </div>
                <LanguageSelect value={seoLang} onChange={setSeoLang} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" placeholder="luxury-villa-nueva-andalucia" value={formData.slug} onChange={(e) => handleInputChange('slug', e.target.value)} />
                <p className="text-xs text-muted-foreground">Leave empty to use the default format from Settings. Enter a custom slug to override for this property only.</p>
              </div>
              <MultilingualInput label="Page Title" lang={seoLang} value={formData.pageTitle} onChange={(lang, val) => handleMultilingualChange('pageTitle', lang, val)} />
              <MultilingualInput label="Meta Title" lang={seoLang} value={formData.metaTitle} onChange={(lang, val) => handleMultilingualChange('metaTitle', lang, val)} />
              <MultilingualTextarea label="Meta Description" lang={seoLang} value={formData.metaDescription} onChange={(lang, val) => handleMultilingualChange('metaDescription', lang, val)} rows={3} />
              <MultilingualInput label="Meta Keywords" lang={seoLang} value={formData.metaKeywords} onChange={(lang, val) => handleMultilingualChange('metaKeywords', lang, val)} placeholder="Keywords separated by commas" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
