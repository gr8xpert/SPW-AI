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
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/i18n-provider';
import { formatRate, formatShortDate, useCampaignsText } from '../_i18n';

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
  { id: 1, email: 'recipient1@company.com', name: 'Recipient One', status: 'sent', openedAt: '2026-04-01T11:30:00Z', clickedAt: '2026-04-01T11:32:00Z' },
  { id: 2, email: 'recipient2@company.com', name: 'Recipient Two', status: 'sent', openedAt: '2026-04-01T12:15:00Z', clickedAt: null },
  { id: 3, email: 'recipient3@company.com', name: 'Recipient Three', status: 'sent', openedAt: null, clickedAt: null },
  { id: 4, email: 'recipient4@company.com', name: 'Recipient Four', status: 'bounced', openedAt: null, clickedAt: null },
  { id: 5, email: 'recipient5@company.com', name: 'Recipient Five', status: 'sent', openedAt: '2026-04-01T14:00:00Z', clickedAt: '2026-04-01T14:05:00Z' },
];

// The label comes from t.status[code] at render.
const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive'; icon: React.ElementType }> = {
  draft: { variant: 'secondary', icon: Edit },
  scheduled: { variant: 'warning', icon: Clock },
  sending: { variant: 'warning', icon: Send },
  sent: { variant: 'success', icon: CheckCircle2 },
  paused: { variant: 'secondary', icon: Pause },
  cancelled: { variant: 'destructive', icon: XCircle },
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const t = useCampaignsText();
  const { locale } = useLanguage();
  const formatDate = (value: string) => formatShortDate(value, locale);
  const formatNumber = (value: number) => value.toLocaleString(locale);
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
      title: t.detail.actionTitles[action] ?? action,
      description: t.detail.actionTexts[action] ?? '',
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
                {t.status[campaign.status] ?? campaign.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t.detail.created(formatDate(campaign.createdAt))}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === 'draft' && (
            <>
              <Button variant="outline" onClick={() => handleAction('scheduled')}>
                <Calendar className="h-4 w-4 mr-2" />
                {t.detail.schedule}
              </Button>
              <Button onClick={() => handleAction('started')}>
                <Send className="h-4 w-4 mr-2" />
                {t.detail.sendNow}
              </Button>
            </>
          )}
          {campaign.status === 'sending' && (
            <Button variant="outline" onClick={() => handleAction('paused')}>
              <Pause className="h-4 w-4 mr-2" />
              {t.detail.pause}
            </Button>
          )}
          {campaign.status === 'paused' && (
            <Button onClick={() => handleAction('resumed')}>
              <Play className="h-4 w-4 mr-2" />
              {t.detail.resume}
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
                {t.detail.duplicate}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Eye className="h-4 w-4 mr-2" />
                {t.detail.previewEmail}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                {t.detail.deleteCampaign}
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
              {t.detail.recipients}
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
              {t.detail.delivered}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatNumber(campaign.sentCount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MailOpen className="h-4 w-4 text-muted-foreground" />
              {t.detail.openRate}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatRate(Number(openRate), locale)}%</div>
            <p className="text-xs text-muted-foreground">{t.detail.opened(formatNumber(campaign.openCount))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MousePointer className="h-4 w-4 text-muted-foreground" />
              {t.detail.clickRate}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatRate(Number(clickRate), locale)}%</div>
            <p className="text-xs text-muted-foreground">{t.detail.clicks(campaign.clickCount, formatNumber(campaign.clickCount))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-muted-foreground" />
              {t.detail.unsubscribed}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary/70">{campaign.unsubscribeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              {t.detail.bounced}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary/50">{campaign.bounceCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">{t.detail.tabs.overview}</TabsTrigger>
          <TabsTrigger value="recipients">{t.detail.tabs.recipients}</TabsTrigger>
          <TabsTrigger value="content">{t.detail.tabs.content}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t.detail.campaignDetails}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t.detail.subjectLine}</p>
                  <p className="font-medium">{campaign.subject}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t.common.template}</p>
                  <p className="font-medium">{campaign.template.name}</p>
                </div>
                {campaign.scheduledAt && (
                  <div>
                    <p className="text-sm text-muted-foreground">{t.detail.scheduledFor}</p>
                    <p className="font-medium">{formatDate(campaign.scheduledAt)}</p>
                  </div>
                )}
                {campaign.startedAt && (
                  <div>
                    <p className="text-sm text-muted-foreground">{t.detail.started}</p>
                    <p className="font-medium">{formatDate(campaign.startedAt)}</p>
                  </div>
                )}
                {campaign.completedAt && (
                  <div>
                    <p className="text-sm text-muted-foreground">{t.detail.completed}</p>
                    <p className="font-medium">{formatDate(campaign.completedAt)}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.detail.performanceSummary}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Delivery Progress */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{t.detail.delivered}</span>
                      <span>{formatRate((campaign.sentCount / campaign.totalRecipients) * 100, locale)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(campaign.sentCount / campaign.totalRecipients) * 100}%` }}
                      />
                    </div>
                  </div>
                  {/* Open Progress */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{t.detail.openedBar}</span>
                      <span>{formatRate(Number(openRate), locale)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-full"
                        style={{ width: `${openRate}%` }}
                      />
                    </div>
                  </div>
                  {/* Click Progress */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{t.detail.clickedBar}</span>
                      <span>{formatRate(Number(clickRate), locale)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/50 rounded-full"
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
              <CardTitle>{t.detail.recipientsCount(recipients.length)}</CardTitle>
              <CardDescription>
                {t.detail.recipientsDescription}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.detail.colContact}</TableHead>
                    <TableHead>{t.common.status}</TableHead>
                    <TableHead>{t.detail.colOpened}</TableHead>
                    <TableHead>{t.detail.colClicked}</TableHead>
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
                          {t.detail.recipientStatus[recipient.status] ?? recipient.status}
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
              <CardTitle>{t.detail.emailPreview}</CardTitle>
              <CardDescription>
                {t.detail.emailPreviewDescription}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg p-4">
                <div className="border-b pb-4 mb-4">
                  <p className="text-sm text-muted-foreground">{t.common.subject}</p>
                  <p className="font-medium">{campaign.subject}</p>
                </div>
                <div className="aspect-video bg-muted rounded flex items-center justify-center">
                  <p className="text-muted-foreground">{t.detail.previewPlaceholder}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
