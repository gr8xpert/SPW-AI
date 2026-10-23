'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
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
  Plus,
  Search,
  MoreHorizontal,
  Play,
  Pause,
  Eye,
  Trash2,
  Mail,
  Send,
  MousePointer,
  Loader2,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { CampaignsNav } from './_components/campaigns-nav';
import { TemplatesSection, type Template } from './_components/templates-section';
import {
  CampaignFormFields,
  EmailSetupNotice,
  campaignBody,
  emptyCampaignForm,
  useEmailSetup,
  type CampaignFormValues,
} from './_components/campaign-form';
import { useLanguage } from '@/i18n/i18n-provider';
import { formatRate, useCampaignsText } from './_i18n';
import { useCampaignsMoreText } from './_i18n/more';

interface Campaign {
  id: number;
  name: string;
  subject: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'paused';
  scheduledAt: string | null;
  sentCount: number;
  totalRecipients: number;
  openCount: number;
  clickCount: number;
  createdAt: string;
  template?: Template;
}

// The label comes from t.status[code] at render.
const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' }> = {
  draft: { variant: 'secondary' },
  scheduled: { variant: 'warning' },
  sending: { variant: 'default' },
  sent: { variant: 'success' },
  paused: { variant: 'secondary' },
  cancelled: { variant: 'destructive' },
};

function CampaignsPageInner() {
  const [search, setSearch] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);
  const [sendingCampaign, setSendingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignFormValues>(emptyCampaignForm);
  const [busy, setBusy] = useState(false);

  const api = useApi();
  const router = useRouter();
  const { toast } = useToast();
  const t = useCampaignsText();
  const m = useCampaignsMoreText();
  const { locale } = useLanguage();
  const emailSetup = useEmailSetup();

  const fetchCampaigns = async () => {
    if (!api.isReady) return;
    try {
      const res = await api.get('/api/dashboard/campaigns');
      const body = res?.data || res;
      setCampaigns(Array.isArray(body) ? body : body.data || []);
    } catch {
      toast({ title: t.list.toasts.loadFailed, variant: 'destructive' });
    } finally {
      setLoaded(true);
    }
  };

  const fetchTemplates = async (selectId?: number) => {
    if (!api.isReady) return;
    try {
      const res = await api.get('/api/dashboard/email-templates');
      const body = res?.data || res;
      setTemplates(Array.isArray(body) ? body : body.data || []);
      if (selectId) setForm((f) => ({ ...f, templateId: selectId }));
    } catch {
      // Templates may not exist yet
    }
  };

  useEffect(() => { fetchCampaigns(); fetchTemplates(); }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Something is going out: follow its progress.
  const anySending = campaigns.some((c) => c.status === 'sending');
  useEffect(() => {
    if (!anySending) return;
    const timer = setInterval(() => { fetchCampaigns(); }, 5000);
    return () => clearInterval(timer);
  }, [anySending, api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setForm({ ...emptyCampaignForm, templateId: templates[0]?.id ?? null });
    setIsCreateOpen(true);
  };

  const handleCreateCampaign = async () => {
    if (!form.templateId) {
      toast({ title: t.list.toasts.selectTemplateFirst, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/api/dashboard/campaigns', campaignBody(form));
      const body = res?.data || res;
      toast({ title: t.list.toasts.campaignCreated });
      setIsCreateOpen(false);
      setForm(emptyCampaignForm);
      if (body?.id) router.push(`/dashboard/campaigns/${body.id}`);
      else fetchCampaigns();
    } catch (e) {
      toast({ title: t.list.toasts.createFailed, description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!sendingCampaign) return;
    try {
      await api.post(`/api/dashboard/campaigns/${sendingCampaign.id}/send`);
      toast({ title: t.list.toasts.sending });
      fetchCampaigns();
    } catch (e) {
      toast({ title: t.list.toasts.sendFailed, description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSendingCampaign(null);
    }
  };

  const handleCancel = async (campaign: Campaign) => {
    try {
      await api.post(`/api/dashboard/campaigns/${campaign.id}/cancel`);
      toast({ title: campaign.status === 'scheduled' ? m.unscheduled : t.list.toasts.cancelled });
      fetchCampaigns();
    } catch (e) {
      toast({ title: t.list.toasts.cancelFailed, description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingCampaign) return;
    try {
      await api.delete(`/api/dashboard/campaigns/${deletingCampaign.id}`);
      toast({ title: m.campaignDeleted });
      fetchCampaigns();
    } catch (e) {
      toast({ title: m.deleteFailed, description: (e as Error).message, variant: 'destructive' });
    } finally {
      setDeletingCampaign(null);
    }
  };

  const filteredCampaigns = campaigns.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.subject?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: campaigns.length,
    sent: campaigns.filter((c) => c.status === 'sent').length,
    scheduled: campaigns.filter((c) => c.status === 'scheduled').length,
    drafts: campaigns.filter((c) => c.status === 'draft').length,
  };

  const formatDate = (d: string, withTime = false) => {
    try {
      return withTime
        ? new Date(d).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
        : new Date(d).toLocaleDateString(locale);
    } catch { return d; }
  };

  const statCards = [
    { title: t.list.totalCampaigns, value: stats.total, icon: Mail },
    { title: t.list.sent, value: stats.sent, icon: Send },
    { title: t.list.scheduled, value: stats.scheduled, icon: Mail },
    { title: t.list.drafts, value: stats.drafts, icon: Mail },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">{t.list.description}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsTemplateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t.list.newTemplate}
          </Button>
          <Button className="shadow-sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t.list.newCampaign}
          </Button>
        </div>
      </div>

      <CampaignsNav />

      <EmailSetupNotice state={emailSetup} />

      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map(({ title, value, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
              <div className="stat-card-icon">
                <Icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold tracking-tight">{value}</div></CardContent>
          </Card>
        ))}
      </div>

      <TemplatesSection
        templates={templates}
        onChanged={(createdId) => fetchTemplates(createdId)}
        createOpen={isTemplateOpen}
        setCreateOpen={setIsTemplateOpen}
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t.list.allCampaigns}</CardTitle>
          <div className="relative sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t.list.searchPlaceholder} className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t.list.noCampaigns}</p>
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {t.list.createFirst}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.list.colCampaign}</TableHead>
                  <TableHead>{t.common.status}</TableHead>
                  <TableHead>{t.list.colRecipients}</TableHead>
                  <TableHead>{t.list.colOpenRate}</TableHead>
                  <TableHead>{t.list.colClickRate}</TableHead>
                  <TableHead>{t.list.colCreated}</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.map((campaign) => {
                  const openRate = campaign.sentCount > 0 ? formatRate((campaign.openCount / campaign.sentCount) * 100, locale) : '-';
                  const clickRate = campaign.sentCount > 0 ? formatRate((campaign.clickCount / campaign.sentCount) * 100, locale) : '-';
                  const cfg = statusConfig[campaign.status] || statusConfig.draft;
                  const statusLabel = t.status[campaign.status] || t.status.draft;

                  return (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <Link href={`/dashboard/campaigns/${campaign.id}`} className="block hover:underline">
                          <p className="font-medium">{campaign.name}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-[300px]">{campaign.subject}</p>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{statusLabel}</Badge>
                        {campaign.status === 'scheduled' && campaign.scheduledAt && (
                          <p className="text-xs text-muted-foreground mt-1">{formatDate(campaign.scheduledAt, true)}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {campaign.status === 'sending'
                          ? `${campaign.sentCount.toLocaleString(locale)} / ${campaign.totalRecipients.toLocaleString(locale)}`
                          : campaign.totalRecipients > 0
                          ? campaign.sentCount.toLocaleString(locale)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          {openRate !== '-' ? `${openRate}%` : openRate}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MousePointer className="h-3 w-3 text-muted-foreground" />
                          {clickRate !== '-' ? `${clickRate}%` : clickRate}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(campaign.createdAt)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t.list.colCampaign}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/dashboard/campaigns/${campaign.id}`)}>
                              <Eye className="h-4 w-4 mr-2" />
                              {m.edit}
                            </DropdownMenuItem>
                            {campaign.status === 'draft' && (
                              <DropdownMenuItem onClick={() => setSendingCampaign(campaign)}>
                                <Play className="h-4 w-4 mr-2" />
                                {t.list.sendNow}
                              </DropdownMenuItem>
                            )}
                            {(campaign.status === 'scheduled' || campaign.status === 'sending') && (
                              <DropdownMenuItem onClick={() => handleCancel(campaign)}>
                                <Pause className="h-4 w-4 mr-2" />
                                {campaign.status === 'scheduled' ? m.unschedule : m.stopSending}
                              </DropdownMenuItem>
                            )}
                            {campaign.status !== 'sending' && (
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeletingCampaign(campaign)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t.common.delete}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Campaign Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) setForm(emptyCampaignForm); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.list.createDialog.title}</DialogTitle>
            <DialogDescription>{t.list.createDialog.description}</DialogDescription>
          </DialogHeader>
          {templates.length === 0 ? (
            <div className="text-sm text-muted-foreground p-3 border rounded-md">
              {t.list.createDialog.noTemplates}{' '}
              <button className="text-primary underline" onClick={() => { setIsCreateOpen(false); setIsTemplateOpen(true); }}>
                {t.list.createDialog.createOneFirst}
              </button>
            </div>
          ) : (
            <div className="py-2">
              <CampaignFormFields values={form} onChange={setForm} templates={templates} t={t} enabled={isCreateOpen} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleCreateCampaign} disabled={!form.name.trim() || !form.templateId || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.list.createDialog.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Confirmation */}
      <AlertDialog open={!!sendingCampaign} onOpenChange={(open) => { if (!open) setSendingCampaign(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.list.sendDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.list.sendDialog.text(sendingCampaign?.name ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend}>{t.list.sendNow}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Campaign Confirmation */}
      <AlertDialog open={!!deletingCampaign} onOpenChange={(open) => { if (!open) setDeletingCampaign(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.list.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.list.deleteDialog.text(deletingCampaign?.name ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { LockedRouteGuard } from '@/components/locked-route-guard';

export default function CampaignsPage() {
  const t = useCampaignsText();
  return (
    <LockedRouteGuard addon="emailCampaign" featureName={t.featureName}>
      <CampaignsPageInner />
    </LockedRouteGuard>
  );
}
