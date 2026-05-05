'use client';

import { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, RefreshCw, Package } from 'lucide-react';

interface CreditPackage {
  id: number;
  name: string;
  hours: number;
  pricePerHour: number;
  totalPrice: number;
  currency: string;
  stripePriceId: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export default function CreditPackagesPage() {
  const api = useApi();
  const { toast } = useToast();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<CreditPackage | null>(null);
  const [editingPkg, setEditingPkg] = useState<CreditPackage | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    hours: '',
    pricePerHour: '35',
    totalPrice: '',
    currency: 'EUR',
    stripePriceId: '',
    isActive: true,
    sortOrder: '0',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/super-admin/credit-packages');
      const body = res?.data || res;
      setPackages(Array.isArray(body) ? body : body?.data || []);
    } catch (error) {
      console.error('Failed to fetch credit packages:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setFormData({
      name: '',
      hours: '',
      pricePerHour: '35',
      totalPrice: '',
      currency: 'EUR',
      stripePriceId: '',
      isActive: true,
      sortOrder: '0',
    });
  };

  const recalcTotal = (hours: string, pph: string) => {
    const h = parseFloat(hours);
    const p = parseFloat(pph);
    if (!isNaN(h) && !isNaN(p)) {
      return (h * p).toFixed(2);
    }
    return '';
  };

  const handleHoursChange = (hours: string) => {
    setFormData({
      ...formData,
      hours,
      totalPrice: recalcTotal(hours, formData.pricePerHour),
    });
  };

  const handlePricePerHourChange = (pph: string) => {
    setFormData({
      ...formData,
      pricePerHour: pph,
      totalPrice: recalcTotal(formData.hours, pph),
    });
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.post('/api/super-admin/credit-packages', {
        name: formData.name,
        hours: parseFloat(formData.hours),
        pricePerHour: parseFloat(formData.pricePerHour),
        totalPrice: parseFloat(formData.totalPrice),
        currency: formData.currency,
        stripePriceId: formData.stripePriceId.trim() || null,
        isActive: formData.isActive,
        sortOrder: parseInt(formData.sortOrder) || 0,
      });
      setIsCreateOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Failed to create credit package:', error);
      toast({ title: 'Error', description: error.response?.data?.message || error.message || 'Failed to create package', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (pkg: CreditPackage) => {
    setEditingPkg(pkg);
    setFormData({
      name: pkg.name,
      hours: pkg.hours.toString(),
      pricePerHour: pkg.pricePerHour.toString(),
      totalPrice: pkg.totalPrice.toString(),
      currency: pkg.currency,
      stripePriceId: pkg.stripePriceId || '',
      isActive: pkg.isActive,
      sortOrder: pkg.sortOrder.toString(),
    });
    setIsEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingPkg) return;
    setSaving(true);
    try {
      await api.put(`/api/super-admin/credit-packages/${editingPkg.id}`, {
        name: formData.name,
        hours: parseFloat(formData.hours),
        pricePerHour: parseFloat(formData.pricePerHour),
        totalPrice: parseFloat(formData.totalPrice),
        currency: formData.currency,
        stripePriceId: formData.stripePriceId.trim() || null,
        isActive: formData.isActive,
        sortOrder: parseInt(formData.sortOrder) || 0,
      });
      setIsEditOpen(false);
      setEditingPkg(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Failed to update credit package:', error);
      toast({ title: 'Error', description: error.response?.data?.message || error.message || 'Failed to update package', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await api.delete(`/api/super-admin/credit-packages/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchData();
    } catch (error: any) {
      console.error('Failed to delete credit package:', error);
      toast({ title: 'Error', description: error.response?.data?.message || error.message || 'Failed to delete package', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const PackageForm = ({ onSubmit }: { onSubmit: () => void }) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Package Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g. 5 Hours Pack"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="hours">Hours</Label>
          <Input
            id="hours"
            type="number"
            step="0.25"
            min="0.25"
            value={formData.hours}
            onChange={(e) => handleHoursChange(e.target.value)}
            placeholder="5"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pricePerHour">Price/Hour ({formData.currency})</Label>
          <Input
            id="pricePerHour"
            type="number"
            step="0.01"
            min="0"
            value={formData.pricePerHour}
            onChange={(e) => handlePricePerHourChange(e.target.value)}
            placeholder="35.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="totalPrice">Total ({formData.currency})</Label>
          <Input
            id="totalPrice"
            type="number"
            step="0.01"
            min="0"
            value={formData.totalPrice}
            onChange={(e) => setFormData({ ...formData, totalPrice: e.target.value })}
            placeholder="175.00"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            value={formData.currency}
            onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
            placeholder="EUR"
            maxLength={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sortOrder">Sort Order</Label>
          <Input
            id="sortOrder"
            type="number"
            value={formData.sortOrder}
            onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stripePriceId">Stripe Price ID (optional)</Label>
        <Input
          id="stripePriceId"
          value={formData.stripePriceId}
          onChange={(e) => setFormData({ ...formData, stripePriceId: e.target.value })}
          placeholder="price_1N..."
        />
        <p className="text-xs text-muted-foreground">
          Leave blank to use dynamic pricing from the fields above
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
        />
        <Label>Active</Label>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setIsCreateOpen(false);
            setIsEditOpen(false);
            resetForm();
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={saving || !formData.name.trim() || !formData.hours || isNaN(parseFloat(formData.hours)) || parseFloat(formData.hours) <= 0 || !formData.totalPrice || isNaN(parseFloat(formData.totalPrice)) || parseFloat(formData.totalPrice) <= 0}
        >
          {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          {editingPkg ? 'Update' : 'Create'}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Credit Packages</h1>
          <p className="page-description mt-1">
            Manage purchasable credit hour packages for clients
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button
              className="shadow-sm"
              onClick={() => {
                resetForm();
                setEditingPkg(null);
                setIsCreateOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Package
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Credit Package</DialogTitle>
              <DialogDescription>
                Add a new credit hour package that clients can purchase
              </DialogDescription>
            </DialogHeader>
            <PackageForm onSubmit={handleCreate} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Packages</CardTitle>
          <CardDescription>
            Configure credit hour packages and pricing. Clients purchase these via Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : packages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Package className="h-8 w-8 mb-2" />
              <p className="text-sm">No credit packages yet. Create one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Price/Hour</TableHead>
                  <TableHead>Total Price</TableHead>
                  <TableHead>Stripe Price ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{pkg.name}</p>
                        <p className="text-xs text-muted-foreground">Order: {pkg.sortOrder}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{pkg.hours}h</TableCell>
                    <TableCell className="font-mono">
                      {pkg.currency} {Number(pkg.pricePerHour).toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono font-semibold">
                      {pkg.currency} {Number(pkg.totalPrice).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {pkg.stripePriceId ? (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {pkg.stripePriceId}
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground">Dynamic</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={pkg.isActive ? 'default' : 'secondary'}>
                        {pkg.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(pkg)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(pkg)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Credit Package</DialogTitle>
            <DialogDescription>Update package settings</DialogDescription>
          </DialogHeader>
          <PackageForm onSubmit={handleUpdate} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the &quot;{deleteConfirm?.name}&quot; package?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground"
            >
              {deleting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
