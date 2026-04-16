'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  Edit,
  Trash2,
  ChevronRight,
  ChevronDown,
  MapPin,
  Building2,
  FolderTree,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Location {
  id: number;
  name: { en: string; es?: string };
  slug: string;
  level: 'country' | 'province' | 'municipality' | 'town' | 'area';
  parentId: number | null;
  propertyCount: number;
  children?: Location[];
}

// Sample data with hierarchy
const sampleLocations: Location[] = [
  {
    id: 1,
    name: { en: 'Spain', es: 'España' },
    slug: 'spain',
    level: 'country',
    parentId: null,
    propertyCount: 156,
    children: [
      {
        id: 2,
        name: { en: 'Málaga', es: 'Málaga' },
        slug: 'malaga',
        level: 'province',
        parentId: 1,
        propertyCount: 120,
        children: [
          {
            id: 3,
            name: { en: 'Marbella' },
            slug: 'marbella',
            level: 'town',
            parentId: 2,
            propertyCount: 45,
            children: [
              { id: 6, name: { en: 'Golden Mile' }, slug: 'golden-mile', level: 'area', parentId: 3, propertyCount: 15 },
              { id: 7, name: { en: 'Puerto Banus' }, slug: 'puerto-banus', level: 'area', parentId: 3, propertyCount: 20 },
              { id: 8, name: { en: 'Nueva Andalucia' }, slug: 'nueva-andalucia', level: 'area', parentId: 3, propertyCount: 10 },
            ],
          },
          {
            id: 4,
            name: { en: 'Estepona' },
            slug: 'estepona',
            level: 'town',
            parentId: 2,
            propertyCount: 35,
          },
          {
            id: 5,
            name: { en: 'Benalmádena' },
            slug: 'benalmadena',
            level: 'town',
            parentId: 2,
            propertyCount: 40,
          },
        ],
      },
      {
        id: 9,
        name: { en: 'Alicante' },
        slug: 'alicante',
        level: 'province',
        parentId: 1,
        propertyCount: 36,
      },
    ],
  },
];

const levelColors: Record<string, string> = {
  country: 'bg-blue-100 text-blue-800',
  province: 'bg-purple-100 text-purple-800',
  municipality: 'bg-indigo-100 text-indigo-800',
  town: 'bg-green-100 text-green-800',
  area: 'bg-amber-100 text-amber-800',
};

function LocationItem({
  location,
  depth = 0,
}: {
  location: Location;
  depth?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = location.children && location.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'flex items-center justify-between py-3 px-4 hover:bg-muted/50 rounded-md transition-colors',
          depth > 0 && 'border-l-2 border-muted ml-4'
        )}
        style={{ paddingLeft: `${depth * 16 + 16}px` }}
      >
        <div className="flex items-center gap-3">
          {hasChildren ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <div className="w-6" />
          )}
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{location.name.en}</p>
            {location.name.es && location.name.es !== location.name.en && (
              <p className="text-xs text-muted-foreground">{location.name.es}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className={levelColors[location.level]}>
            {location.level}
          </Badge>
          <span className="text-sm text-muted-foreground min-w-[80px] text-right">
            {location.propertyCount} properties
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Plus className="h-4 w-4 mr-2" />
                Add Child Location
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {location.children!.map((child) => (
            <LocationItem key={child.id} location={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function LocationsPage() {
  const [search, setSearch] = useState('');

  const stats = {
    total: 9,
    countries: 1,
    provinces: 2,
    towns: 3,
    areas: 3,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Locations</h1>
          <p className="text-muted-foreground">
            Manage your location hierarchy for property filtering
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Location
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Countries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.countries}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Provinces</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.provinces}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Towns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.towns}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Areas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.areas}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search locations..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Location Tree */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            <CardTitle>Location Hierarchy</CardTitle>
          </div>
          <CardDescription>
            Drag and drop to reorder, click to expand/collapse
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {sampleLocations.map((location) => (
              <LocationItem key={location.id} location={location} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
