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
import { useToast } from '@/hooks/use-toast';
import { ClientUsersCard, type ClientUser } from '@/components/admin/client-password-actions';
import { ArrowLeft, Save, RefreshCw } from 'lucide-react';

const clientSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  domain: z.string().optional().nullable(),
  ownerEmail: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  siteName: z.string().optional().nullable(),
  planId: z.number(),
  subscriptionStatus: z.enum(['active', 'grace', 'expired', 'manual', 'internal']),
  billingCycle: z.enum(['monthly', 'yearly']).optional().nullable(),
  billingSource: z.enum(['manual', 'stripe', 'internal']).optional().nullable(),
  adminOverride: z.boolean(),
  isInternal: z.boolean(),
  widgetEnabled: z.boolean(),
  feedImagesToR2: z.boolean(),
  isActive: z.boolean(),
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
    aiTranslation: z.boolean(),
  }),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  xeroContactId: z.string().optional().nullable(),
});

// Kept in sync with TIER_PRESETS in packages/shared/src/types/tenant.types.ts.
// Duplicated here (rather than imported at runtime) so the client bundle stays
// small — the shared package would drag class-validator in transitively.
const TIER_ADDON_PRESETS: Record<1 | 2 | 3, ClientFormData['dashboardAddons']> = {
  1: {
    addProperty: false,
    emailCampaign: false,
    feedExport: false,
    team: false,
    aiChat: false,
    aiTranslation: false,
  },
  2: {
    addProperty: true,
    emailCampaign: false,
    feedExport: true,
    team: true,
    aiChat: false,
    aiTranslation: false,
  },
  3: {
    addProperty: true,
    emailCampaign: true,
    feedExport: true,
    team: true,
    aiChat: true,
    aiTranslation: true,
  },
};

type ClientFormData = z.infer<typeof clientSchema>;

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const api = useApi();
  const { toast } = useToast();
  const clientId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientUsers, setClientUsers] = useState<ClientUser[]>([]);

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
      feedImagesToR2: false,
      isActive: true,
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
        aiTranslation: false,
      },
      tier: 1,
      xeroContactId: '',
    },
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // The plans list is no longer fetched — the Plan picker is gone and
        // planId comes straight off the client below, so it was a wasted
        // request on every edit page load.
        const clientRes = await api.get(`/api/super-admin/clients/${clientId}`);

        const client = clientRes.data;
        setClientUsers(client.users ?? []);

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
          feedImagesToR2: client.feedImagesToR2 ?? false,
          isActive: client.isActive,
          featureFlags: {
            mapSearch: !!client.featureFlags?.mapSearch,
            mapView: !!client.featureFlags?.mapView,
            aiSearch: !!client.featureFlags?.aiSearch,
            aiChatbot: !!client.featureFlags?.aiChatbot,
            mortgageCalculator: !!client.featureFlags?.mortgageCalculator,
            currencyConverter: !!client.featureFlags?.currencyConverter,
          },
          dashboardAddons: {
            // Coerce to boolean — MySQL JSON columns may store as 0/1.
            addProperty: !!client.dashboardAddons?.addProperty,
            emailCampaign: !!client.dashboardAddons?.emailCampaign,
            feedExport: !!client.dashboardAddons?.feedExport,
            team: !!client.dashboardAddons?.team,
            aiChat: !!client.dashboardAddons?.aiChat,
            aiTranslation: !!client.dashboardAddons?.aiTranslation,
          },
          tier: (client.tier as 1 | 2 | 3) || 1,
          xeroContactId: client.xeroContactId || '',
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
        xeroContactId: data.xeroContactId?.trim() ? data.xeroContactId.trim() : null,
      };

      await api.put(`/api/super-admin/clients/${clientId}`, cleanData);
      toast({
        title: 'Changes saved',
        description: `${data.name} has been updated.`,
      });
      router.push(`/admin/clients/${clientId}`);
    } catch (error) {
      console.error('Failed to save client:', error);
      toast({ title: 'Error', description: 'Failed to save changes', variant: 'destructive' });
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
        <Button onClick={form.handleSubmit(onSubmit, (errors) => {
              const fields = Object.keys(errors).join(', ');
              const first = Object.values(errors)[0] as { message?: string } | undefined;
              toast({
                title: `Validation failed: ${fields}`,
                description: first?.message ?? 'Check the highlighted fields.',
                variant: 'destructive',
              });
              console.warn('[edit] validation errors:', errors);
            })} disabled={saving} className="shadow-sm">
          {saving ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
              const fields = Object.keys(errors).join(', ');
              const first = Object.values(errors)[0] as { message?: string } | undefined;
              toast({
                title: `Validation failed: ${fields}`,
                description: first?.message ?? 'Check the highlighted fields.',
                variant: 'destructive',
              });
              console.warn('[edit] validation errors:', errors);
            })} className="space-y-6">
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

                    <FormField
                      control={form.control}
                      name="xeroContactId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Xero Contact ID (optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 4d1f18a7-..." {...field} value={field.value || ''} />
                          </FormControl>
                          <FormDescription>
                            Links this client to a Xero Contact so n8n attaches invoices correctly. Leave blank to let n8n look up / create by email.
                          </FormDescription>
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
                    {/* Plan and Billing Cycle hidden here for the same reason as
                        on the create form — plans aren't sold per-client and the
                        Subscriptions page is gone from the admin sidebar. Both
                        values are still loaded from the client and submitted
                        unchanged, so editing anything else won't reset them. */}

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
                            When ON, feed importers download property photos, convert to WebP, and store in R2 with content-hash deduplication. When OFF, feed images keep the provider&apos;s CDN URL (no extra storage cost).
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
                  <CardTitle>Commercial Tier</CardTitle>
                  <CardDescription>
                    Changing tier resets Dashboard Add-ons below to the tier&apos;s preset. Any manual add-on toggles you make after picking a tier persist on save (they act as overrides above/below the preset).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="tier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tier</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            const nextTier = parseInt(value, 10) as 1 | 2 | 3;
                            field.onChange(nextTier);
                            // Reset add-ons to tier preset — operator sees the change immediately
                            // and can still hand-tune individual toggles below before saving.
                            form.setValue('dashboardAddons', TIER_ADDON_PRESETS[nextTier], {
                              shouldDirty: true,
                            });
                          }}
                          value={field.value?.toString() || '1'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">Tier 1 — Support only</SelectItem>
                            <SelectItem value="2">Tier 2 — Support + Property management</SelectItem>
                            <SelectItem value="3">Tier 3 — Everything (all premium add-ons)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Tier 1: ticket system only. Tier 2: adds properties, feeds, team. Tier 3: unlocks AI (chat, translation, SEO) and email campaigns.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dashboard Add-ons</CardTitle>
                  <CardDescription>Per-client paid add-ons. When OFF the entry point is greyed out in the dashboard with an upgrade prompt; direct URLs render a locked screen. Tier changes above overwrite these; you can still hand-tune individual toggles here as overrides.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { name: 'dashboardAddons.addProperty' as const, label: 'Add Property', description: 'Allow this client to manually create properties from the dashboard' },
                    { name: 'dashboardAddons.emailCampaign' as const, label: 'Email Campaigns', description: 'Send marketing emails and manage campaigns' },
                    { name: 'dashboardAddons.feedExport' as const, label: 'Feed Export', description: 'Generate XML/JSON feeds to syndicate to portals' },
                    { name: 'dashboardAddons.team' as const, label: 'Team Management', description: 'Invite team members and assign roles' },
                    { name: 'dashboardAddons.aiChat' as const, label: 'AI Chat', description: 'Conversational AI analytics and chat history' },
                    { name: 'dashboardAddons.aiTranslation' as const, label: 'AI Translation & SEO', description: 'AI-powered content translation and SEO generation across properties, features, labels, and property types' },
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

      {/* Outside the form: these buttons act immediately and must not submit it. */}
      <ClientUsersCard clientId={String(clientId)} users={clientUsers} />
    </div>
  );
}
