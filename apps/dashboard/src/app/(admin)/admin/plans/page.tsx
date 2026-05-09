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
import { Plus, Edit, Trash2, RefreshCw, Check, X } from 'lucide-react';

interface PlanFeatures {
  feeds: boolean;
  campaigns: boolean;
  analytics: boolean;
  apiAccess: boolean;
  customBranding: boolean;
}

interface Plan {
  id: number;
  name: string;
  slug: string;
  priceMonthly: number | null;
  priceYearly: number | null;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  maxProperties: number;
  maxUsers: number;
  features: PlanFeatures | null;
  isActive: boolean;
  createdAt: string;
}

interface PlanStats {
  planId: number;
  planName: string;
  tenantCount: number;
}

const defaultFeatures: PlanFeatures = {
  feeds: false,
  campaigns: false,
  analytics: false,
  apiAccess: false,
  customBranding: false,
};

export default function PlansPage() {
  const api = useApi();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [stats, setStats] = useState<PlanStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Plan | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    priceMonthly: '',
    priceYearly: '',
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    maxProperties: '100',
    maxUsers: '5',
    features: { ...defaultFeatures },
    isActive: true,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [plansRes, statsRes] = await Promise.all([
        api.get('/api/super-admin/plans'),
        api.get('/api/super-admin/plans/stats'),
      ]);
      setPlans(plansRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
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
      slug: '',
      priceMonthly: '',
      priceYearly: '',
      stripePriceIdMonthly: '',
      stripePriceIdYearly: '',
      maxProperties: '100',
      maxUsers: '5',
      features: { ...defaultFeatures },
      isActive: true,
    });
  };

  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
    setFormData({ ...formData, name, slug });
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.post('/api/super-admin/plans', {
        name: formData.name,
        slug: formData.slug,
        priceMonthly: formData.priceMonthly ? parseFloat(formData.priceMonthly) : null,
        priceYearly: formData.priceYearly ? parseFloat(formData.priceYearly) : null,
        stripePriceIdMonthly: formData.stripePriceIdMonthly.trim() || null,
        stripePriceIdYearly: formData.stripePriceIdYearly.trim() || null,
        maxProperties: parseInt(formData.maxProperties),
        maxUsers: parseInt(formData.maxUsers),
        features: formData.features,
        isActive: formData.isActive,
      });
      setIsCreateOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Failed to create plan:', error);
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to create plan', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      slug: plan.slug,
      priceMonthly: plan.priceMonthly?.toString() || '',
      priceYearly: plan.priceYearly?.toString() || '',
      stripePriceIdMonthly: plan.stripePriceIdMonthly || '',
      stripePriceIdYearly: plan.stripePriceIdYearly || '',
      maxProperties: plan.maxProperties.toString(),
      maxUsers: plan.maxUsers.toString(),
      features: plan.features || { ...defaultFeatures },
      isActive: plan.isActive,
    });
    setIsEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingPlan) return;
    setSaving(true);
    try {
      await api.put(`/api/super-admin/plans/${editingPlan.id}`, {
        name: formData.name,
        priceMonthly: formData.priceMonthly ? parseFloat(formData.priceMonthly) : null,
        priceYearly: formData.priceYearly ? parseFloat(formData.priceYearly) : null,
        stripePriceIdMonthly: formData.stripePriceIdMonthly.trim() || null,
        stripePriceIdYearly: formData.stripePriceIdYearly.trim() || null,
        maxProperties: parseInt(formData.maxProperties),
        maxUsers: parseInt(formData.maxUsers),
        features: formData.features,
        isActive: formData.isActive,
      });
      setIsEditOpen(false);
      setEditingPlan(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Failed to update plan:', error);
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to update plan', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/api/super-admin/plans/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchData();
    } catch (error: any) {
      console.error('Failed to delete plan:', error);
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to delete plan', variant: 'destructive' });
    }
  };

  const getClientCount = (planId: number) => {
    const stat = stats.find((s) => s.planId === planId);
    return stat?.tenantCount || 0;
  };

  const PlanForm = ({ onSubmit }: { onSubmit: () => void }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Plan Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Professional"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            placeholder="professional"
            disabled={!!editingPlan}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="priceMonthly">Monthly Price (€)</Label>
          <Input
            id="priceMonthly"
            type="number"
            step="0.01"
            value={formData.priceMonthly}
            onChange={(e) => setFormData({ ...formData, priceMonthly: e.target.value })}
            placeholder="29.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="priceYearly">Yearly Price (€)</Label>
          <Input
            id="priceYearly"
            type="number"
            step="0.01"
            value={formData.priceYearly}
            onChange={(e) => setFormData({ ...formData, priceYearly: e.target.value })}
            placeholder="290.00"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="stripePriceIdMonthly">Stripe Price ID (monthly)</Label>
          <Input
            id="stripePriceIdMonthly"
            value={formData.stripePriceIdMonthly}
            onChange={(e) =>
              setFormData({ ...formData, stripePriceIdMonthly: e.target.value })
            }
            placeholder="price_1ABC..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stripePriceIdYearly">Stripe Price ID (yearly)</Label>
          <Input
            id="stripePriceIdYearly"
            value={formData.stripePriceIdYearly}
            onChange={(e) =>
              setFormData({ ...formData, stripePriceIdYearly: e.target.value })
            }
            placeholder="price_1ABC..."
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="maxProperties">Max Properties</Label>
          <Input
            id="maxProperties"
            type="number"
            value={formData.maxProperties}
            onChange={(e) => setFormData({ ...formData, maxProperties: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxUsers">Max Users</Label>
          <Input
            id="maxUsers"
            type="number"
            value={formData.maxUsers}
            onChange={(e) => setFormData({ ...formData, maxUsers: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Features</Label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(formData.features).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <Switch
                checked={value}
                onCheckedChange={(checked) =>
                  setFormData({
                    ...formData,
                    features: { ...formData.features, [key]: checked },
                  })
                }
              />
              <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
        />
        <Label>Active</Label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => {
          setIsCreateOpen(false);
          setIsEditOpen(false);
          resetForm();
        }}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={saving}>
          {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          {editingPlan ? 'Update' : 'Create'}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Plans</h1>
          <p className="page-description mt-1">Manage subscription plans and pricing</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-sm" onClick={() => { resetForm(); setIsCreateOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Plan</DialogTitle>
              <DialogDescription>Add a new subscription plan</DialogDescription>
            </DialogHeader>
            <PlanForm onSubmit={handleCreate} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Plans Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Plans</CardTitle>
          <CardDescription>Configure pricing tiers and feature limits</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead>Yearly</TableHead>
                  <TableHead>Limits</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead>Clients</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{plan.name}</p>
                        <p className="text-xs text-muted-foreground">{plan.slug}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {plan.priceMonthly ? `€${plan.priceMonthly}` : 'Free'}
                    </TableCell>
                    <TableCell>
                      {plan.priceYearly ? `€${plan.priceYearly}` : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{plan.maxProperties} properties</p>
                        <p>{plan.maxUsers} users</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {plan.features && Object.entries(plan.features).map(([key, value]) => (
                          value ? (
                            <Badge key={key} variant="secondary" className="text-xs">
                              {key}
                            </Badge>
                          ) : null
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getClientCount(plan.id)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.isActive ? 'default' : 'secondary'}>
                        {plan.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(plan)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(plan)}
                          disabled={getClientCount(plan.id) > 0}
                        >
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
            <DialogTitle>Edit Plan</DialogTitle>
            <DialogDescription>Update plan settings</DialogDescription>
          </DialogHeader>
          <PlanForm onSubmit={handleUpdate} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the &quot;{deleteConfirm?.name}&quot; plan?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
