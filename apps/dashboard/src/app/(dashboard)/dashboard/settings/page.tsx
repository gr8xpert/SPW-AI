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
import { useToast } from '@/hooks/use-toast';
import { Building2, Mail, Globe, Webhook, Key, RefreshCw } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';

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

export default function SettingsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [syncVersion, setSyncVersion] = useState<number | null>(null);
  const [lastClearedAt, setLastClearedAt] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

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
  }, [session?.accessToken]);

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
        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <CardTitle>Webhook Configuration</CardTitle>
              <CardDescription>
                Configure webhooks to sync data with your website
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhookUrl"
                    placeholder="https://yoursite.com/api/spw-webhook"
                    className="flex-1"
                  />
                  <Button>Save</Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  We&apos;ll send POST requests to this URL when data changes
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Webhook Secret</p>
                    <p className="text-sm text-muted-foreground">
                      Used to verify webhook signatures
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-muted rounded text-sm">
                      whsec_••••••••••••
                    </code>
                    <Button variant="outline" size="sm">
                      Reveal
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
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
