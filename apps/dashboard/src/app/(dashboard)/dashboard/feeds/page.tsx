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
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

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
}

const providerLogos: Record<string, string> = {
  resales: 'RO',
  inmoba: 'IM',
  infocasa: 'IC',
  redsp: 'RS',
};

const providerNames: Record<string, string> = {
  resales: 'Resales Online',
  inmoba: 'Inmoba',
  infocasa: 'Infocasa',
  redsp: 'REDSP',
};

const statusConfig = {
  success: { icon: CheckCircle2, color: 'text-green-500', label: 'Success' },
  partial: { icon: AlertTriangle, color: 'text-amber-500', label: 'Partial' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
};

const emptyForm = {
  name: '',
  provider: 'resales',
  apiKey: '',
  clientId: '',
  username: '',
  password: '',
  endpoint: '',
  syncSchedule: '0 6 * * *',
};

function formatDate(d: string): string {
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}

export default function FeedsPage() {
  const [feeds, setFeeds] = useState<FeedConfig[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<FeedConfig | null>(null);
  const [deletingFeed, setDeletingFeed] = useState<FeedConfig | null>(null);
  const [form, setForm] = useState(emptyForm);

  const api = useApi();
  const { toast } = useToast();

  const fetchFeeds = async () => {
    try {
      const res = await api.get('/api/dashboard/feeds');
      const body = res?.data || res;
      setFeeds(Array.isArray(body) ? body : body.data || []);
    } catch {
      toast({ title: 'Failed to load feeds', variant: 'destructive' });
    }
  };

  useEffect(() => { fetchFeeds(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    try {
      await api.post('/api/dashboard/feeds', {
        name: form.name,
        provider: form.provider,
        credentials: {
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
          ...(form.clientId ? { clientId: form.clientId } : {}),
          ...(form.username ? { username: form.username } : {}),
          ...(form.password ? { password: form.password } : {}),
          ...(form.endpoint ? { endpoint: form.endpoint } : {}),
        },
        syncSchedule: form.syncSchedule || '0 6 * * *',
        isActive: true,
      });
      toast({ title: 'Feed source created' });
      setIsAddOpen(false);
      setForm(emptyForm);
      fetchFeeds();
    } catch (e: any) {
      toast({ title: 'Failed to create', description: e.message, variant: 'destructive' });
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
          ...(form.username ? { username: form.username } : {}),
          ...(form.password ? { password: form.password } : {}),
          ...(form.endpoint ? { endpoint: form.endpoint } : {}),
        },
        syncSchedule: form.syncSchedule || '0 6 * * *',
      });
      toast({ title: 'Feed source updated' });
      setIsEditOpen(false);
      setEditingFeed(null);
      setForm(emptyForm);
      fetchFeeds();
    } catch (e: any) {
      toast({ title: 'Failed to update', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingFeed) return;
    try {
      await api.delete(`/api/dashboard/feeds/${deletingFeed.id}`);
      toast({ title: 'Feed source deleted' });
      setIsDeleteOpen(false);
      setDeletingFeed(null);
      fetchFeeds();
    } catch (e: any) {
      toast({ title: 'Failed to delete', description: e.message, variant: 'destructive' });
    }
  };

  const handleToggleActive = async (feed: FeedConfig) => {
    try {
      await api.put(`/api/dashboard/feeds/${feed.id}`, { isActive: !feed.isActive });
      toast({ title: feed.isActive ? 'Feed paused' : 'Feed activated' });
      fetchFeeds();
    } catch (e: any) {
      toast({ title: 'Failed to update', description: e.message, variant: 'destructive' });
    }
  };

  const handleSync = async (feed: FeedConfig) => {
    try {
      await api.post(`/api/dashboard/feeds/${feed.id}/sync`);
      toast({ title: 'Sync triggered', description: `Syncing ${feed.name}...` });
      fetchFeeds();
    } catch (e: any) {
      toast({ title: 'Failed to sync', description: e.message, variant: 'destructive' });
    }
  };

  const openEdit = (feed: FeedConfig) => {
    setEditingFeed(feed);
    setForm({
      name: feed.name,
      provider: feed.provider,
      apiKey: feed.credentials?.apiKey || '',
      clientId: feed.credentials?.clientId || '',
      username: feed.credentials?.username || '',
      password: feed.credentials?.password || '',
      endpoint: feed.credentials?.endpoint || '',
      syncSchedule: feed.syncSchedule || '0 6 * * *',
    });
    setIsEditOpen(true);
  };

  const formFields = (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>Feed Name *</Label>
        <Input placeholder="My Feed Source" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Provider *</Label>
        <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="resales">Resales Online</SelectItem>
            <SelectItem value="inmoba">Inmoba</SelectItem>
            <SelectItem value="infocasa">Infocasa</SelectItem>
            <SelectItem value="redsp">REDSP</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>API Key</Label>
        <Input placeholder="Provider API key" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Username</Label>
          <Input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Password</Label>
          <Input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Endpoint URL</Label>
        <Input placeholder="https://api.provider.com/feed" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Sync Schedule (cron)</Label>
        <Input placeholder="0 6 * * *" value={form.syncSchedule} onChange={(e) => setForm({ ...form, syncSchedule: e.target.value })} />
        <p className="text-xs text-muted-foreground">Default: daily at 6 AM</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Feed Sources</h1>
          <p className="text-muted-foreground">Configure property feed imports from external providers</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setIsAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Feed Source
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Feeds</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{feeds.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Active</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{feeds.filter((f) => f.isActive).length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Last Sync Total</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{feeds.reduce((acc, f) => acc + (f.lastSyncCount || 0), 0)}</div>
            <p className="text-xs text-muted-foreground">properties imported</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Issues</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
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

            return (
              <Card key={feed.id}>
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
                          Sync Now
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(feed)}>
                          <Settings className="h-4 w-4 mr-2" />
                          Configure
                        </DropdownMenuItem>
                        {feed.isActive ? (
                          <DropdownMenuItem onClick={() => handleToggleActive(feed)}>
                            <Pause className="h-4 w-4 mr-2" />
                            Pause
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleToggleActive(feed)}>
                            <Play className="h-4 w-4 mr-2" />
                            Activate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive" onClick={() => { setDeletingFeed(feed); setIsDeleteOpen(true); }}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={feed.isActive ? 'success' : 'secondary'}>
                      {feed.isActive ? 'Active' : 'Paused'}
                    </Badge>
                  </div>

                  {feed.lastSyncAt && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Last Sync</span>
                        <div className="flex items-center gap-2">
                          <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                          <span className="text-sm">{formatDate(feed.lastSyncAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Properties</span>
                        <span className="text-sm font-medium">{feed.lastSyncCount || 0} imported</span>
                      </div>
                    </>
                  )}

                  {feed.isActive && feed.nextSyncAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Next Sync</span>
                      <span className="text-sm">{formatDate(feed.nextSyncAt)}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t">
                    <Button variant="outline" size="sm" className="w-full" onClick={() => handleSync(feed)}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync Now
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
              <h3 className="font-semibold mb-2">Add Feed Source</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Connect to Resales Online, Inmoba, Infocasa, or REDSP
              </p>
              <Button onClick={() => { setForm(emptyForm); setIsAddOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Source
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setForm(emptyForm); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Feed Source</DialogTitle>
            <DialogDescription>Connect a new property feed provider</DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.name || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingFeed(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Feed Source</DialogTitle>
            <DialogDescription>Update feed source settings</DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!form.name || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Feed Source</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingFeed?.name}&quot;? This will stop all imports from this source.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
