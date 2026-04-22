'use client';

import { useEffect, useState } from 'react';
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
import { ArrowLeft, Loader2, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';

interface PropertyType {
  id: number;
  name: Record<string, string> | string;
}

interface Location {
  id: number;
  name: Record<string, string> | string;
  level?: string;
}

interface Feature {
  id: number;
  name: Record<string, string> | string;
  category?: string;
}

function displayName(name: Record<string, string> | string): string {
  if (typeof name === 'string') return name;
  return name?.en || name?.es || Object.values(name)[0] || '';
}

interface FormData {
  reference: string;
  agentReference: string;
  listingType: string;
  propertyTypeId: string;
  locationId: string;
  status: string;
  price: string;
  currency: string;
  priceOnRequest: boolean;
  bedrooms: string;
  bathrooms: string;
  buildSize: string;
  plotSize: string;
  terraceSize: string;
  gardenSize: string;
  title: Record<string, string>;
  description: Record<string, string>;
  features: number[];
  videoUrl: string;
  virtualTourUrl: string;
  floorPlanUrl: string;
  lat: string;
  lng: string;
  isFeatured: boolean;
  isPublished: boolean;
}

export default function EditPropertyPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const api = useApi();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [propertySource, setPropertySource] = useState<string>('manual');

  const [locations, setLocations] = useState<Location[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [allFeatures, setAllFeatures] = useState<Feature[]>([]);

  const [formData, setFormData] = useState<FormData>({
    reference: '',
    agentReference: '',
    listingType: 'sale',
    propertyTypeId: '',
    locationId: '',
    status: 'draft',
    price: '',
    currency: 'EUR',
    priceOnRequest: false,
    bedrooms: '',
    bathrooms: '',
    buildSize: '',
    plotSize: '',
    terraceSize: '',
    gardenSize: '',
    title: { en: '', es: '' },
    description: { en: '', es: '' },
    features: [],
    videoUrl: '',
    virtualTourUrl: '',
    floorPlanUrl: '',
    lat: '',
    lng: '',
    isFeatured: false,
    isPublished: false,
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const [propertyRes, locationsRes, typesRes, featuresRes] =
          await Promise.all([
            api.get(`/api/dashboard/properties/${id}`),
            api.get('/api/dashboard/locations'),
            api.get('/api/dashboard/property-types'),
            api.get('/api/dashboard/features'),
          ].map(p => p.catch(() => null)));

        const property = propertyRes?.data || propertyRes;
        const locs = locationsRes?.data || locationsRes;
        const types = typesRes?.data || typesRes;
        const feats = featuresRes?.data || featuresRes;

        if (Array.isArray(locs)) setLocations(locs);
        if (Array.isArray(types)) setPropertyTypes(types);
        if (Array.isArray(feats)) setAllFeatures(feats);

        if (property) {
          setPropertySource(property.source || 'manual');
          setFormData({
            reference: property.reference || '',
            agentReference: property.agentReference || '',
            listingType: property.listingType || 'sale',
            propertyTypeId: property.propertyTypeId
              ? String(property.propertyTypeId)
              : '',
            locationId: property.locationId
              ? String(property.locationId)
              : '',
            status: property.status || 'draft',
            price: property.price != null ? String(property.price) : '',
            currency: property.currency || 'EUR',
            priceOnRequest: property.priceOnRequest || false,
            bedrooms:
              property.bedrooms != null ? String(property.bedrooms) : '',
            bathrooms:
              property.bathrooms != null ? String(property.bathrooms) : '',
            buildSize:
              property.buildSize != null ? String(property.buildSize) : '',
            plotSize:
              property.plotSize != null ? String(property.plotSize) : '',
            terraceSize:
              property.terraceSize != null
                ? String(property.terraceSize)
                : '',
            gardenSize:
              property.gardenSize != null
                ? String(property.gardenSize)
                : '',
            title: property.title || { en: '', es: '' },
            description: property.description || { en: '', es: '' },
            features: Array.isArray(property.features)
              ? property.features.map((f: any) =>
                  typeof f === 'object' ? f.id : f
                )
              : [],
            videoUrl: property.videoUrl || '',
            virtualTourUrl: property.virtualTourUrl || '',
            floorPlanUrl: property.floorPlanUrl || '',
            lat: property.lat != null ? String(property.lat) : '',
            lng: property.lng != null ? String(property.lng) : '',
            isFeatured: property.isFeatured || false,
            isPublished: property.isPublished || false,
          });
        }
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to load property data.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleMultilingualChange = (
    field: 'title' | 'description',
    lang: string,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: { ...prev[field], [lang]: value },
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
        videoUrl: formData.videoUrl || undefined,
        virtualTourUrl: formData.virtualTourUrl || undefined,
        floorPlanUrl: formData.floorPlanUrl || undefined,
      };

      if (propertySource === 'manual') {
        payload.reference = formData.reference;
      }

      if (formData.agentReference) {
        payload.agentReference = formData.agentReference;
      }

      if (formData.propertyTypeId) {
        payload.propertyTypeId = Number(formData.propertyTypeId);
      }
      if (formData.locationId) {
        payload.locationId = Number(formData.locationId);
      }
      if (formData.price) {
        payload.price = Number(formData.price);
      }
      if (formData.bedrooms) {
        payload.bedrooms = Number(formData.bedrooms);
      }
      if (formData.bathrooms) {
        payload.bathrooms = Number(formData.bathrooms);
      }
      if (formData.buildSize) {
        payload.buildSize = Number(formData.buildSize);
      }
      if (formData.plotSize) {
        payload.plotSize = Number(formData.plotSize);
      }
      if (formData.terraceSize) {
        payload.terraceSize = Number(formData.terraceSize);
      }
      if (formData.gardenSize) {
        payload.gardenSize = Number(formData.gardenSize);
      }
      if (formData.lat) {
        payload.lat = Number(formData.lat);
      }
      if (formData.lng) {
        payload.lng = Number(formData.lng);
      }

      await api.put(`/api/dashboard/properties/${id}`, payload);

      toast({
        title: 'Property updated',
        description: 'Your changes have been saved successfully.',
      });

      router.push(`/dashboard/properties/${id}`);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update property. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const detailUrl = `/dashboard/properties/${id}`;

  // Group features by category for display
  const featuresByCategory = allFeatures.reduce(
    (acc, feature) => {
      const cat = feature.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(feature);
      return acc;
    },
    {} as Record<string, Feature[]>
  );

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
          <Link href={detailUrl}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Edit Property {formData.reference || id}
            </h1>
            <p className="text-muted-foreground">
              Update property details
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={detailUrl}>
            <Button variant="outline">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </Link>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
          <CardDescription>
            Reference, listing type, status, and classification
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                value={formData.reference}
                onChange={(e) =>
                  handleInputChange('reference', e.target.value)
                }
                readOnly={propertySource !== 'manual'}
                maxLength={50}
                className={
                  propertySource !== 'manual' ? 'bg-muted' : ''
                }
              />
              {propertySource !== 'manual' && (
                <p className="text-xs text-muted-foreground">
                  Read-only (sourced externally)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="agentReference">Agent Reference</Label>
              <Input
                id="agentReference"
                value={formData.agentReference}
                onChange={(e) =>
                  handleInputChange('agentReference', e.target.value)
                }
                maxLength={100}
                placeholder="Agent ref"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="listingType">Listing Type</Label>
              <Select
                value={formData.listingType}
                onValueChange={(value) =>
                  handleInputChange('listingType', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">For Sale</SelectItem>
                  <SelectItem value="rent">For Rent</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  handleInputChange('status', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <Label htmlFor="propertyType">Property Type</Label>
              <Select
                value={formData.propertyTypeId}
                onValueChange={(value) =>
                  handleInputChange('propertyTypeId', value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {propertyTypes.map((type) => (
                    <SelectItem
                      key={type.id}
                      value={String(type.id)}
                    >
                      {displayName(type.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Select
                value={formData.locationId}
                onValueChange={(value) =>
                  handleInputChange('locationId', value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem
                      key={loc.id}
                      value={String(loc.id)}
                    >
                      {displayName(loc.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>
            Set the price for this property
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="priceOnRequest"
              checked={formData.priceOnRequest}
              onCheckedChange={(checked) =>
                handleInputChange('priceOnRequest', !!checked)
              }
            />
            <Label htmlFor="priceOnRequest">Price on Request</Label>
          </div>

          {!formData.priceOnRequest && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  type="number"
                  placeholder="500000"
                  value={formData.price}
                  onChange={(e) =>
                    handleInputChange('price', e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) =>
                    handleInputChange('currency', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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

      {/* Dimensions */}
      <Card>
        <CardHeader>
          <CardTitle>Dimensions</CardTitle>
          <CardDescription>
            Bedrooms, bathrooms, and property sizes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="bedrooms">Bedrooms</Label>
              <Input
                id="bedrooms"
                type="number"
                placeholder="3"
                value={formData.bedrooms}
                onChange={(e) =>
                  handleInputChange('bedrooms', e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms">Bathrooms</Label>
              <Input
                id="bathrooms"
                type="number"
                placeholder="2"
                value={formData.bathrooms}
                onChange={(e) =>
                  handleInputChange('bathrooms', e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buildSize">Build Size (m2)</Label>
              <Input
                id="buildSize"
                type="number"
                placeholder="250"
                value={formData.buildSize}
                onChange={(e) =>
                  handleInputChange('buildSize', e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plotSize">Plot Size (m2)</Label>
              <Input
                id="plotSize"
                type="number"
                placeholder="1000"
                value={formData.plotSize}
                onChange={(e) =>
                  handleInputChange('plotSize', e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="terraceSize">Terrace Size (m2)</Label>
              <Input
                id="terraceSize"
                type="number"
                placeholder="50"
                value={formData.terraceSize}
                onChange={(e) =>
                  handleInputChange('terraceSize', e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gardenSize">Garden Size (m2)</Label>
              <Input
                id="gardenSize"
                type="number"
                placeholder="200"
                value={formData.gardenSize}
                onChange={(e) =>
                  handleInputChange('gardenSize', e.target.value)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
          <CardDescription>
            Title and description in English and Spanish
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="titleEn">Title (EN)</Label>
              <Input
                id="titleEn"
                placeholder="Property title in English"
                value={formData.title.en || ''}
                onChange={(e) =>
                  handleMultilingualChange('title', 'en', e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="titleEs">Title (ES)</Label>
              <Input
                id="titleEs"
                placeholder="Property title in Spanish"
                value={formData.title.es || ''}
                onChange={(e) =>
                  handleMultilingualChange('title', 'es', e.target.value)
                }
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="descEn">Description (EN)</Label>
              <Textarea
                id="descEn"
                rows={6}
                placeholder="Property description in English"
                value={formData.description.en || ''}
                onChange={(e) =>
                  handleMultilingualChange(
                    'description',
                    'en',
                    e.target.value
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descEs">Description (ES)</Label>
              <Textarea
                id="descEs"
                rows={6}
                placeholder="Property description in Spanish"
                value={formData.description.es || ''}
                onChange={(e) =>
                  handleMultilingualChange(
                    'description',
                    'es',
                    e.target.value
                  )
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle>Features</CardTitle>
          <CardDescription>
            Select all features that apply to this property
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(featuresByCategory).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No features available.
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(featuresByCategory).map(
                ([category, features]) => (
                  <div key={category}>
                    <h4 className="font-medium capitalize mb-3">
                      {category}
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {features.map((feature) => (
                        <div
                          key={feature.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`feature-${feature.id}`}
                            checked={formData.features.includes(
                              feature.id
                            )}
                            onCheckedChange={() =>
                              handleFeatureToggle(feature.id)
                            }
                          />
                          <Label
                            htmlFor={`feature-${feature.id}`}
                            className="font-normal"
                          >
                            {displayName(feature.name)}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Media Links */}
      <Card>
        <CardHeader>
          <CardTitle>Media Links</CardTitle>
          <CardDescription>
            Video, virtual tour, and floor plan URLs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="videoUrl">Video URL</Label>
              <Input
                id="videoUrl"
                placeholder="https://youtube.com/watch?v=..."
                value={formData.videoUrl}
                onChange={(e) =>
                  handleInputChange('videoUrl', e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="virtualTourUrl">Virtual Tour URL</Label>
              <Input
                id="virtualTourUrl"
                placeholder="https://matterport.com/..."
                value={formData.virtualTourUrl}
                onChange={(e) =>
                  handleInputChange('virtualTourUrl', e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floorPlanUrl">Floor Plan URL</Label>
              <Input
                id="floorPlanUrl"
                placeholder="https://example.com/floorplan.pdf"
                value={formData.floorPlanUrl}
                onChange={(e) =>
                  handleInputChange('floorPlanUrl', e.target.value)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Visibility and promotion options
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isFeatured">Featured Property</Label>
              <p className="text-xs text-muted-foreground">
                Featured properties appear at the top of search results
              </p>
            </div>
            <Switch
              id="isFeatured"
              checked={formData.isFeatured}
              onCheckedChange={(checked) =>
                handleInputChange('isFeatured', checked)
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isPublished">Published</Label>
              <p className="text-xs text-muted-foreground">
                Published properties are visible on the public website
              </p>
            </div>
            <Switch
              id="isPublished"
              checked={formData.isPublished}
              onCheckedChange={(checked) =>
                handleInputChange('isPublished', checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Bottom Actions */}
      <div className="flex items-center justify-end gap-2 pb-8">
        <Link href={detailUrl}>
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
