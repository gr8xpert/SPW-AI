'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Sample data for dropdowns
const sampleLocations = [
  { id: 1, name: 'Marbella', level: 'town' },
  { id: 2, name: 'Estepona', level: 'town' },
  { id: 3, name: 'Benahavis', level: 'town' },
  { id: 4, name: 'Nueva Andalucia', level: 'area' },
  { id: 5, name: 'Puerto Banus', level: 'area' },
];

const samplePropertyTypes = [
  { id: 1, name: 'Villa' },
  { id: 2, name: 'Apartment' },
  { id: 3, name: 'Townhouse' },
  { id: 4, name: 'Penthouse' },
  { id: 5, name: 'Plot' },
];

const sampleFeatures = [
  { id: 1, name: 'Swimming Pool', category: 'exterior' },
  { id: 2, name: 'Garden', category: 'exterior' },
  { id: 3, name: 'Terrace', category: 'exterior' },
  { id: 4, name: 'Garage', category: 'parking' },
  { id: 5, name: 'Air Conditioning', category: 'climate' },
  { id: 6, name: 'Central Heating', category: 'climate' },
  { id: 7, name: 'Sea View', category: 'views' },
  { id: 8, name: 'Mountain View', category: 'views' },
  { id: 9, name: 'Security System', category: 'security' },
  { id: 10, name: 'Gym', category: 'community' },
  { id: 11, name: 'Spa', category: 'community' },
  { id: 12, name: 'Fireplace', category: 'interior' },
];

const featureCategories = [
  'interior',
  'exterior',
  'community',
  'climate',
  'views',
  'security',
  'parking',
];

interface UploadedImage {
  id: string;
  url: string;
  name: string;
  isUploading?: boolean;
}

export default function CreatePropertyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isAddTypeOpen, setIsAddTypeOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    reference: '',
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
    title: { en: '', es: '', de: '' },
    description: { en: '', es: '', de: '' },
    features: [] as number[],
    lat: '',
    lng: '',
    videoUrl: '',
    virtualTourUrl: '',
    isFeatured: false,
    isPublished: false,
  });

  const [images, setImages] = useState<UploadedImage[]>([]);
  const [activeLanguage, setActiveLanguage] = useState('en');

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
        ? prev.features.filter((id) => id !== featureId)
        : [...prev.features, featureId],
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const id = Math.random().toString(36).substring(7);
      const url = URL.createObjectURL(file);

      setImages((prev) => [
        ...prev,
        { id, url, name: file.name, isUploading: true },
      ]);

      // Simulate upload delay
      setTimeout(() => {
        setImages((prev) =>
          prev.map((img) =>
            img.id === id ? { ...img, isUploading: false } : img
          )
        );
      }, 1500);
    });
  };

  const handleRemoveImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleSave = async (publish: boolean = false) => {
    setIsSaving(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast({
      title: publish ? 'Property published' : 'Property saved',
      description: publish
        ? 'Your property is now live.'
        : 'Your property has been saved as a draft.',
    });

    setIsSaving(false);
    router.push('/dashboard/properties');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/properties">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Create Property</h1>
            <p className="text-muted-foreground">
              Add a new property to your portfolio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </Button>
          <Button onClick={() => handleSave(true)} disabled={isSaving}>
            <Eye className="h-4 w-4 mr-2" />
            Publish
          </Button>
        </div>
      </div>

      {/* Form */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
        </TabsList>

        {/* Basic Info Tab */}
        <TabsContent value="basic" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Property Information</CardTitle>
                <CardDescription>
                  Basic details about the property
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference *</Label>
                  <Input
                    id="reference"
                    placeholder="e.g., PROP-001"
                    value={formData.reference}
                    onChange={(e) => handleInputChange('reference', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="listingType">Listing Type *</Label>
                  <Select
                    value={formData.listingType}
                    onValueChange={(value) => handleInputChange('listingType', value)}
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="propertyType">Property Type *</Label>
                    <Dialog open={isAddTypeOpen} onOpenChange={setIsAddTypeOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Plus className="h-3 w-3 mr-1" />
                          Add New
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Property Type</DialogTitle>
                          <DialogDescription>
                            Create a new property type for your listings.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Name (English)</Label>
                            <Input placeholder="e.g., Duplex" />
                          </div>
                          <div className="space-y-2">
                            <Label>Name (Spanish)</Label>
                            <Input placeholder="e.g., Dúplex" />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAddTypeOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={() => setIsAddTypeOpen(false)}>
                            Add Type
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select
                    value={formData.propertyTypeId}
                    onValueChange={(value) => handleInputChange('propertyTypeId', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {samplePropertyTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id.toString()}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="location">Location *</Label>
                    <Dialog open={isAddLocationOpen} onOpenChange={setIsAddLocationOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Plus className="h-3 w-3 mr-1" />
                          Add New
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Location</DialogTitle>
                          <DialogDescription>
                            Create a new location for your properties.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Name</Label>
                            <Input placeholder="e.g., Golden Mile" />
                          </div>
                          <div className="space-y-2">
                            <Label>Level</Label>
                            <Select defaultValue="area">
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="country">Country</SelectItem>
                                <SelectItem value="province">Province</SelectItem>
                                <SelectItem value="municipality">Municipality</SelectItem>
                                <SelectItem value="town">Town</SelectItem>
                                <SelectItem value="area">Area</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Parent Location</Label>
                            <Select>
                              <SelectTrigger>
                                <SelectValue placeholder="Select parent" />
                              </SelectTrigger>
                              <SelectContent>
                                {sampleLocations.map((loc) => (
                                  <SelectItem key={loc.id} value={loc.id.toString()}>
                                    {loc.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAddLocationOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={() => setIsAddLocationOpen(false)}>
                            Add Location
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select
                    value={formData.locationId}
                    onValueChange={(value) => handleInputChange('locationId', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {sampleLocations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id.toString()}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => handleInputChange('status', value)}
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
              </CardContent>
            </Card>

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
                      handleInputChange('priceOnRequest', checked)
                    }
                  />
                  <Label htmlFor="priceOnRequest">Price on Request</Label>
                </div>

                {!formData.priceOnRequest && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="price">Price *</Label>
                      <Input
                        id="price"
                        type="number"
                        placeholder="500000"
                        value={formData.price}
                        onChange={(e) => handleInputChange('price', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Select
                        value={formData.currency}
                        onValueChange={(value) => handleInputChange('currency', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                          <SelectItem value="USD">USD ($)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isFeatured"
                      checked={formData.isFeatured}
                      onCheckedChange={(checked) =>
                        handleInputChange('isFeatured', checked)
                      }
                    />
                    <Label htmlFor="isFeatured">Featured Property</Label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Featured properties appear at the top of search results
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Multilingual Content */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Languages className="h-5 w-5" />
                Content
              </CardTitle>
              <CardDescription>
                Title and description in multiple languages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeLanguage} onValueChange={setActiveLanguage}>
                <TabsList>
                  <TabsTrigger value="en">English</TabsTrigger>
                  <TabsTrigger value="es">Spanish</TabsTrigger>
                  <TabsTrigger value="de">German</TabsTrigger>
                </TabsList>

                {['en', 'es', 'de'].map((lang) => (
                  <TabsContent key={lang} value={lang} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Title ({lang.toUpperCase()})</Label>
                      <Input
                        placeholder={`Property title in ${lang === 'en' ? 'English' : lang === 'es' ? 'Spanish' : 'German'}`}
                        value={formData.title[lang as keyof typeof formData.title]}
                        onChange={(e) =>
                          handleMultilingualChange('title', lang, e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description ({lang.toUpperCase()})</Label>
                      <Textarea
                        placeholder={`Property description in ${lang === 'en' ? 'English' : lang === 'es' ? 'Spanish' : 'German'}`}
                        rows={6}
                        value={formData.description[lang as keyof typeof formData.description]}
                        onChange={(e) =>
                          handleMultilingualChange('description', lang, e.target.value)
                        }
                      />
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Property Metrics</CardTitle>
              <CardDescription>
                Bedrooms, bathrooms, and sizes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="bedrooms">Bedrooms</Label>
                  <Input
                    id="bedrooms"
                    type="number"
                    placeholder="3"
                    value={formData.bedrooms}
                    onChange={(e) => handleInputChange('bedrooms', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bathrooms">Bathrooms</Label>
                  <Input
                    id="bathrooms"
                    type="number"
                    placeholder="2"
                    value={formData.bathrooms}
                    onChange={(e) => handleInputChange('bathrooms', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buildSize">Build Size (m²)</Label>
                  <Input
                    id="buildSize"
                    type="number"
                    placeholder="250"
                    value={formData.buildSize}
                    onChange={(e) => handleInputChange('buildSize', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plotSize">Plot Size (m²)</Label>
                  <Input
                    id="plotSize"
                    type="number"
                    placeholder="1000"
                    value={formData.plotSize}
                    onChange={(e) => handleInputChange('plotSize', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="terraceSize">Terrace Size (m²)</Label>
                  <Input
                    id="terraceSize"
                    type="number"
                    placeholder="50"
                    value={formData.terraceSize}
                    onChange={(e) => handleInputChange('terraceSize', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gardenSize">Garden Size (m²)</Label>
                  <Input
                    id="gardenSize"
                    type="number"
                    placeholder="200"
                    value={formData.gardenSize}
                    onChange={(e) => handleInputChange('gardenSize', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Property Features</CardTitle>
              <CardDescription>
                Select all features that apply to this property
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {featureCategories.map((category) => {
                  const categoryFeatures = sampleFeatures.filter(
                    (f) => f.category === category
                  );
                  if (categoryFeatures.length === 0) return null;

                  return (
                    <div key={category}>
                      <h4 className="font-medium capitalize mb-3">{category}</h4>
                      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {categoryFeatures.map((feature) => (
                          <div
                            key={feature.id}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={`feature-${feature.id}`}
                              checked={formData.features.includes(feature.id)}
                              onCheckedChange={() => handleFeatureToggle(feature.id)}
                            />
                            <Label
                              htmlFor={`feature-${feature.id}`}
                              className="font-normal"
                            >
                              {feature.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Media Tab */}
        <TabsContent value="media" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Images</CardTitle>
              <CardDescription>
                Upload property images. Drag to reorder.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Upload Area */}
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold">Click to upload</span> or
                      drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG up to 10MB
                    </p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                  />
                </label>

                {/* Image Grid */}
                {images.length > 0 && (
                  <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                    {images.map((image, index) => (
                      <div
                        key={image.id}
                        className="relative group aspect-square rounded-lg overflow-hidden border"
                      >
                        {image.isUploading ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-muted">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                          </div>
                        ) : (
                          <>
                            <img
                              src={image.url}
                              alt={image.name}
                              className="object-cover w-full h-full"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <GripVertical className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleRemoveImage(image.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            {index === 0 && (
                              <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                                Main
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {images.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No images uploaded yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Videos & Virtual Tours</CardTitle>
              <CardDescription>
                Add external media links
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="videoUrl">Video URL</Label>
                <Input
                  id="videoUrl"
                  placeholder="https://youtube.com/watch?v=..."
                  value={formData.videoUrl}
                  onChange={(e) => handleInputChange('videoUrl', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="virtualTourUrl">Virtual Tour URL</Label>
                <Input
                  id="virtualTourUrl"
                  placeholder="https://matterport.com/..."
                  value={formData.virtualTourUrl}
                  onChange={(e) => handleInputChange('virtualTourUrl', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Location Tab */}
        <TabsContent value="location" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Coordinates</CardTitle>
              <CardDescription>
                Set the exact location on the map
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lat">Latitude</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    placeholder="36.5126"
                    value={formData.lat}
                    onChange={(e) => handleInputChange('lat', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lng">Longitude</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="any"
                    placeholder="-4.8829"
                    value={formData.lng}
                    onChange={(e) => handleInputChange('lng', e.target.value)}
                  />
                </div>
              </div>

              {/* Map placeholder */}
              <div className="aspect-video rounded-lg border bg-muted flex items-center justify-center">
                <p className="text-muted-foreground">
                  Map integration will be displayed here
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
