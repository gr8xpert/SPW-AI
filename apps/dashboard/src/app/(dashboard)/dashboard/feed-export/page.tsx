'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Copy,
  RefreshCw,
  ExternalLink,
  FileJson,
  FileCode,
  Check,
  Eye,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

interface ExportLog {
  id: number;
  format: 'xml' | 'json';
  propertiesCount: number;
  requesterIp: string;
  responseTimeMs: number;
  accessedAt: string;
}

const sampleLogs: ExportLog[] = [
  { id: 1, format: 'xml', propertiesCount: 156, requesterIp: '52.18.xxx.xxx', responseTimeMs: 45, accessedAt: '2026-04-06T08:30:00Z' },
  { id: 2, format: 'json', propertiesCount: 156, requesterIp: '34.92.xxx.xxx', responseTimeMs: 32, accessedAt: '2026-04-06T07:15:00Z' },
  { id: 3, format: 'xml', propertiesCount: 154, requesterIp: '52.18.xxx.xxx', responseTimeMs: 48, accessedAt: '2026-04-05T08:30:00Z' },
  { id: 4, format: 'xml', propertiesCount: 154, requesterIp: '52.18.xxx.xxx', responseTimeMs: 42, accessedAt: '2026-04-04T08:30:00Z' },
  { id: 5, format: 'json', propertiesCount: 152, requesterIp: '34.92.xxx.xxx', responseTimeMs: 35, accessedAt: '2026-04-03T12:00:00Z' },
];

export default function FeedExportPage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const exportKey = 'sk_export_abc123def456...';
  const baseUrl = 'https://api.spw.com/feed/acme-properties';
  const xmlUrl = `${baseUrl}/properties.xml`;
  const jsonUrl = `${baseUrl}/properties.json`;

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    toast({
      title: 'Copied to clipboard',
      description: `${type} has been copied to your clipboard.`,
    });
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Feed Export</h1>
          <p className="text-muted-foreground">
            Export your properties as XML (Kyero) or JSON for external portals
          </p>
        </div>
      </div>

      {/* Configuration */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              XML Feed (Kyero Format)
            </CardTitle>
            <CardDescription>
              Compatible with Kyero, Idealista, and other portals
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Feed URL</Label>
              <div className="flex gap-2">
                <Input value={xmlUrl} readOnly className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(xmlUrl, 'XML URL')}
                >
                  {copied === 'XML URL' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={xmlUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <span className="text-sm">Properties in feed</span>
              <Badge variant="secondary">156</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              JSON Feed
            </CardTitle>
            <CardDescription>
              For custom integrations and modern applications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Feed URL</Label>
              <div className="flex gap-2">
                <Input value={jsonUrl} readOnly className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(jsonUrl, 'JSON URL')}
                >
                  {copied === 'JSON URL' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={jsonUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <span className="text-sm">Properties in feed</span>
              <Badge variant="secondary">156</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* API Key */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            Include this API key in the X-API-Key header when accessing the feed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Export API Key</Label>
            <div className="flex gap-2">
              <Input
                value={exportKey}
                readOnly
                type="password"
                className="font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(exportKey, 'API Key')}
              >
                {copied === 'API Key' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button variant="outline">
                <Eye className="h-4 w-4 mr-2" />
                Reveal
              </Button>
              <Button variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
            </div>
          </div>
          <div className="p-4 bg-muted rounded-md">
            <p className="text-sm font-medium mb-2">Example Request</p>
            <code className="text-xs block bg-background p-3 rounded border">
              curl -H &quot;X-API-Key: {exportKey}&quot; {xmlUrl}
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Export Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Export Settings</CardTitle>
          <CardDescription>Configure which properties are included in the feed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between p-4 border rounded-md">
              <div>
                <p className="font-medium">Published Properties Only</p>
                <p className="text-sm text-muted-foreground">
                  Exclude draft and unpublished properties
                </p>
              </div>
              <Badge variant="success">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-md">
              <div>
                <p className="font-medium">Include Sold Properties</p>
                <p className="text-sm text-muted-foreground">
                  Include properties marked as sold
                </p>
              </div>
              <Badge variant="secondary">Disabled</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Access Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Access Log</CardTitle>
          <CardDescription>Recent feed access history (last 7 days)</CardDescription>
        </CardHeader>
        <CardContent>
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
              {sampleLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{formatDate(log.accessedAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase">
                      {log.format}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.propertiesCount}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {log.requesterIp}
                  </TableCell>
                  <TableCell>{log.responseTimeMs}ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
