'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  ArrowLeft,
  MoreHorizontal,
  Send,
  Paperclip,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  XCircle,
  User,
  Calendar,
  Tag,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Sample ticket data
const sampleTicket = {
  id: 1,
  ticketNumber: 'TKT-000001',
  subject: 'Unable to import properties from Resales',
  status: 'in_progress',
  priority: 'high',
  category: 'technical',
  user: { id: 1, name: 'Alex Johnson', email: 'alex@example.com' },
  assignedTo: { id: 2, name: 'Support Team' },
  createdAt: '2026-04-05T14:30:00Z',
  lastReplyAt: '2026-04-06T08:00:00Z',
};

const sampleMessages = [
  {
    id: 1,
    isStaff: false,
    user: { name: 'Alex Johnson', email: 'alex@example.com' },
    message: `Hi,

I'm having trouble importing properties from my Resales Online feed. The import keeps failing with an "Authentication Error" message.

I've double-checked my API credentials and they seem correct. The last successful import was 3 days ago.

Could you please help me resolve this issue?

Thanks,
Alex`,
    attachments: [],
    createdAt: '2026-04-05T14:30:00Z',
  },
  {
    id: 2,
    isStaff: true,
    user: { name: 'Support Team', email: 'support@spw.com' },
    message: `Hi Alex,

Thank you for reaching out. I understand you're experiencing issues with your Resales Online feed import.

I've checked your account and I can see the authentication errors in the logs. This usually happens when:

1. The API credentials have been regenerated on the Resales Online side
2. There's a temporary issue with the Resales Online API

Could you please:
1. Log into your Resales Online account
2. Go to Settings > API Access
3. Verify the API key matches what you have configured in SPW
4. If in doubt, generate a new API key and update it in your SPW dashboard

Let me know if this helps!

Best regards,
Support Team`,
    attachments: [],
    createdAt: '2026-04-05T16:00:00Z',
  },
  {
    id: 3,
    isStaff: false,
    user: { name: 'Alex Johnson', email: 'alex@example.com' },
    message: `Hi,

I checked and you're right - Resales Online had regenerated my API key as part of their security update last week. I've updated the key in SPW.

However, when I try to run a manual sync, it now says "Rate limit exceeded". How long do I need to wait before trying again?`,
    attachments: [],
    createdAt: '2026-04-06T07:30:00Z',
  },
  {
    id: 4,
    isStaff: true,
    user: { name: 'Support Team', email: 'support@spw.com' },
    message: `Hi Alex,

Great news that you found the issue with the API key!

Regarding the rate limit - Resales Online has a limit of 100 requests per hour. After multiple failed authentication attempts, your quota may have been consumed.

I've reset the rate limit counter on our side. Please try the sync again now - it should work.

If you continue to experience issues, let me know and I'll dig deeper.

Best regards,
Support Team`,
    attachments: [],
    createdAt: '2026-04-06T08:00:00Z',
  },
];

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

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [replyMessage, setReplyMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const ticket = sampleTicket;
  const messages = sampleMessages;
  const status = statusConfig[ticket.status];
  const StatusIcon = status.icon;

  const handleStatusChange = (newStatus: string) => {
    toast({
      title: 'Status updated',
      description: `Ticket status changed to ${statusConfig[newStatus].label}`,
    });
  };

  const handleSendReply = async () => {
    if (!replyMessage.trim()) return;

    setIsSending(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast({
      title: 'Reply sent',
      description: 'Your message has been sent.',
    });

    setReplyMessage('');
    setIsSending(false);
  };

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
        <div className="flex items-center gap-2">
          <Select defaultValue={ticket.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Assign to me</DropdownMenuItem>
              <DropdownMenuItem>Mark as spam</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                Delete ticket
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        {/* Message Thread */}
        <div className="md:col-span-3 space-y-6">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-6 ${message.isStaff ? 'bg-muted/30' : ''}`}
                  >
                    <div className="flex gap-4">
                      <Avatar>
                        <AvatarFallback className={message.isStaff ? 'bg-primary text-primary-foreground' : ''}>
                          {message.user.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{message.user.name}</span>
                            {message.isStaff && (
                              <Badge variant="secondary" className="text-xs">
                                Staff
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(message.createdAt)}
                          </span>
                        </div>
                        <div className="text-sm whitespace-pre-wrap">
                          {message.message}
                        </div>
                        {message.attachments.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {/* Attachment rendering would go here */}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Reply Box */}
          <Card>
            <CardHeader>
              <CardTitle>Reply</CardTitle>
              <CardDescription>
                Send a message to the customer
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Type your reply..."
                rows={6}
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm">
                  <Paperclip className="h-4 w-4 mr-2" />
                  Attach File
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleSendReply();
                      handleStatusChange('waiting_customer');
                    }}
                    disabled={isSending || !replyMessage.trim()}
                  >
                    Send & Wait for Reply
                  </Button>
                  <Button
                    onClick={handleSendReply}
                    disabled={isSending || !replyMessage.trim()}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Reply
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Ticket Details */}
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
                <p className="font-medium">{ticket.user.name}</p>
                <p className="text-sm text-muted-foreground">{ticket.user.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Assigned To
                </p>
                <p className="font-medium">{ticket.assignedTo?.name || 'Unassigned'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  Category
                </p>
                <Badge variant="outline">{categoryLabels[ticket.category]}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Priority
                </p>
                <span className={`font-medium ${priorityConfig[ticket.priority].color}`}>
                  {priorityConfig[ticket.priority].label}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Created
                </p>
                <p className="text-sm">{formatDate(ticket.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last Reply
                </p>
                <p className="text-sm">{formatDate(ticket.lastReplyAt)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
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
        </div>
      </div>
    </div>
  );
}
