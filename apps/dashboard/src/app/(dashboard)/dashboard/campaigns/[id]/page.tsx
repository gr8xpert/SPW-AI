'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  ArrowLeft,
  MoreHorizontal,
  Send,
  Pause,
  Users,
  Mail,
  MousePointer,
  MailOpen,
  XCircle,
  AlertCircle,
  Calendar,
  Clock,
  CheckCircle2,
  Edit,
  Copy,
  Trash2,
  FlaskConical,
  Loader2,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/i18n-provider';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { formatRate, useCampaignsText } from '../_i18n';
import { useCampaignsMoreText } from '../_i18n/more';
import { EmailSetupNotice, campaignBody, useEmailSetup, type CampaignFormValues, type TemplateOption } from '../_components/campaign-form';
import { CampaignRecipients } from './_components/campaign-recipients';
import { EditCampaignDialog, ScheduleDialog, TestEmailDialog } from './_components/campaign-dialogs';

interface CampaignDetail {
  id: number;
  name: string;
  subject: string;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'sent' | 'cancelled';
  templateId: number;
  template: { id: number; name: string } | null;
  recipientFilter: { tags?: string[] } | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalRecipients: number;
  createdAt: string;
  featured: { id: number; reference: string; title: string; live: boolean }[];
  matchingRecipients: number | null;
  emailConfig: { fromEmail: string; dailyLimit: number; isVerified: boolean } | null;
}

interface Stats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}

const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive'; icon: React.ElementType }> = {
  draft: { variant: 'secondary', icon: Edit },
  scheduled: { variant: 'warning', icon: Clock },
  sending: { variant: 'warning', icon: Send },
  sent: { variant: 'success', icon: CheckCircle2 },
  paused: { variant: 'secondary', icon: Pause },
  cancelled: { variant: 'destructive', icon: XCircle },
};

const unwrap = <T,>(res: unknown): T => ((res as { data?: T })?.data ?? res) as T;

function CampaignDetailInner() {
  const params = useParams();
  const id = Number(params.id);
  const router = useRouter();
  const api = useApi();
  const { toast } = useToast();
  const t = useCampaignsText();
  const m = useCampaignsMoreText();
  const { locale } = useLanguage();
  const emailSetup = useEmailSetup();

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [missing, setMissing] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null | 'error'>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [dialog, setDialog] = useState<'edit' | 'test' | 'schedule' | 'send' | 'stop' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!api.isReady || !Number.isInteger(id)) return;
    try {
      const [c, s] = await Promise.all([
        api.get(`/api/dashboard/campaigns/${id}`),
        api.get(`/api/dashboard/campaigns/${id}/stats`),
      ]);
      setCampaign(unwrap<CampaignDetail>(c));
      setStats(unwrap<Stats>(s));
      setRefreshKey((k) => k + 1);
    } catch (e) {
      if ((e as { status?: number }).status === 404) setMissing(true);
    }
  };

  useEffect(() => { load(); }, [api.isReady, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api.isReady) return;
    api.get('/api/dashboard/email-templates').then((res) => setTemplates(unwrap<TemplateOption[]>(res) || [])).catch(() => {});
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow a campaign while it goes out.
  const sending = campaign?.status === 'sending';
  useEffect(() => {
    if (!sending) return;
    const timer = setInterval(() => { load(); }, 5000);
    return () => clearInterval(timer);
  }, [sending]); // eslint-disable-line react-hooks/exhaustive-deps

  // The preview follows the campaign (subject, template, listings).
  const contentKey = campaign ? `${campaign.subject}|${campaign.templateId}|${campaign.featured.map((f) => f.id).join(',')}` : '';
  useEffect(() => {
    if (!api.isReady || activeTab !== 'content' || !contentKey) return;
    setPreview(null);
    api
      .get(`/api/dashboard/campaigns/${id}/preview`)
      .then((res) => setPreview(unwrap<{ subject: string; html: string }>(res)))
      .catch(() => setPreview('error'));
  }, [api.isReady, activeTab, contentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>, ok: string, fail: string): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      toast({ title: ok });
      await load();
      return true;
    } catch (e) {
      toast({ title: fail, description: (e as Error).message, variant: 'destructive' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-muted-foreground">{m.notFound}</p>
        <Link href="/dashboard/campaigns" className="text-primary underline">{m.back}</Link>
      </div>
    );
  }
  if (!campaign || !stats) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const status = statusConfig[campaign.status] ?? statusConfig.draft;
  const StatusIcon = status.icon;
  const when = (d: string) => new Date(d).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const num = (n: number) => n.toLocaleString(locale);
  const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
  const openRate = pct(stats.opened, stats.sent);
  const clickRate = pct(stats.clicked, stats.sent);
  const delivered = pct(stats.sent, stats.total || campaign.totalRecipients);
  const isDraft = campaign.status === 'draft';
  const tags = campaign.recipientFilter?.tags ?? [];

  const formInitial: CampaignFormValues = {
    name: campaign.name,
    subject: campaign.subject,
    templateId: campaign.templateId,
    tags,
    featured: campaign.featured.map((f) => f.reference).join(', '),
  };

  const statCards = [
    { label: t.detail.recipients, value: num(stats.total || campaign.matchingRecipients || 0), icon: Users },
    { label: t.detail.delivered, value: num(stats.sent), sub: stats.pending ? m.pendingCount(stats.pending) : undefined, icon: Mail },
    { label: t.detail.openRate, value: `${formatRate(openRate, locale)}%`, sub: t.detail.opened(num(stats.opened)), icon: MailOpen },
    { label: t.detail.clickRate, value: `${formatRate(clickRate, locale)}%`, sub: t.detail.clicks(stats.clicked, num(stats.clicked)), icon: MousePointer },
    { label: t.detail.unsubscribed, value: num(stats.unsubscribed), icon: XCircle },
    { label: m.failed, value: num(stats.failed), icon: AlertCircle },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/campaigns" aria-label={m.back}>
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
              <Badge variant={status.variant} className="gap-1">
                <StatusIcon className="h-3 w-3" />
                {t.status[campaign.status] ?? campaign.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {campaign.status === 'scheduled' && campaign.scheduledAt
                ? m.scheduledFor(when(campaign.scheduledAt))
                : t.detail.created(when(campaign.createdAt))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDraft && (
            <>
              <Button variant="outline" onClick={() => setDialog('edit')}><Edit className="h-4 w-4 mr-2" />{m.edit}</Button>
              <Button variant="outline" onClick={() => setDialog('test')}><FlaskConical className="h-4 w-4 mr-2" />{m.sendTest}</Button>
              <Button variant="outline" onClick={() => setDialog('schedule')}><Calendar className="h-4 w-4 mr-2" />{t.detail.schedule}</Button>
              <Button onClick={() => setDialog('send')} disabled={busy}><Send className="h-4 w-4 mr-2" />{t.detail.sendNow}</Button>
            </>
          )}
          {campaign.status === 'scheduled' && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => act(() => api.post(`/api/dashboard/campaigns/${id}/cancel`), m.unscheduled, t.list.toasts.cancelFailed)}
            >
              <XCircle className="h-4 w-4 mr-2" />{m.unschedule}
            </Button>
          )}
          {sending && (
            <Button variant="outline" onClick={() => setDialog('stop')} disabled={busy}><Pause className="h-4 w-4 mr-2" />{m.stopSending}</Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t.list.colCampaign}><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isDraft && (
                <DropdownMenuItem onClick={() => setDialog('test')}>
                  <FlaskConical className="h-4 w-4 mr-2" />{m.sendTest}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    const res = await api.post(`/api/dashboard/campaigns/${id}/duplicate`);
                    const copy = unwrap<{ id: number }>(res);
                    toast({ title: m.duplicated });
                    router.push(`/dashboard/campaigns/${copy.id}`);
                  } catch (e) {
                    toast({ title: m.duplicateFailed, description: (e as Error).message, variant: 'destructive' });
                  }
                }}
              >
                <Copy className="h-4 w-4 mr-2" />{t.detail.duplicate}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('content')}>
                <MailOpen className="h-4 w-4 mr-2" />{t.detail.previewEmail}
              </DropdownMenuItem>
              {!sending && (
                <DropdownMenuItem className="text-destructive" onClick={() => setDialog('delete')}>
                  <Trash2 className="h-4 w-4 mr-2" />{t.detail.deleteCampaign}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(isDraft || campaign.status === 'scheduled') && <EmailSetupNotice state={emailSetup} />}

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {statCards.map(({ label, value, sub, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />{label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">{t.detail.tabs.overview}</TabsTrigger>
          <TabsTrigger value="recipients">{t.detail.tabs.recipients}</TabsTrigger>
          <TabsTrigger value="content">{t.detail.tabs.content}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{t.detail.campaignDetails}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Field label={t.detail.subjectLine} value={campaign.subject} />
                <Field label={t.common.template} value={campaign.template?.name ?? '—'} />
                <div>
                  <p className="text-sm text-muted-foreground">{m.audience}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tags.length ? tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>) : <span className="font-medium">{m.audienceAll}</span>}
                  </div>
                  {campaign.matchingRecipients !== null && (
                    <p className="mt-1 text-xs text-muted-foreground">{m.matching(campaign.matchingRecipients)}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{m.featured}</p>
                  {campaign.featured.length ? (
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {campaign.featured.map((f) => (
                        <li key={f.id}>
                          <span className="font-mono">{f.reference}</span> {f.title}
                          {!f.live && <span className="ml-1 text-xs text-destructive">({m.notLive})</span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="font-medium">{m.none}</p>}
                </div>
                {campaign.scheduledAt && campaign.status === 'scheduled' && <Field label={t.detail.scheduledFor} value={when(campaign.scheduledAt)} />}
                {campaign.startedAt && <Field label={t.detail.started} value={when(campaign.startedAt)} />}
                {campaign.completedAt && <Field label={t.detail.completed} value={when(campaign.completedAt)} />}
                {campaign.emailConfig && (isDraft || sending || campaign.status === 'scheduled') && (
                  <p className="text-xs text-muted-foreground">{m.dailyLimitNote(campaign.emailConfig.dailyLimit)}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t.detail.performanceSummary}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Bar label={t.detail.delivered} value={delivered} locale={locale} className="bg-primary" />
                <Bar label={t.detail.openedBar} value={openRate} locale={locale} className="bg-primary/70" />
                <Bar label={t.detail.clickedBar} value={clickRate} locale={locale} className="bg-primary/50" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="recipients" className="space-y-6">
          <CampaignRecipients campaignId={id} refreshKey={refreshKey} />
        </TabsContent>

        <TabsContent value="content" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.detail.emailPreview}</CardTitle>
              <CardDescription>{t.detail.emailPreviewDescription} {m.sampleNote}</CardDescription>
            </CardHeader>
            <CardContent>
              {preview === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{m.previewLoading}</p>
              ) : preview === 'error' ? (
                <p className="py-8 text-center text-sm text-destructive">{m.previewFailed}</p>
              ) : (
                <div className="rounded-lg border">
                  <div className="border-b p-4">
                    <p className="text-sm text-muted-foreground">{t.common.subject}</p>
                    <p className="font-medium">{preview.subject}</p>
                  </div>
                  {/* sandbox="" : no scripts, no forms, no navigation from the client's HTML. */}
                  <iframe title={t.detail.emailPreview} sandbox="" srcDoc={preview.html} className="h-[640px] w-full rounded-b-lg bg-white" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EditCampaignDialog
        open={dialog === 'edit'}
        onOpenChange={(open) => setDialog(open ? 'edit' : null)}
        initial={formInitial}
        templates={templates}
        onSave={(values) => act(() => api.put(`/api/dashboard/campaigns/${id}`, campaignBody(values)), m.saved, m.saveFailed)}
      />
      <TestEmailDialog
        open={dialog === 'test'}
        onOpenChange={(open) => setDialog(open ? 'test' : null)}
        onSend={(email) => act(() => api.post(`/api/dashboard/campaigns/${id}/test`, { email }), m.testSent(email), m.testFailed)}
      />
      <ScheduleDialog
        open={dialog === 'schedule'}
        onOpenChange={(open) => setDialog(open ? 'schedule' : null)}
        onSchedule={(at) => act(
          () => api.post(`/api/dashboard/campaigns/${id}/schedule`, { scheduledAt: at.toISOString() }),
          m.scheduledFor(when(at.toISOString())),
          m.scheduleFailed,
        )}
      />

      <Confirm
        open={dialog === 'send'}
        onClose={() => setDialog(null)}
        title={t.list.sendDialog.title}
        text={t.list.sendDialog.text(campaign.name)}
        action={t.list.sendNow}
        onConfirm={() => act(() => api.post(`/api/dashboard/campaigns/${id}/send`), m.started, m.sendFailed)}
      />
      <Confirm
        open={dialog === 'stop'}
        onClose={() => setDialog(null)}
        title={m.stopConfirmTitle}
        text={m.stopConfirmText}
        action={m.stopSending}
        destructive
        onConfirm={() => act(() => api.post(`/api/dashboard/campaigns/${id}/cancel`), m.stopped, t.list.toasts.cancelFailed)}
      />
      <Confirm
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title={t.list.deleteDialog.title}
        text={t.list.deleteDialog.text(campaign.name)}
        action={t.common.delete}
        destructive
        onConfirm={async () => {
          try {
            await api.delete(`/api/dashboard/campaigns/${id}`);
            toast({ title: m.campaignDeleted });
            router.push('/dashboard/campaigns');
          } catch (e) {
            toast({ title: m.deleteFailed, description: (e as Error).message, variant: 'destructive' });
          }
        }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function Bar({ label, value, locale, className }: { label: string; value: number; locale: string; className: string }) {
  const width = Math.min(Math.max(value, 0), 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span>{formatRate(value, locale)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Confirm({
  open,
  onClose,
  title,
  text,
  action,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  text: string;
  action: string;
  destructive?: boolean;
  onConfirm: () => unknown;
}) {
  const t = useCampaignsText();
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { onClose(); void onConfirm(); }}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function CampaignDetailPage() {
  const t = useCampaignsText();
  return (
    <LockedRouteGuard addon="emailCampaign" featureName={t.featureName}>
      <CampaignDetailInner />
    </LockedRouteGuard>
  );
}
