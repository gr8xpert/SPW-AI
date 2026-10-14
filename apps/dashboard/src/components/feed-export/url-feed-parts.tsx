'use client';

import type { ReactNode } from 'react';
import { Check, Copy, ExternalLink, Eye, EyeOff, Loader2, RefreshCw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// The parts of the Kyero XML and JSON tabs. Each feed has its own settings,
// key and access log; these cards render either one.

export interface UrlFeedSettings {
  enabled: boolean;
  includeUnpublished: boolean;
  includeSold: boolean;
  listingScope: 'all' | 'own';
  // Kyero XML only.
  cacheTtl?: number;
}

export interface ExportLog {
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

export function FeedUrlCard(props: {
  icon: ReactNode;
  title: string;
  description: string;
  shownUrl: string;
  url: string;
  propertyCount: number;
  enabled: boolean;
  copied: boolean;
  onCopy: () => void;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {props.icon}
          {props.title}
          <Badge variant={props.enabled ? 'default' : 'secondary'}>{props.enabled ? 'On' : 'Off'}</Badge>
        </CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Feed URL</Label>
          <div className="flex gap-2">
            <Input value={props.shownUrl} readOnly className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={props.onCopy}>
              {props.copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" asChild>
              <a href={props.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between p-3 bg-muted rounded-md">
          <span className="text-sm">Properties in feed</span>
          <Badge variant="secondary">{props.propertyCount}</Badge>
        </div>
        {!props.enabled && (
          <p className="text-sm text-amber-600">The feed is switched off — the URL returns an error until you turn on “Feed On” below.</p>
        )}
        {props.children}
      </CardContent>
    </Card>
  );
}

// One settings line: label + hint on the left, the control on the right.
function SettingRow({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function FeedSettingsCard(props: {
  feedName: string;
  settings: UrlFeedSettings;
  onChange: (s: UrlFeedSettings) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { settings, onChange } = props;
  const set = (patch: Partial<UrlFeedSettings>) => onChange({ ...settings, ...patch });
  const isKyero = settings.cacheTtl !== undefined;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Feed Settings</CardTitle>
            <CardDescription>Which properties go in the {props.feedName} feed</CardDescription>
          </div>
          <Button className="shadow-sm" onClick={props.onSave} disabled={props.saving}>
            {props.saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Settings
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border divide-y">
          <SettingRow title="Feed On" hint={`Turn on so the ${props.feedName} URL can be downloaded`}>
            <Switch checked={settings.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          </SettingRow>
          <SettingRow title="Include unpublished" hint="Also send draft and unpublished properties">
            <Switch checked={settings.includeUnpublished} onCheckedChange={(v) => set({ includeUnpublished: v })} />
          </SettingRow>
          {!isKyero && (
            <SettingRow title="Include sold" hint="Sold listings are sent with status “sold”">
              <Switch checked={settings.includeSold} onCheckedChange={(v) => set({ includeSold: v })} />
            </SettingRow>
          )}
          <SettingRow title="Which listings" hint="Own = marked as your own in the feed (Resales Own Property) or added by hand">
            <Select value={settings.listingScope} onValueChange={(v) => set({ listingScope: v as 'all' | 'own' })}>
              <SelectTrigger className="w-full sm:w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All listings (network included)</SelectItem>
                <SelectItem value="own">Own listings only</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          {isKyero && (
            <SettingRow title="Cache time" hint="Seconds a download is reused before it is rebuilt (60 – 86400)">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={60}
                  max={86400}
                  value={settings.cacheTtl}
                  onChange={(e) => set({ cacheTtl: Number(e.target.value) })}
                  className="w-[120px]"
                />
                <span className="text-sm text-muted-foreground">sec</span>
              </div>
            </SettingRow>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function FeedKeyCard(props: {
  feedName: string;
  apiKey: string;
  plainUrl: string;
  onCopy: () => void;
  copied: boolean;
  showKey: boolean;
  onToggleShow: () => void;
  onRegenerate: () => void;
}) {
  const maskedKey = props.showKey ? props.apiKey : props.apiKey ? '***' : '';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Feed Key</CardTitle>
        <CardDescription>
          The {props.feedName} URL already carries this key. Integrations can send it in the X-API-Key header instead.
          Regenerating it breaks the old {props.feedName} URL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input value={props.apiKey} readOnly type={props.showKey ? 'text' : 'password'} className="font-mono flex-1 min-w-[200px]" />
          <Button variant="outline" size="icon" onClick={props.onCopy}>
            {props.copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="outline" onClick={props.onToggleShow}>
            {props.showKey ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {props.showKey ? 'Hide' : 'Reveal'}
          </Button>
          <Button variant="outline" onClick={props.onRegenerate}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Regenerate
          </Button>
        </div>
        {props.apiKey && (
          <div className="p-4 bg-muted rounded-md">
            <p className="text-sm font-medium mb-2">Example Request</p>
            <code className="text-xs block bg-background p-3 rounded border break-all">
              curl -H &quot;X-API-Key: {maskedKey}&quot; {props.plainUrl}
            </code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AccessLogCard({ feedName, logs }: { feedName: string; logs: ExportLog[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Access Log</CardTitle>
        <CardDescription>Who downloaded the {feedName} feed in the last 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No downloads yet</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Properties</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Response Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{formatDate(log.accessedAt)}</TableCell>
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
  );
}
