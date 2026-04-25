'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useApi } from '@/hooks/use-api';
import { ArrowLeft, Save, RefreshCw } from 'lucide-react';

const clientSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  domain: z.string().optional().nullable(),
  ownerEmail: z.string().email().optional().nullable(),
  siteName: z.string().optional().nullable(),
  planId: z.number(),
  subscriptionStatus: z.enum(['active', 'grace', 'expired', 'manual', 'internal']),
  billingCycle: z.enum(['monthly', 'yearly']).optional().nullable(),
  billingSource: z.enum(['manual', 'paddle', 'internal']).optional().nullable(),
  adminOverride: z.boolean(),
  isInternal: z.boolean(),
  widgetEnabled: z.boolean(),
  aiSearchEnabled: z.boolean(),
  isActive: z.boolean(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface Plan {
  id: number;
  name: string;
  slug: string;
}

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const api = useApi();
  const clientId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      domain: '',
      ownerEmail: '',
      siteName: '',
      planId: 1,
      subscriptionStatus: 'active',
      billingCycle: null,
      billingSource: null,
      adminOverride: false,
      isInternal: false,
      widgetEnabled: true,
      aiSearchEnabled: false,
      isActive: true,
    },
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientRes, plansRes] = await Promise.all([
          api.get(`/api/super-admin/clients/${clientId}`),
          api.get('/api/super-admin/plans'),
        ]);

        const client = clientRes.data;
        setPlans(plansRes.data);

        form.reset({
          name: client.name,
          domain: client.domain || '',
          ownerEmail: client.ownerEmail || '',
          siteName: client.siteName || '',
          planId: client.planId,
          subscriptionStatus: client.subscriptionStatus,
          billingCycle: client.billingCycle,
          billingSource: client.billingSource,
          adminOverride: client.adminOverride,
          isInternal: client.isInternal,
          widgetEnabled: client.widgetEnabled,
          aiSearchEnabled: client.aiSearchEnabled,
          isActive: client.isActive,
        });
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const onSubmit = async (data: ClientFormData) => {
    setSaving(true);
    try {
      // Clean up empty strings to null
      const cleanData = {
        ...data,
        domain: data.domain || null,
        ownerEmail: data.ownerEmail || null,
        siteName: data.siteName || null,
      };

      await api.put(`/api/super-admin/clients/${clientId}`, cleanData);
      router.push(`/admin/clients/${clientId}`);
    } catch (error) {
      console.error('Failed to save client:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Link href={`/admin/clients/${clientId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="page-title">Edit Client</h1>
            <p className="page-description mt-1">Update client settings and configuration</p>
          </div>
        </div>
        <Button onClick={form.handleSubmit(onSubmit)} disabled={saving} className="shadow-sm">
          {saving ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="basic" className="space-y-4">
            <TabsList>
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="subscription">Subscription</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Client Information</CardTitle>
                  <CardDescription>Basic details about the client</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Company name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="siteName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Display name" {...field} value={field.value || ''} />
                          </FormControl>
                          <FormDescription>Display name for the widget</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="domain"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Domain</FormLabel>
                          <FormControl>
                            <Input placeholder="yourdomain.com" {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="ownerEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Owner Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="owner@company.com" {...field} value={field.value || ''} />
                          </FormControl>
                          <FormDescription>For notifications and inquiries</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                  </div>

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active Status</FormLabel>
                          <FormDescription>
                            Inactive clients cannot access the dashboard
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="subscription" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Subscription Settings</CardTitle>
                  <CardDescription>Manage billing and subscription status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="planId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plan</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            value={field.value?.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a plan" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {plans.map((plan) => (
                                <SelectItem key={plan.id} value={plan.id.toString()}>
                                  {plan.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="subscriptionStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subscription Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="grace">Grace Period</SelectItem>
                              <SelectItem value="expired">Expired</SelectItem>
                              <SelectItem value="manual">Manual</SelectItem>
                              <SelectItem value="internal">Internal</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="billingCycle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Billing Cycle</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select cycle" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="yearly">Yearly</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="billingSource"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Billing Source</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select source" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="manual">Manual</SelectItem>
                              <SelectItem value="paddle">Paddle</SelectItem>
                              <SelectItem value="internal">Internal</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4 pt-4">
                    <FormField
                      control={form.control}
                      name="adminOverride"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Admin Override</FormLabel>
                            <FormDescription>
                              When enabled, subscription never expires
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="isInternal"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Internal Client</FormLabel>
                            <FormDescription>
                              Mark as internal (no subscription required)
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="features" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Widget Features</CardTitle>
                  <CardDescription>Configure which features are enabled for this client</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="widgetEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Widget Enabled</FormLabel>
                          <FormDescription>
                            Allow this client to embed the property widget
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="aiSearchEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">AI Search</FormLabel>
                          <FormDescription>
                            Enable AI-powered natural language property search
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </form>
      </Form>
    </div>
  );
}
