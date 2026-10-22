'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus,
  MoreHorizontal,
  Play,
  Pause,
  RefreshCw,
  Settings,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Eraser,
  FlaskConical,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/i18n-provider';
import { useFeedsText } from './_i18n';

interface FeedConfig {
  id: number;
  name: string;
  provider: string;
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: 'success' | 'partial' | 'failed' | null;
  lastSyncCount: number;
  syncSchedule: string;
  nextSyncAt: string | null;
  credentials?: Record<string, string>;
  protectedFields?: string[] | null;
  markAsFeatured?: boolean;
  removeMissing?: boolean;
}

// Field names must match Property entity keys (see FEED_MANAGED_FIELDS in
// apps/api/src/modules/property/property.service.ts).
// Labels come from the page dictionary (t.fields[key]).
const PROTECTABLE_FIELDS: string[] = [
  'title',
  'description',
  'price',
  'images',
  'features',
  'bedrooms',
  'bathrooms',
  'buildSize',
  'plotSize',
  'terraceSize',
  'gardenSize',
  'propertyTypeId',
  'locationId',
  'energyRating',
];

const providerLogos: Record<string, string> = {
  resales: 'RO',
  inmoba: 'IM',
  infocasa: 'IC',
  redsp: 'RS',
  kyero: 'KY',
  odoo: 'OD',
};

const providerNames: Record<string, string> = {
  resales: 'Resales Online',
  inmoba: 'Inmoba',
  infocasa: 'Infocasa',
  redsp: 'REDSP',
  kyero: 'Kyero',
  odoo: 'Odoo CRM',
};

const statusConfig = {
  success: { icon: CheckCircle2, color: 'text-primary' },
  partial: { icon: AlertTriangle, color: 'text-primary/60' },
  failed: { icon: XCircle, color: 'text-primary/40' },
};

const emptyForm = {
  name: '',
  provider: 'resales',
  apiKey: '',
  clientId: '',
  filterId: '',
  username: '',
  password: '',
  endpoint: '',
  syncSchedule: '0 6 * * *',
  protectedFields: [] as string[],
  markAsFeatured: false,
  removeMissing: true,
};

function formatDate(d: string, locale: string): string {
  try { return new Date(d).toLocaleDateString(locale); } catch { return d; }
}

interface SyncStatus {
  isRunning: boolean;
  totalFetched: number;
  targetCount: number;
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  removedCount?: number;
  removalNote?: string | null;
  status?: string | null;
}

export default function FeedsPage() {
  const [feeds, setFeeds] = useState<FeedConfig[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isWipeOpen, setIsWipeOpen] = useState(false);
  const [isWipeDataOpen, setIsWipeDataOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<FeedConfig | null>(null);
  const [deletingFeed, setDeletingFeed] = useState<FeedConfig | null>(null);
  const [wipingFeed, setWipingFeed] = useState<FeedConfig | null>(null);
  const [wipingDataFeed, setWipingDataFeed] = useState<FeedConfig | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [syncStatuses, setSyncStatuses] = useState<Record<number, SyncStatus>>({});

  const api = useApi();
  const { toast } = useToast();
  const t = useFeedsText();
  const { locale } = useLanguage();

  const fetchFeeds = async () => {
    if (!api.isReady) return;
    try {
      const res = await api.get('/api/dashboard/feeds');
      const body = res?.data || res;
      setFeeds(Array.isArray(body) ? body : body.data || []);
    } catch {
      toast({ title: t.toasts.loadFailed, variant: 'destructive' });
    }
  };

  useEffect(() => { fetchFeeds(); }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll sync status for each feed every 3s; if any was running and stops, refresh the feeds list once
  useEffect(() => {
    if (!api.isReady || feeds.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      const results = await Promise.all(
        feeds.map(async (f) => {
          try {
            const res = await api.get(`/api/dashboard/feeds/${f.id}/sync-status`);
            const body = (res?.data || res) as SyncStatus;
            return [f.id, body] as const;
          } catch {
            return [f.id, null] as const;
          }
        }),
      );
      if (cancelled) return;
      const next: Record<number, SyncStatus> = {};
      let anyJustFinished = false;
      for (const [id, status] of results) {
        if (!status) continue;
        next[id] = status;
        const prev = syncStatuses[id];
        if (prev?.isRunning && !status.isRunning) anyJustFinished = true;
      }
      setSyncStatuses(next);
      if (anyJustFinished) fetchFeeds();
    };
    tick();
    const handle = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [api.isReady, feeds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    try {
      await api.post('/api/dashboard/feeds', {
        name: form.name,
        provider: form.provider,
        credentials: {
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
          ...(form.clientId ? { clientId: form.clientId } : {}),
          ...(form.filterId ? { filterId: form.filterId } : {}),
          ...(form.username ? { username: form.username } : {}),
          ...(form.password ? { password: form.password } : {}),
          ...(form.endpoint ? { endpoint: form.endpoint } : {}),
        },
        syncSchedule: form.syncSchedule || '0 6 * * *',
        protectedFields: form.protectedFields,
        markAsFeatured: form.markAsFeatured,
        removeMissing: form.removeMissing,
        isActive: true,
      });
      toast({ title: t.toasts.created });
      setIsAddOpen(false);
      setForm(emptyForm);
      fetchFeeds();
    } catch (e: any) {
      toast({ title: t.toasts.createFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleUpdate = async () => {
    if (!editingFeed) return;
    try {
      await api.put(`/api/dashboard/feeds/${editingFeed.id}`, {
        name: form.name,
        provider: form.provider,
        credentials: {
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
          ...(form.clientId ? { clientId: form.clientId } : {}),
          ...(form.filterId ? { filterId: form.filterId } : {}),
          ...(form.username ? { username: form.username } : {}),
          ...(form.password ? { password: form.password } : {}),
          ...(form.endpoint ? { endpoint: form.endpoint } : {}),
        },
        syncSchedule: form.syncSchedule || '0 6 * * *',
        protectedFields: form.protectedFields,
        markAsFeatured: form.markAsFeatured,
        removeMissing: form.removeMissing,
      });
      toast({ title: t.toasts.updated });
      setIsEditOpen(false);
      setEditingFeed(null);
      setForm(emptyForm);
      fetchFeeds();
    } catch (e: any) {
      toast({ title: t.toasts.updateFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingFeed) return;
    try {
      await api.delete(`/api/dashboard/feeds/${deletingFeed.id}`);
      toast({ title: t.toasts.deleted });
      setIsDeleteOpen(false);
      setDeletingFeed(null);
      fetchFeeds();
    } catch (e: any) {
      toast({ title: t.toasts.deleteFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleToggleActive = async (feed: FeedConfig) => {
    try {
      await api.put(`/api/dashboard/feeds/${feed.id}`, { isActive: !feed.isActive });
      toast({ title: feed.isActive ? t.toasts.paused : t.toasts.activated });
      fetchFeeds();
    } catch (e: any) {
      toast({ title: t.toasts.updateFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleSync = async (feed: FeedConfig) => {
    try {
      await api.post(`/api/dashboard/feeds/${feed.id}/sync`);
      toast({ title: t.toasts.syncTriggered, description: t.toasts.syncing(feed.name) });
      fetchFeeds();
    } catch (e: any) {
      toast({ title: t.toasts.syncFailed, description: e.message, variant: 'destructive' });
    }
  };

  // The safety check held back a big removal (or an empty feed). When the
  // client really shrank their filter, one confirmed sync removes them.
  const handleConfirmRemoval = async (feed: FeedConfig, note: string) => {
    const n = /(\d+) of \d+ properties would be removed/.exec(note)?.[1];
    const what = n ? t.confirmRemovalCount(n) : t.confirmRemovalAll(feed.name);
    if (!window.confirm(t.confirmRemoval(what))) return;
    try {
      await api.post(`/api/dashboard/feeds/${feed.id}/sync`, { confirmRemoval: true });
      toast({ title: t.toasts.syncStarted, description: t.toasts.removalStarted(feed.name) });
      fetchFeeds();
    } catch (e: any) {
      toast({ title: t.toasts.syncFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleWipeAndSync = async () => {
    if (!wipingFeed) return;
    try {
      const res = await api.post(`/api/dashboard/feeds/${wipingFeed.id}/wipe-and-sync`);
      const body = res?.data || res;
      toast({
        title: t.toasts.wipeTriggered,
        description: t.toasts.wiped(body?.wiped ?? 0),
      });
      setIsWipeOpen(false);
      setWipingFeed(null);
      fetchFeeds();
    } catch (e: any) {
      toast({ title: t.toasts.wipeFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleWipeData = async () => {
    if (!wipingDataFeed) return;
    try {
      const res = await api.post(`/api/dashboard/feeds/${wipingDataFeed.id}/wipe-data`);
      const body = res?.data || res;
      toast({
        title: t.toasts.dataWiped,
        description: t.toasts.dataWipedText(
          body?.propertiesDeleted ?? 0,
          body?.locationsDeleted ?? 0,
          body?.propertyTypesDeleted ?? 0,
          body?.featuresDeleted ?? 0,
        ),
      });
      setIsWipeDataOpen(false);
      setWipingDataFeed(null);
      fetchFeeds();
    } catch (e: any) {
      toast({ title: t.toasts.dataWipeFailed, description: e.message, variant: 'destructive' });
    }
  };

  const openEdit = (feed: FeedConfig) => {
    setEditingFeed(feed);
    setForm({
      name: feed.name,
      provider: feed.provider,
      apiKey: feed.credentials?.apiKey || '',
      clientId: feed.credentials?.clientId || '',
      filterId: feed.credentials?.filterId || '',
      username: feed.credentials?.username || '',
      password: feed.credentials?.password || '',
      endpoint: feed.credentials?.endpoint || '',
      syncSchedule: feed.syncSchedule || '0 6 * * *',
      protectedFields: feed.protectedFields || [],
      markAsFeatured: feed.markAsFeatured === true,
      removeMissing: feed.removeMissing !== false,
    });
    setIsEditOpen(true);
  };

  const showClientId = form.provider === 'resales' || form.provider === 'inmoba';
  const showEndpoint = form.provider === 'inmoba' || form.provider === 'kyero' || form.provider === 'odoo' || form.provider === 'redsp';
  const showUsernamePassword = form.provider === 'infocasa';
  // XML-file feeds: the private URL is the only credential.
  const showApiKey = form.provider !== 'kyero' && form.provider !== 'redsp';
  const endpointPlaceholder =
    form.provider === 'kyero'
      ? 'https://provider.example.com/feed.xml'
      : form.provider === 'redsp'
        ? 'https://xml.redsp.net/files/…/…_v4.xml'
        : form.provider === 'odoo'
          ? 'https://your-odoo.example.com/api/properties'
          : 'https://api.inmoba.com/v1';
  const endpointLabel =
    form.provider === 'kyero'
      ? t.form.kyeroUrl
      : form.provider === 'redsp'
        ? t.form.redspUrl
        : form.provider === 'odoo'
          ? t.form.odooUrl
          : t.form.endpointUrl;
  const apiKeyLabel =
    form.provider === 'odoo' ? t.form.bearerToken : t.form.apiKey;
  const apiKeyPlaceholder =
    form.provider === 'odoo' ? t.form.bearerTokenPlaceholder : t.form.apiKeyPlaceholder;

  const formFields = (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>{t.form.feedName}</Label>
        <Input placeholder={t.form.feedNamePlaceholder} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>{t.form.provider}</Label>
        <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="resales">Resales Online</SelectItem>
            <SelectItem value="inmoba">Inmoba</SelectItem>
            <SelectItem value="infocasa">Infocasa</SelectItem>
            <SelectItem value="redsp">REDSP</SelectItem>
            <SelectItem value="kyero">Kyero</SelectItem>
            {/* Odoo is no longer offered for new feeds; an existing one still edits. */}
            {form.provider === 'odoo' && <SelectItem value="odoo">Odoo CRM</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      {showApiKey && (
        <div className="space-y-2">
          <Label>{apiKeyLabel}</Label>
          <Input placeholder={apiKeyPlaceholder} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
        </div>
      )}
      {showClientId && (
        <div className="space-y-2">
          <Label>{t.form.clientId} {form.provider === 'resales' ? '*' : ''}</Label>
          <Input placeholder={form.provider === 'resales' ? t.form.clientIdResalesPlaceholder : t.form.clientIdPlaceholder} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
        </div>
      )}
      {form.provider === 'resales' && (
        <div className="space-y-2">
          <Label>{t.form.filterAlias}</Label>
          <Input placeholder={t.form.filterAliasPlaceholder} value={form.filterId} onChange={(e) => setForm({ ...form, filterId: e.target.value })} />
          <p className="text-xs text-muted-foreground">{t.form.filterAliasHelp}</p>
        </div>
      )}
      {showUsernamePassword && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t.form.username}</Label>
            <Input placeholder={t.form.username} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t.form.password}</Label>
            <Input type="password" placeholder={t.form.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
        </div>
      )}
      {showEndpoint && (
        <div className="space-y-2">
          <Label>{endpointLabel}</Label>
          <Input placeholder={endpointPlaceholder} value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} />
        </div>
      )}
      <div className="space-y-2">
        <Label>{t.form.syncSchedule}</Label>
        <Input placeholder="0 6 * * *" value={form.syncSchedule} onChange={(e) => setForm({ ...form, syncSchedule: e.target.value })} />
        <p className="text-xs text-muted-foreground">{t.form.syncScheduleHelp}</p>
      </div>
      <div className="flex items-start justify-between gap-4 border-t pt-4">
        <div className="space-y-1">
          <Label htmlFor="feed-mark-featured">{t.form.markFeatured}</Label>
          <p className="text-xs text-muted-foreground">{t.form.markFeaturedHelp}</p>
        </div>
        <Switch
          id="feed-mark-featured"
          checked={form.markAsFeatured}
          onCheckedChange={(v) => setForm({ ...form, markAsFeatured: v })}
        />
      </div>
      <div className="flex items-start justify-between gap-4 border-t pt-4">
        <div className="space-y-1">
          <Label htmlFor="feed-remove-missing">{t.form.removeMissing}</Label>
          <p className="text-xs text-muted-foreground">{t.form.removeMissingHelp}</p>
        </div>
        <Switch
          id="feed-remove-missing"
          checked={form.removeMissing}
          onCheckedChange={(v) => setForm({ ...form, removeMissing: v })}
        />
      </div>
      <div className="space-y-2 border-t pt-4">
        <Label>{t.form.protectedFields}</Label>
        <p className="text-xs text-muted-foreground">
          {t.form.protectedBefore}<strong>{t.form.protectedStrong}</strong>{t.form.protectedAfter}
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {PROTECTABLE_FIELDS.map((key) => {
            const checked = form.protectedFields.includes(key);
            return (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    const next = v
                      ? Array.from(new Set([...form.protectedFields, key]))
                      : form.protectedFields.filter((k) => k !== key);
                    setForm({ ...form, protectedFields: next });
                  }}
                />
                {t.fields[key] ?? key}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">{t.description}</p>
        </div>
        <Button className="shadow-sm" onClick={() => { setForm(emptyForm); setIsAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          {t.addFeedSource}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.stats.totalFeeds}</CardTitle>
            <div className="stat-card-icon">
              <Settings className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{feeds.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.stats.active}</CardTitle>
            <div className="stat-card-icon">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{feeds.filter((f) => f.isActive).length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.stats.lastSyncTotal}</CardTitle>
            <div className="stat-card-icon">
              <RefreshCw className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{feeds.reduce((acc, f) => acc + (f.lastSyncCount || 0), 0)}</div>
            <p className="text-xs text-muted-foreground">{t.stats.propertiesImported}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.stats.issues}</CardTitle>
            <div className="stat-card-icon">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {feeds.filter((f) => f.lastSyncStatus && f.lastSyncStatus !== 'success').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {api.isLoading && feeds.length === 0 ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {feeds.map((feed) => {
            const StatusIcon = feed.lastSyncStatus
              ? statusConfig[feed.lastSyncStatus].icon
              : Clock;
            const statusColor = feed.lastSyncStatus
              ? statusConfig[feed.lastSyncStatus].color
              : 'text-muted-foreground';
            const sync = syncStatuses[feed.id];
            const isSyncing = sync?.isRunning;
            const progressPct = isSyncing && sync.targetCount > 0
              ? Math.min(100, Math.round((sync.totalFetched / sync.targetCount) * 100))
              : 0;

            return (
              <Card key={feed.id} className={isSyncing ? 'ring-2 ring-primary/50 ring-offset-2 transition-all' : ''}>
                {isSyncing && (
                  <div className="h-1.5 w-full bg-primary/10 rounded-t-lg overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: sync.targetCount > 0 ? `${progressPct}%` : '40%' }}
                    />
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center font-bold text-primary">
                        {providerLogos[feed.provider] || '??'}
                      </div>
                      <div>
                        <CardTitle className="text-base">{feed.name}</CardTitle>
                        <CardDescription>{providerNames[feed.provider] || feed.provider}</CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleSync(feed)}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          {t.menu.syncNow}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setWipingFeed(feed); setIsWipeOpen(true); }}>
                          <Eraser className="h-4 w-4 mr-2" />
                          {t.menu.wipeReimport}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => { setWipingDataFeed(feed); setIsWipeDataOpen(true); }}
                        >
                          <FlaskConical className="h-4 w-4 mr-2" />
                          {t.menu.wipeData}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(feed)}>
                          <Settings className="h-4 w-4 mr-2" />
                          {t.menu.configure}
                        </DropdownMenuItem>
                        {feed.isActive ? (
                          <DropdownMenuItem onClick={() => handleToggleActive(feed)}>
                            <Pause className="h-4 w-4 mr-2" />
                            {t.menu.pause}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleToggleActive(feed)}>
                            <Play className="h-4 w-4 mr-2" />
                            {t.menu.activate}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive" onClick={() => { setDeletingFeed(feed); setIsDeleteOpen(true); }}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t.menu.delete}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t.card.status}</span>
                    {isSyncing ? (
                      <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20">
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        {t.card.syncing}
                      </Badge>
                    ) : (
                      <Badge variant={feed.isActive ? 'success' : 'secondary'}>
                        {feed.isActive ? t.card.active : t.card.paused}
                      </Badge>
                    )}
                  </div>

                  {feed.markAsFeatured && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t.card.importsAs}</span>
                      <Badge variant="outline">{t.card.featured}</Badge>
                    </div>
                  )}

                  {isSyncing && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t.card.progress}</span>
                      <span className="text-sm font-medium">
                        {sync.totalFetched.toLocaleString(locale)}
                        {sync.targetCount > 0 && ` / ~${sync.targetCount.toLocaleString(locale)} (${progressPct}%)`}
                      </span>
                    </div>
                  )}

                  {feed.lastSyncAt && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t.card.lastSync}</span>
                        <div className="flex items-center gap-2">
                          <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                          <span className="text-sm">{formatDate(feed.lastSyncAt, locale)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t.card.properties}</span>
                        <span className="text-sm font-medium">{t.card.imported(feed.lastSyncCount || 0)}</span>
                      </div>
                      {!isSyncing && (sync?.removedCount ?? 0) > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{t.card.removedLeftFeed}</span>
                          <span className="text-sm font-medium">{sync!.removedCount}</span>
                        </div>
                      )}
                      {!isSyncing && sync?.removalNote && (
                        <div className="space-y-2">
                          <p className="text-xs text-amber-600 dark:text-amber-500">{sync.removalNote}</p>
                          {/would be removed at once|returned no properties/.test(sync.removalNote) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                              onClick={() => handleConfirmRemoval(feed, sync.removalNote!)}
                            >
                              {t.card.removeAndSync}
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {feed.removeMissing === false && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t.card.leftFeedProperties}</span>
                      <Badge variant="outline">{t.card.kept}</Badge>
                    </div>
                  )}

                  {feed.isActive && feed.nextSyncAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t.card.nextSync}</span>
                      <span className="text-sm">{formatDate(feed.nextSyncAt, locale)}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t">
                    <Button variant="outline" size="sm" className="w-full" onClick={() => handleSync(feed)} disabled={isSyncing}>
                      {isSyncing ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.card.syncingDots}</>
                      ) : (
                        <><RefreshCw className="h-4 w-4 mr-2" />{t.menu.syncNow}</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center h-full min-h-[280px] text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Plus className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">{t.addFeedSource}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t.connectProviders}
              </p>
              <Button onClick={() => { setForm(emptyForm); setIsAddOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                {t.addSource}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setForm(emptyForm); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.dialogs.addTitle}</DialogTitle>
            <DialogDescription>{t.dialogs.addDescription}</DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>{t.dialogs.cancel}</Button>
            <Button onClick={handleCreate} disabled={!form.name || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.dialogs.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingFeed(null); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.dialogs.editTitle}</DialogTitle>
            <DialogDescription>{t.dialogs.editDescription}</DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>{t.dialogs.cancel}</Button>
            <Button onClick={handleUpdate} disabled={!form.name || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.dialogs.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.dialogs.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.dialogs.deleteText(deletingFeed?.name ?? '')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.dialogs.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.dialogs.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Wipe imported data Confirmation */}
      <AlertDialog open={isWipeDataOpen} onOpenChange={setIsWipeDataOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.dialogs.wipeDataTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.dialogs.wipeDataP1Before}<strong>{t.dialogs.wipeDataP1Strong}</strong>
              {t.dialogs.wipeDataP1After(wipingDataFeed?.name ?? '')}
              <br /><br />
              {t.dialogs.wipeDataP2Before}<strong>{t.dialogs.wipeDataP2Strong}</strong>{t.dialogs.wipeDataP2After}
              <br /><br />
              {t.dialogs.cannotUndo}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.dialogs.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleWipeData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <Trash2 className="h-4 w-4 mr-2" />
              {t.dialogs.wipeDataButton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Wipe & Re-import Confirmation */}
      <AlertDialog open={isWipeOpen} onOpenChange={setIsWipeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.dialogs.wipeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.dialogs.wipeP1Before}<strong>{t.dialogs.wipeP1Strong}</strong>{t.dialogs.wipeP1After}
              <br /><br />
              {t.dialogs.wipeP2Before}<strong>{t.dialogs.wipeP2Strong}</strong>{t.dialogs.wipeP2After}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.dialogs.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleWipeAndSync} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <Eraser className="h-4 w-4 mr-2" />
              {t.dialogs.wipeButton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
