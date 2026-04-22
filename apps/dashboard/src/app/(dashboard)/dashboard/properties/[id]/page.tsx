'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Edit,
  Trash2,
  AlertCircle,
  Bed,
  Bath,
  Ruler,
  TreePine,
  Sun,
  LandPlot,
  Video,
  Globe,
  FileImage,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

interface Property {
  id: number;
  reference: string;
  agentReference: string | null;
  externalId: string | null;
  source: string;
  listingType: 'sale' | 'rent' | 'development';
  propertyTypeId: number | null;
  locationId: number | null;
  urbanization: string | null;
  price: number | null;
  priceOnRequest: boolean;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  buildSize: number | null;
  plotSize: number | null;
  terraceSize: number | null;
  gardenSize: number | null;
  title: Record<string, string>;
  description: Record<string, string>;
  images: Array<{ url: string; caption?: string }> | null;
  videoUrl: string | null;
  virtualTourUrl: string | null;
  floorPlanUrl: string | null;
  features: number[];
  lat: number | null;
  lng: number | null;
  deliveryDate: string | null;
  status: 'draft' | 'active' | 'sold' | 'rented' | 'archived';
  isFeatured: boolean;
  isPublished: boolean;
  syncEnabled: boolean;
  lockedFields: string[] | null;
  importedAt: string | null;
  publishedAt: string | null;
  soldAt: string | null;
  createdAt: string;
  updatedAt: string;
  location?: { id: number; name: Record<string, string> };
  propertyType?: { id: number; name: Record<string, string> };
}

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  active: 'success',
  sold: 'warning',
  rented: 'default',
  archived: 'destructive',
};

const listingTypeLabels: Record<string, string> = {
  sale: 'For Sale',
  rent: 'For Rent',
  development: 'Development',
};

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const api = useApi();
  const { toast } = useToast();

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const id = params.id as string;

  useEffect(() => {
    async function fetchProperty() {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const response = await api.get(`/api/dashboard/properties/${id}`);
        const body = response?.data || response;
        if (!body) {
          setNotFound(true);
        } else {
          setProperty(body as Property);
        }
      } catch (err: any) {
        if (err?.message?.includes('404') || err?.message?.includes('not found')) {
          setNotFound(true);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load property');
        }
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchProperty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/api/dashboard/properties/${id}`);
      toast({
        title: 'Property deleted',
        description: `Property ${property?.reference || id} has been deleted.`,
      });
      router.push('/dashboard/properties');
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Could not delete property.',
        variant: 'destructive',
      });
      setDeleting(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // 404 state
  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Property not found</h2>
        <p className="text-muted-foreground mb-6">
          The property you are looking for does not exist or has been removed.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard/properties">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Properties
          </Link>
        </Button>
      </div>
    );
  }

  // Error state
  if (error || !property) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-destructive">
        <AlertCircle className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error loading property</h2>
        <p className="text-sm text-muted-foreground mb-6">{error || 'Unknown error'}</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/properties">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Properties
          </Link>
        </Button>
      </div>
    );
  }

  const title = property.title?.en || property.title?.es || `Property ${property.reference}`;
  const descriptionEn = property.description?.en;
  const descriptionEs = property.description?.es;

  const detailItems = [
    { label: 'Bedrooms', value: property.bedrooms, icon: Bed },
    { label: 'Bathrooms', value: property.bathrooms, icon: Bath },
    { label: 'Build Size', value: property.buildSize, icon: Ruler, suffix: 'm²' },
    { label: 'Plot Size', value: property.plotSize, icon: LandPlot, suffix: 'm²' },
    { label: 'Terrace Size', value: property.terraceSize, icon: Sun, suffix: 'm²' },
    { label: 'Garden Size', value: property.gardenSize, icon: TreePine, suffix: 'm²' },
  ].filter((item) => item.value != null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link href="/dashboard/properties">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight font-mono">
                {property.reference}
              </h1>
              <Badge variant={statusVariant[property.status]}>
                {property.status}
              </Badge>
              {property.isFeatured && (
                <Badge variant="warning">Featured</Badge>
              )}
              {property.isPublished && (
                <Badge variant="success">Published</Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">{title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/dashboard/properties/${property.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete property?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete property{' '}
                  <span className="font-semibold">{property.reference}</span>.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content - left 2 columns */}
        <div className="space-y-6 lg:col-span-2">
          {/* Overview Card */}
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Listing Type</p>
                  <p className="font-medium capitalize">
                    {listingTypeLabels[property.listingType] || property.listingType}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="font-medium text-lg">
                    {property.priceOnRequest
                      ? 'Price on Request'
                      : property.price
                        ? formatCurrency(property.price, property.currency)
                        : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="font-medium">
                    {property.location?.name?.en || property.location?.name?.es || 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Property Type</p>
                  <p className="font-medium">
                    {property.propertyType?.name?.en || property.propertyType?.name?.es || 'Not set'}
                  </p>
                </div>
                {property.urbanization && (
                  <div>
                    <p className="text-sm text-muted-foreground">Urbanization</p>
                    <p className="font-medium">{property.urbanization}</p>
                  </div>
                )}
                {property.deliveryDate && (
                  <div>
                    <p className="text-sm text-muted-foreground">Delivery Date</p>
                    <p className="font-medium">
                      {format(new Date(property.deliveryDate), 'dd MMM yyyy')}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Details Card */}
          {detailItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {detailItems.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <item.icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">{item.label}</p>
                        <p className="font-semibold">
                          {item.value}
                          {item.suffix ? ` ${item.suffix}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Description Card */}
          {(descriptionEn || descriptionEs) && (
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {descriptionEn && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">English</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {descriptionEn}
                    </p>
                  </div>
                )}
                {descriptionEn && descriptionEs && <Separator />}
                {descriptionEs && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Spanish</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {descriptionEs}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Features */}
          {property.features && property.features.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Features</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {property.features.map((featureId) => (
                    <Badge key={featureId} variant="outline">
                      Feature #{featureId}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Media Section */}
          <Card>
            <CardHeader>
              <CardTitle>Media</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Images */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-3">Images</p>
                {property.images && property.images.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {property.images.map((image, index) => (
                      <div
                        key={index}
                        className="aspect-video rounded-lg bg-muted overflow-hidden"
                      >
                        <img
                          src={image.url}
                          alt={image.caption || `Image ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-lg border border-dashed p-8 text-muted-foreground">
                    <FileImage className="h-5 w-5 mr-2" />
                    No images uploaded
                  </div>
                )}
              </div>

              {/* Video / Virtual Tour / Floor Plan links */}
              {(property.videoUrl || property.virtualTourUrl || property.floorPlanUrl) && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-3">
                    {property.videoUrl && (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={property.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Video className="h-4 w-4 mr-2" />
                          Video
                          <ExternalLink className="h-3 w-3 ml-1.5" />
                        </a>
                      </Button>
                    )}
                    {property.virtualTourUrl && (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={property.virtualTourUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Globe className="h-4 w-4 mr-2" />
                          Virtual Tour
                          <ExternalLink className="h-3 w-3 ml-1.5" />
                        </a>
                      </Button>
                    )}
                    {property.floorPlanUrl && (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={property.floorPlanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FileImage className="h-4 w-4 mr-2" />
                          Floor Plan
                          <ExternalLink className="h-3 w-3 ml-1.5" />
                        </a>
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - right column */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Source</p>
                <Badge variant="outline" className="mt-1 capitalize">
                  {property.source}
                </Badge>
              </div>
              {property.externalId && (
                <div>
                  <p className="text-sm text-muted-foreground">External ID</p>
                  <p className="font-mono text-sm mt-1">{property.externalId}</p>
                </div>
              )}
              {property.agentReference && (
                <div>
                  <p className="text-sm text-muted-foreground">Agent Reference</p>
                  <p className="font-mono text-sm mt-1">{property.agentReference}</p>
                </div>
              )}
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Sync Enabled</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {property.syncEnabled ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Yes</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">No</span>
                    </>
                  )}
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="text-sm mt-1">
                  {format(new Date(property.createdAt), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="text-sm mt-1">
                  {format(new Date(property.updatedAt), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
              {property.importedAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Imported</p>
                  <p className="text-sm mt-1">
                    {format(new Date(property.importedAt), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
              )}
              {property.publishedAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Published</p>
                  <p className="text-sm mt-1">
                    {format(new Date(property.publishedAt), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
              )}
              {property.soldAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Sold</p>
                  <p className="text-sm mt-1">
                    {format(new Date(property.soldAt), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
              )}
              {property.lat != null && property.lng != null && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Coordinates</p>
                    <p className="font-mono text-sm mt-1">
                      {property.lat.toFixed(6)}, {property.lng.toFixed(6)}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
