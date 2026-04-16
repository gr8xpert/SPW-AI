'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Waves,
  Sun,
  Car,
  Shield,
  Trees,
  Thermometer,
  Eye,
  Home,
} from 'lucide-react';

interface Feature {
  id: number;
  name: { en: string; es?: string };
  category: string;
  icon: string;
  propertyCount: number;
}

const categories = [
  { id: 'all', name: 'All Features' },
  { id: 'interior', name: 'Interior' },
  { id: 'exterior', name: 'Exterior' },
  { id: 'community', name: 'Community' },
  { id: 'climate', name: 'Climate' },
  { id: 'views', name: 'Views' },
  { id: 'security', name: 'Security' },
  { id: 'parking', name: 'Parking' },
];

const sampleFeatures: Feature[] = [
  { id: 1, name: { en: 'Swimming Pool', es: 'Piscina' }, category: 'exterior', icon: 'waves', propertyCount: 85 },
  { id: 2, name: { en: 'Sea View', es: 'Vista al mar' }, category: 'views', icon: 'eye', propertyCount: 62 },
  { id: 3, name: { en: 'Garden', es: 'Jardín' }, category: 'exterior', icon: 'trees', propertyCount: 78 },
  { id: 4, name: { en: 'Air Conditioning', es: 'Aire acondicionado' }, category: 'climate', icon: 'thermometer', propertyCount: 120 },
  { id: 5, name: { en: 'Garage', es: 'Garaje' }, category: 'parking', icon: 'car', propertyCount: 95 },
  { id: 6, name: { en: 'Security System', es: 'Sistema de seguridad' }, category: 'security', icon: 'shield', propertyCount: 45 },
  { id: 7, name: { en: 'Terrace', es: 'Terraza' }, category: 'exterior', icon: 'sun', propertyCount: 88 },
  { id: 8, name: { en: 'Gym', es: 'Gimnasio' }, category: 'community', icon: 'home', propertyCount: 32 },
];

const iconMap: Record<string, React.ReactNode> = {
  waves: <Waves className="h-4 w-4" />,
  eye: <Eye className="h-4 w-4" />,
  trees: <Trees className="h-4 w-4" />,
  thermometer: <Thermometer className="h-4 w-4" />,
  car: <Car className="h-4 w-4" />,
  shield: <Shield className="h-4 w-4" />,
  sun: <Sun className="h-4 w-4" />,
  home: <Home className="h-4 w-4" />,
};

export default function FeaturesPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredFeatures = sampleFeatures.filter((feature) => {
    const matchesSearch =
      feature.name.en.toLowerCase().includes(search.toLowerCase()) ||
      feature.name.es?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      activeCategory === 'all' || feature.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Features</h1>
          <p className="text-muted-foreground">
            Manage property features and amenities
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Feature
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sampleFeatures.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Most Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Air Conditioning</div>
            <p className="text-xs text-muted-foreground">120 properties</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length - 1}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg per Property</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">6.2</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search features..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Features by Category */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="flex-wrap h-auto gap-2 bg-transparent p-0">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat.id}
              value={cat.id}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {cat.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {categories.find((c) => c.id === activeCategory)?.name} (
                {filteredFeatures.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredFeatures.map((feature) => (
                  <div
                    key={feature.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                        {iconMap[feature.icon] || <Home className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="font-medium">{feature.name.en}</p>
                        {feature.name.es && feature.name.es !== feature.name.en && (
                          <p className="text-xs text-muted-foreground">
                            {feature.name.es}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{feature.propertyCount}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
