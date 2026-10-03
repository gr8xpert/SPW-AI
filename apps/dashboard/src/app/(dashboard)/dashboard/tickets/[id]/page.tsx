'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
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
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { AttachmentList } from '@/components/tickets/attachment-list';
import { useQueryClient } from '@tanstack/react-query';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { tenantTicketKeys, useTenantTicket, useTenantTicketMutation } from '../use-tickets';

interface TicketData {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  user?: { id: number; name: string; email: string };
  assignedToUser?: { id: number; name: string };
  lastReplyAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
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
  urgent: { label: 'Urgent', color: 'text-primary' },
};

const categoryLabels: Record<string, string> = {
  technical: 'Technical',
  billing: 'Billing',
  feature_request: 'Feature Request',
  bug: 'Bug Report',
  general: 'General',
};

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const api = useApi();
  const { toast } = useToast();
  const [replyMessage, setReplyMessage] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<Array<{ name: string; url: string; size: number }>>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ticketId = params.id as string | undefined;
  const queryClient = useQueryClient();
  const ticketQuery = useTenantTicket<TicketData>(ticketId);
  const ticket = ticketQuery.data ?? null;
  // Spinner until the first answer (also while the session/token isn't ready).
  const isLoading = ticketQuery.isPending;
  const { scope } = useTenantQueryScope();

  useEffect(() => {
    if (ticketQuery.isError) toast({ title: 'Failed to load ticket', variant: 'destructive' });
  }, [ticketQuery.errorUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = useTenantTicketMutation(({ id, status }: { id: number; status: string }) =>
    api.put(`/api/dashboard/tickets/${id}`, { status }));
  const sendReply = useTenantTicketMutation(({ id, body }: { id: number; body: any }) =>
    api.post(`/api/dashboard/tickets/${id}/messages`, body));

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages?.length]);

  const handleStatusChange = async (newStatus: string) => {
    if (!ticket) return;
    try {
      await updateStatus.mutateAsync({ id: ticket.id, status: newStatus });
      queryClient.setQueryData<TicketData>(tenantTicketKeys.detail(scope, ticket.id), (prev) =>
        prev ? { ...prev, status: newStatus } : prev);
      toast({ title: `Status changed to ${statusConfig[newStatus]?.label || newStatus}` });
    } catch (e: any) {
      toast({ title: 'Failed to update status', description: e.message, variant: 'destructive' });
    }
  };

  const handleSendReply = async () => {
    if (!ticket || !replyMessage.trim()) return;
    setIsSending(true);
    try {
      const body: any = { message: replyMessage };
      if (replyAttachments.length > 0) {
        body.attachments = replyAttachments;
      }
      await sendReply.mutateAsync({ id: ticket.id, body });
      setReplyMessage('');
      setReplyAttachments([]);
      toast({ title: 'Reply sent' });
      await queryClient.invalidateQueries({ queryKey: tenantTicketKeys.detail(scope, ticket.id) });
    } catch (e: any) {
      toast({ title: 'Failed to send reply', description: e.message, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/tickets">
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/tickets">
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
                      className={`p-6 ${msg.isStaff ? 'bg-muted/30' : ''}`}
                    >
                      <div className="flex gap-4">
                        <Avatar>
                          <AvatarFallback className={msg.isStaff ? 'bg-primary text-primary-foreground' : ''}>
                            {(msg.user?.name || (msg.isStaff ? 'S' : 'U'))
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {msg.user?.name || (msg.isStaff ? 'Support' : 'You')}
                              </span>
                              {msg.isStaff && (
                                <Badge variant="secondary" className="text-xs">
                                  Staff
                                </Badge>
                              )}
                              {msg.isInternal && (
                                <Badge variant="outline" className="text-xs text-primary/70">
                                  Internal
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
                          <AttachmentList attachments={msg.attachments} />
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
          {!isClosed && (
            <Card>
              <CardHeader>
                <CardTitle>Reply</CardTitle>
                <CardDescription>Send a message</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Type your reply..."
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
                      accept="image/*,.pdf,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
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
                    onClick={() => handleSendReply()}
                    disabled={isSending || !replyMessage.trim()}
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send Reply
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <User className="h-3 w-3" />
                  Assigned To
                </p>
                <p className="font-medium">{ticket.assignedToUser?.name || 'Unassigned'}</p>
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
              {ticket.resolvedAt && (
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Resolved
                  </p>
                  <p className="text-sm">{formatDate(ticket.resolvedAt)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {!isClosed && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
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
              </CardContent>
            </Card>
          )}

          {isClosed && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleStatusChange('open')}
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Reopen Ticket
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
