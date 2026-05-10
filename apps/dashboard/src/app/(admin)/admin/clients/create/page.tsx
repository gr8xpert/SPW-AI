'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApi } from '@/hooks/use-api';
import { ArrowLeft, Save, RefreshCw, Copy, Check } from 'lucide-react';

const createClientSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  slug: z.string()
    .min(2, 'Slug must be at least 2 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  adminEmail: z.string().email('Valid email required'),
  adminPassword: z.string().min(6, 'Password must be at least 6 characters'),
  adminName: z.string().optional(),
  domain: z.string().optional(),
  ownerEmail: z.string().email().optional().or(z.literal('')),
  siteName: z.string().optional(),
  planId: z.number(),
  subscriptionStatus: z.enum(['active', 'grace', 'expired', 'manual', 'internal']),
  billingCycle: z.enum(['monthly', 'yearly']).optional(),
  billingSource: z.enum(['manual', 'stripe', 'internal']).optional(),
  adminOverride: z.boolean(),
  isInternal: z.boolean(),
  widgetEnabled: z.boolean(),
  feedImagesToR2: z.boolean(),
  featureFlags: z.object({
    mapSearch: z.boolean(),
    mapView: z.boolean(),
    aiSearch: z.boolean(),
    aiChatbot: z.boolean(),
    mortgageCalculator: z.boolean(),
    currencyConverter: z.boolean(),
  }),
  dashboardAddons: z.object({
    addProperty: z.boolean(),
    emailCampaign: z.boolean(),
    feedExport: z.boolean(),
    team: z.boolean(),
    aiChat: z.boolean(),
  }),
});

type CreateClientFormData = z.infer<typeof createClientSchema>;

interface Plan {
  id: number;
  name: string;
  slug: string;
}

export default function CreateClientPage() {
  const router = useRouter();
  const api = useApi();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [createdClientId, setCreatedClientId] = useState<number | null>(null);
  const [rawApiKey, setRawApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<CreateClientFormData>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: '',
      slug: '',
      adminEmail: '',
      adminPassword: '',
      adminName: '',
      domain: '',
      ownerEmail: '',
      siteName: '',
      planId: 1,
      subscriptionStatus: 'active',
      billingCycle: 'monthly',
      billingSource: 'manual',
      adminOverride: false,
      isInternal: false,
      widgetEnabled: true,
      feedImagesToR2: false,
      featureFlags: {
        mapSearch: false,
        mapView: false,
        aiSearch: false,
        aiChatbot: false,
        mortgageCalculator: false,
        currencyConverter: false,
      },
      dashboardAddons: {
        addProperty: false,
        emailCampaign: false,
        feedExport: false,
        team: false,
        aiChat: false,
      },
    },
  });

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await api.get('/api/super-admin/plans');
        setPlans(response.data);
        if (response.data.length > 0) {
          form.setValue('planId', response.data[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch plans:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    form.setValue('slug', slug);
  };

  const onSubmit = async (data: CreateClientFormData) => {
    setSaving(true);
    try {
      // Clean up empty strings
      const cleanData = {
        ...data,
        adminName: data.adminName || undefined,
        domain: data.domain || undefined,
        ownerEmail: data.ownerEmail || undefined,
        siteName: data.siteName || undefined,
      };

      const response = await api.post('/api/super-admin/clients', cleanData);
      const body = response.data || response;
      setCreatedClientId(body.id);
      setRawApiKey(body.rawApiKey || null);
      if (!body.rawApiKey) {
        toast({
          title: 'Client created',
          description: `${data.name} has been added.`,
        });
        router.push(`/admin/clients/${body.id}`);
      }
    } catch (error: any) {
      console.error('Failed to create client:', error);
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to create client', variant: 'destructive' });
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
          <Link href="/admin/clients">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="page-title">Create Client</h1>
            <p className="page-description mt-1">Add a new client to the platform</p>
          </div>
        </div>
        <Button onClick={form.handleSubmit(onSubmit)} disabled={saving} className="shadow-sm">
          {saving ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Create Client
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="basic" className="space-y-4">
            <TabsList>
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="admin">Admin User</TabsTrigger>
              <TabsTrigger value="subscription">Subscription</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Client Information</CardTitle>
                  <CardDescription>Basic details about the new client</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Company name"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                handleNameChange(e.target.value);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="slug"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Slug *</FormLabel>
                          <FormControl>
                            <Input placeholder="company-name" {...field} />
                          </FormControl>
                          <FormDescription>Unique identifier (auto-generated)</FormDescription>
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
                            <Input placeholder="Display name" {...field} />
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
                            <Input placeholder="yourdomain.com" {...field} />
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
                            <Input type="email" placeholder="owner@company.com" {...field} />
                          </FormControl>
                          <FormDescription>For notifications (defaults to admin email)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="admin" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Admin User</CardTitle>
                  <CardDescription>Create the admin user for this client</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="adminEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Admin Email *</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="admin@company.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adminName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Admin Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Full name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adminPassword"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Admin Password *</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormDescription>Minimum 6 characters</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="subscription" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Subscription Settings</CardTitle>
                  <CardDescription>Configure billing and subscription</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="planId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plan *</FormLabel>
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
                          <Select onValueChange={field.onChange} value={field.value}>
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
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select source" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="manual">Manual</SelectItem>
                              <SelectItem value="stripe">Stripe</SelectItem>
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
                  <CardTitle>Features & Add-ons</CardTitle>
                  <CardDescription>Control which features this client can access on their website</CardDescription>
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
                    name="feedImagesToR2"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Download Feed Images to R2</FormLabel>
                          <FormDescription>
                            When ON, feed importers download property photos, convert to WebP, and store in R2 with content-hash deduplication. When OFF, feed images keep the provider&apos;s CDN URL.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {[
                    { name: 'featureFlags.mapSearch' as const, label: 'Map Search', description: 'Search properties by drawing on a map' },
                    { name: 'featureFlags.mapView' as const, label: 'Map View', description: 'Display properties on an interactive map' },
                    { name: 'featureFlags.aiSearch' as const, label: 'AI Search', description: 'AI-powered natural language property search' },
                    { name: 'featureFlags.aiChatbot' as const, label: 'AI Chatbot', description: 'Conversational AI assistant on the widget' },
                    { name: 'featureFlags.mortgageCalculator' as const, label: 'Mortgage Calculator', description: 'Mortgage calculator on property pages' },
                    { name: 'featureFlags.currencyConverter' as const, label: 'Currency Converter', description: 'Currency conversion on the widget' },
                  ].map((feature) => (
                    <FormField
                      key={feature.name}
                      control={form.control}
                      name={feature.name}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">{feature.label}</FormLabel>
                            <FormDescription>{feature.description}</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dashboard Add-ons</CardTitle>
                  <CardDescription>Per-client paid add-ons. When OFF the entry point is greyed out in the dashboard with an upgrade prompt; direct URLs render a locked screen.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { name: 'dashboardAddons.addProperty' as const, label: 'Add Property', description: 'Allow this client to manually create properties from the dashboard' },
                    { name: 'dashboardAddons.emailCampaign' as const, label: 'Email Campaigns', description: 'Send marketing emails and manage campaigns' },
                    { name: 'dashboardAddons.feedExport' as const, label: 'Feed Export', description: 'Generate XML/JSON feeds to syndicate to portals' },
                    { name: 'dashboardAddons.team' as const, label: 'Team Management', description: 'Invite team members and assign roles' },
                    { name: 'dashboardAddons.aiChat' as const, label: 'AI Chat', description: 'Conversational AI analytics and chat history' },
                  ].map((addon) => (
                    <FormField
                      key={addon.name}
                      control={form.control}
                      name={addon.name}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">{addon.label}</FormLabel>
                            <FormDescription>{addon.description}</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </form>
      </Form>

      <AlertDialog open={!!rawApiKey}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Client Created Successfully</AlertDialogTitle>
            <AlertDialogDescription>
              Copy the widget key now — it will not be shown again. If lost, you can regenerate it from the Widget Keys tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <label className="text-sm font-medium">Widget Key</label>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 rounded border bg-muted px-3 py-2 text-sm font-mono break-all select-all">
                {rawApiKey}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (rawApiKey) {
                    navigator.clipboard.writeText(rawApiKey);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => router.push(`/admin/clients/${createdClientId}`)}>
              Continue to Client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
