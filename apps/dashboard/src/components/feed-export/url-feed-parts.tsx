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
import { useLanguage } from '@/i18n/i18n-provider';
import { useFeedExportText } from './_i18n';

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

function formatDate(d: string, locale: string): string {
  try { return new Date(d).toLocaleString(locale); } catch { return d; }
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
  const t = useFeedExportText();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {props.icon}
          {props.title}
          <Badge variant={props.enabled ? 'default' : 'secondary'}>{props.enabled ? t.common.on : t.common.off}</Badge>
        </CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t.common.feedUrl}</Label>
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
          <span className="text-sm">{t.url.propertiesInFeed}</span>
          <Badge variant="secondary">{props.propertyCount}</Badge>
        </div>
        {!props.enabled && (
          <p className="text-sm text-amber-600">{t.url.switchedOff}</p>
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
  const t = useFeedExportText();
  const { settings, onChange } = props;
  const set = (patch: Partial<UrlFeedSettings>) => onChange({ ...settings, ...patch });
  const isKyero = settings.cacheTtl !== undefined;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>{t.url.settingsTitle}</CardTitle>
            <CardDescription>{t.url.settingsDescription(props.feedName)}</CardDescription>
          </div>
          <Button className="shadow-sm" onClick={props.onSave} disabled={props.saving}>
            {props.saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {t.url.saveSettings}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border divide-y">
          <SettingRow title={t.url.feedOn} hint={t.url.feedOnHint(props.feedName)}>
            <Switch checked={settings.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          </SettingRow>
          <SettingRow title={t.url.includeUnpublished} hint={t.url.includeUnpublishedHint}>
            <Switch checked={settings.includeUnpublished} onCheckedChange={(v) => set({ includeUnpublished: v })} />
          </SettingRow>
          {!isKyero && (
            <SettingRow title={t.url.includeSold} hint={t.url.includeSoldHint}>
              <Switch checked={settings.includeSold} onCheckedChange={(v) => set({ includeSold: v })} />
            </SettingRow>
          )}
          <SettingRow title={t.url.whichListings} hint={t.url.whichListingsHint}>
            <Select value={settings.listingScope} onValueChange={(v) => set({ listingScope: v as 'all' | 'own' })}>
              <SelectTrigger className="w-full sm:w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.url.allListings}</SelectItem>
                <SelectItem value="own">{t.url.ownOnly}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          {isKyero && (
            <SettingRow title={t.url.cacheTime} hint={t.url.cacheTimeHint}>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={60}
                  max={86400}
                  value={settings.cacheTtl}
                  onChange={(e) => set({ cacheTtl: Number(e.target.value) })}
                  className="w-[120px]"
                />
                <span className="text-sm text-muted-foreground">{t.url.sec}</span>
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
  const t = useFeedExportText();
  const maskedKey = props.showKey ? props.apiKey : props.apiKey ? '***' : '';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.url.keyTitle}</CardTitle>
        <CardDescription>{t.url.keyDescription(props.feedName)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input value={props.apiKey} readOnly type={props.showKey ? 'text' : 'password'} className="font-mono flex-1 min-w-[200px]" />
          <Button variant="outline" size="icon" onClick={props.onCopy}>
            {props.copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="outline" onClick={props.onToggleShow}>
            {props.showKey ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {props.showKey ? t.url.hide : t.url.reveal}
          </Button>
          <Button variant="outline" onClick={props.onRegenerate}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t.url.regenerate}
          </Button>
        </div>
        {props.apiKey && (
          <div className="p-4 bg-muted rounded-md">
            <p className="text-sm font-medium mb-2">{t.url.exampleRequest}</p>
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
  const t = useFeedExportText();
  const { locale } = useLanguage();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.url.logTitle}</CardTitle>
        <CardDescription>{t.url.logDescription(feedName)}</CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">{t.url.noDownloads}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.url.date}</TableHead>
                <TableHead>{t.url.properties}</TableHead>
                <TableHead>{t.url.ipAddress}</TableHead>
                <TableHead>{t.url.responseTime}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{formatDate(log.accessedAt, locale)}</TableCell>
                  <TableCell>{log.propertiesCount.toLocaleString(locale)}</TableCell>
                  <TableCell className="font-mono text-sm">{log.requesterIp}</TableCell>
                  <TableCell>{t.url.ms(log.responseTimeMs)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
