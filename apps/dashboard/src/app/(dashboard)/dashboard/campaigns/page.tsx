'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
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
  CardDescription,
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
  Plus,
  Search,
  MoreHorizontal,
  Play,
  Pause,
  Eye,
  Copy,
  Trash2,
  Mail,
  Send,
  MousePointer,
  Users,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';

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
  template: {
    id: number;
    name: string;
  };
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  scheduled: { label: 'Scheduled', variant: 'warning' },
  sending: { label: 'Sending', variant: 'default' },
  sent: { label: 'Sent', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

// Sample data
const sampleCampaigns: Campaign[] = [
  {
    id: 1,
    name: 'New Listings March 2026',
    subject: 'Check out our latest properties in Marbella',
    status: 'sent',
    scheduledAt: null,
    sentCount: 1250,
    totalRecipients: 1250,
    openCount: 450,
    clickCount: 120,
    createdAt: '2026-03-15T10:00:00Z',
    template: { id: 1, name: 'Newsletter Template' },
  },
  {
    id: 2,
    name: 'Easter Special Offers',
    subject: 'Exclusive Easter property deals',
    status: 'scheduled',
    scheduledAt: '2026-04-10T09:00:00Z',
    sentCount: 0,
    totalRecipients: 2100,
    openCount: 0,
    clickCount: 0,
    createdAt: '2026-04-01T14:00:00Z',
    template: { id: 2, name: 'Promotional Template' },
  },
  {
    id: 3,
    name: 'Price Reduction Alert',
    subject: 'Prices reduced on selected properties',
    status: 'draft',
    scheduledAt: null,
    sentCount: 0,
    totalRecipients: 0,
    openCount: 0,
    clickCount: 0,
    createdAt: '2026-04-05T16:30:00Z',
    template: { id: 1, name: 'Newsletter Template' },
  },
];

export default function CampaignsPage() {
  const [search, setSearch] = useState('');

  const campaigns = sampleCampaigns.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.subject.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: sampleCampaigns.length,
    sent: sampleCampaigns.filter((c) => c.status === 'sent').length,
    scheduled: sampleCampaigns.filter((c) => c.status === 'scheduled').length,
    drafts: sampleCampaigns.filter((c) => c.status === 'draft').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Campaigns</h1>
          <p className="text-muted-foreground">
            Create and manage email marketing campaigns
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/campaigns/create">
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.sent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.scheduled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.drafts}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search campaigns..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No campaigns found</p>
              <Button asChild className="mt-4">
                <Link href="/dashboard/campaigns/create">
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first campaign
                </Link>
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
                {campaigns.map((campaign) => {
                  const openRate = campaign.sentCount > 0
                    ? ((campaign.openCount / campaign.sentCount) * 100).toFixed(1)
                    : '-';
                  const clickRate = campaign.sentCount > 0
                    ? ((campaign.clickCount / campaign.sentCount) * 100).toFixed(1)
                    : '-';

                  return (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{campaign.name}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                            {campaign.subject}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusConfig[campaign.status].variant}>
                          {statusConfig[campaign.status].label}
                        </Badge>
                        {campaign.scheduledAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(campaign.scheduledAt)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {campaign.status === 'sent'
                          ? `${campaign.sentCount.toLocaleString()}`
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
                      <TableCell className="text-muted-foreground">
                        {formatDate(campaign.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {campaign.status === 'draft' && (
                              <>
                                <DropdownMenuItem>
                                  <Play className="h-4 w-4 mr-2" />
                                  Send Now
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Duplicate
                                </DropdownMenuItem>
                              </>
                            )}
                            {campaign.status === 'scheduled' && (
                              <DropdownMenuItem>
                                <Pause className="h-4 w-4 mr-2" />
                                Cancel
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive">
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
    </div>
  );
}
