'use client';

import { useState } from 'react';
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
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  AlertCircle,
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

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

interface RangeFilter {
  min: string;
  max: string;
}

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
  draft: 'default',
  active: 'success',
  sold: 'warning',
  archived: 'destructive',
};

const emptyRange = (): RangeFilter => ({ min: '', max: '' });

function RangeInputs({
  label,
  value,
  onChange,
  onPageReset,
}: {
  label: string;
  value: RangeFilter;
  onChange: (v: RangeFilter) => void;
  onPageReset: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Min"
          className="h-8 text-sm"
          value={value.min}
          onChange={(e) => { onChange({ ...value, min: e.target.value }); onPageReset(); }}
        />
        <span className="text-xs text-muted-foreground shrink-0">to</span>
        <Input
          type="number"
          placeholder="Max"
          className="h-8 text-sm"
          value={value.max}
          onChange={(e) => { onChange({ ...value, max: e.target.value }); onPageReset(); }}
        />
      </div>
    </div>
  );
}

export default function PropertiesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [price, setPrice] = useState<RangeFilter>(emptyRange());
  const [bedrooms, setBedrooms] = useState<RangeFilter>(emptyRange());
  const [bathrooms, setBathrooms] = useState<RangeFilter>(emptyRange());
  const [buildSize, setBuildSize] = useState<RangeFilter>(emptyRange());
  const [plotSize, setPlotSize] = useState<RangeFilter>(emptyRange());
  const [terraceSize, setTerraceSize] = useState<RangeFilter>(emptyRange());

  const hasActiveFilters =
    [price, bedrooms, bathrooms, buildSize, plotSize, terraceSize].some(
      (r) => r.min !== '' || r.max !== ''
    );

  const clearFilters = () => {
    setPrice(emptyRange());
    setBedrooms(emptyRange());
    setBathrooms(emptyRange());
    setBuildSize(emptyRange());
    setPlotSize(emptyRange());
    setTerraceSize(emptyRange());
    setPage(1);
  };

  const resetPage = () => setPage(1);

  const buildParams = () => {
    const params: Record<string, any> = { page, limit: 20 };
    if (search) params.search = search;
    if (price.min) params.minPrice = price.min;
    if (price.max) params.maxPrice = price.max;
    if (bedrooms.min) params.minBedrooms = bedrooms.min;
    if (bedrooms.max) params.maxBedrooms = bedrooms.max;
    if (bathrooms.min) params.minBathrooms = bathrooms.min;
    if (bathrooms.max) params.maxBathrooms = bathrooms.max;
    if (buildSize.min) params.minBuildSize = buildSize.min;
    if (buildSize.max) params.maxBuildSize = buildSize.max;
    if (plotSize.min) params.minPlotSize = plotSize.min;
    if (plotSize.max) params.maxPlotSize = plotSize.max;
    if (terraceSize.min) params.minTerraceSize = terraceSize.min;
    if (terraceSize.max) params.maxTerraceSize = terraceSize.max;
    return params;
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'properties', page, search,
      price, bedrooms, bathrooms, buildSize, plotSize, terraceSize,
    ],
    queryFn: () =>
      apiGet<PropertiesResponse>('/api/dashboard/properties', {
        params: buildParams(),
      }),
  });

  const properties = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Properties</h1>
          <p className="text-muted-foreground">Manage your property listings</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/properties/create">
            <Plus className="h-4 w-4 mr-2" />
            Add Property
          </Link>
        </Button>
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
                <p className="text-sm font-medium">Range Filters</p>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                    <X className="h-3 w-3 mr-1" /> Clear all
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <RangeInputs label="Price" value={price} onChange={setPrice} onPageReset={resetPage} />
                <RangeInputs label="Bedrooms" value={bedrooms} onChange={setBedrooms} onPageReset={resetPage} />
                <RangeInputs label="Bathrooms" value={bathrooms} onChange={setBathrooms} onPageReset={resetPage} />
                <RangeInputs label="Build Size (m²)" value={buildSize} onChange={setBuildSize} onPageReset={resetPage} />
                <RangeInputs label="Plot Size (m²)" value={plotSize} onChange={setPlotSize} onPageReset={resetPage} />
                <RangeInputs label="Terrace (m²)" value={terraceSize} onChange={setTerraceSize} onPageReset={resetPage} />
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
