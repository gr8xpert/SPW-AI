'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Property, PropertyListResponse, PropertySource } from '@spm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PropertyRowsTable } from '@/components/property-rows-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  AlertCircle,
  SlidersHorizontal,
  X,
  Languages,
  Loader2,
  ChevronUp,
  ChevronDown,
  Lock,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { PROPERTY_SOURCE_LABELS, propertySourceLabel } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useDashboardAddons } from '@/hooks/use-dashboard-addons';
import { LockedFeatureDialog } from '@/components/locked-feature-dialog';
import { BulkSeoDialog } from '@/components/bulk-seo-dialog';
import { useBulkJob } from '@/hooks/use-bulk-job';
import { propertyKeys, useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { PageNumbers } from '@/components/ui/page-numbers';
import { useLanguage } from '@/i18n/i18n-provider';
import { labelOf, usePropertiesText } from './_i18n';
import { useCommonText } from '@/i18n/common';

interface PropertyTypeOption { id: number; name: Record<string, string> | string; }

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
  draft: 'default',
  active: 'success',
  sold: 'warning',
  archived: 'destructive',
};

// Module-level so BulkSeoDialog gets a stable reference — it resets its
// language selection whenever this prop changes identity.
const DEFAULT_LANGUAGES = ['en'];

function displayName(name: Record<string, string> | string): string {
  if (typeof name === 'string') return name;
  return name?.en || name?.es || Object.values(name)[0] || '';
}

export default function PropertiesPage() {
  const { toast } = useToast();
  const t = usePropertiesText();
  const tc = useCommonText();
  const { locale } = useLanguage();
  const { addons, known: addonsKnown } = useDashboardAddons();
  // Not greyed out while the plan is still loading (see useDashboardAddons).
  const canAddProperty = addons.addProperty || !addonsKnown;
  const [lockOpen, setLockOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const queryClient = useQueryClient();
  // Signed-in user + impersonated client: part of every key below, so a
  // super-admin switching clients never sees the previous client's cache.
  const { scope, ready } = useTenantQueryScope();

  // Filters
  const [status, setStatus] = useState('');
  const [listingType, setListingType] = useState('');
  const [propertyTypeId, setPropertyTypeId] = useState('');
  const [source, setSource] = useState('');
  const [isOwnProperty, setIsOwnProperty] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  // Set from a link on the Locations page (?locationId=…&locationName=…):
  // that place and every place inside it, matching the count shown there.
  const [location, setLocation] = useState<{ id: string; name: string } | null>(null);
  // The list waits for the address to be read, so a filtered link doesn't
  // first load every property.
  const [urlRead, setUrlRead] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get('locationId');
    if (id && /^\d+$/.test(id)) setLocation({ id, name: q.get('locationName') || `#${id}` });
    const p = Number(q.get('page'));
    if (Number.isInteger(p) && p > 1) setPage(p);
    setUrlRead(true);
  }, []);

  // The page number lives in the address, so opening a listing and coming
  // back (or a refresh) lands on the same page instead of page 1.
  useEffect(() => {
    if (!urlRead) return;
    const q = new URLSearchParams(window.location.search);
    if (page > 1) q.set('page', String(page));
    else q.delete('page');
    const query = q.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  }, [page, urlRead]);

  const changePage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearLocation = () => {
    setLocation(null);
    setPage(1);
    window.history.replaceState(null, '', window.location.pathname);
  };

  const hasActiveFilters = !!(status || listingType || propertyTypeId || source || isOwnProperty || isFeatured);

  const clearFilters = () => {
    setStatus('');
    setListingType('');
    setPropertyTypeId('');
    setSource('');
    setIsOwnProperty(false);
    setIsFeatured(false);
    setPage(1);
  };

  const buildParams = () => {
    const params: Record<string, any> = { page, limit: 50 };
    if (search) params.search = search;
    if (status) params.status = status;
    if (listingType) params.listingType = listingType;
    if (propertyTypeId) params.propertyTypeId = propertyTypeId;
    if (source) params.source = source;
    if (isOwnProperty) params.isOwnProperty = true;
    if (isFeatured) params.isFeatured = true;
    if (location) params.locationId = location.id;
    return params;
  };

  const params = buildParams();
  const { data, isPending, isError, error } = useQuery({
    queryKey: propertyKeys.list(scope, params),
    queryFn: () =>
      apiGet<PropertyListResponse>('/api/dashboard/properties', { params }),
    enabled: urlRead && ready,
  });

  const properties = data?.data || [];
  const meta = data?.meta;

  // Tenant languages + property types for the header buttons and filters.
  // Through react-query rather than a one-shot effect: a request that fails
  // while the session is still settling is retried instead of silently
  // leaving Translate All hidden and the type filter empty until a reload.
  const { data: tenantData } = useQuery({
    queryKey: ['dashboard-tenant', ...scope],
    queryFn: () =>
      apiGet<{ data: { settings?: { languages?: string[] } } }>('/api/dashboard/tenant'),
    enabled: ready,
    staleTime: 5 * 60 * 1000,
  });
  const configuredLanguages = tenantData?.data?.settings?.languages;
  const tenantLanguages =
    configuredLanguages && configuredLanguages.length > 1 ? configuredLanguages : [];

  const { data: typesData } = useQuery({
    queryKey: ['dashboard-property-types', ...scope],
    queryFn: () =>
      apiGet<{ data: PropertyTypeOption[] } | PropertyTypeOption[]>('/api/dashboard/property-types'),
    enabled: ready,
    staleTime: 5 * 60 * 1000,
  });
  const propertyTypes: PropertyTypeOption[] = Array.isArray(typesData)
    ? typesData
    : Array.isArray(typesData?.data)
      ? typesData.data
      : [];

  // Progress comes from the server, so it survives a refresh or leaving the
  // page, and the button stays disabled while a run is in flight.
  const bulkTranslate = useBulkJob({
    activeUrl: '/api/dashboard/translate/jobs/active?entityType=property',
    statusUrl: (jobId) => `/api/dashboard/translate/job/${jobId}`,
    onFinished: (s) => {
      // Translated titles show in the table, so reload it.
      void queryClient.invalidateQueries({ queryKey: propertyKeys.lists() });
      toast({
        title: s.status === 'completed' ? t.list.bulkComplete : t.list.bulkWithErrors,
        description: t.list.bulkResult(s.completed - s.failed, s.failed, s.total),
        variant: s.failed > 0 ? 'destructive' : 'default',
      });
    },
  });

  const startBulkTranslate = useMutation({
    mutationFn: async (targetLanguages: string[]) => {
      const res = await apiPost<{ data: { jobId: string; alreadyRunning?: boolean } }>(
        '/api/dashboard/translate/properties/bulk',
        { targetLanguages },
      );
      if (!res.data?.jobId) throw new Error(t.list.noJobId);
      return res.data;
    },
    onSuccess: ({ jobId, alreadyRunning }) => {
      bulkTranslate.track(jobId);
      toast(
        alreadyRunning
          ? { title: t.list.bulkAlready, description: t.list.bulkAlreadyDescription }
          : { title: t.list.bulkStarted, description: t.list.bulkStartedDescription },
      );
    },
    onError: (err) => {
      toast({ title: t.list.bulkFailed, description: (err as Error).message || t.common.unexpectedError, variant: 'destructive' });
    },
  });
  const bulkTranslating = startBulkTranslate.isPending || bulkTranslate.running;

  // Row "Delete": the same endpoint and hard delete as the detail page. The
  // dialog lives outside the row menu (opened via state) because a dialog
  // nested in a closing DropdownMenu unmounts with it.
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null);
  const deleteProperty = useMutation({
    mutationFn: (property: Property) => apiDelete(`/api/dashboard/properties/${property.id}`),
    onSuccess: (_res, property) => {
      toast({ title: t.deleteDialog.deleted, description: t.deleteDialog.deletedDescription(String(property.reference || property.id)) });
      // All property keys, not just lists: a cached detail of this row
      // would otherwise still open after the delete.
      void queryClient.invalidateQueries({ queryKey: propertyKeys.all });
    },
    onError: (err: any) => {
      toast({
        title: t.deleteDialog.failed,
        description: err?.response?.data?.message || err?.message || t.deleteDialog.failedDescription,
        variant: 'destructive',
      });
    },
  });

  const onBulkTranslate = () => {
    if (tenantLanguages.length < 2) {
      toast({ title: t.list.multipleLanguages, description: t.list.multipleLanguagesDescription, variant: 'destructive' });
      return;
    }
    const confirmed = window.confirm(t.list.confirmTranslate(tenantLanguages.length - 1));
    if (!confirmed) return;
    startBulkTranslate.mutate(tenantLanguages);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{t.list.title}</h1>
          <p className="page-description mt-1">{t.list.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <BulkSeoDialog tenantLanguages={configuredLanguages?.length ? configuredLanguages : DEFAULT_LANGUAGES} />
          {tenantLanguages.length > 1 && (
            <Button variant="outline" onClick={onBulkTranslate} disabled={bulkTranslating}>
              {bulkTranslating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t.list.translating(bulkTranslate.progress)}
                </>
              ) : (
                <>
                  <Languages className="h-4 w-4 mr-2" />
                  {t.list.translateAll}
                </>
              )}
            </Button>
          )}
          {canAddProperty ? (
            <Button asChild className="shadow-sm">
              <Link href="/dashboard/properties/create">
                <Plus className="h-4 w-4 mr-2" />
                {t.list.addProperty}
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              className="shadow-sm"
              onClick={() => setLockOpen(true)}
              title={t.list.addPropertyLocked}
            >
              <Lock className="h-4 w-4 mr-2" />
              {t.list.addProperty}
            </Button>
          )}
        </div>
      </div>

      <LockedFeatureDialog
        open={lockOpen}
        onOpenChange={setLockOpen}
        featureName={t.list.addProperty}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteDialog.before}<span className="font-semibold">{deleteTarget?.reference}</span>{t.deleteDialog.after}
              {deleteTarget && deleteTarget.source !== 'manual' && (
                <>{t.deleteDialog.feedNote(PROPERTY_SOURCE_LABELS[deleteTarget.source] || deleteTarget.source)}</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) deleteProperty.mutate(deleteTarget); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Search & Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t.list.searchPlaceholder}
                className="pl-10"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t.list.filters}
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">!</Badge>
              )}
              {filtersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>

          {location && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t.list.location}</span>
              <Badge variant="secondary" className="gap-1 pr-1" data-testid="location-filter">
                {location.name}
                <button type="button" onClick={clearLocation} aria-label={t.list.removeLocationFilter} className="rounded-full p-0.5 hover:bg-muted">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
              <span className="text-xs text-muted-foreground">{t.list.includingInside}</span>
            </div>
          )}

          {filtersOpen && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">{t.list.filters}</p>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                    <X className="h-3 w-3 mr-1" /> {t.list.clearAll}
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{t.list.status}</Label>
                  <Select value={status} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t.list.allStatuses} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.list.allStatuses}</SelectItem>
                      <SelectItem value="draft">{t.status.draft}</SelectItem>
                      <SelectItem value="active">{t.status.active}</SelectItem>
                      <SelectItem value="sold">{t.status.sold}</SelectItem>
                      <SelectItem value="rented">{t.status.rented}</SelectItem>
                      <SelectItem value="archived">{t.status.archived}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{t.list.listingType}</Label>
                  <Select value={listingType} onValueChange={(v) => { setListingType(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t.list.allTypes} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.list.allTypes}</SelectItem>
                      <SelectItem value="sale">{t.listingType.sale}</SelectItem>
                      <SelectItem value="rent">{t.listingType.rent}</SelectItem>
                      <SelectItem value="holiday_rent">{t.listingType.holiday_rent}</SelectItem>
                      <SelectItem value="development">{t.listingType.development}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{t.list.propertyType}</Label>
                  <Select value={propertyTypeId} onValueChange={(v) => { setPropertyTypeId(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t.list.allPropertyTypes} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.list.allPropertyTypes}</SelectItem>
                      {propertyTypes.map((pt) => (
                        <SelectItem key={pt.id} value={pt.id.toString()}>{displayName(pt.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{t.list.source}</Label>
                  <Select value={source} onValueChange={(v) => { setSource(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t.list.allSources} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.list.allSources}</SelectItem>
                      {/* Every properties.source value, so Kyero/Odoo imports can be filtered too. */}
                      {(Object.keys(PROPERTY_SOURCE_LABELS) as PropertySource[]).map((s) => (
                        <SelectItem key={s} value={s}>{propertySourceLabel(s, tc.manualSource)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{t.list.ownProperty}</Label>
                  <div className="flex items-center gap-2 h-8">
                    <Switch checked={isOwnProperty} onCheckedChange={(v) => { setIsOwnProperty(v); setPage(1); }} />
                    <span className="text-sm text-muted-foreground">{isOwnProperty ? t.common.yes : t.common.all}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">{t.list.featured}</Label>
                  <div className="flex items-center gap-2 h-8">
                    <Switch checked={isFeatured} onCheckedChange={(v) => { setIsFeatured(v); setPage(1); }} />
                    <span className="text-sm text-muted-foreground">{isFeatured ? t.common.yes : t.common.all}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          {/* Total beside the heading: the "Showing x to y of n" line below only
              appears when there is more than one page. */}
          <CardTitle data-testid="properties-heading">
            {hasActiveFilters || location || search.trim() ? t.list.matching : t.list.allProperties}
            {meta && (
              <>
                {' '}
                <span className="font-normal text-muted-foreground">({meta.total.toLocaleString(locale)})</span>
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isPending || !urlRead ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-8 text-destructive">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>{t.list.loadFailed}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {error instanceof Error ? error.message : t.common.unknownError}
              </p>
            </div>
          ) : properties.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t.list.noProperties}</p>
              {canAddProperty ? (
                <Button asChild className="mt-4">
                  <Link href="/dashboard/properties/create">
                    <Plus className="h-4 w-4 mr-2" />
                    {t.list.addFirst}
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  className="mt-4"
                  onClick={() => setLockOpen(true)}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  {t.list.addFirst}
                </Button>
              )}
            </div>
          ) : (
            <>
              <PropertyRowsTable
                rows={properties.map((property: Property) => ({ ...property, image: property.images?.[0]?.url ?? null, property }))}
                columns={['image', 'reference', 'title', 'location', 'price', 'bedsBaths']}
                extra={[
                  { key: 'status', header: t.list.status, cell: ({ property }) => <Badge variant={statusColors[property.status]}>{labelOf(t.status, property.status)}</Badge> },
                  { key: 'source', header: t.list.source, cell: ({ property }) => <Badge variant="outline">{propertySourceLabel(property.source, tc.manualSource)}</Badge> },
                ]}
                actions={({ property }) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/properties/${property.id}`}><Eye className="h-4 w-4 mr-2" /> {t.common.view}</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/properties/${property.id}/edit`}><Edit className="h-4 w-4 mr-2" /> {t.common.edit}</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        disabled={deleteProperty.isPending}
                        onSelect={() => setDeleteTarget(property)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> {t.common.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              />

              {meta && meta.pages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    {t.list.showing(
                      ((meta.page - 1) * meta.limit + 1).toLocaleString(locale),
                      Math.min(meta.page * meta.limit, meta.total).toLocaleString(locale),
                      meta.total.toLocaleString(locale),
                    )}
                  </p>
                  <PageNumbers page={page} pages={meta.pages} onChange={changePage} />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
