'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, Save, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPut } from '@/lib/api';
import {
  API_URL,
  errorText,
  unwrap,
  type IdealistaCheck,
  type IdealistaOverview,
  type IdealistaSettings,
} from './idealista-api';
import { IdealistaListingPicker } from './idealista-listing-picker';
import { IdealistaTypesTable } from './idealista-types-table';

// Feed Export → idealista: the client's own idealista feed (customer JSON v6).
// idealista downloads the URL; the key sits in the path.
export function IdealistaCard() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [overview, setOverview] = useState<IdealistaOverview | null>(null);
  const [settings, setSettings] = useState<IdealistaSettings | null>(null);
  const [check, setCheck] = useState<IdealistaCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const data = unwrap<IdealistaOverview>(await apiGet('/api/dashboard/feed-export/idealista'));
      setOverview(data);
      setSettings(data.settings);
    } catch (err) {
      toast({ title: 'Could not load the idealista settings', description: errorText(err), variant: 'destructive' });
    }
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      setCheck(unwrap<IdealistaCheck>(await apiGet('/api/dashboard/feed-export/idealista/check')));
    } catch (err) {
      toast({ title: 'Could not check the feed', description: errorText(err), variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    load();
    runCheck();
  }, [session?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { enabled, customerCode, country, contactName, contactEmail, contactPhone, addressVisibility, mode, propertyIds, propertyUrlPattern } = settings;
      await apiPut('/api/dashboard/feed-export/idealista', {
        enabled, customerCode: customerCode.trim(), country, contactName, contactEmail: contactEmail.trim(),
        contactPhone, addressVisibility, mode, propertyIds, propertyUrlPattern: propertyUrlPattern.trim(),
      });
      toast({ title: 'idealista settings saved' });
      await load();
      runCheck();
    } catch (err) {
      toast({ title: 'Could not save', description: errorText(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!overview || !settings) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const set = (patch: Partial<IdealistaSettings>) => setSettings({ ...settings, ...patch });
  const feedUrl = overview.exportKey
    ? `${API_URL}/api/feed/${overview.tenantSlug}/${overview.exportKey}/idealista.json`
    : '';
  const codeOk = /^ilc[a-z0-9]{40}$/.test(settings.customerCode.trim());
  const problems = (check?.skipped.length ?? 0) + (check?.issues?.length ?? 0);

  const copy = () => {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              idealista
              <Badge variant={settings.enabled ? 'default' : 'secondary'}>{settings.enabled ? 'On' : 'Off'}</Badge>
            </CardTitle>
            <CardDescription>
              Your own listings as an idealista feed (JSON v6). Give the feed URL to idealista and they import it on their schedule.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={settings.enabled} onCheckedChange={(v) => set({ enabled: v })} />
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="settings">
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="types">Property types</TabsTrigger>
            <TabsTrigger value="listings">Listings</TabsTrigger>
            <TabsTrigger value="check">
              Feed check
              {!!problems && <Badge variant="destructive" className="ml-2 h-5 px-1.5">{problems}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Feed URL</Label>
              {feedUrl ? (
                <div className="flex gap-2">
                  <Input value={feedUrl} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={copy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="icon" asChild disabled={!settings.enabled}>
                    <a href={feedUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Save once to create your feed URL.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Keep it private — anyone with this URL can read the feed. Regenerating the export key below changes it.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>idealista customer code</Label>
                <Input
                  value={settings.customerCode}
                  onChange={(e) => set({ customerCode: e.target.value.trim().toLowerCase() })}
                  placeholder="ilc…"
                  className="font-mono text-sm"
                  autoComplete="off"
                />
                <p className={`text-xs ${settings.customerCode && !codeOk ? 'text-destructive' : 'text-muted-foreground'}`}>
                  Given to you by idealista: “ilc” followed by 40 letters and digits.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={settings.country} onValueChange={(v) => set({ country: v as IdealistaSettings['country'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Spain">Spain</SelectItem>
                    <SelectItem value="Portugal">Portugal</SelectItem>
                    <SelectItem value="Italy">Italy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contact name</Label>
                <Input value={settings.contactName} maxLength={60} onChange={(e) => set({ contactName: e.target.value })} autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label>Contact email (receives idealista leads)</Label>
                <Input value={settings.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label>Contact phone</Label>
                <Input value={settings.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="+34 600 000 000" autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label>Address shown on idealista</Label>
                <Select value={settings.addressVisibility} onValueChange={(v) => set({ addressVisibility: v as IdealistaSettings['addressVisibility'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hidden">Hidden (area only)</SelectItem>
                    <SelectItem value="street">Street, no number</SelectItem>
                    <SelectItem value="full">Full address</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Property page link (optional)</Label>
              <Input
                value={settings.propertyUrlPattern}
                onChange={(e) => set({ propertyUrlPattern: e.target.value })}
                placeholder="https://yourwebsite.com/en/property/{segment}"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {'{segment}'} becomes the same page address your website uses (e.g. sea-view-penthouse_R123); {'{ref}'} becomes the reference.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="types" className="pt-4">
            <IdealistaTypesTable types={overview.types} options={overview.typeOptions} onSaved={() => { load(); runCheck(); }} />
          </TabsContent>

          <TabsContent value="listings" className="space-y-4 pt-4">
            <div className="space-y-2 max-w-md">
              <Label>Which listings are sent</Label>
              <Select value={settings.mode} onValueChange={(v) => set({ mode: v as IdealistaSettings['mode'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">All my own live listings</SelectItem>
                  <SelectItem value="selected">Only the listings I pick</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only your own listings (and ones added by hand) are ever sent, never other agencies’. Holiday rentals are not published on idealista.
              </p>
            </div>
            {settings.mode === 'selected' && (
              <IdealistaListingPicker ids={settings.propertyIds} onChange={(propertyIds) => set({ propertyIds })} />
            )}
            <p className="text-xs text-muted-foreground">Press Save to apply.</p>
          </TabsContent>

          <TabsContent value="check" className="space-y-4 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <strong>{check?.included ?? '–'}</strong> listings in the feed
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <strong>{check?.issues?.length ?? '–'}</strong> need attention
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <strong>{check?.skipped.length ?? '–'}</strong> left out
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={runCheck} disabled={checking}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Check again
              </Button>
            </div>
            {check?.warnings.map((w) => (
              <div key={w} className="text-sm p-3 rounded-md bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200">{w}</div>
            ))}
            {!!check?.skipped.length && (
              <p className="text-sm font-medium">Left out — idealista would reject these</p>
            )}
            {!!check?.skipped.length && (
              <div className="border rounded-md max-h-[360px] overflow-y-auto divide-y">
                {check.skipped.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 p-2 text-sm">
                    <a href={`/dashboard/properties/${s.id}/edit`} className="font-medium hover:underline">{s.reference}</a>
                    <span className="text-muted-foreground text-right">{s.reason}</span>
                  </div>
                ))}
              </div>
            )}
            {!!check?.issues?.length && (
              <>
                <p className="text-sm font-medium">Sent, but need attention — fix these before idealista shows them</p>
                <div className="border rounded-md max-h-[420px] overflow-y-auto divide-y">
                  {check.issues.map((s) => (
                    <div key={s.id} className="flex items-start justify-between gap-3 p-2 text-sm">
                      <a href={`/dashboard/properties/${s.id}/edit`} className="font-medium hover:underline shrink-0">{s.reference}</a>
                      <ul className="text-muted-foreground text-right space-y-0.5">
                        {s.issues.map((i) => <li key={i}>{i}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}
            {check && !check.skipped.length && !check.issues?.length && check.included > 0 && (
              <p className="text-sm text-muted-foreground">Every listing in the feed is complete.</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
