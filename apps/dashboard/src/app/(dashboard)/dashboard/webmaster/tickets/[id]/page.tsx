'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  XCircle,
  User,
  Calendar,
  Tag,
  Loader2,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Building2,
  Timer,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { formatDate } from '@/lib/utils';
import { formatHM } from '@/lib/time';
import { HoursMinutesInput } from '@/components/ui/hours-minutes-input';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { AttachmentDropzone } from '@/components/tickets/attachment-dropzone';

interface TicketData {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  tenantId: number;
  tenant?: { id: number; name: string };
  user?: { id: number; name: string; email: string };
  assignedTo: number | null;
  assignedToUser?: { id: number; name: string; email: string };
  lastReplyAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  messages?: TicketMessage[];
}

interface TicketMessage {
  id: number;
  message: string;
  isStaff: boolean;
  isInternal: boolean;
  attachments: Array<{ name: string; url: string; size: number }> | null;
  createdAt: string;
  user?: { name: string; email: string };
}

interface TimeEntry {
  id: number;
  userId: number;
  ticketId: number;
  hours: number;
  description: string;
  isPaid: boolean;
  workDate: string;
  createdAt: string;
  user?: { name: string; email: string };
}

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive'; icon: React.ElementType }
> = {
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
  urgent: { label: 'Urgent', color: 'text-primary font-semibold' },
};

const categoryLabels: Record<string, string> = {
  technical: 'Technical',
  billing: 'Billing',
  feature_request: 'Feature Request',
  bug: 'Bug Report',
  general: 'General',
};

function initials(name?: string, fallback = 'U'): string {
  return (name || fallback)
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function WebmasterTicketDetailPage() {
  const params = useParams();
  const api = useApi();
  const { toast } = useToast();

  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<Array<{ name: string; url: string; size: number }>>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [replyHours, setReplyHours] = useState(0);
  const [showLogTime, setShowLogTime] = useState(false);
  const [logHours, setLogHours] = useState(0);
  const [logDescription, setLogDescription] = useState('');
  const [logDate, setLogDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isLogging, setIsLogging] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ticketId = params.id;

  const fetchTicket = async () => {
    try {
      const res = await api.get(`/api/webmaster/tickets/${ticketId}`);
      const body = res?.data || res;
      setTicket(body);
    } catch {
      toast({ title: 'Failed to load ticket', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTimeEntries = async () => {
    try {
      const res = await api.get('/api/webmaster/time-entries');
      const body = res?.data || res;
      const all: TimeEntry[] = Array.isArray(body)
        ? body
        : Array.isArray(body?.entries)
          ? body.entries
          : [];
      setTimeEntries(all.filter((e) => e.ticketId === Number(ticketId)));
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    if (api.isReady && ticketId) {
      fetchTicket();
      fetchTimeEntries();
    }
  }, [api.isReady, ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages?.length]);

  const uploadFiles = async (files: FileList) => {
    const uploaded: Array<{ name: string; url: string; size: number }> = [];
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

  const handleSendReply = async () => {
    if (!ticket || !replyMessage.trim()) return;
    setIsSending(true);
    try {
      const body: any = { message: replyMessage };
      if (replyAttachments.length > 0) body.attachments = replyAttachments;
      await api.post(`/api/webmaster/tickets/${ticket.id}/messages`, body);

      let loggedHours = 0;
      if (replyHours > 0) {
        try {
          await api.post('/api/webmaster/time-entries', {
            ticketId: ticket.id,
            hours: replyHours,
            description: replyMessage.slice(0, 500),
            workDate: format(new Date(), 'yyyy-MM-dd'),
          });
          loggedHours = replyHours;
        } catch (e: any) {
          toast({
            title: 'Reply sent, but time log failed',
            description: e.message,
            variant: 'destructive',
          });
        }
      }

      setReplyMessage('');
      setReplyAttachments([]);
      setReplyHours(0);
      toast({
        title: loggedHours > 0
          ? `Reply sent · ${formatHM(loggedHours)} logged`
          : 'Reply sent',
      });
      await fetchTicket();
      if (loggedHours > 0) await fetchTimeEntries();
    } catch (e: any) {
      toast({ title: 'Failed to send reply', description: e.message, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const openLogTime = () => {
    setLogHours(0);
    setLogDescription('');
    setLogDate(format(new Date(), 'yyyy-MM-dd'));
    setShowLogTime(true);
  };

  const handleLogTime = async () => {
    if (!ticket || logHours <= 0) return;
    setIsLogging(true);
    try {
      await api.post('/api/webmaster/time-entries', {
        ticketId: ticket.id,
        hours: logHours,
        description: logDescription || undefined,
        workDate: logDate || undefined,
      });
      toast({ title: `Logged ${formatHM(logHours)} against ${ticket.ticketNumber}` });
      setShowLogTime(false);
      await fetchTimeEntries();
    } catch (e: any) {
      toast({ title: 'Failed to log time', description: e.message, variant: 'destructive' });
    } finally {
      setIsLogging(false);
    }
  };

  const handleCategoryChange = async (next: string) => {
    if (!ticket || next === ticket.category) return;
    const previous = ticket.category;
    setTicket({ ...ticket, category: next });
    setIsSavingCategory(true);
    try {
      await api.put(`/api/webmaster/tickets/${ticket.id}/category`, { category: next });
      toast({
        title: `Category updated to ${categoryLabels[next] || next}`,
        description: next === 'bug'
          ? 'Hours booked on this ticket will not consume client credits.'
          : 'Hours booked on this ticket will consume client credits.',
      });
    } catch (e: any) {
      setTicket({ ...ticket, category: previous });
      toast({ title: 'Failed to update category', description: e.message, variant: 'destructive' });
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleComplete = async () => {
    if (!ticket) return;
    setIsCompleting(true);
    try {
      await api.post(`/api/webmaster/tickets/${ticket.id}/complete`, {});
      toast({ title: 'Ticket marked as awaiting customer reply' });
      await fetchTicket();
    } catch (e: any) {
      toast({ title: 'Failed to complete ticket', description: e.message, variant: 'destructive' });
    } finally {
      setIsCompleting(false);
    }
  };

  if (isLoading || !api.isReady) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/webmaster/tickets">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to tickets
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Ticket not found or not assigned to you</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = statusConfig[ticket.status] || statusConfig.open;
  const StatusIcon = status.icon;
  const messages = ticket.messages || [];
  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved';
  const isAwaiting = ticket.status === 'waiting_customer';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/webmaster/tickets">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight line-clamp-1">{ticket.subject}</h1>
              <Badge variant={status.variant} className="gap-1">
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {ticket.ticketNumber} &middot; Opened {formatDate(ticket.createdAt)}
              {ticket.tenant && <span> &middot; {ticket.tenant.name}</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="md:col-span-3 space-y-6">
          <Card>
            <CardContent className="p-0">
              {messages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No messages yet</div>
              ) : (
                <div className="divide-y">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-6 ${msg.isInternal ? 'bg-secondary/30' : msg.isStaff ? 'bg-muted/30' : ''}`}
                    >
                      <div className="flex gap-4">
                        <Avatar>
                          <AvatarFallback className={msg.isStaff ? 'bg-primary text-primary-foreground' : ''}>
                            {initials(msg.user?.name, msg.isStaff ? 'S' : 'U')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {msg.user?.name || (msg.isStaff ? 'Support' : 'Customer')}
                              </span>
                              {msg.isStaff && (
                                <Badge variant="secondary" className="text-xs">Staff</Badge>
                              )}
                              {msg.isInternal && (
                                <Badge variant="outline" className="text-xs text-primary/70">Internal Note</Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(msg.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-sm whitespace-pre-wrap">{msg.message}</div>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {msg.attachments.map((att, i) =>
                                att.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                  <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                                    <img src={att.url} alt={att.name} className="max-w-[200px] max-h-[150px] rounded border object-cover" />
                                  </a>
                                ) : (
                                  <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-background rounded px-2 py-1 text-xs border hover:bg-muted">
                                    <FileText className="h-3 w-3" />
                                    {att.name}
                                  </a>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </CardContent>
          </Card>

          {!isClosed && (
            <Card>
              <CardHeader>
                <CardTitle>Reply</CardTitle>
                <CardDescription>Send a message to the customer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Type your reply..."
                  rows={4}
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                />
                <AttachmentDropzone
                  attachments={replyAttachments}
                  onAdd={(files) => setReplyAttachments((prev) => [...prev, ...files])}
                  onRemove={(idx) => setReplyAttachments((prev) => prev.filter((_, j) => j !== idx))}
                  onUpload={uploadFiles}
                  isUploading={isUploading}
                />
                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <Timer className="h-3 w-3" />
                      Time (optional)
                    </Label>
                    <HoursMinutesInput value={replyHours} onChange={setReplyHours} />
                  </div>
                  <div className="flex-1" />
                  <Button onClick={handleSendReply} disabled={isSending || !replyMessage.trim()}>
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    {replyHours > 0
                      ? `Send + Log ${formatHM(replyHours)}`
                      : 'Send Reply'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {timeEntries.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Your Time Logged
                  <Badge variant="secondary" className="ml-1">
                    {formatHM(timeEntries.reduce((sum, e) => sum + Number(e.hours), 0))}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timeEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(entry.workDate || entry.createdAt), 'PP')}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{formatHM(entry.hours)}</TableCell>
                        <TableCell className="max-w-[250px] truncate text-sm">
                          {entry.description || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={entry.isPaid ? 'default' : 'outline'}>
                            {entry.isPaid ? 'Paid' : 'Unpaid'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {ticket.tenant && (
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Client
                  </p>
                  <p className="font-medium">{ticket.tenant.name}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Requester
                </p>
                <p className="font-medium">{ticket.user?.name || '-'}</p>
                {ticket.user?.email && (
                  <p className="text-sm text-muted-foreground">{ticket.user.email}</p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  Category
                </p>
                <Select
                  value={ticket.category}
                  onValueChange={handleCategoryChange}
                  disabled={isSavingCategory || isClosed}
                >
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="feature_request">Feature Request</SelectItem>
                    <SelectItem value="bug">Bug Report</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
                {ticket.category === 'bug' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Hours logged on bugs don&apos;t consume client credits.
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Priority
                </p>
                <span className={`font-medium ${priorityConfig[ticket.priority]?.color || ''}`}>
                  {priorityConfig[ticket.priority]?.label || ticket.priority}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Created
                </p>
                <p className="text-sm">{formatDate(ticket.createdAt)}</p>
              </div>
              {ticket.lastReplyAt && (
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last Reply
                  </p>
                  <p className="text-sm">{formatDate(ticket.lastReplyAt)}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  Your Time
                </p>
                <p className="font-medium">
                  {timeEntries.length > 0
                    ? formatHM(timeEntries.reduce((sum, e) => sum + Number(e.hours), 0))
                    : 'No time logged'}
                </p>
              </div>
            </CardContent>
          </Card>

          {!isClosed && (
            <Card>
              <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="default"
                  className="w-full justify-start"
                  onClick={openLogTime}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Log Time
                </Button>
                {!isAwaiting && (
                  <>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleComplete}
                      disabled={isCompleting}
                    >
                      {isCompleting ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <MessageSquare className="h-4 w-4 mr-2" />
                      )}
                      Mark Awaiting Customer
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Signals your work is done. Status changes to &quot;Awaiting Reply&quot; and the customer is notified.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={showLogTime} onOpenChange={setShowLogTime}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Time for {ticket.ticketNumber}</DialogTitle>
            <DialogDescription>{ticket.subject}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Time *</Label>
              <HoursMinutesInput value={logHours} onChange={setLogHours} />
            </div>
            <div>
              <Label htmlFor="log-date">Date</Label>
              <Input
                id="log-date"
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="log-desc">Description</Label>
              <Textarea
                id="log-desc"
                placeholder="What did you work on?"
                rows={3}
                value={logDescription}
                onChange={(e) => setLogDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogTime(false)}>Cancel</Button>
            <Button onClick={handleLogTime} disabled={isLogging || logHours <= 0}>
              {isLogging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Log Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
