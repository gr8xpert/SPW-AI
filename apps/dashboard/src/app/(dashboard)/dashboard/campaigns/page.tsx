'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Search,
  MoreHorizontal,
  Play,
  Pause,
  Eye,
  Trash2,
  Edit,
  Mail,
  Send,
  MousePointer,
  FileText,
  Loader2,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { CampaignsNav } from './_components/campaigns-nav';
import { useLanguage } from '@/i18n/i18n-provider';
import { formatRate, useCampaignsText } from './_i18n';

interface Template {
  id: number;
  name: string;
  subject: string;
  bodyHtml: string;
  type: string;
}

interface Campaign {
  id: number;
  name: string;
  subject: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
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
  cancelled: { variant: 'destructive' },
};

const emptyForm = { name: '', subject: '', bodyHtml: '' };
const emptyTemplateForm = { name: '', subject: '', bodyHtml: '' };

function CampaignsPageInner() {
  const [search, setSearch] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);
  const [sendingCampaign, setSendingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isEditTemplateOpen, setIsEditTemplateOpen] = useState(false);
  const [isDeleteTemplateOpen, setIsDeleteTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null);

  const api = useApi();
  const { toast } = useToast();
  const t = useCampaignsText();
  const { locale } = useLanguage();

  const fetchCampaigns = async () => {
    if (!api.isReady) return;
    try {
      const res = await api.get('/api/dashboard/campaigns');
      const body = res?.data || res;
      setCampaigns(Array.isArray(body) ? body : body.data || []);
    } catch {
      toast({ title: t.list.toasts.loadFailed, variant: 'destructive' });
    }
  };

  const fetchTemplates = async () => {
    if (!api.isReady) return;
    try {
      const res = await api.get('/api/dashboard/email-templates');
      const body = res?.data || res;
      setTemplates(Array.isArray(body) ? body : body.data || []);
    } catch {
      // Templates may not exist yet
    }
  };

  useEffect(() => { fetchCampaigns(); fetchTemplates(); }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateTemplate = async () => {
    try {
      const res = await api.post('/api/dashboard/email-templates', {
        name: templateForm.name,
        subject: templateForm.subject,
        bodyHtml: templateForm.bodyHtml,
        type: 'custom',
      });
      toast({ title: t.list.toasts.templateCreated });
      setIsTemplateOpen(false);
      setTemplateForm(emptyTemplateForm);
      fetchTemplates();
      const body = res?.data || res;
      if (body?.id) setSelectedTemplateId(body.id);
    } catch (e: any) {
      toast({ title: t.list.toasts.templateCreateFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleCreateCampaign = async () => {
    if (!selectedTemplateId) {
      toast({ title: t.list.toasts.selectTemplateFirst, variant: 'destructive' });
      return;
    }
    try {
      await api.post('/api/dashboard/campaigns', {
        name: form.name,
        subject: form.subject || undefined,
        templateId: selectedTemplateId,
      });
      toast({ title: t.list.toasts.campaignCreated });
      setIsCreateOpen(false);
      setForm(emptyForm);
      setSelectedTemplateId(null);
      fetchCampaigns();
    } catch (e: any) {
      toast({ title: t.list.toasts.createFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleSend = async () => {
    if (!sendingCampaign) return;
    try {
      await api.post(`/api/dashboard/campaigns/${sendingCampaign.id}/send`);
      toast({ title: t.list.toasts.sending });
      setIsSendOpen(false);
      setSendingCampaign(null);
      fetchCampaigns();
    } catch (e: any) {
      toast({ title: t.list.toasts.sendFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleCancel = async (campaign: Campaign) => {
    try {
      await api.post(`/api/dashboard/campaigns/${campaign.id}/cancel`);
      toast({ title: t.list.toasts.cancelled });
      fetchCampaigns();
    } catch (e: any) {
      toast({ title: t.list.toasts.cancelFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingCampaign) return;
    toast({ title: t.list.toasts.deleteUnavailable, variant: 'destructive' });
    setIsDeleteOpen(false);
    setDeletingCampaign(null);
  };

  const openEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      subject: template.subject || '',
      bodyHtml: template.bodyHtml || '',
    });
    setIsEditTemplateOpen(true);
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;
    try {
      await api.put(`/api/dashboard/email-templates/${editingTemplate.id}`, {
        name: templateForm.name,
        subject: templateForm.subject,
        bodyHtml: templateForm.bodyHtml,
      });
      toast({ title: t.list.toasts.templateUpdated });
      setIsEditTemplateOpen(false);
      setEditingTemplate(null);
      setTemplateForm(emptyTemplateForm);
      fetchTemplates();
    } catch (e: any) {
      toast({ title: t.list.toasts.templateUpdateFailed, description: e.message, variant: 'destructive' });
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return;
    try {
      await api.delete(`/api/dashboard/email-templates/${deletingTemplate.id}`);
      toast({ title: t.list.toasts.templateDeleted });
      setIsDeleteTemplateOpen(false);
      setDeletingTemplate(null);
      fetchTemplates();
    } catch (e: any) {
      toast({ title: t.list.toasts.templateDeleteFailed, description: e.message, variant: 'destructive' });
      setIsDeleteTemplateOpen(false);
      setDeletingTemplate(null);
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

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString(locale); } catch { return d; }
  };

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
          <Button className="shadow-sm" onClick={() => { setForm(emptyForm); setSelectedTemplateId(templates[0]?.id || null); setIsCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {t.list.newCampaign}
          </Button>
        </div>
      </div>

      <CampaignsNav />

      <div
        className="grid gap-4 md:grid-cols-4"
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.list.totalCampaigns}</CardTitle>
            <div className="stat-card-icon">
              <Mail className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.list.sent}</CardTitle>
            <div className="stat-card-icon">
              <Send className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{stats.sent}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.list.scheduled}</CardTitle>
            <div className="stat-card-icon">
              <Mail className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{stats.scheduled}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.list.drafts}</CardTitle>
            <div className="stat-card-icon">
              <Mail className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{stats.drafts}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t.list.searchPlaceholder} className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Email Templates */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t.list.templatesTitle}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => { setTemplateForm(emptyTemplateForm); setIsTemplateOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {t.list.newTemplate}
          </Button>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-center py-6 text-sm text-muted-foreground">{t.list.noTemplates}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.common.name}</TableHead>
                  <TableHead>{t.common.subject}</TableHead>
                  <TableHead>{t.list.type}</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl.id}>
                    <TableCell className="font-medium">{tpl.name}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[300px]">{tpl.subject}</TableCell>
                    <TableCell><Badge variant="outline">{t.list.templateTypes[tpl.type || 'custom'] || tpl.type || 'custom'}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditTemplate(tpl)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setDeletingTemplate(tpl); setIsDeleteTemplateOpen(true); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t.list.allCampaigns}</CardTitle></CardHeader>
        <CardContent>
          {api.isLoading && campaigns.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t.list.noCampaigns}</p>
              <Button className="mt-4" onClick={() => { setForm(emptyForm); setIsCreateOpen(true); }}>
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
                        <div>
                          <p className="font-medium">{campaign.name}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-[300px]">{campaign.subject}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{statusLabel}</Badge>
                        {campaign.scheduledAt && (
                          <p className="text-xs text-muted-foreground mt-1">{formatDate(campaign.scheduledAt)}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {campaign.status === 'sent'
                          ? campaign.sentCount.toLocaleString(locale)
                          : campaign.totalRecipients > 0
                          ? t.list.pending(campaign.totalRecipients.toLocaleString(locale))
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
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {campaign.status === 'draft' && (
                              <DropdownMenuItem onClick={() => { setSendingCampaign(campaign); setIsSendOpen(true); }}>
                                <Play className="h-4 w-4 mr-2" />
                                {t.list.sendNow}
                              </DropdownMenuItem>
                            )}
                            {(campaign.status === 'scheduled' || campaign.status === 'sending') && (
                              <DropdownMenuItem onClick={() => handleCancel(campaign)}>
                                <Pause className="h-4 w-4 mr-2" />
                                {t.list.cancelCampaign}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={() => { setDeletingCampaign(campaign); setIsDeleteOpen(true); }}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t.common.delete}
                            </DropdownMenuItem>
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
      <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) setForm(emptyForm); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.list.createDialog.title}</DialogTitle>
            <DialogDescription>{t.list.createDialog.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.list.createDialog.nameLabel}</Label>
              <Input placeholder={t.list.createDialog.namePlaceholder} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t.list.createDialog.subjectLabel}</Label>
              <Input placeholder={t.list.createDialog.subjectPlaceholder} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t.common.template}</Label>
              {templates.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 border rounded-md">
                  {t.list.createDialog.noTemplates}{' '}
                  <button className="text-primary underline" onClick={() => { setIsCreateOpen(false); setIsTemplateOpen(true); }}>
                    {t.list.createDialog.createOneFirst}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      className={cn(
                        'w-full text-left p-3 border rounded-md transition-colors',
                        selectedTemplateId === tpl.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      )}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                    >
                      <p className="font-medium text-sm">{tpl.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleCreateCampaign} disabled={!form.name || !selectedTemplateId || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.list.createDialog.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Template Dialog */}
      <Dialog open={isTemplateOpen} onOpenChange={(open) => { setIsTemplateOpen(open); if (!open) setTemplateForm(emptyTemplateForm); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.list.templateDialog.title}</DialogTitle>
            <DialogDescription>{t.list.templateDialog.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.list.templateDialog.nameLabel}</Label>
              <Input placeholder={t.list.templateDialog.namePlaceholder} value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t.list.templateDialog.subjectLabel}</Label>
              <Input placeholder={t.list.templateDialog.subjectPlaceholder} value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t.list.templateDialog.bodyLabel}</Label>
              <Textarea
                placeholder={t.list.templateDialog.bodyPlaceholder}
                className="font-mono text-sm min-h-[200px]"
                value={templateForm.bodyHtml}
                onChange={(e) => setTemplateForm({ ...templateForm, bodyHtml: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTemplateOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleCreateTemplate} disabled={!templateForm.name || !templateForm.subject || !templateForm.bodyHtml || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.list.templateDialog.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Confirmation */}
      <AlertDialog open={isSendOpen} onOpenChange={setIsSendOpen}>
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
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
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

      {/* Edit Template Dialog */}
      <Dialog open={isEditTemplateOpen} onOpenChange={(open) => { setIsEditTemplateOpen(open); if (!open) { setEditingTemplate(null); setTemplateForm(emptyTemplateForm); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.list.templateDialog.editTitle}</DialogTitle>
            <DialogDescription>{t.list.templateDialog.editDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.list.templateDialog.nameLabel}</Label>
              <Input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t.list.templateDialog.subjectLabel}</Label>
              <Input value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t.list.templateDialog.bodyLabel}</Label>
              <Textarea
                className="font-mono text-sm min-h-[200px]"
                value={templateForm.bodyHtml}
                onChange={(e) => setTemplateForm({ ...templateForm, bodyHtml: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditTemplateOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleUpdateTemplate} disabled={!templateForm.name || !templateForm.subject || !templateForm.bodyHtml || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.common.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Template Confirmation */}
      <AlertDialog open={isDeleteTemplateOpen} onOpenChange={setIsDeleteTemplateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.list.deleteTemplateDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.list.deleteTemplateDialog.text(deletingTemplate?.name ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
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
