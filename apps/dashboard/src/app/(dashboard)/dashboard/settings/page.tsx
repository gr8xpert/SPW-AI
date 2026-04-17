'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Building2, Mail, Globe, Webhook, Key, RefreshCw } from 'lucide-react';
import { apiGet, apiPost, apiPut } from '@/lib/api';

const generalSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  domain: z.string().optional(),
  defaultLanguage: z.string(),
});

const emailSchema = z.object({
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  fromEmail: z.string().email().optional().or(z.literal('')),
  fromName: z.string().optional(),
});

// Public widget + WP plugin read from tenant.syncVersion to decide when to
// drop their local cache. Bumping it on demand replaces the old PHP "clear
// cache" script operators used to run by hand.
interface CacheClearResponse {
  data: { tenantId: number; syncVersion: number; clearedAt: string };
}
interface TenantCurrent {
  data: { id: number; syncVersion?: number } & Record<string, unknown>;
}

// Webhook management (5E). The dashboard fetches the current URL + last4 of
// the signing secret on mount, surfaces a deliveries table so operators can
// diagnose "why isn't my site receiving updates?" without DB access, and
// exposes rotate + test buttons.
interface WebhookConfigResponse {
  data: { webhookUrl: string | null; webhookSecretLast4: string };
}
interface WebhookRotateResponse {
  data: { webhookSecret: string };
}
interface WebhookDeliveryRow {
  id: number;
  event: string;
  status: 'pending' | 'delivered' | 'failed' | 'skipped';
  attemptCount: number;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  // Detail view also surfaces targetUrl + payload. Populated when the
  // drawer opens via a separate GET /deliveries/:id fetch so the list
  // response stays small.
  targetUrl?: string;
  payload?: Record<string, unknown>;
}
interface WebhookDeliveriesResponse {
  data: WebhookDeliveryRow[];
}
interface WebhookDeliveryDetailResponse {
  data: WebhookDeliveryRow;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [syncVersion, setSyncVersion] = useState<number | null>(null);
  const [lastClearedAt, setLastClearedAt] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  // Webhook state. `revealedSecret` holds the rotation result exactly long
  // enough for the user to copy it — the API never returns it again. It's
  // cleared when the user dismisses the reveal box or navigates away.
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookSecretLast4, setWebhookSecretLast4] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [rotatingSecret, setRotatingSecret] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  // Delivery detail drawer state. When non-null, the Dialog renders with
  // the full payload. We keep the detail fetched separately so clicking a
  // row can load a fresh snapshot (attemptCount/status may have advanced
  // since the list was pulled).
  const [selectedDelivery, setSelectedDelivery] =
    useState<WebhookDeliveryRow | null>(null);
  const [loadingDeliveryDetail, setLoadingDeliveryDetail] = useState(false);
  const [redelivering, setRedelivering] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiGet<TenantCurrent>('/api/dashboard/tenant')
      .then((res) => {
        // API wraps responses as { data: ... } via global interceptor; our
        // apiGet returns the raw axios response.data, so res.data is the
        // payload.
        if (typeof res.data?.syncVersion === 'number') {
          setSyncVersion(res.data.syncVersion);
        }
      })
      .catch(() => {
        // Non-fatal — cache panel just won't show a version number.
      });

    apiGet<WebhookConfigResponse>('/api/dashboard/tenant/webhook')
      .then((res) => {
        setWebhookUrl(res.data.webhookUrl ?? '');
        setWebhookSecretLast4(res.data.webhookSecretLast4);
      })
      .catch(() => {
        // Non-fatal — webhook tab renders with an empty form.
      });
  }, [session?.accessToken]);

  const loadDeliveries = async () => {
    setLoadingDeliveries(true);
    try {
      const res = await apiGet<WebhookDeliveriesResponse>(
        '/api/dashboard/tenant/webhook/deliveries?limit=25',
      );
      setDeliveries(res.data);
    } catch (err) {
      toast({
        title: 'Failed to load deliveries',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const openDeliveryDetail = async (row: WebhookDeliveryRow) => {
    // Seed the dialog with what the list already knows so it renders
    // instantly; the fetch fills in targetUrl + payload (the heavy bits
    // kept off the list response for brevity).
    setSelectedDelivery(row);
    setLoadingDeliveryDetail(true);
    try {
      const res = await apiGet<WebhookDeliveryDetailResponse>(
        `/api/dashboard/tenant/webhook/deliveries/${row.id}`,
      );
      setSelectedDelivery(res.data);
    } catch (err) {
      toast({
        title: 'Failed to load delivery detail',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setLoadingDeliveryDetail(false);
    }
  };

  const onRedeliver = async () => {
    if (!selectedDelivery) return;
    setRedelivering(true);
    try {
      await apiPost(
        `/api/dashboard/tenant/webhook/deliveries/${selectedDelivery.id}/redeliver`,
        {},
      );
      toast({
        title: 'Redelivery queued',
        description:
          'A fresh delivery row was created. Refresh the list to see it.',
      });
      setSelectedDelivery(null);
      await loadDeliveries();
    } catch (err) {
      toast({
        title: 'Redelivery failed',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setRedelivering(false);
    }
  };

  // Pull deliveries on mount too — the panel is empty-by-default otherwise,
  // which makes it look broken. Deferred to its own effect so refreshing
  // the list after an action (Test / Rotate) can reuse loadDeliveries
  // without re-running the webhook config fetch.
  useEffect(() => {
    if (!session?.accessToken) return;
    void loadDeliveries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const onSaveWebhook = async () => {
    setSavingWebhook(true);
    try {
      const res = await apiPut<WebhookConfigResponse>(
        '/api/dashboard/tenant/webhook',
        { webhookUrl: webhookUrl.trim() || null },
      );
      setWebhookUrl(res.data.webhookUrl ?? '');
      setWebhookSecretLast4(res.data.webhookSecretLast4);
      toast({
        title: 'Webhook URL saved',
        description: res.data.webhookUrl
          ? 'We\u2019ll deliver events to this URL going forward.'
          : 'Webhook delivery is now disabled.',
      });
    } catch (err) {
      toast({
        title: 'Failed to save webhook URL',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setSavingWebhook(false);
    }
  };

  const onRotateSecret = async () => {
    const confirmed = window.confirm(
      'Rotate webhook signing secret? Any receiver that has not been updated with the new secret will reject subsequent webhooks.',
    );
    if (!confirmed) return;
    setRotatingSecret(true);
    try {
      const res = await apiPost<WebhookRotateResponse>(
        '/api/dashboard/tenant/webhook/rotate-secret',
      );
      setRevealedSecret(res.data.webhookSecret);
      setWebhookSecretLast4(res.data.webhookSecret.slice(-4));
      toast({
        title: 'Webhook secret rotated',
        description: 'Copy the new secret now \u2014 it will not be shown again.',
      });
    } catch (err) {
      toast({
        title: 'Rotate failed',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setRotatingSecret(false);
    }
  };

  const onSendTest = async () => {
    setSendingTest(true);
    try {
      await apiPost('/api/dashboard/tenant/webhook/test');
      toast({
        title: 'Test webhook queued',
        description: 'A webhook.test event was enqueued. Refresh deliveries below to see the outcome.',
      });
      await loadDeliveries();
    } catch (err) {
      toast({
        title: 'Test send failed',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const onClearCache = async () => {
    if (clearingCache) return;
    const confirmed = window.confirm(
      'Clear widget cache now? Your site will refetch listings on the next request. This cannot be undone.',
    );
    if (!confirmed) return;

    setClearingCache(true);
    try {
      const res = await apiPost<CacheClearResponse>('/api/dashboard/tenant/cache/clear');
      setSyncVersion(res.data.syncVersion);
      setLastClearedAt(res.data.clearedAt);
      toast({
        title: 'Widget cache cleared',
        description: `New sync version: ${res.data.syncVersion}. Downstream widgets pick this up on their next poll.`,
      });
    } catch (err) {
      toast({
        title: 'Failed to clear cache',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setClearingCache(false);
    }
  };

  const generalForm = useForm({
    resolver: zodResolver(generalSchema),
    defaultValues: {
      companyName: '',
      domain: '',
      defaultLanguage: 'en',
    },
  });

  const emailForm = useForm({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPassword: '',
      fromEmail: '',
      fromName: '',
    },
  });

  const onGeneralSubmit = async (data: z.infer<typeof generalSchema>) => {
    setIsLoading(true);
    try {
      // API call would go here
      toast({
        title: 'Settings saved',
        description: 'Your general settings have been updated.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onEmailSubmit = async (data: z.infer<typeof emailSchema>) => {
    setIsLoading(true);
    try {
      // API call would go here
      toast({
        title: 'Email settings saved',
        description: 'Your SMTP configuration has been updated.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save email settings.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and application settings
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">
            <Building2 className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="h-4 w-4 mr-2" />
            Email
          </TabsTrigger>
          <TabsTrigger value="api">
            <Key className="h-4 w-4 mr-2" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="cache">
            <RefreshCw className="h-4 w-4 mr-2" />
            Cache
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure your company information and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={generalForm.handleSubmit(onGeneralSubmit)}
                className="space-y-6"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      {...generalForm.register('companyName')}
                    />
                    {generalForm.formState.errors.companyName && (
                      <p className="text-sm text-destructive">
                        {generalForm.formState.errors.companyName.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="domain">Website Domain</Label>
                    <Input
                      id="domain"
                      placeholder="www.example.com"
                      {...generalForm.register('domain')}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultLanguage">Default Language</Label>
                  <select
                    id="defaultLanguage"
                    className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
                    {...generalForm.register('defaultLanguage')}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="de">German</option>
                    <option value="fr">French</option>
                    <option value="nl">Dutch</option>
                  </select>
                </div>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Settings */}
        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>Email Configuration</CardTitle>
              <CardDescription>
                Configure your SMTP settings for sending email campaigns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={emailForm.handleSubmit(onEmailSubmit)}
                className="space-y-6"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="smtpHost">SMTP Host</Label>
                    <Input
                      id="smtpHost"
                      placeholder="smtp.example.com"
                      {...emailForm.register('smtpHost')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPort">SMTP Port</Label>
                    <Input
                      id="smtpPort"
                      type="number"
                      placeholder="587"
                      {...emailForm.register('smtpPort')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpUser">SMTP Username</Label>
                    <Input
                      id="smtpUser"
                      {...emailForm.register('smtpUser')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPassword">SMTP Password</Label>
                    <Input
                      id="smtpPassword"
                      type="password"
                      {...emailForm.register('smtpPassword')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fromEmail">From Email</Label>
                    <Input
                      id="fromEmail"
                      type="email"
                      placeholder="noreply@example.com"
                      {...emailForm.register('fromEmail')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fromName">From Name</Label>
                    <Input
                      id="fromName"
                      placeholder="Your Company"
                      {...emailForm.register('fromName')}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Saving...' : 'Save Settings'}
                  </Button>
                  <Button type="button" variant="outline">
                    Send Test Email
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Keys */}
        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Manage your API keys for widget integration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Public API Key</p>
                    <p className="text-sm text-muted-foreground">
                      Use this key in your website widget
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-muted rounded text-sm">
                      pk_live_xxxxxxxxxxxx
                    </code>
                    <Button variant="outline" size="sm">
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Secret API Key</p>
                    <p className="text-sm text-muted-foreground">
                      Use for server-side integrations only
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-muted rounded text-sm">
                      sk_live_••••••••••••
                    </code>
                    <Button variant="outline" size="sm">
                      Reveal
                    </Button>
                    <Button variant="outline" size="sm">
                      Regenerate
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks */}
        <TabsContent value="webhooks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Webhook Configuration</CardTitle>
              <CardDescription>
                SPW delivers signed POST requests to your URL when properties
                change, cache is cleared, or you click &quot;Send test&quot;
                below. Signatures use HMAC-SHA256 over <code>`${'{'}timestamp{'}'}.${'{'}body{'}'}`</code>
                with the secret shown below. Private IPs and non-HTTP schemes are rejected.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhookUrl"
                    placeholder="https://yoursite.com/wp-json/spw/v1/sync"
                    className="flex-1"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                  <Button onClick={onSaveWebhook} disabled={savingWebhook}>
                    {savingWebhook ? 'Saving\u2026' : 'Save'}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Leave empty to disable webhook delivery.
                </p>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Webhook Secret</p>
                    <p className="text-sm text-muted-foreground">
                      {webhookSecretLast4
                        ? `Ends in \u2026${webhookSecretLast4}. Rotate if it has been leaked \u2014 receivers must be updated with the new secret before the next event.`
                        : 'Loading\u2026'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRotateSecret}
                    disabled={rotatingSecret}
                  >
                    {rotatingSecret ? 'Rotating\u2026' : 'Rotate secret'}
                  </Button>
                </div>
                {revealedSecret && (
                  <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      New webhook secret \u2014 copy it now. It will not be shown again.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 px-2 py-1 bg-muted rounded text-xs break-all">
                        {revealedSecret}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(revealedSecret);
                          toast({ title: 'Copied to clipboard' });
                        }}
                      >
                        Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevealedSecret(null)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={onSendTest}
                  disabled={sendingTest || !webhookUrl.trim()}
                >
                  {sendingTest ? 'Sending\u2026' : 'Send test webhook'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void loadDeliveries()}
                  disabled={loadingDeliveries}
                >
                  {loadingDeliveries ? 'Refreshing\u2026' : 'Refresh deliveries'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Deliveries</CardTitle>
              <CardDescription>
                Last 25 webhook attempts. Failures keep a row so you can see
                why a delivery was dropped.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {deliveries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {loadingDeliveries
                    ? 'Loading\u2026'
                    : 'No deliveries yet. Trigger an event (create a property, click Send test, or clear the cache) to see one here.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-3 font-medium">Event</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Attempts</th>
                        <th className="py-2 pr-3 font-medium">HTTP</th>
                        <th className="py-2 pr-3 font-medium">When</th>
                        <th className="py-2 pr-3 font-medium">Last error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map((d) => (
                        <tr
                          key={d.id}
                          className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
                          onClick={() => void openDeliveryDetail(d)}
                        >
                          <td className="py-2 pr-3 font-mono text-xs">{d.event}</td>
                          <td className="py-2 pr-3">
                            <span
                              className={
                                d.status === 'delivered'
                                  ? 'text-green-700 dark:text-green-400'
                                  : d.status === 'failed'
                                  ? 'text-red-700 dark:text-red-400'
                                  : d.status === 'skipped'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-muted-foreground'
                              }
                            >
                              {d.status}
                            </span>
                          </td>
                          <td className="py-2 pr-3">{d.attemptCount}</td>
                          <td className="py-2 pr-3">
                            {d.lastStatusCode ?? '\u2014'}
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {new Date(d.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground max-w-xs truncate">
                            {d.lastError ?? '\u2014'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delivery detail drawer. Dialog is the closest fit in our
              component kit — no Sheet primitive available. Opens on row
              click, shows the full payload + the latest attempt outcome,
              and offers Redeliver (admin-only server-side). */}
          <Dialog
            open={selectedDelivery !== null}
            onOpenChange={(open) => !open && setSelectedDelivery(null)}
          >
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  Delivery #{selectedDelivery?.id ?? '\u2026'}
                </DialogTitle>
                <DialogDescription>
                  {selectedDelivery
                    ? `${selectedDelivery.event} — ${selectedDelivery.status}`
                    : 'Loading\u2026'}
                </DialogDescription>
              </DialogHeader>
              {selectedDelivery && (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-medium">Attempts:</span>{' '}
                      {selectedDelivery.attemptCount}
                    </div>
                    <div>
                      <span className="font-medium">HTTP:</span>{' '}
                      {selectedDelivery.lastStatusCode ?? '\u2014'}
                    </div>
                    <div>
                      <span className="font-medium">Created:</span>{' '}
                      {new Date(selectedDelivery.createdAt).toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium">Delivered:</span>{' '}
                      {selectedDelivery.deliveredAt
                        ? new Date(
                            selectedDelivery.deliveredAt,
                          ).toLocaleString()
                        : '\u2014'}
                    </div>
                  </div>

                  {selectedDelivery.targetUrl !== undefined && (
                    <div>
                      <p className="font-medium mb-1">Target URL</p>
                      <code className="block bg-muted rounded p-2 text-xs break-all">
                        {selectedDelivery.targetUrl || '\u2014'}
                      </code>
                    </div>
                  )}

                  {selectedDelivery.lastError && (
                    <div>
                      <p className="font-medium mb-1 text-red-700 dark:text-red-400">
                        Last error
                      </p>
                      <code className="block bg-muted rounded p-2 text-xs whitespace-pre-wrap break-words">
                        {selectedDelivery.lastError}
                      </code>
                    </div>
                  )}

                  <div>
                    <p className="font-medium mb-1">Payload</p>
                    <pre className="bg-muted rounded p-2 text-xs overflow-x-auto max-h-80">
                      {loadingDeliveryDetail && !selectedDelivery.payload
                        ? 'Loading\u2026'
                        : JSON.stringify(
                            selectedDelivery.payload ?? {},
                            null,
                            2,
                          )}
                    </pre>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedDelivery(null)}
                  disabled={redelivering}
                >
                  Close
                </Button>
                <Button
                  onClick={() => void onRedeliver()}
                  disabled={redelivering || !selectedDelivery}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${redelivering ? 'animate-spin' : ''}`}
                  />
                  {redelivering ? 'Queuing\u2026' : 'Redeliver'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Widget Cache */}
        <TabsContent value="cache">
          <Card>
            <CardHeader>
              <CardTitle>Widget Cache</CardTitle>
              <CardDescription>
                Clear the cache on your live widget and WordPress plugin. Run
                this after updating properties or settings if the changes
                haven&apos;t reached your site yet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Current sync version</p>
                    <p className="text-sm text-muted-foreground">
                      {syncVersion === null
                        ? 'Loading…'
                        : `v${syncVersion} — downstream widgets invalidate their local cache when this number changes`}
                    </p>
                    {lastClearedAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last cleared: {new Date(lastClearedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={onClearCache}
                    disabled={clearingCache}
                    variant="default"
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-2 ${clearingCache ? 'animate-spin' : ''}`}
                    />
                    {clearingCache ? 'Clearing…' : 'Clear widget cache'}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Replaces the old manual cache-clear PHP script. Widgets that
                poll <code>/api/v1/sync-meta</code> refresh on their next tick
                (within ~1 minute); webhook-subscribed integrations refresh
                immediately.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
