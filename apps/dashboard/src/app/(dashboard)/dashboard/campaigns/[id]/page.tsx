'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  MoreHorizontal,
  Send,
  Pause,
  Play,
  Eye,
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
} from 'lucide-react';
import { formatDate, formatNumber } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Sample campaign data
const sampleCampaign = {
  id: 1,
  name: 'New Properties - April 2026',
  subject: 'Discover Our Latest Property Listings',
  status: 'sent',
  template: { id: 1, name: 'Property Newsletter' },
  scheduledAt: '2026-04-01T10:00:00Z',
  startedAt: '2026-04-01T10:00:00Z',
  completedAt: '2026-04-01T10:45:00Z',
  totalRecipients: 2450,
  sentCount: 2445,
  failedCount: 5,
  openCount: 892,
  clickCount: 234,
  unsubscribeCount: 12,
  bounceCount: 3,
  createdAt: '2026-03-28T14:00:00Z',
};

const sampleRecipients = [
  { id: 1, email: 'john@example.com', name: 'John Smith', status: 'sent', openedAt: '2026-04-01T11:30:00Z', clickedAt: '2026-04-01T11:32:00Z' },
  { id: 2, email: 'sarah@example.com', name: 'Sarah Johnson', status: 'sent', openedAt: '2026-04-01T12:15:00Z', clickedAt: null },
  { id: 3, email: 'mike@example.com', name: 'Mike Wilson', status: 'sent', openedAt: null, clickedAt: null },
  { id: 4, email: 'emma@example.com', name: 'Emma Brown', status: 'bounced', openedAt: null, clickedAt: null },
  { id: 5, email: 'david@example.com', name: 'David Lee', status: 'sent', openedAt: '2026-04-01T14:00:00Z', clickedAt: '2026-04-01T14:05:00Z' },
];

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive'; icon: React.ElementType }> = {
  draft: { label: 'Draft', variant: 'secondary', icon: Edit },
  scheduled: { label: 'Scheduled', variant: 'warning', icon: Clock },
  sending: { label: 'Sending', variant: 'warning', icon: Send },
  sent: { label: 'Sent', variant: 'success', icon: CheckCircle2 },
  paused: { label: 'Paused', variant: 'secondary', icon: Pause },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: XCircle },
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');

  const campaign = sampleCampaign;
  const recipients = sampleRecipients;
  const status = statusConfig[campaign.status];
  const StatusIcon = status.icon;

  const openRate = campaign.totalRecipients > 0
    ? ((campaign.openCount / campaign.sentCount) * 100).toFixed(1)
    : '0';
  const clickRate = campaign.openCount > 0
    ? ((campaign.clickCount / campaign.openCount) * 100).toFixed(1)
    : '0';

  const handleAction = (action: string) => {
    toast({
      title: `Campaign ${action}`,
      description: `The campaign has been ${action}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/campaigns">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {campaign.name}
              </h1>
              <Badge variant={status.variant} className="gap-1">
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Created {formatDate(campaign.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === 'draft' && (
            <>
              <Button variant="outline" onClick={() => handleAction('scheduled')}>
                <Calendar className="h-4 w-4 mr-2" />
                Schedule
              </Button>
              <Button onClick={() => handleAction('started')}>
                <Send className="h-4 w-4 mr-2" />
                Send Now
              </Button>
            </>
          )}
          {campaign.status === 'sending' && (
            <Button variant="outline" onClick={() => handleAction('paused')}>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          {campaign.status === 'paused' && (
            <Button onClick={() => handleAction('resumed')}>
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate Campaign
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Eye className="h-4 w-4 mr-2" />
                Preview Email
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Campaign
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Recipients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(campaign.totalRecipients)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Delivered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatNumber(campaign.sentCount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MailOpen className="h-4 w-4 text-muted-foreground" />
              Open Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openRate}%</div>
            <p className="text-xs text-muted-foreground">{formatNumber(campaign.openCount)} opened</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MousePointer className="h-4 w-4 text-muted-foreground" />
              Click Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clickRate}%</div>
            <p className="text-xs text-muted-foreground">{formatNumber(campaign.clickCount)} clicks</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-muted-foreground" />
              Unsubscribed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{campaign.unsubscribeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              Bounced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{campaign.bounceCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recipients">Recipients</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Subject Line</p>
                  <p className="font-medium">{campaign.subject}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Template</p>
                  <p className="font-medium">{campaign.template.name}</p>
                </div>
                {campaign.scheduledAt && (
                  <div>
                    <p className="text-sm text-muted-foreground">Scheduled For</p>
                    <p className="font-medium">{formatDate(campaign.scheduledAt)}</p>
                  </div>
                )}
                {campaign.startedAt && (
                  <div>
                    <p className="text-sm text-muted-foreground">Started</p>
                    <p className="font-medium">{formatDate(campaign.startedAt)}</p>
                  </div>
                )}
                {campaign.completedAt && (
                  <div>
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="font-medium">{formatDate(campaign.completedAt)}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Delivery Progress */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Delivered</span>
                      <span>{((campaign.sentCount / campaign.totalRecipients) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${(campaign.sentCount / campaign.totalRecipients) * 100}%` }}
                      />
                    </div>
                  </div>
                  {/* Open Progress */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Opened</span>
                      <span>{openRate}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${openRate}%` }}
                      />
                    </div>
                  </div>
                  {/* Click Progress */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Clicked</span>
                      <span>{clickRate}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${clickRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Recipients Tab */}
        <TabsContent value="recipients" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recipients ({recipients.length})</CardTitle>
              <CardDescription>
                View delivery status for each recipient
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead>Clicked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((recipient) => (
                    <TableRow key={recipient.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{recipient.name}</p>
                          <p className="text-sm text-muted-foreground">{recipient.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            recipient.status === 'sent'
                              ? 'success'
                              : recipient.status === 'bounced'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {recipient.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {recipient.openedAt ? (
                          <span className="text-sm">{formatDate(recipient.openedAt)}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {recipient.clickedAt ? (
                          <span className="text-sm">{formatDate(recipient.clickedAt)}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Preview</CardTitle>
              <CardDescription>
                Preview how the email appears to recipients
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg p-4">
                <div className="border-b pb-4 mb-4">
                  <p className="text-sm text-muted-foreground">Subject</p>
                  <p className="font-medium">{campaign.subject}</p>
                </div>
                <div className="aspect-video bg-muted rounded flex items-center justify-center">
                  <p className="text-muted-foreground">Email content preview would render here</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
