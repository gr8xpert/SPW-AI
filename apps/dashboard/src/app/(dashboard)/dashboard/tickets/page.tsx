'use client';

import { useState, useEffect, useRef } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Search,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  Send,
  Paperclip,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { formatHM } from '@/lib/time';
import { AttachmentList } from '@/components/tickets/attachment-list';
import { AttachmentDropzone } from '@/components/tickets/attachment-dropzone';
import { useTenantTicket, useTenantTicketMutation, useTenantTicketStats, useTenantTickets } from './use-tickets';
import { PageNumbers } from '@/components/ui/page-numbers';

interface Ticket {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  lastReplyAt: string | null;
  createdAt: string;
  messagesCount: number;
  hoursSpent?: number;
  messages?: TicketMessage[];
}

interface Attachment {
  name: string;
  url: string;
  size: number;
}

interface TicketMessage {
  id: number;
  message: string;
  isStaff: boolean;
  createdAt: string;
  user?: { name: string };
  attachments?: Attachment[] | null;
}

interface TicketStats {
  open: number;
  inProgress: number;
  awaitingReply: number;
  resolved: number;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive'; icon: React.ElementType }> = {
  open: { label: 'Open', variant: 'default', icon: AlertCircle },
  in_progress: { label: 'In Progress', variant: 'warning', icon: Clock },
  waiting_customer: { label: 'Awaiting Reply', variant: 'secondary', icon: MessageSquare },
  resolved: { label: 'Resolved', variant: 'success', icon: CheckCircle2 },
  closed: { label: 'Closed', variant: 'secondary', icon: XCircle },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: 'text-muted-foreground' },
  medium: { label: 'Medium', color: 'text-primary/60' },
  high: { label: 'High', color: 'text-primary/80' },
  urgent: { label: 'Urgent', color: 'text-primary' },
};

const categoryLabels: Record<string, string> = {
  technical: 'Technical',
  billing: 'Billing',
  feature_request: 'Feature Request',
  bug: 'Bug Report',
  general: 'General',
};

const emptyForm = { subject: '', message: '', priority: 'medium', category: 'general' };

function formatDate(d: string): string {
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}

export default function TicketsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  // The row that was clicked; the dialog shows the full ticket once loaded.
  const [selectedRow, setSelectedRow] = useState<Ticket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [createAttachments, setCreateAttachments] = useState<Attachment[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const createFileRef = useRef<HTMLInputElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);

  const api = useApi();
  const { toast } = useToast();

  const uploadFiles = async (files: FileList): Promise<Attachment[]> => {
    const uploaded: Attachment[] = [];
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/api/dashboard/upload', formData);
        const data = res?.data || res;
        uploaded.push({ name: data.originalFilename || file.name, url: data.url, size: data.fileSize || file.size });
      }
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
    return uploaded;
  };

  const ticketsQuery = useTenantTickets<Ticket>(page);
  const tickets = ticketsQuery.data?.tickets ?? [];
  const totalPages = ticketsQuery.data?.totalPages ?? 1;
  const statsQuery = useTenantTicketStats();
  const stats: TicketStats = statsQuery.data ?? { open: 0, inProgress: 0, awaitingReply: 0, resolved: 0 };
  const detailQuery = useTenantTicket<Ticket>(isDetailOpen ? selectedRow?.id : null);
  // Show what we have (the list row) until / unless the full ticket loads.
  const selectedTicket = (selectedRow && detailQuery.data) || selectedRow;

  // One toast per failed list load (after React Query's retries). Stats and
  // detail failures stay silent, as before.
  useEffect(() => {
    if (ticketsQuery.isError) toast({ title: 'Failed to load tickets', variant: 'destructive' });
  }, [ticketsQuery.errorUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const createTicket = useTenantTicketMutation((body: any) => api.post('/api/dashboard/tickets', body));
  const sendReply = useTenantTicketMutation(({ id, body }: { id: number; body: any }) =>
    api.post(`/api/dashboard/tickets/${id}/messages`, body));

  const handleCreate = async () => {
    try {
      const body: any = {
        subject: form.subject,
        message: form.message,
        priority: form.priority,
        category: form.category,
      };
      if (createAttachments.length > 0) {
        body.attachments = createAttachments;
      }
      await createTicket.mutateAsync(body);
      toast({ title: 'Ticket created' });
      setIsCreateOpen(false);
      setForm(emptyForm);
      setCreateAttachments([]);
    } catch (e: any) {
      toast({ title: 'Failed to create ticket', description: e.message, variant: 'destructive' });
    }
  };

  const openDetail = (ticket: Ticket) => {
    setSelectedRow(ticket);
    setReplyMessage('');
    setIsDetailOpen(true);
  };

  const handleReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) return;
    try {
      const body: any = { message: replyMessage };
      if (replyAttachments.length > 0) {
        body.attachments = replyAttachments;
      }
      await sendReply.mutateAsync({ id: selectedTicket.id, body });
      toast({ title: 'Reply sent' });
      setReplyMessage('');
      setReplyAttachments([]);
    } catch (e: any) {
      toast({ title: 'Failed to send reply', description: e.message, variant: 'destructive' });
    }
  };

  const filteredTickets = tickets.filter(
    (ticket) =>
      ticket.subject?.toLowerCase().includes(search.toLowerCase()) ||
      ticket.ticketNumber?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Support Tickets</h1>
          <p className="page-description mt-1">Get help from our support team</p>
        </div>
        <Button className="shadow-sm" onClick={() => { setForm(emptyForm); setIsCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Ticket
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <div className="stat-card-icon">
              <AlertCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{stats.open}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <div className="stat-card-icon">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{stats.inProgress}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Reply</CardTitle>
            <div className="stat-card-icon">
              <MessageSquare className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{stats.awaitingReply}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <div className="stat-card-icon">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tracking-tight">{stats.resolved}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All Tickets</CardTitle></CardHeader>
        <CardContent>
          {ticketsQuery.isFetching && tickets.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No tickets found</p>
              <Button className="mt-4 shadow-sm" onClick={() => { setForm(emptyForm); setIsCreateOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Create your first ticket
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time Spent</TableHead>
                    <TableHead>Last Update</TableHead>
                    <TableHead>Replies</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map((ticket) => {
                    const status = statusConfig[ticket.status] || statusConfig.open;
                    const StatusIcon = status.icon;
                    return (
                      <TableRow
                        key={ticket.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDetail(ticket)}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">{ticket.subject}</p>
                            <p className="text-xs text-muted-foreground">{ticket.ticketNumber}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{categoryLabels[ticket.category] || ticket.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`font-medium ${priorityConfig[ticket.priority]?.color || ''}`}>
                            {priorityConfig[ticket.priority]?.label || ticket.priority}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="gap-1">
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {ticket.hoursSpent && ticket.hoursSpent > 0
                            ? formatHM(ticket.hoursSpent)
                            : <span className="text-muted-foreground">—</span>}
                          {ticket.category === 'bug' && ticket.hoursSpent && ticket.hoursSpent > 0 && (
                            <span className="text-xs text-muted-foreground ml-1">(free)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(ticket.lastReplyAt || ticket.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            {ticket.messagesCount || 0}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
                  <PageNumbers page={page} pages={totalPages} onChange={setPage} />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Ticket Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) setForm(emptyForm); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Support Ticket</DialogTitle>
            <DialogDescription>Describe your issue and we&apos;ll get back to you as soon as possible.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subject *</Label>
              <Input placeholder="Brief description of your issue" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technical">Technical Issue</SelectItem>
                    <SelectItem value="billing">Billing Question</SelectItem>
                    <SelectItem value="feature_request">Feature Request</SelectItem>
                    <SelectItem value="bug">Bug Report</SelectItem>
                    <SelectItem value="general">General Inquiry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message *</Label>
              <Textarea
                rows={4}
                placeholder="Describe your issue in detail..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Attachments</Label>
              <AttachmentDropzone
                attachments={createAttachments}
                onAdd={(files) => setCreateAttachments((prev) => [...prev, ...files])}
                onRemove={(idx) => setCreateAttachments((prev) => prev.filter((_, j) => j !== idx))}
                onUpload={uploadFiles}
                isUploading={isUploading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateOpen(false); setCreateAttachments([]); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.subject || !form.message || createTicket.isPending || isUploading}>
              {createTicket.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ticket Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={(open) => { setIsDetailOpen(open); if (!open) setSelectedRow(null); }}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTicket?.subject}</DialogTitle>
            <DialogDescription>
              {selectedTicket?.ticketNumber} &middot;{' '}
              {statusConfig[selectedTicket?.status || 'open']?.label || selectedTicket?.status}
            </DialogDescription>
          </DialogHeader>
          {selectedTicket && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap items-center">
                <Badge variant="outline">{categoryLabels[selectedTicket.category] || selectedTicket.category}</Badge>
                <Badge variant={priorityConfig[selectedTicket.priority]?.color === 'text-primary' ? 'destructive' : 'secondary'}>
                  {priorityConfig[selectedTicket.priority]?.label || selectedTicket.priority}
                </Badge>
                {selectedTicket.hoursSpent && selectedTicket.hoursSpent > 0 ? (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {formatHM(selectedTicket.hoursSpent)} spent
                    {selectedTicket.category === 'bug' && (
                      <span className="text-xs opacity-70 ml-1">(free)</span>
                    )}
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto border rounded-md p-3">
                {selectedTicket.messages && selectedTicket.messages.length > 0 ? (
                  selectedTicket.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg text-sm ${msg.isStaff ? 'bg-primary/10 ml-4' : 'bg-muted mr-4'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-xs">
                          {msg.isStaff ? 'Support' : msg.user?.name || 'You'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                      <AttachmentList attachments={msg.attachments} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Loading messages...</p>
                )}
              </div>

              {selectedTicket.status !== 'closed' && selectedTicket.status !== 'resolved' && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Type your reply..."
                    rows={2}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                  />
                  <AttachmentDropzone
                    compact
                    attachments={replyAttachments}
                    onAdd={(files) => setReplyAttachments((prev) => [...prev, ...files])}
                    onRemove={(idx) => setReplyAttachments((prev) => prev.filter((_, j) => j !== idx))}
                    onUpload={uploadFiles}
                    isUploading={isUploading}
                  />
                  <div className="flex justify-end">
                    <Button onClick={handleReply} disabled={!replyMessage.trim() || sendReply.isPending} size="sm">
                      {sendReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                      Send
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
