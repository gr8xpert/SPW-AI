'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  Eye,
  Timer,
} from 'lucide-react';
import { format } from 'date-fns';
import { formatDate } from '@/lib/utils';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

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

interface Webmaster {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
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
  medium: { label: 'Medium', color: 'text-blue-600' },
  high: { label: 'High', color: 'text-amber-600' },
  urgent: { label: 'Urgent', color: 'text-red-600' },
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

export default function AdminTicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const api = useApi();
  const { toast } = useToast();

  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [webmasters, setWebmasters] = useState<Webmaster[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<Array<{ name: string; url: string; size: number }>>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ticketId = params.id;

  const fetchTicket = useCallback(async () => {
    try {
      const res = await api.get(`/api/super-admin/tickets/${ticketId}`);
      const body = res?.data || res;
      setTicket(body);
    } catch {
      toast({ title: 'Failed to load ticket', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchWebmasters = useCallback(async () => {
    try {
      const res = await api.get('/api/super-admin/webmasters');
      const body = res?.data || res;
      setWebmasters(Array.isArray(body) ? body : []);
    } catch {
      // non-critical
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTimeEntries = useCallback(async () => {
    try {
      const res = await api.get(`/api/super-admin/webmasters/tickets/${ticketId}/time-entries`);
      const body = res?.data || res;
      setTimeEntries(Array.isArray(body) ? body : []);
    } catch {
      // non-critical
    }
  }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (api.isReady && ticketId) {
      fetchTicket();
      fetchWebmasters();
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

  const handleStatusChange = async (newStatus: string) => {
    if (!ticket) return;
    try {
      await api.put(`/api/super-admin/tickets/${ticket.id}`, { status: newStatus });
      setTicket((prev) => prev ? { ...prev, status: newStatus } : prev);
      toast({ title: `Status changed to ${statusConfig[newStatus]?.label || newStatus}` });
    } catch (e: any) {
      toast({ title: 'Failed to update status', description: e.message, variant: 'destructive' });
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!ticket) return;
    try {
      await api.put(`/api/super-admin/tickets/${ticket.id}`, { priority: newPriority });
      setTicket((prev) => prev ? { ...prev, priority: newPriority } : prev);
      toast({ title: `Priority changed to ${priorityConfig[newPriority]?.label || newPriority}` });
    } catch (e: any) {
      toast({ title: 'Failed to update priority', description: e.message, variant: 'destructive' });
    }
  };

  const handleAssign = async (value: string) => {
    if (!ticket) return;
    const assignedTo = value === 'unassigned' ? null : parseInt(value);
    try {
      await api.put(`/api/super-admin/tickets/${ticket.id}`, { assignedTo });
      const assignedUser = webmasters.find((w) => w.id === assignedTo);
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              assignedTo,
              assignedToUser: assignedUser ? { id: assignedUser.id, name: assignedUser.name, email: assignedUser.email } : undefined,
            }
          : prev,
      );
      toast({ title: assignedTo ? `Assigned to ${assignedUser?.name || 'webmaster'}` : 'Unassigned' });
    } catch (e: any) {
      toast({ title: 'Failed to assign ticket', description: e.message, variant: 'destructive' });
    }
  };

  const handleSendReply = async () => {
    if (!ticket || !replyMessage.trim()) return;
    setIsSending(true);
    try {
      const body: any = { message: replyMessage, isInternal };
      if (replyAttachments.length > 0) body.attachments = replyAttachments;
      await api.post(`/api/super-admin/tickets/${ticket.id}/messages`, body);
      setReplyMessage('');
      setReplyAttachments([]);
      setIsInternal(false);
      toast({ title: isInternal ? 'Internal note added' : 'Reply sent' });
      await fetchTicket();
    } catch (e: any) {
      toast({ title: 'Failed to send reply', description: e.message, variant: 'destructive' });
    } finally {
      setIsSending(false);
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
        <Link href="/admin/tickets">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to tickets
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Ticket not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = statusConfig[ticket.status] || statusConfig.open;
  const StatusIcon = status.icon;
  const messages = ticket.messages || [];
  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/tickets">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight line-clamp-1">
                {ticket.subject}
              </h1>
              <Badge variant={status.variant} className="gap-1">
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {ticket.ticketNumber} &middot; Opened {formatDate(ticket.createdAt)}
              {ticket.tenant && (
                <span> &middot; {ticket.tenant.name}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        {/* Message Thread */}
        <div className="md:col-span-3 space-y-6">
          <Card>
            <CardContent className="p-0">
              {messages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No messages yet
                </div>
              ) : (
                <div className="divide-y">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-6 ${msg.isInternal ? 'bg-amber-50/50 dark:bg-amber-950/20' : msg.isStaff ? 'bg-muted/30' : ''}`}
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
                                <Badge variant="secondary" className="text-xs">
                                  Staff
                                </Badge>
                              )}
                              {msg.isInternal && (
                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                  <Eye className="h-3 w-3 mr-1" />
                                  Internal Note
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(msg.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-sm whitespace-pre-wrap">
                            {msg.message}
                          </div>
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

          {/* Reply Box */}
          <Card className={isInternal ? 'border-amber-300' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {isInternal ? 'Add Internal Note' : 'Reply'}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Switch
                    id="internal-note"
                    checked={isInternal}
                    onCheckedChange={setIsInternal}
                  />
                  <Label htmlFor="internal-note" className="text-sm cursor-pointer">
                    Internal note
                  </Label>
                </div>
              </div>
              {isInternal && (
                <p className="text-xs text-amber-600">This note is only visible to staff, not to the customer.</p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={isInternal ? 'Write an internal note...' : 'Type your reply...'}
                rows={4}
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
              />
              {replyAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {replyAttachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-1 bg-muted rounded px-2 py-1 text-xs">
                      {att.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      <span className="max-w-[120px] truncate">{att.name}</span>
                      <button onClick={() => setReplyAttachments((prev) => prev.filter((_, j) => j !== i))} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={async (e) => {
                      if (e.target.files?.length) {
                        const files = await uploadFiles(e.target.files);
                        setReplyAttachments((prev) => [...prev, ...files]);
                      }
                      e.target.value = '';
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Paperclip className="h-4 w-4 mr-2" />}
                    Attach Files
                  </Button>
                </div>
                <Button
                  onClick={handleSendReply}
                  disabled={isSending || !replyMessage.trim()}
                  variant={isInternal ? 'outline' : 'default'}
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {isInternal ? 'Add Note' : 'Send Reply'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Time Entries */}
          {timeEntries.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    Time Logged
                    <Badge variant="secondary" className="ml-1">
                      {timeEntries.reduce((sum, e) => sum + Number(e.hours), 0).toFixed(1)}h
                    </Badge>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Webmaster</TableHead>
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
                        <TableCell className="text-sm">
                          {entry.user?.name || entry.user?.email || `User ${entry.userId}`}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{Number(entry.hours).toFixed(1)}h</TableCell>
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

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
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
                <Badge variant="outline">{categoryLabels[ticket.category] || ticket.category}</Badge>
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
              {ticket.resolvedAt && (
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Resolved
                  </p>
                  <p className="text-sm">{formatDate(ticket.resolvedAt)}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  Time Spent
                </p>
                <p className="font-medium">
                  {timeEntries.length > 0
                    ? `${timeEntries.reduce((sum, e) => sum + Number(e.hours), 0).toFixed(1)} hours`
                    : 'No time logged'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Assignment */}
          <Card>
            <CardHeader>
              <CardTitle>Assign To</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={ticket.assignedTo ? String(ticket.assignedTo) : 'unassigned'}
                onValueChange={handleAssign}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select webmaster" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {webmasters
                    .filter((w) => w.isActive)
                    .map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.name || w.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={ticket.status} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="waiting_customer">Awaiting Reply</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Priority */}
          <Card>
            <CardHeader>
              <CardTitle>Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={ticket.priority} onValueChange={handlePriorityChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!isClosed ? (
                <>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleStatusChange('resolved')}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark as Resolved
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleStatusChange('closed')}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Close Ticket
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleStatusChange('open')}
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Reopen Ticket
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
