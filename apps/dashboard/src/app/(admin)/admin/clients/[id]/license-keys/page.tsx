'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Key, Copy, RefreshCw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface LicenseKey {
  id: number;
  key: string;
  status: string;
  domain: string | null;
  activatedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function LicenseKeysPage() {
  const params = useParams();
  const clientId = params.id as string;
  const api = useApi();
  const { toast } = useToast();

  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/super-admin/clients/${clientId}/license-keys`);
      const body = res?.data || res;
      setKeys(Array.isArray(body) ? body : body?.data || []);
    } catch {
      toast({ title: 'Failed to load license keys', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.post(`/api/super-admin/clients/${clientId}/license-keys`, {});
      const newKey = res?.data || res;
      setKeys([newKey, ...keys]);
      toast({ title: 'License key generated' });
    } catch {
      toast({ title: 'Failed to generate key', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (keyId: number) => {
    try {
      await api.post(`/api/super-admin/clients/${clientId}/license-keys/${keyId}/revoke`);
      setKeys(keys.map(k => k.id === keyId ? { ...k, status: 'revoked' } : k));
      toast({ title: 'License key revoked' });
    } catch {
      toast({ title: 'Failed to revoke key', variant: 'destructive' });
    }
  };

  const handleRegenerate = async (keyId: number) => {
    try {
      const res = await api.post(`/api/super-admin/clients/${clientId}/license-keys/${keyId}/regenerate`);
      const updated = res?.data || res;
      setKeys(keys.map(k => k.id === keyId ? updated : k));
      toast({ title: 'License key regenerated' });
    } catch {
      toast({ title: 'Failed to regenerate key', variant: 'destructive' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Link href={`/admin/clients/${clientId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="page-title">License Keys</h1>
            <p className="page-description mt-1">Manage license keys for this client</p>
          </div>
        </div>
        <Button onClick={handleGenerate} disabled={generating} className="shadow-sm">
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Key className="mr-2 h-4 w-4" />
          )}
          Generate New Key
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All License Keys</CardTitle>
          <CardDescription>Keys used by the widget/WP plugin to authenticate</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">No license keys generated yet</p>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
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
                      Domain: {key.domain || 'Any'}
                      {' · '}Created: {format(new Date(key.createdAt), 'PP')}
                      {key.activatedAt && ` · Activated: ${format(new Date(key.activatedAt), 'PP')}`}
                      {key.lastUsedAt && ` · Last used: ${format(new Date(key.lastUsedAt), 'PP')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {key.status === 'active' && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => handleRegenerate(key.id)}>
                          <RefreshCw className="mr-1 h-3 w-3" />
                          Regenerate
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleRevoke(key.id)}>
                          Revoke
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
