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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Building2,
  Waves,
  Zap,
  Calendar,
  MapPin,
  Link2,
  User,
  Languages,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { propertyKeys } from '@/hooks/use-tenant-query-scope';
import { useToast } from '@/hooks/use-toast';
import { PROPERTY_SOURCE_LABELS, formatAmount, formatCurrency, formatDecimal, hasPrice } from '@/lib/utils';
import type { DecimalValue, Property } from '@spm/shared';

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
  holiday_rent: 'Holiday Rent',
  development: 'Development',
};

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const api = useApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [descLang, setDescLang] = useState('en');
  const [seoLang, setSeoLang] = useState('en');
  const [featuresMap, setFeaturesMap] = useState<Record<number, string>>({});

  const id = params.id as string;

  useEffect(() => {
    if (!api.isReady) return;
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
    async function fetchFeatures() {
      try {
        const res = await api.get('/api/dashboard/features');
        const body = res?.data || res;
        const list: any[] = Array.isArray(body) ? body : body?.data || [];
        const map: Record<number, string> = {};
        for (const f of list) {
          map[f.id] = f.name?.en || f.name?.es || `Feature #${f.id}`;
        }
        setFeaturesMap(map);
      } catch { /* ignore */ }
    }
    if (id) {
      fetchProperty();
      fetchFeatures();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, api.isReady]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/api/dashboard/properties/${id}`);
      toast({ title: 'Property deleted', description: `Property ${property?.reference || id} has been deleted.` });
      // Drop cached lists so the deleted row is gone when the list opens.
      void queryClient.invalidateQueries({ queryKey: propertyKeys.all });
      router.push('/dashboard/properties');
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Could not delete property.', variant: 'destructive' });
      setDeleting(false);
    }
  }

  if (loading) {
    return (<div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>);
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Property not found</h2>
        <p className="text-muted-foreground mb-6">The property you are looking for does not exist or has been removed.</p>
        <Button asChild variant="outline"><Link href="/dashboard/properties"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Properties</Link></Button>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-destructive">
        <AlertCircle className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error loading property</h2>
        <p className="text-sm text-muted-foreground mb-6">{error || 'Unknown error'}</p>
        <Button asChild variant="outline"><Link href="/dashboard/properties"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Properties</Link></Button>
      </div>
    );
  }

  const title = property.title?.en || property.title?.es || `Property ${property.reference}`;
  const fmtDate = (d: string) => format(new Date(d), 'dd MMM yyyy, HH:mm');
  const fmtDateShort = (d: string) => format(new Date(d), 'dd MMM yyyy');

  // Sizes are DECIMAL columns, so they arrive as strings ("120.00"):
  // formatDecimal drops the trailing zeros. An area of 0 is an empty field
  // (feeds send 0 when they have no figure), so it is hidden like null.
  const fmtArea = (v: DecimalValue | null) => (v != null && Number(v) > 0 ? formatDecimal(v) : null);
  const fmtRange = (from: string | null, to: string | null, suffix?: string) => {
    const s = suffix ? ` ${suffix}` : '';
    if (from != null && to != null) return `${from}${s} - ${to}${s}`;
    if (from != null) return `${from}${s}`;
    return null;
  };
  const withUnit = (v: string | null, unit: string) => (v != null ? `${v} ${unit}` : null);

  const detailItems = [
    { label: 'Bedrooms', display: fmtRange(formatDecimal(property.bedrooms), formatDecimal(property.bedroomsTo)), icon: Bed },
    { label: 'Bathrooms', display: fmtRange(formatDecimal(property.bathrooms), formatDecimal(property.bathroomsTo)), icon: Bath },
    { label: 'Build Size', display: fmtRange(fmtArea(property.buildSize), fmtArea(property.buildSizeTo), 'm²'), icon: Ruler },
    { label: 'Plot Size', display: fmtRange(fmtArea(property.plotSize), fmtArea(property.plotSizeTo), 'm²'), icon: LandPlot },
    { label: 'Terrace', display: fmtRange(fmtArea(property.terraceSize), fmtArea(property.terraceSizeTo), 'm²'), icon: Sun },
    { label: 'Garden', display: withUnit(fmtArea(property.gardenSize), 'm²'), icon: TreePine },
    { label: 'Solarium', display: withUnit(fmtArea(property.solariumSize), 'm²'), icon: Sun },
    { label: 'Built Year', display: property.builtYear != null ? String(property.builtYear) : null, icon: Building2 },
    { label: 'Energy', display: withUnit(formatDecimal(property.energyConsumption), 'kWh/m²'), icon: Zap },
    { label: 'Energy Rating', display: property.energyRating || null, icon: Zap },
    { label: 'Beach Distance', display: withUnit(formatDecimal(property.distanceToBeach), 'm'), icon: Waves },
  ].filter((item) => item.display != null);

  const hasAddress = property.street || property.streetNumber || property.floor || property.postcode || property.cadastralReference;
  const hasFinancial = property.communityFees != null || property.basuraTax != null || property.ibiFees != null || property.commission != null;
  const hasSeo = property.slug || property.metaTitle || property.metaDescription;

  const allLinks = [
    { label: 'Video', url: property.videoUrl, icon: Video },
    { label: 'Virtual Tour', url: property.virtualTourUrl, icon: Globe },
    { label: 'Floor Plan', url: property.floorPlanUrl, icon: FileImage },
    { label: 'External Link', url: property.externalLink, icon: Link2 },
    { label: 'Blog', url: property.blogUrl, icon: Link2 },
    { label: 'Map', url: property.mapLink, icon: MapPin },
    { label: 'Website', url: property.websiteUrl, icon: Globe },
  ].filter((l) => l.url);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon"><Link href="/dashboard/properties"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="page-title font-mono">{property.reference}</h1>
              <Badge variant={statusVariant[property.status]}>{property.status}</Badge>
              {property.isFeatured && <Badge variant="warning">Featured</Badge>}
              {property.isPublished && <Badge variant="success">Published</Badge>}
              {property.isOwnProperty && <Badge variant="outline">Own</Badge>}
              {property.villaSelection && <Badge variant="outline">Villa Selection</Badge>}
              {property.luxurySelection && <Badge variant="outline">Luxury</Badge>}
              {property.apartmentSelection && <Badge variant="outline">Apartment Selection</Badge>}
            </div>
            <p className="page-description mt-1">{title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline"><Link href={`/dashboard/properties/${property.id}/edit`}><Edit className="h-4 w-4 mr-2" /> Edit</Link></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleting} className="shadow-sm"><Trash2 className="h-4 w-4 mr-2" />{deleting ? 'Deleting...' : 'Delete'}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete property?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete property <span className="font-semibold">{property.reference}</span>. This action cannot be undone.{property.source !== 'manual' && <> It was imported from the {PROPERTY_SOURCE_LABELS[property.source] || property.source} feed, so the next import adds it back while the feed still lists it.</>}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Overview */}
          <Card>
            <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Listing Type</p>
                  <p className="font-medium capitalize">{listingTypeLabels[property.listingType] || property.listingType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="font-medium text-lg">
                    {property.priceOnRequest ? 'Price on Request' : hasPrice(property.price) ? (
                      hasPrice(property.priceTo)
                        ? `${formatCurrency(Number(property.price), property.currency)} - ${formatCurrency(Number(property.priceTo), property.currency)}`
                        : formatCurrency(Number(property.price), property.currency)
                    ) : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="font-medium">{property.location?.name?.en || property.location?.name?.es || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Property Type</p>
                  <p className="font-medium">{property.propertyType?.name?.en || property.propertyType?.name?.es || 'Not set'}</p>
                </div>
                {property.urbanization && (
                  <div><p className="text-sm text-muted-foreground">Urbanization</p><p className="font-medium">{property.urbanization}</p></div>
                )}
                {property.project && (
                  <div><p className="text-sm text-muted-foreground">Project</p><p className="font-medium">{property.project}</p></div>
                )}
                {property.deliveryDate && (
                  <div><p className="text-sm text-muted-foreground">Delivery Date</p><p className="font-medium">{fmtDateShort(property.deliveryDate)}</p></div>
                )}
                {property.completionDate && (
                  <div><p className="text-sm text-muted-foreground">Completion Date</p><p className="font-medium">{fmtDateShort(property.completionDate)}</p></div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          {detailItems.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {detailItems.map((item) => {
                    return (
                      <div key={item.label} className="flex items-center gap-3 rounded-lg border p-3">
                        <div className="stat-card-icon">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{item.label}</p>
                          <p className="font-semibold">{item.display}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Address */}
          {hasAddress && (
            <Card>
              <CardHeader><CardTitle>Address</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {property.street && <div><p className="text-sm text-muted-foreground">Street</p><p className="font-medium">{property.street} {property.streetNumber || ''}</p></div>}
                  {property.floor && <div><p className="text-sm text-muted-foreground">Floor</p><p className="font-medium">{property.floor}</p></div>}
                  {property.postcode && <div><p className="text-sm text-muted-foreground">Postcode</p><p className="font-medium">{property.postcode}</p></div>}
                  {property.cadastralReference && <div><p className="text-sm text-muted-foreground">Cadastral Reference</p><p className="font-mono text-sm">{property.cadastralReference}</p></div>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Financial */}
          {hasFinancial && (
            <Card>
              <CardHeader><CardTitle>Fees & Taxes</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {property.communityFees != null && <div><p className="text-sm text-muted-foreground">Community Fees</p><p className="font-medium">{formatAmount(property.communityFees, property.currency)}/month</p></div>}
                  {property.basuraTax != null && <div><p className="text-sm text-muted-foreground">Basura Tax</p><p className="font-medium">{formatAmount(property.basuraTax, property.currency)}/year</p></div>}
                  {property.ibiFees != null && <div><p className="text-sm text-muted-foreground">IBI Fees</p><p className="font-medium">{formatAmount(property.ibiFees, property.currency)}/year</p></div>}
                  {property.commission != null && (
                    <div>
                      <p className="text-sm text-muted-foreground">Commission</p>
                      <p className="font-medium">{formatDecimal(property.commission)}%{property.sharedCommission ? ' (shared)' : ''}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Description */}
          {property.description && Object.values(property.description).some(v => v) && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Description</CardTitle>
                  <Select value={descLang} onValueChange={setDescLang}>
                    <SelectTrigger className="w-[160px]">
                      <Languages className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.label}{property.description?.[lang.code] ? ' *' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {property.description[descLang] ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{property.description[descLang]}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No description in {LANGUAGES.find(l => l.code === descLang)?.label || descLang}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Features */}
          {property.features && property.features.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Features</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {property.features.map((featureId) => (<Badge key={featureId} variant="outline">{featuresMap[featureId] || `Feature #${featureId}`}</Badge>))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Media */}
          <Card>
            <CardHeader><CardTitle>Media</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-3">Images</p>
                {property.images && property.images.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {property.images.map((image, index) => (
                      <div key={index} className="aspect-video rounded-lg bg-muted overflow-hidden">
                        <img src={image.url} alt={image.alt || `Image ${index + 1}`} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-lg border border-dashed p-8 text-muted-foreground">
                    <FileImage className="h-5 w-5 mr-2" /> No images uploaded
                  </div>
                )}
              </div>

              {allLinks.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-3">
                    {allLinks.map((link) => (
                      <Button key={link.label} asChild variant="outline" size="sm">
                        <a href={link.url!} target="_blank" rel="noopener noreferrer">
                          <link.icon className="h-4 w-4 mr-2" />
                          {link.label}
                          <ExternalLink className="h-3 w-3 ml-1.5" />
                        </a>
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* SEO */}
          {hasSeo && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>SEO</CardTitle>
                  <Select value={seoLang} onValueChange={setSeoLang}>
                    <SelectTrigger className="w-[160px]">
                      <Languages className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.label}{(property.metaTitle?.[lang.code] || property.metaDescription?.[lang.code] || property.pageTitle?.[lang.code]) ? ' *' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {property.slug && <div><p className="text-sm text-muted-foreground">Slug</p><p className="font-mono text-sm">{property.slug}</p></div>}
                {property.pageTitle?.[seoLang] && <div><p className="text-sm text-muted-foreground">Page Title</p><p className="text-sm">{property.pageTitle[seoLang]}</p></div>}
                {property.metaTitle?.[seoLang] && <div><p className="text-sm text-muted-foreground">Meta Title</p><p className="text-sm">{property.metaTitle[seoLang]}</p></div>}
                {property.metaDescription?.[seoLang] && <div><p className="text-sm text-muted-foreground">Meta Description</p><p className="text-sm">{property.metaDescription[seoLang]}</p></div>}
                {property.metaKeywords?.[seoLang] && <div><p className="text-sm text-muted-foreground">Meta Keywords</p><p className="text-sm">{property.metaKeywords[seoLang]}</p></div>}
                {!property.slug && !property.pageTitle?.[seoLang] && !property.metaTitle?.[seoLang] && !property.metaDescription?.[seoLang] && !property.metaKeywords?.[seoLang] && (
                  <p className="text-sm text-muted-foreground italic">No SEO data in {LANGUAGES.find(l => l.code === seoLang)?.label || seoLang}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Agent Info */}
          {(property.agent || property.salesAgent) && (
            <Card>
              <CardHeader><CardTitle>Agents</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {property.agent && (
                  <div>
                    <p className="text-sm text-muted-foreground">Listing Agent</p>
                    <div className="flex items-center gap-2 mt-1">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium">{property.agent.name || property.agent.email}</p>
                    </div>
                  </div>
                )}
                {property.salesAgent && (
                  <div>
                    <p className="text-sm text-muted-foreground">Sales Agent</p>
                    <div className="flex items-center gap-2 mt-1">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium">{property.salesAgent.name || property.salesAgent.email}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          <Card>
            <CardHeader><CardTitle>Metadata</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Source</p>
                <Badge variant="outline" className="mt-1 capitalize">{property.source}</Badge>
              </div>
              {property.externalId && <div><p className="text-sm text-muted-foreground">External ID</p><p className="font-mono text-sm mt-1">{property.externalId}</p></div>}
              {property.agentReference && <div><p className="text-sm text-muted-foreground">Agent Reference</p><p className="font-mono text-sm mt-1">{property.agentReference}</p></div>}
              {property.propertyTypeReference && <div><p className="text-sm text-muted-foreground">Property Type Ref</p><p className="font-mono text-sm mt-1">{property.propertyTypeReference}</p></div>}
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Sync Enabled</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {property.syncEnabled ? (<><CheckCircle2 className="h-4 w-4 text-primary" /><span className="text-sm">Yes</span></>) : (<><XCircle className="h-4 w-4 text-muted-foreground" /><span className="text-sm">No</span></>)}
                </div>
              </div>
              <Separator />
              <div><p className="text-sm text-muted-foreground">Created</p><p className="text-sm mt-1">{fmtDate(property.createdAt)}</p></div>
              <div>
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="text-sm mt-1">{fmtDate(property.updatedAt)}</p>
                {property.lastUpdatedByUser && (
                  <p className="text-xs text-muted-foreground mt-0.5">by {property.lastUpdatedByUser.name || property.lastUpdatedByUser.email}</p>
                )}
              </div>
              {property.importedAt && <div><p className="text-sm text-muted-foreground">Imported</p><p className="text-sm mt-1">{fmtDate(property.importedAt)}</p></div>}
              {property.publishedAt && <div><p className="text-sm text-muted-foreground">Published</p><p className="text-sm mt-1">{fmtDate(property.publishedAt)}</p></div>}
              {property.soldAt && <div><p className="text-sm text-muted-foreground">Sold</p><p className="text-sm mt-1">{fmtDate(property.soldAt)}</p></div>}
              {property.lastUpdatedResales && <div><p className="text-sm text-muted-foreground">Last Updated (Resales)</p><p className="text-sm mt-1">{fmtDate(property.lastUpdatedResales)}</p></div>}
              {property.lat != null && property.lng != null && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Coordinates</p>
                    <p className="font-mono text-sm mt-1">{Number(property.lat).toFixed(6)}, {Number(property.lng).toFixed(6)}</p>
                    {property.geoLocationLabel && <p className="text-xs text-muted-foreground mt-0.5">{property.geoLocationLabel}</p>}
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
