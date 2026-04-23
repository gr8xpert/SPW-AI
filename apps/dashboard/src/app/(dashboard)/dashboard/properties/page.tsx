'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
} from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface PropertyTypeOption { id: number; name: Record<string, string> | string; }

interface Property {
  id: number;
  reference: string;
  title: { en?: string; es?: string };
  price: number;
  currency: string;
  bedrooms: number;
  bathrooms: number;
  status: 'draft' | 'active' | 'sold' | 'archived';
  isPublished: boolean;
  source: string;
  location?: { name: { en?: string } };
  propertyType?: { name: { en?: string } };
  images?: Array<{ url: string }>;
  createdAt: string;
}

interface PropertiesResponse {
  data: Property[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
  draft: 'default',
  active: 'success',
  sold: 'warning',
  archived: 'destructive',
};

function displayName(name: Record<string, string> | string): string {
  if (typeof name === 'string') return name;
  return name?.en || name?.es || Object.values(name)[0] || '';
}

export default function PropertiesPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulkTranslating, setBulkTranslating] = useState(false);
  const [bulkJobId, setBulkJobId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [tenantLanguages, setTenantLanguages] = useState<string[]>([]);

  // Filters
  const [status, setStatus] = useState('');
  const [listingType, setListingType] = useState('');
  const [propertyTypeId, setPropertyTypeId] = useState('');
  const [source, setSource] = useState('');
  const [isOwnProperty, setIsOwnProperty] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [propertyTypes, setPropertyTypes] = useState<PropertyTypeOption[]>([]);

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
    return params;
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'properties', page, search,
      status, listingType, propertyTypeId, source, isOwnProperty, isFeatured,
    ],
    queryFn: () =>
      apiGet<PropertiesResponse>('/api/dashboard/properties', {
        params: buildParams(),
      }),
  });

  const properties = data?.data || [];
  const meta = data?.meta;

  // Load tenant languages + property types for filters
  useEffect(() => {
    apiGet<{ data: { settings?: { languages?: string[] } } }>('/api/dashboard/tenant')
      .then((res) => {
        const langs = res?.data?.settings?.languages;
        if (langs && langs.length > 1) setTenantLanguages(langs);
      })
      .catch(() => {});
    apiGet<{ data: PropertyTypeOption[] }>('/api/dashboard/property-types')
      .then((res) => {
        const types = res?.data || res;
        if (Array.isArray(types)) setPropertyTypes(types);
      })
      .catch(() => {});
  }, []);

  const onBulkTranslate = async () => {
    if (tenantLanguages.length < 2) {
      toast({ title: 'Multiple languages required', description: 'Enable at least 2 languages in Settings to use AI translation.', variant: 'destructive' });
      return;
    }
    const confirmed = window.confirm(
      `Translate all properties to ${tenantLanguages.length - 1} language(s)? This runs in the background and may take several minutes for large catalogs.`,
    );
    if (!confirmed) return;

    setBulkTranslating(true);
    setBulkProgress(0);
    try {
      const res = await apiPost<{ data: { jobId: string } }>('/api/dashboard/translate/properties/bulk', {
        targetLanguages: tenantLanguages,
      });
      const jobId = res.data?.jobId;
      if (!jobId) throw new Error('No job ID returned');
      setBulkJobId(jobId);
      toast({ title: 'Bulk translation started', description: 'Translating all properties in the background. This may take a few minutes.' });

      const poll = setInterval(async () => {
        try {
          const status = await apiGet<{ data: { status: string; progress: number; completed: number; failed: number; total: number } }>(
            `/api/dashboard/translate/job/${jobId}`,
          );
          const s = status.data;
          setBulkProgress(s.progress);
          if (s.status === 'completed' || s.status === 'failed') {
            clearInterval(poll);
            setBulkTranslating(false);
            setBulkJobId(null);
            toast({
              title: s.status === 'completed' ? 'Bulk translation complete' : 'Bulk translation finished with errors',
              description: `${s.completed - s.failed} succeeded, ${s.failed} failed out of ${s.total} translations.`,
              variant: s.failed > 0 ? 'destructive' : 'default',
            });
          }
        } catch {
          clearInterval(poll);
          setBulkTranslating(false);
        }
      }, 3000);
    } catch (err) {
      setBulkTranslating(false);
      toast({ title: 'Bulk translate failed', description: (err as Error).message || 'Unexpected error', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Properties</h1>
          <p className="text-muted-foreground">Manage your property listings</p>
        </div>
        <div className="flex items-center gap-2">
          {tenantLanguages.length > 1 && (
            <Button variant="outline" onClick={onBulkTranslate} disabled={bulkTranslating}>
              {bulkTranslating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Translating {bulkProgress}%
                </>
              ) : (
                <>
                  <Languages className="h-4 w-4 mr-2" />
                  Translate All
                </>
              )}
            </Button>
          )}
          <Button asChild>
            <Link href="/dashboard/properties/create">
              <Plus className="h-4 w-4 mr-2" />
              Add Property
            </Link>
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by reference, title..."
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
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">!</Badge>
              )}
              {filtersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>

          {filtersOpen && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Filters</p>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                    <X className="h-3 w-3 mr-1" /> Clear all
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                  <Select value={status} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="sold">Sold</SelectItem>
                      <SelectItem value="rented">Rented</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Listing Type</Label>
                  <Select value={listingType} onValueChange={(v) => { setListingType(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="sale">For Sale</SelectItem>
                      <SelectItem value="rent">For Rent</SelectItem>
                      <SelectItem value="holiday_rent">Holiday Rental</SelectItem>
                      <SelectItem value="development">Development</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Property Type</Label>
                  <Select value={propertyTypeId} onValueChange={(v) => { setPropertyTypeId(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All property types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All property types</SelectItem>
                      {propertyTypes.map((pt) => (
                        <SelectItem key={pt.id} value={pt.id.toString()}>{displayName(pt.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Source</Label>
                  <Select value={source} onValueChange={(v) => { setSource(v === 'all' ? '' : v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All sources" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="resales">Resales Online</SelectItem>
                      <SelectItem value="inmoba">Inmoba</SelectItem>
                      <SelectItem value="infocasa">Infocasa</SelectItem>
                      <SelectItem value="redsp">RedSP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Own Property</Label>
                  <div className="flex items-center gap-2 h-8">
                    <Switch checked={isOwnProperty} onCheckedChange={(v) => { setIsOwnProperty(v); setPage(1); }} />
                    <span className="text-sm text-muted-foreground">{isOwnProperty ? 'Yes' : 'All'}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Featured</Label>
                  <div className="flex items-center gap-2 h-8">
                    <Switch checked={isFeatured} onCheckedChange={(v) => { setIsFeatured(v); setPage(1); }} />
                    <span className="text-sm text-muted-foreground">{isFeatured ? 'Yes' : 'All'}</span>
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
          <CardTitle>All Properties</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-8 text-destructive">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>Failed to load properties</p>
              <p className="text-sm text-muted-foreground mt-1">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          ) : properties.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No properties found</p>
              <Button asChild className="mt-4">
                <Link href="/dashboard/properties/create">
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first property
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Image</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Beds/Baths</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {properties.map((property) => (
                    <TableRow key={property.id}>
                      <TableCell>
                        <div className="h-12 w-16 rounded-md bg-muted overflow-hidden">
                          {property.images?.[0]?.url ? (
                            <img src={property.images[0].url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">No image</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{property.reference}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{property.title?.en || property.title?.es || '-'}</TableCell>
                      <TableCell>{property.location?.name?.en || '-'}</TableCell>
                      <TableCell>{property.price ? formatCurrency(property.price, property.currency) : 'POA'}</TableCell>
                      <TableCell>{property.bedrooms || '-'} / {property.bathrooms || '-'}</TableCell>
                      <TableCell><Badge variant={statusColors[property.status]}>{property.status}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{property.source}</Badge></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/properties/${property.id}`}><Eye className="h-4 w-4 mr-2" /> View</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/properties/${property.id}/edit`}><Edit className="h-4 w-4 mr-2" /> Edit</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {meta && meta.pages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(meta.page - 1) * meta.limit + 1} to{' '}
                    {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} results
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(meta.pages, p + 1))} disabled={page === meta.pages}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
