'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Copy,
  RefreshCw,
  ExternalLink,
  FileJson,
  FileCode,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Save,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

interface ExportConfig {
  id?: number;
  isEnabled: boolean;
  apiKey: string;
  allowedFormats: string[];
  includeUnpublished: boolean;
  includeSold: boolean;
  xmlFormat: string;
  cacheTtl: number;
  tenantSlug?: string;
  propertyCount?: number;
}

interface ExportLog {
  id: number;
  format: string;
  propertiesCount: number;
  requesterIp: string;
  responseTimeMs: number;
  accessedAt: string;
}

function formatDate(d: string): string {
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

export default function FeedExportPage() {
  const [config, setConfig] = useState<ExportConfig | null>(null);
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [settings, setSettings] = useState({
    includeUnpublished: false,
    includeSold: false,
    xmlFormat: 'kyero',
    cacheTtl: 3600,
  });

  const api = useApi();
  const { toast } = useToast();

  const fetchConfig = async () => {
    try {
      const res = await api.get('/api/dashboard/feed-export');
      const body = res?.data || res;
      setConfig(body);
      if (body) {
        setSettings({
          includeUnpublished: body.includeUnpublished ?? false,
          includeSold: body.includeSold ?? false,
          xmlFormat: body.xmlFormat || 'kyero',
          cacheTtl: body.cacheTtl || 3600,
        });
      }
    } catch {
      setConfig(null);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await api.get('/api/dashboard/feed-export/logs?days=7');
      const body = res?.data || res;
      setLogs(Array.isArray(body) ? body : body.data || []);
    } catch {
      setLogs([]);
    }
  };

  useEffect(() => { fetchConfig(); fetchLogs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveSettings = async () => {
    try {
      await api.put('/api/dashboard/feed-export', settings);
      toast({ title: 'Export settings saved' });
      fetchConfig();
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    }
  };

  const handleRegenerateKey = async () => {
    try {
      await api.post('/api/dashboard/feed-export/regenerate-key');
      toast({ title: 'API key regenerated' });
      fetchConfig();
    } catch (e: any) {
      toast({ title: 'Failed to regenerate', description: e.message, variant: 'destructive' });
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    toast({ title: 'Copied to clipboard', description: `${type} copied.` });
    setTimeout(() => setCopied(null), 2000);
  };

  const apiBaseUrl = typeof window !== 'undefined' ? window.location.origin.replace(':3000', ':3001') : '';
  const tenantSlug = config?.tenantSlug || 'my-agency';
  const xmlUrl = `${apiBaseUrl}/api/feed/${tenantSlug}/properties.xml`;
  const jsonUrl = `${apiBaseUrl}/api/feed/${tenantSlug}/properties.json`;
  const apiKey = config?.apiKey || '';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Feed Export</h1>
          <p className="page-description mt-1">Export your properties as XML (Kyero) or JSON for external portals</p>
        </div>
      </div>

      {api.isLoading && !config ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCode className="h-5 w-5" />
                  XML Feed (Kyero Format)
                </CardTitle>
                <CardDescription>Compatible with Kyero, Idealista, and other portals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Feed URL</Label>
                  <div className="flex gap-2">
                    <Input value={xmlUrl} readOnly className="font-mono text-sm" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(xmlUrl, 'XML URL')}>
                      {copied === 'XML URL' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="icon" asChild>
                      <a href={xmlUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <span className="text-sm">Properties in feed</span>
                  <Badge variant="secondary">{config?.propertyCount ?? 0}</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileJson className="h-5 w-5" />
                  JSON Feed
                </CardTitle>
                <CardDescription>For custom integrations and modern applications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Feed URL</Label>
                  <div className="flex gap-2">
                    <Input value={jsonUrl} readOnly className="font-mono text-sm" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(jsonUrl, 'JSON URL')}>
                      {copied === 'JSON URL' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="icon" asChild>
                      <a href={jsonUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <span className="text-sm">Properties in feed</span>
                  <Badge variant="secondary">{config?.propertyCount ?? 0}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Authentication</CardTitle>
              <CardDescription>Include this API key in the X-API-Key header when accessing the feed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Export API Key</Label>
                <div className="flex gap-2">
                  <Input
                    value={apiKey}
                    readOnly
                    type={showKey ? 'text' : 'password'}
                    className="font-mono"
                  />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(apiKey, 'API Key')}>
                    {copied === 'API Key' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" onClick={() => setShowKey(!showKey)}>
                    {showKey ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                    {showKey ? 'Hide' : 'Reveal'}
                  </Button>
                  <Button variant="outline" onClick={handleRegenerateKey}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate
                  </Button>
                </div>
              </div>
              {apiKey && (
                <div className="p-4 bg-muted rounded-md">
                  <p className="text-sm font-medium mb-2">Example Request</p>
                  <code className="text-xs block bg-background p-3 rounded border">
                    curl -H &quot;X-API-Key: {showKey ? apiKey : '***'}&quot; {xmlUrl}
                  </code>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Export Settings</CardTitle>
                  <CardDescription>Configure which properties are included in the feed</CardDescription>
                </div>
                <Button className="shadow-sm" onClick={handleSaveSettings} disabled={api.isLoading}>
                  {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Settings
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between p-4 border rounded-md">
                  <div>
                    <p className="font-medium">Include Unpublished</p>
                    <p className="text-sm text-muted-foreground">Include draft and unpublished properties</p>
                  </div>
                  <Switch
                    checked={settings.includeUnpublished}
                    onCheckedChange={(checked) => setSettings({ ...settings, includeUnpublished: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-md">
                  <div>
                    <p className="font-medium">Include Sold Properties</p>
                    <p className="text-sm text-muted-foreground">Include properties marked as sold</p>
                  </div>
                  <Switch
                    checked={settings.includeSold}
                    onCheckedChange={(checked) => setSettings({ ...settings, includeSold: checked })}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>XML Format</Label>
                  <Select value={settings.xmlFormat} onValueChange={(v) => setSettings({ ...settings, xmlFormat: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kyero">Kyero</SelectItem>
                      <SelectItem value="idealista">Idealista</SelectItem>
                      <SelectItem value="generic">Generic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cache TTL (seconds)</Label>
                  <Input
                    type="number"
                    min={60}
                    max={86400}
                    value={settings.cacheTtl}
                    onChange={(e) => setSettings({ ...settings, cacheTtl: Number(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground">Min 60s, max 86400s (24h)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Access Log</CardTitle>
              <CardDescription>Recent feed access history (last 7 days)</CardDescription>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No access logs yet</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Properties</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Response Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{formatDate(log.accessedAt)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="uppercase">{log.format}</Badge>
                        </TableCell>
                        <TableCell>{log.propertiesCount}</TableCell>
                        <TableCell className="font-mono text-sm">{log.requesterIp}</TableCell>
                        <TableCell>{log.responseTimeMs}ms</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
