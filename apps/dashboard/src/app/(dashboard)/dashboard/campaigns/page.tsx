'use client';

import { useState, useEffect } from 'react';
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

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  scheduled: { label: 'Scheduled', variant: 'warning' },
  sending: { label: 'Sending', variant: 'default' },
  sent: { label: 'Sent', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

const emptyForm = { name: '', subject: '', bodyHtml: '' };
const emptyTemplateForm = { name: '', subject: '', bodyHtml: '' };

export default function CampaignsPage() {
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

  const fetchCampaigns = async () => {
    if (!api.isReady) return;
    try {
      const res = await api.get('/api/dashboard/campaigns');
      const body = res?.data || res;
      setCampaigns(Array.isArray(body) ? body : body.data || []);
    } catch {
      toast({ title: 'Failed to load campaigns', variant: 'destructive' });
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
      toast({ title: 'Template created' });
      setIsTemplateOpen(false);
      setTemplateForm(emptyTemplateForm);
      fetchTemplates();
      const body = res?.data || res;
      if (body?.id) setSelectedTemplateId(body.id);
    } catch (e: any) {
      toast({ title: 'Failed to create template', description: e.message, variant: 'destructive' });
    }
  };

  const handleCreateCampaign = async () => {
    if (!selectedTemplateId) {
      toast({ title: 'Please select or create a template first', variant: 'destructive' });
      return;
    }
    try {
      await api.post('/api/dashboard/campaigns', {
        name: form.name,
        subject: form.subject || undefined,
        templateId: selectedTemplateId,
      });
      toast({ title: 'Campaign created' });
      setIsCreateOpen(false);
      setForm(emptyForm);
      setSelectedTemplateId(null);
      fetchCampaigns();
    } catch (e: any) {
      toast({ title: 'Failed to create', description: e.message, variant: 'destructive' });
    }
  };

  const handleSend = async () => {
    if (!sendingCampaign) return;
    try {
      await api.post(`/api/dashboard/campaigns/${sendingCampaign.id}/send`);
      toast({ title: 'Campaign is being sent' });
      setIsSendOpen(false);
      setSendingCampaign(null);
      fetchCampaigns();
    } catch (e: any) {
      toast({ title: 'Failed to send', description: e.message, variant: 'destructive' });
    }
  };

  const handleCancel = async (campaign: Campaign) => {
    try {
      await api.post(`/api/dashboard/campaigns/${campaign.id}/cancel`);
      toast({ title: 'Campaign cancelled' });
      fetchCampaigns();
    } catch (e: any) {
      toast({ title: 'Failed to cancel', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingCampaign) return;
    toast({ title: 'Delete not available for campaigns', variant: 'destructive' });
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
      toast({ title: 'Template updated' });
      setIsEditTemplateOpen(false);
      setEditingTemplate(null);
      setTemplateForm(emptyTemplateForm);
      fetchTemplates();
    } catch (e: any) {
      toast({ title: 'Failed to update template', description: e.message, variant: 'destructive' });
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return;
    try {
      await api.delete(`/api/dashboard/email-templates/${deletingTemplate.id}`);
      toast({ title: 'Template deleted' });
      setIsDeleteTemplateOpen(false);
      setDeletingTemplate(null);
      fetchTemplates();
    } catch (e: any) {
      toast({ title: 'Cannot delete template', description: e.message, variant: 'destructive' });
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
    try { return new Date(d).toLocaleDateString(); } catch { return d; }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email Campaigns</h1>
          <p className="page-description mt-1">Create and manage email marketing campaigns</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsTemplateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
          <Button className="shadow-sm" onClick={() => { setForm(emptyForm); setSelectedTemplateId(templates[0]?.id || null); setIsCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <div className="stat-card-icon bg-blue-50">
              <Mail className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <div className="stat-card-icon bg-green-50">
              <Send className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight text-green-600">{stats.sent}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <div className="stat-card-icon bg-amber-50">
              <Mail className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight text-amber-600">{stats.scheduled}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <div className="stat-card-icon bg-purple-50">
              <Mail className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{stats.drafts}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search campaigns..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Email Templates */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Email Templates</CardTitle>
          <Button variant="outline" size="sm" onClick={() => { setTemplateForm(emptyTemplateForm); setIsTemplateOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-center py-6 text-sm text-muted-foreground">No templates yet. Create one to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[300px]">{t.subject}</TableCell>
                    <TableCell><Badge variant="outline">{t.type || 'custom'}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditTemplate(t)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setDeletingTemplate(t); setIsDeleteTemplateOpen(true); }}>
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
        <CardHeader><CardTitle>All Campaigns</CardTitle></CardHeader>
        <CardContent>
          {api.isLoading && campaigns.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No campaigns yet</p>
              <Button className="mt-4" onClick={() => { setForm(emptyForm); setIsCreateOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Create your first campaign
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Open Rate</TableHead>
                  <TableHead>Click Rate</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.map((campaign) => {
                  const openRate = campaign.sentCount > 0 ? ((campaign.openCount / campaign.sentCount) * 100).toFixed(1) : '-';
                  const clickRate = campaign.sentCount > 0 ? ((campaign.clickCount / campaign.sentCount) * 100).toFixed(1) : '-';
                  const cfg = statusConfig[campaign.status] || statusConfig.draft;

                  return (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{campaign.name}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-[300px]">{campaign.subject}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        {campaign.scheduledAt && (
                          <p className="text-xs text-muted-foreground mt-1">{formatDate(campaign.scheduledAt)}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {campaign.status === 'sent'
                          ? campaign.sentCount.toLocaleString()
                          : campaign.totalRecipients > 0
                          ? `${campaign.totalRecipients.toLocaleString()} (pending)`
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
                                Send Now
                              </DropdownMenuItem>
                            )}
                            {(campaign.status === 'scheduled' || campaign.status === 'sending') && (
                              <DropdownMenuItem onClick={() => handleCancel(campaign)}>
                                <Pause className="h-4 w-4 mr-2" />
                                Cancel
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={() => { setDeletingCampaign(campaign); setIsDeleteOpen(true); }}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
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
            <DialogTitle>New Campaign</DialogTitle>
            <DialogDescription>Create a new email campaign</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Campaign Name *</Label>
              <Input placeholder="April Newsletter" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Subject Line</Label>
              <Input placeholder="Check out our latest properties" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              {templates.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 border rounded-md">
                  No templates yet.{' '}
                  <button className="text-primary underline" onClick={() => { setIsCreateOpen(false); setIsTemplateOpen(true); }}>
                    Create one first
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      className={cn(
                        'w-full text-left p-3 border rounded-md transition-colors',
                        selectedTemplateId === t.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      )}
                      onClick={() => setSelectedTemplateId(t.id)}
                    >
                      <p className="font-medium text-sm">{t.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCampaign} disabled={!form.name || !selectedTemplateId || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Template Dialog */}
      <Dialog open={isTemplateOpen} onOpenChange={(open) => { setIsTemplateOpen(open); if (!open) setTemplateForm(emptyTemplateForm); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Email Template</DialogTitle>
            <DialogDescription>Create a reusable email template for campaigns</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input placeholder="Newsletter Template" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Default Subject *</Label>
              <Input placeholder="Your monthly property update" value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>HTML Body *</Label>
              <Textarea
                placeholder="<h1>Hello {{name}}</h1><p>Check out our latest properties...</p>"
                className="font-mono text-sm min-h-[200px]"
                value={templateForm.bodyHtml}
                onChange={(e) => setTemplateForm({ ...templateForm, bodyHtml: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTemplateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTemplate} disabled={!templateForm.name || !templateForm.subject || !templateForm.bodyHtml || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Confirmation */}
      <AlertDialog open={isSendOpen} onOpenChange={setIsSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to send &quot;{sendingCampaign?.name}&quot;? This will email all matching contacts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend}>Send Now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Campaign Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingCampaign?.name}&quot;? This action cannot be undone.
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

      {/* Edit Template Dialog */}
      <Dialog open={isEditTemplateOpen} onOpenChange={(open) => { setIsEditTemplateOpen(open); if (!open) { setEditingTemplate(null); setTemplateForm(emptyTemplateForm); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>Modify the email template</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Default Subject *</Label>
              <Input value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>HTML Body *</Label>
              <Textarea
                className="font-mono text-sm min-h-[200px]"
                value={templateForm.bodyHtml}
                onChange={(e) => setTemplateForm({ ...templateForm, bodyHtml: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditTemplateOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateTemplate} disabled={!templateForm.name || !templateForm.subject || !templateForm.bodyHtml || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Template Confirmation */}
      <AlertDialog open={isDeleteTemplateOpen} onOpenChange={setIsDeleteTemplateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingTemplate?.name}&quot;? Templates used by existing campaigns cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
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
