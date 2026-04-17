'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useApi } from '@/hooks/use-api';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Key,
  RefreshCw,
  Calendar,
  Globe,
  Mail,
  Building2,
  Shield,
  Zap,
  CheckCircle,
  XCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';

interface ClientDetail {
  id: number;
  name: string;
  slug: string;
  domain: string | null;
  ownerEmail: string | null;
  siteName: string | null;
  apiUrl: string | null;
  apiKey: string;
  webhookUrl: string | null;
  settings: Record<string, any>;
  isActive: boolean;
  subscriptionStatus: string;
  billingCycle: string | null;
  billingSource: string | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  adminOverride: boolean;
  isInternal: boolean;
  widgetEnabled: boolean;
  aiSearchEnabled: boolean;
  widgetFeatures: string[];
  planId: number;
  lastCacheClearedAt: string | null;
  adminUser?: {
    id: number;
    email: string;
    name: string;
    lastLoginAt: string | null;
    isActive: boolean;
  };
}

interface LicenseKey {
  id: number;
  key: string;
  status: string;
  domain: string | null;
  activatedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-500',
  grace: 'bg-yellow-500',
  expired: 'bg-red-500',
  manual: 'bg-blue-500',
  internal: 'bg-purple-500',
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const api = useApi();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [licenseKeys, setLicenseKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientRes, keysRes] = await Promise.all([
          api.get(`/api/super-admin/clients/${clientId}`),
          api.get(`/api/super-admin/clients/${clientId}/license-keys`),
        ]);
        setClient(clientRes.data);
        setLicenseKeys(keysRes.data);
      } catch (error) {
        console.error('Failed to fetch client:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleDelete = async () => {
    try {
      await api.delete(`/api/super-admin/clients/${clientId}`);
      router.push('/admin/clients');
    } catch (error) {
      console.error('Failed to delete client:', error);
      alert('Failed to delete client');
    }
  };

  const handleToggleOverride = async () => {
    setActionLoading(true);
    try {
      const response = await api.post(`/api/super-admin/clients/${clientId}/toggle-override`);
      setClient(response.data);
    } catch (error) {
      console.error('Failed to toggle override:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtend = async (days: number) => {
    setActionLoading(true);
    try {
      const response = await api.post(`/api/super-admin/clients/${clientId}/extend`, { days });
      setClient(response.data);
    } catch (error) {
      console.error('Failed to extend subscription:', error);
    } finally {
      setActionLoading(false);
    }
  };

  // Bumps the client's syncVersion and fires cache.invalidated — their
  // widget + WP plugin pick up fresh data without the old manual script.
  const handleClearClientCache = async () => {
    if (!client) return;
    if (
      !window.confirm(
        `Clear widget cache for ${client.name}? Their site will refetch listings on the next request.`,
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      const response = await api.post(
        `/api/super-admin/clients/${clientId}/clear-cache`,
      );
      const version = response.data?.syncVersion ?? '?';
      // Re-fetch the client so lastCacheClearedAt (persisted server-side)
      // updates the "Last cleared" hint below the button. The clear
      // response itself only carries clearedAt + syncVersion — the full
      // client payload is what the rest of the page renders off of.
      try {
        const fresh = await api.get(`/api/super-admin/clients/${clientId}`);
        setClient(fresh.data);
      } catch {
        // Non-fatal: a failed refetch just means the hint won't update
        // until the user reloads. The clear itself already succeeded.
      }
      alert(`Cache cleared — new sync version: v${version}`);
    } catch (error) {
      console.error('Failed to clear client cache:', error);
      alert('Failed to clear client cache. Check server logs.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateLicenseKey = async () => {
    try {
      const response = await api.post(`/api/super-admin/clients/${clientId}/license-keys`, {
        domain: client?.domain,
      });
      setLicenseKeys([response.data, ...licenseKeys]);
    } catch (error) {
      console.error('Failed to generate license key:', error);
    }
  };

  const handleRevokeLicenseKey = async (keyId: number) => {
    try {
      await api.post(`/api/super-admin/clients/${clientId}/license-keys/${keyId}/revoke`);
      setLicenseKeys(licenseKeys.map(k => k.id === keyId ? { ...k, status: 'revoked' } : k));
    } catch (error) {
      console.error('Failed to revoke license key:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold">Client not found</h1>
        <Link href="/admin/clients">
          <Button variant="link">Back to clients</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/clients">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
            <p className="text-muted-foreground">{client.slug}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${statusColors[client.subscriptionStatus]} text-white`}>
              {client.subscriptionStatus}
            </Badge>
            {client.adminOverride && <Badge variant="outline">Override</Badge>}
            {client.isInternal && <Badge variant="outline">Internal</Badge>}
            {!client.isActive && <Badge variant="destructive">Inactive</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/clients/${clientId}/edit`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Client</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;{client.name}&quot;? This action cannot be undone
                  and will permanently delete all associated data.
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
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="license">License Keys</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Client Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">{client.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Slug</p>
                    <p className="font-medium">{client.slug}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Site Name</p>
                    <p className="font-medium">{client.siteName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Domain</p>
                    {client.domain ? (
                      <a
                        href={`https://${client.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium flex items-center gap-1 text-primary hover:underline"
                      >
                        {client.domain}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <p className="font-medium">—</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Owner Email</p>
                    {client.ownerEmail ? (
                      <a href={`mailto:${client.ownerEmail}`} className="font-medium text-primary hover:underline">
                        {client.ownerEmail}
                      </a>
                    ) : (
                      <p className="font-medium">—</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">API URL</p>
                    <p className="font-medium text-sm truncate">{client.apiUrl || '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Admin User */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Admin User
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {client.adminUser ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium">{client.adminUser.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{client.adminUser.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant={client.adminUser.isActive ? 'default' : 'destructive'}>
                        {client.adminUser.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Last Login</p>
                      <p className="font-medium">
                        {client.adminUser.lastLoginAt
                          ? format(new Date(client.adminUser.lastLoginAt), 'PPp')
                          : 'Never'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No admin user found</p>
                )}
              </CardContent>
            </Card>

            {/* Widget Features */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Widget Features
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Widget Enabled</span>
                  {client.widgetEnabled ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>AI Search</span>
                  {client.aiSearchEnabled ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Enabled Features</p>
                  <div className="flex flex-wrap gap-2">
                    {client.widgetFeatures.map((feature) => (
                      <Badge key={feature} variant="secondary">{feature}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* API Credentials */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Credentials
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">API Key</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                      {client.apiKey}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(client.apiKey)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Webhook URL</p>
                  <p className="text-sm truncate">{client.webhookUrl || 'Not configured'}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subscription" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Subscription Details</CardTitle>
              <CardDescription>Manage billing and subscription settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={`${statusColors[client.subscriptionStatus]} text-white mt-1`}>
                    {client.subscriptionStatus}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Billing Cycle</p>
                  <p className="font-medium capitalize">{client.billingCycle || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Billing Source</p>
                  <p className="font-medium capitalize">{client.billingSource || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expires At</p>
                  <p className="font-medium">
                    {client.expiresAt ? format(new Date(client.expiresAt), 'PPP') : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Grace Period Ends</p>
                  <p className="font-medium">
                    {client.graceEndsAt ? format(new Date(client.graceEndsAt), 'PPP') : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Plan ID</p>
                  <p className="font-medium">{client.planId}</p>
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Shield className={client.adminOverride ? 'text-green-500' : 'text-muted-foreground'} />
                  <span>Admin Override: {client.adminOverride ? 'ON' : 'OFF'}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleOverride}
                    disabled={actionLoading}
                  >
                    Toggle
                  </Button>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-4">Quick Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => handleExtend(30)} disabled={actionLoading}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Extend 30 Days
                  </Button>
                  <Button variant="outline" onClick={() => handleExtend(90)} disabled={actionLoading}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Extend 90 Days
                  </Button>
                  <Button variant="outline" onClick={() => handleExtend(365)} disabled={actionLoading}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Extend 1 Year
                  </Button>
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="outline"
                      onClick={handleClearClientCache}
                      disabled={actionLoading}
                    >
                      <RefreshCw
                        className={`mr-2 h-4 w-4 ${actionLoading ? 'animate-spin' : ''}`}
                      />
                      Clear widget cache
                    </Button>
                    {/* Persisted on the tenant row so this survives page
                        reloads (and hands support a timestamp they can
                        quote when a customer complains about stale data). */}
                    <span className="text-xs text-muted-foreground px-1">
                      {client?.lastCacheClearedAt
                        ? `Last cleared ${format(new Date(client.lastCacheClearedAt), 'PPp')}`
                        : 'Never cleared'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="license" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>License Keys</CardTitle>
                <CardDescription>Manage widget license keys for this client</CardDescription>
              </div>
              <Button onClick={handleGenerateLicenseKey}>
                <Key className="mr-2 h-4 w-4" />
                Generate New Key
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {licenseKeys.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No license keys generated yet</p>
                ) : (
                  licenseKeys.map((key) => (
                    <div key={key.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="font-mono font-bold">{key.key}</code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(key.key)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Badge variant={key.status === 'active' ? 'default' : 'destructive'}>
                            {key.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Domain: {key.domain || 'Any'} • Created: {format(new Date(key.createdAt), 'PP')}
                          {key.lastUsedAt && ` • Last used: ${format(new Date(key.lastUsedAt), 'PP')}`}
                        </p>
                      </div>
                      {key.status === 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevokeLicenseKey(key.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tenant Settings</CardTitle>
              <CardDescription>Raw settings JSON for this client</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
                {JSON.stringify(client.settings, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
