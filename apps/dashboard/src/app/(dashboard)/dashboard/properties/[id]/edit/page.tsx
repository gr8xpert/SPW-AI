'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import type { Property } from '@spm/shared';
import { Button } from '@/components/ui/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Save, X, Languages, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { propertyKeys } from '@/hooks/use-tenant-query-scope';
import type {
  FeatureOption,
  FieldChangeHandler,
  LocationOption,
  MultilingualChangeHandler,
  PropertyFormData,
  PropertyTypeOption,
  TeamMember,
} from './_components/types';
import { EMPTY_FORM, buildUpdatePayload, propertyToForm } from './_components/form-mapping';
import { usePropertyImages } from './_components/use-property-images';
import { usePropertyAi } from './_components/use-property-ai';
import { BasicInfoTab } from './_components/basic-info-tab';
import { AddressTab, DetailsTab, FeaturesTab, FinancialTab, LocationTab } from './_components/detail-tabs';
import { ImagesTab } from './_components/images-tab';
import { MediaTab } from './_components/media-tab';
import { SeoTab } from './_components/seo-tab';
import { SettingsTab } from './_components/settings-tab';

export default function EditPropertyPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = params.id as string;
  const propertyId = Number(id);
  const api = useApi();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingFloorPlan, setIsUploadingFloorPlan] = useState(false);
  const [useCustomSchema, setUseCustomSchema] = useState(false);
  const [tenantLanguages, setTenantLanguages] = useState<string[]>([]);
  const [propertySource, setPropertySource] = useState<string>('manual');
  const [activeTab, setActiveTab] = useState('basic');
  const [contentLang, setContentLang] = useState('en');
  const [seoLang, setSeoLang] = useState('en');

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyTypeOption[]>([]);
  const [allFeatures, setAllFeatures] = useState<FeatureOption[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [formData, setFormData] = useState<PropertyFormData>(EMPTY_FORM);

  const photos = usePropertyImages({ api, toast, propertyId });
  const ai = usePropertyAi({ api, toast, propertyId, tenantLanguages, setFormData, setUseCustomSchema });

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

        const property: Property | null = propertyRes?.data || propertyRes;
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
        photos.load(property?.images, files);

        if (property) {
          setPropertySource(property.source || 'manual');
          setFormData(propertyToForm(property));
          setUseCustomSchema(!!(property.seoSchemaJson && String(property.seoSchemaJson).trim().length > 0));
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

  const handleInputChange: FieldChangeHandler = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleMultilingualChange: MultilingualChangeHandler = (field, lang, value) => {
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

  const handleFloorPlansChange = (update: (prev: PropertyFormData['floorPlans']) => PropertyFormData['floorPlans']) => {
    setFormData((prev) => ({ ...prev, floorPlans: update(prev.floorPlans) }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const built = buildUpdatePayload(formData, {
        propertySource,
        useCustomSchema,
        images: photos.imagesForSave(),
      });
      if (!built.ok) {
        setIsSaving(false);
        toast({ title: 'Invalid JSON-LD schema', description: 'The SEO Schema block is not valid JSON. Fix or turn off the custom schema toggle.', variant: 'destructive' });
        return;
      }

      await api.put(`/api/dashboard/properties/${id}`, built.payload);

      toast({ title: 'Property updated', description: 'Your changes have been saved successfully.' });
      // The properties list is cached; make it show the saved values.
      void queryClient.invalidateQueries({ queryKey: propertyKeys.all });
      router.push(`/dashboard/properties/${id}`);
    } catch {
      toast({ title: 'Error', description: 'Failed to update property. Please try again.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const detailUrl = `/dashboard/properties/${id}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const section = { formData, onChange: handleInputChange };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Link href={detailUrl}><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="page-title">Edit Property {formData.reference || id}</h1>
            <p className="page-description mt-1">Update property details</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={detailUrl}><Button variant="outline"><X className="h-4 w-4 mr-2" /> Cancel</Button></Link>
          {tenantLanguages.length > 1 && (
            <Button variant="outline" onClick={ai.handleTranslate} disabled={ai.isTranslating || isLoading} title={ai.aiLocked ? 'AI Translation is a premium add-on — contact your account manager to unlock' : undefined}>
              {ai.isTranslating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : ai.aiLocked ? <Lock className="h-4 w-4 mr-2" /> : <Languages className="h-4 w-4 mr-2" />}
              {ai.isTranslating ? 'Translating…' : 'AI Translate'}
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving} className="shadow-sm">
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

        <BasicInfoTab
          {...section}
          onMultilingualChange={handleMultilingualChange}
          propertySource={propertySource}
          propertyTypes={propertyTypes}
          locations={locations}
          teamMembers={teamMembers}
          contentLang={contentLang}
          onContentLangChange={setContentLang}
        />
        <DetailsTab {...section} />
        <AddressTab {...section} />
        <FinancialTab {...section} />
        <FeaturesTab selected={formData.features} allFeatures={allFeatures} onToggle={handleFeatureToggle} />
        <ImagesTab
          images={photos.images}
          onUpload={photos.handleImageUpload}
          onRemove={photos.handleRemoveImage}
          onDragEnd={photos.handleDragEnd}
        />
        <MediaTab
          {...section}
          onFloorPlansChange={handleFloorPlansChange}
          isUploadingFloorPlan={isUploadingFloorPlan}
          setIsUploadingFloorPlan={setIsUploadingFloorPlan}
          api={api}
          toast={toast}
        />
        <LocationTab {...section} />
        <SeoTab
          {...section}
          onMultilingualChange={handleMultilingualChange}
          seoLang={seoLang}
          onSeoLangChange={setSeoLang}
          aiLocked={ai.aiLocked}
          disabled={isLoading}
          isGeneratingSeo={ai.isGeneratingSeo}
          onGenerateSeo={ai.handleGenerateSeo}
          isGeneratingSchema={ai.isGeneratingSchema}
          onGenerateSchema={ai.handleGenerateSchema}
          useCustomSchema={useCustomSchema}
          onUseCustomSchemaChange={setUseCustomSchema}
        />
        <SettingsTab {...section} propertySource={propertySource} />
      </Tabs>

      <div className="flex items-center justify-end gap-2 pb-8">
        <Link href={detailUrl}><Button variant="outline">Cancel</Button></Link>
        <Button onClick={handleSave} disabled={isSaving} className="shadow-sm">
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
