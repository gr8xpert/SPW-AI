'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  GripVertical,
  Home,
  Building,
  Castle,
} from 'lucide-react';

interface PropertyType {
  id: number;
  name: { en: string; es?: string };
  slug: string;
  icon: string;
  propertyCount: number;
  sortOrder: number;
}

const sampleTypes: PropertyType[] = [
  { id: 1, name: { en: 'Villa', es: 'Villa' }, slug: 'villa', icon: 'castle', propertyCount: 45, sortOrder: 1 },
  { id: 2, name: { en: 'Apartment', es: 'Apartamento' }, slug: 'apartment', icon: 'building', propertyCount: 62, sortOrder: 2 },
  { id: 3, name: { en: 'Townhouse', es: 'Casa adosada' }, slug: 'townhouse', icon: 'home', propertyCount: 28, sortOrder: 3 },
  { id: 4, name: { en: 'Penthouse', es: 'Ático' }, slug: 'penthouse', icon: 'building', propertyCount: 15, sortOrder: 4 },
  { id: 5, name: { en: 'Land', es: 'Terreno' }, slug: 'land', icon: 'map', propertyCount: 6, sortOrder: 5 },
];

const iconMap: Record<string, React.ReactNode> = {
  castle: <Castle className="h-4 w-4" />,
  building: <Building className="h-4 w-4" />,
  home: <Home className="h-4 w-4" />,
  map: <div className="h-4 w-4 bg-muted rounded" />,
};

export default function PropertyTypesPage() {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredTypes = sampleTypes.filter(
    (type) =>
      type.name.en.toLowerCase().includes(search.toLowerCase()) ||
      type.name.es?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Property Types</h1>
          <p className="text-muted-foreground">
            Manage property type classifications
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Type
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Property Type</DialogTitle>
              <DialogDescription>
                Create a new property type classification
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name-en">Name (English)</Label>
                <Input id="name-en" placeholder="Villa" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name-es">Name (Spanish)</Label>
                <Input id="name-es" placeholder="Villa" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" placeholder="villa" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsDialogOpen(false)}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search property types..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Property Types ({filteredTypes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Properties</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTypes.map((type) => (
                <TableRow key={type.id}>
                  <TableCell>
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                        {iconMap[type.icon] || <Home className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="font-medium">{type.name.en}</p>
                        {type.name.es && type.name.es !== type.name.en && (
                          <p className="text-xs text-muted-foreground">{type.name.es}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {type.slug}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{type.propertyCount}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
