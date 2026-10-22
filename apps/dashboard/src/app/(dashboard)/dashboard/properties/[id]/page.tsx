'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { PROPERTY_SOURCE_LABELS, formatAmount, formatCurrency, formatDecimal, hasPrice, propertySourceLabel } from '@/lib/utils';
import type { DecimalValue, Property } from '@spm/shared';
import { useLanguage } from '@/i18n/i18n-provider';
import { labelOf, usePropertiesText } from '../_i18n';
import { useCommonText } from '@/i18n/common';

// Content languages a property can hold; names come from the text file.
const LANGUAGES = ['en', 'es', 'de', 'fr', 'nl', 'sv', 'no', 'da', 'fi', 'ru'];

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  active: 'success',
  sold: 'warning',
  rented: 'default',
  archived: 'destructive',
};

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const api = useApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = usePropertiesText();
  const tc = useCommonText();
  const { locale } = useLanguage();

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
          setError(err instanceof Error ? err.message : t.detail.loadFailed);
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
          map[f.id] = f.name?.en || f.name?.es || t.detail.featureN(f.id);
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
      toast({ title: t.deleteDialog.deleted, description: t.deleteDialog.deletedDescription(String(property?.reference || id)) });
      // Drop cached lists so the deleted row is gone when the list opens.
      void queryClient.invalidateQueries({ queryKey: propertyKeys.all });
      router.push('/dashboard/properties');
    } catch (err) {
      toast({ title: t.deleteDialog.failed, description: err instanceof Error ? err.message : t.deleteDialog.failedDescription, variant: 'destructive' });
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
        <h2 className="text-xl font-semibold mb-2">{t.detail.notFound}</h2>
        <p className="text-muted-foreground mb-6">{t.detail.notFoundDescription}</p>
        <Button asChild variant="outline"><Link href="/dashboard/properties"><ArrowLeft className="h-4 w-4 mr-2" /> {t.detail.backToProperties}</Link></Button>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-destructive">
        <AlertCircle className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t.detail.errorLoading}</h2>
        <p className="text-sm text-muted-foreground mb-6">{error || t.common.unknownError}</p>
        <Button asChild variant="outline"><Link href="/dashboard/properties"><ArrowLeft className="h-4 w-4 mr-2" /> {t.detail.backToProperties}</Link></Button>
      </div>
    );
  }

  const title = property.title?.en || property.title?.es || t.detail.propertyRef(property.reference);
  const fmtDate = (d: string) =>
    new Date(d).toLocaleString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtDateShort = (d: string) => new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  const langName = (code: string) => labelOf(t.languages, code);

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
    { label: t.detail.items.bedrooms, display: fmtRange(formatDecimal(property.bedrooms), formatDecimal(property.bedroomsTo)), icon: Bed },
    { label: t.detail.items.bathrooms, display: fmtRange(formatDecimal(property.bathrooms), formatDecimal(property.bathroomsTo)), icon: Bath },
    { label: t.detail.items.buildSize, display: fmtRange(fmtArea(property.buildSize), fmtArea(property.buildSizeTo), 'm²'), icon: Ruler },
    { label: t.detail.items.plotSize, display: fmtRange(fmtArea(property.plotSize), fmtArea(property.plotSizeTo), 'm²'), icon: LandPlot },
    { label: t.detail.items.terrace, display: fmtRange(fmtArea(property.terraceSize), fmtArea(property.terraceSizeTo), 'm²'), icon: Sun },
    { label: t.detail.items.garden, display: withUnit(fmtArea(property.gardenSize), 'm²'), icon: TreePine },
    { label: t.detail.items.solarium, display: withUnit(fmtArea(property.solariumSize), 'm²'), icon: Sun },
    { label: t.detail.items.builtYear, display: property.builtYear != null ? String(property.builtYear) : null, icon: Building2 },
    { label: t.detail.items.energy, display: withUnit(formatDecimal(property.energyConsumption), 'kWh/m²'), icon: Zap },
    { label: t.detail.items.energyRating, display: property.energyRating || null, icon: Zap },
    { label: t.detail.items.beachDistance, display: withUnit(formatDecimal(property.distanceToBeach), 'm'), icon: Waves },
  ].filter((item) => item.display != null);

  const hasAddress = property.street || property.streetNumber || property.floor || property.postcode || property.cadastralReference;
  // A fee of 0 means nobody entered it (feeds send 0 for unknown), so it is
  // left out like a missing one rather than shown as €0.
  const hasFinancial = hasPrice(property.communityFees) || hasPrice(property.basuraTax) || hasPrice(property.ibiFees) || property.commission != null;
  const hasSeo = property.slug || property.metaTitle || property.metaDescription;

  const allLinks = [
    { label: t.detail.links.video, url: property.videoUrl, icon: Video },
    { label: t.detail.links.virtualTour, url: property.virtualTourUrl, icon: Globe },
    { label: t.detail.links.floorPlan, url: property.floorPlanUrl, icon: FileImage },
    { label: t.detail.links.externalLink, url: property.externalLink, icon: Link2 },
    { label: t.detail.links.blog, url: property.blogUrl, icon: Link2 },
    { label: t.detail.links.map, url: property.mapLink, icon: MapPin },
    { label: t.detail.links.website, url: property.websiteUrl, icon: Globe },
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
              <Badge variant={statusVariant[property.status]}>{labelOf(t.status, property.status)}</Badge>
              {property.isFeatured && <Badge variant="warning">{t.detail.badges.featured}</Badge>}
              {property.isPublished && <Badge variant="success">{t.detail.badges.published}</Badge>}
              {property.isOwnProperty && <Badge variant="outline">{t.detail.badges.own}</Badge>}
              {property.villaSelection && <Badge variant="outline">{t.detail.badges.villaSelection}</Badge>}
              {property.luxurySelection && <Badge variant="outline">{t.detail.badges.luxury}</Badge>}
              {property.apartmentSelection && <Badge variant="outline">{t.detail.badges.apartmentSelection}</Badge>}
            </div>
            <p className="page-description mt-1">{title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline"><Link href={`/dashboard/properties/${property.id}/edit`}><Edit className="h-4 w-4 mr-2" /> {t.common.edit}</Link></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleting} className="shadow-sm"><Trash2 className="h-4 w-4 mr-2" />{deleting ? t.common.deleting : t.common.delete}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.deleteDialog.title}</AlertDialogTitle>
                <AlertDialogDescription>{t.deleteDialog.before}<span className="font-semibold">{property.reference}</span>{t.deleteDialog.after}{property.source !== 'manual' && <>{t.deleteDialog.feedNote(PROPERTY_SOURCE_LABELS[property.source] || property.source)}</>}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t.common.delete}</AlertDialogAction>
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
            <CardHeader><CardTitle>{t.detail.overview}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t.detail.listingType}</p>
                  <p className="font-medium capitalize">{labelOf(t.listingType, property.listingType)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t.detail.price}</p>
                  <p className="font-medium text-lg">
                    {property.priceOnRequest ? t.detail.priceOnRequest : hasPrice(property.price) ? (
                      (Number(property.priceTo) > Number(property.price)
                        ? `${formatCurrency(Number(property.price), property.currency)} – ${formatCurrency(Number(property.priceTo), property.currency)}`
                        : formatCurrency(Number(property.price), property.currency))
                      + (property.rentalPeriod ? ` / ${labelOf(t.detail.per, property.rentalPeriod)}` : property.listingType === 'rent' ? ` / ${t.detail.per.month}` : '')
                    ) : t.common.na}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t.detail.location}</p>
                  <p className="font-medium">{property.location?.name?.en || property.location?.name?.es || t.common.notSet}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t.detail.propertyType}</p>
                  <p className="font-medium">{property.propertyType?.name?.en || property.propertyType?.name?.es || t.common.notSet}</p>
                </div>
                {property.urbanization && (
                  <div><p className="text-sm text-muted-foreground">{t.detail.urbanization}</p><p className="font-medium">{property.urbanization}</p></div>
                )}
                {property.project && (
                  <div><p className="text-sm text-muted-foreground">{t.detail.project}</p><p className="font-medium">{property.project}</p></div>
                )}
                {property.deliveryDate && (
                  <div><p className="text-sm text-muted-foreground">{t.detail.deliveryDate}</p><p className="font-medium">{fmtDateShort(property.deliveryDate)}</p></div>
                )}
                {property.completionDate && (
                  <div><p className="text-sm text-muted-foreground">{t.detail.completionDate}</p><p className="font-medium">{fmtDateShort(property.completionDate)}</p></div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          {detailItems.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t.detail.details}</CardTitle></CardHeader>
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
              <CardHeader><CardTitle>{t.detail.address}</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {property.street && <div><p className="text-sm text-muted-foreground">{t.detail.street}</p><p className="font-medium">{property.street} {property.streetNumber || ''}</p></div>}
                  {property.floor && <div><p className="text-sm text-muted-foreground">{t.detail.floor}</p><p className="font-medium">{property.floor}</p></div>}
                  {property.postcode && <div><p className="text-sm text-muted-foreground">{t.detail.postcode}</p><p className="font-medium">{property.postcode}</p></div>}
                  {property.cadastralReference && <div><p className="text-sm text-muted-foreground">{t.detail.cadastralReference}</p><p className="font-mono text-sm">{property.cadastralReference}</p></div>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Financial */}
          {hasFinancial && (
            <Card>
              <CardHeader><CardTitle>{t.detail.feesTaxes}</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {hasPrice(property.communityFees) && <div><p className="text-sm text-muted-foreground">{t.detail.communityFees}</p><p className="font-medium">{formatAmount(property.communityFees, property.currency)}{t.detail.perMonth}</p></div>}
                  {hasPrice(property.basuraTax) && <div><p className="text-sm text-muted-foreground">{t.detail.basuraTax}</p><p className="font-medium">{formatAmount(property.basuraTax, property.currency)}{t.detail.perYear}</p></div>}
                  {hasPrice(property.ibiFees) && <div><p className="text-sm text-muted-foreground">{t.detail.ibiFees}</p><p className="font-medium">{formatAmount(property.ibiFees, property.currency)}{t.detail.perYear}</p></div>}
                  {property.commission != null && (
                    <div>
                      <p className="text-sm text-muted-foreground">{t.detail.commission}</p>
                      <p className="font-medium">{formatDecimal(property.commission)}%{property.sharedCommission ? t.detail.shared : ''}</p>
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
                  <CardTitle>{t.detail.description}</CardTitle>
                  <Select value={descLang} onValueChange={setDescLang}>
                    <SelectTrigger className="w-[160px]">
                      <Languages className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang} value={lang}>
                          {langName(lang)}{property.description?.[lang] ? ' *' : ''}
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
                  <p className="text-sm text-muted-foreground italic">{t.detail.noDescriptionIn(langName(descLang))}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Features */}
          {property.features && property.features.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t.detail.features}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {property.features.map((featureId) => (<Badge key={featureId} variant="outline">{featuresMap[featureId] || t.detail.featureN(featureId)}</Badge>))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Media */}
          <Card>
            <CardHeader><CardTitle>{t.detail.media}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-3">{t.detail.images}</p>
                {property.images && property.images.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {property.images.map((image, index) => (
                      <div key={index} className="aspect-video rounded-lg bg-muted overflow-hidden">
                        <img src={image.url} alt={image.alt || t.detail.imageN(index + 1)} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-lg border border-dashed p-8 text-muted-foreground">
                    <FileImage className="h-5 w-5 mr-2" /> {t.detail.noImages}
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
                  <CardTitle>{t.detail.seo}</CardTitle>
                  <Select value={seoLang} onValueChange={setSeoLang}>
                    <SelectTrigger className="w-[160px]">
                      <Languages className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang} value={lang}>
                          {langName(lang)}{(property.metaTitle?.[lang] || property.metaDescription?.[lang] || property.pageTitle?.[lang]) ? ' *' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {property.slug && <div><p className="text-sm text-muted-foreground">{t.detail.slug}</p><p className="font-mono text-sm">{property.slug}</p></div>}
                {property.pageTitle?.[seoLang] && <div><p className="text-sm text-muted-foreground">{t.detail.pageTitle}</p><p className="text-sm">{property.pageTitle[seoLang]}</p></div>}
                {property.metaTitle?.[seoLang] && <div><p className="text-sm text-muted-foreground">{t.detail.metaTitle}</p><p className="text-sm">{property.metaTitle[seoLang]}</p></div>}
                {property.metaDescription?.[seoLang] && <div><p className="text-sm text-muted-foreground">{t.detail.metaDescription}</p><p className="text-sm">{property.metaDescription[seoLang]}</p></div>}
                {property.metaKeywords?.[seoLang] && <div><p className="text-sm text-muted-foreground">{t.detail.metaKeywords}</p><p className="text-sm">{property.metaKeywords[seoLang]}</p></div>}
                {!property.slug && !property.pageTitle?.[seoLang] && !property.metaTitle?.[seoLang] && !property.metaDescription?.[seoLang] && !property.metaKeywords?.[seoLang] && (
                  <p className="text-sm text-muted-foreground italic">{t.detail.noSeoIn(langName(seoLang))}</p>
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
              <CardHeader><CardTitle>{t.detail.agents}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {property.agent && (
                  <div>
                    <p className="text-sm text-muted-foreground">{t.detail.listingAgent}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium">{property.agent.name || property.agent.email}</p>
                    </div>
                  </div>
                )}
                {property.salesAgent && (
                  <div>
                    <p className="text-sm text-muted-foreground">{t.detail.salesAgent}</p>
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
            <CardHeader><CardTitle>{t.detail.metadata}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">{t.detail.source}</p>
                <Badge variant="outline" className="mt-1">{propertySourceLabel(property.source, tc.manualSource)}</Badge>
              </div>
              {property.externalId && <div><p className="text-sm text-muted-foreground">{t.detail.externalId}</p><p className="font-mono text-sm mt-1">{property.externalId}</p></div>}
              {property.agentReference && <div><p className="text-sm text-muted-foreground">{t.detail.agentReference}</p><p className="font-mono text-sm mt-1">{property.agentReference}</p></div>}
              {property.propertyTypeReference && <div><p className="text-sm text-muted-foreground">{t.detail.propertyTypeRef}</p><p className="font-mono text-sm mt-1">{property.propertyTypeReference}</p></div>}
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">{t.detail.syncEnabled}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {property.syncEnabled ? (<><CheckCircle2 className="h-4 w-4 text-primary" /><span className="text-sm">{t.common.yes}</span></>) : (<><XCircle className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{t.common.no}</span></>)}
                </div>
              </div>
              <Separator />
              <div><p className="text-sm text-muted-foreground">{t.detail.created}</p><p className="text-sm mt-1">{fmtDate(property.createdAt)}</p></div>
              <div>
                <p className="text-sm text-muted-foreground">{t.detail.lastUpdated}</p>
                <p className="text-sm mt-1">{fmtDate(property.updatedAt)}</p>
                {property.lastUpdatedByUser && (
                  <p className="text-xs text-muted-foreground mt-0.5">{t.detail.by(property.lastUpdatedByUser.name || property.lastUpdatedByUser.email || '')}</p>
                )}
              </div>
              {property.importedAt && <div><p className="text-sm text-muted-foreground">{t.detail.imported}</p><p className="text-sm mt-1">{fmtDate(property.importedAt)}</p></div>}
              {property.publishedAt && <div><p className="text-sm text-muted-foreground">{t.detail.published}</p><p className="text-sm mt-1">{fmtDate(property.publishedAt)}</p></div>}
              {property.soldAt && <div><p className="text-sm text-muted-foreground">{t.detail.sold}</p><p className="text-sm mt-1">{fmtDate(property.soldAt)}</p></div>}
              {property.lastUpdatedResales && <div><p className="text-sm text-muted-foreground">{t.detail.lastUpdatedResales}</p><p className="text-sm mt-1">{fmtDate(property.lastUpdatedResales)}</p></div>}
              {property.lat != null && property.lng != null && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">{t.detail.coordinates}</p>
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
