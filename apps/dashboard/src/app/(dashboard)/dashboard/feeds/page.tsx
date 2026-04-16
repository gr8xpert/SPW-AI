'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
  MoreHorizontal,
  Play,
  Pause,
  RefreshCw,
  Settings,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface FeedConfig {
  id: number;
  name: string;
  provider: 'resales' | 'inmoba' | 'infocasa' | 'redsp';
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: 'success' | 'partial' | 'failed' | null;
  lastSyncCount: number;
  syncSchedule: string;
  nextSyncAt: string;
}

const sampleFeeds: FeedConfig[] = [
  {
    id: 1,
    name: 'Resales Online Main',
    provider: 'resales',
    isActive: true,
    lastSyncAt: '2026-04-06T06:00:00Z',
    lastSyncStatus: 'success',
    lastSyncCount: 145,
    syncSchedule: '0 6 * * *',
    nextSyncAt: '2026-04-07T06:00:00Z',
  },
  {
    id: 2,
    name: 'Inmoba Properties',
    provider: 'inmoba',
    isActive: true,
    lastSyncAt: '2026-04-06T06:00:00Z',
    lastSyncStatus: 'partial',
    lastSyncCount: 52,
    syncSchedule: '0 6 * * *',
    nextSyncAt: '2026-04-07T06:00:00Z',
  },
  {
    id: 3,
    name: 'Infocasa Test',
    provider: 'infocasa',
    isActive: false,
    lastSyncAt: '2026-04-01T06:00:00Z',
    lastSyncStatus: 'failed',
    lastSyncCount: 0,
    syncSchedule: '0 6 * * *',
    nextSyncAt: null as any,
  },
];

const providerLogos: Record<string, string> = {
  resales: 'RO',
  inmoba: 'IM',
  infocasa: 'IC',
  redsp: 'RS',
};

const providerNames: Record<string, string> = {
  resales: 'Resales Online',
  inmoba: 'Inmoba',
  infocasa: 'Infocasa',
  redsp: 'REDSP',
};

const statusConfig = {
  success: { icon: CheckCircle2, color: 'text-green-500', label: 'Success' },
  partial: { icon: AlertTriangle, color: 'text-amber-500', label: 'Partial' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
};

export default function FeedsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Feed Sources</h1>
          <p className="text-muted-foreground">
            Configure property feed imports from external providers
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Feed Source
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Feeds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sampleFeeds.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {sampleFeeds.filter((f) => f.isActive).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Last Sync Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sampleFeeds.reduce((acc, f) => acc + f.lastSyncCount, 0)}
            </div>
            <p className="text-xs text-muted-foreground">properties imported</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {sampleFeeds.filter((f) => f.lastSyncStatus !== 'success').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feed Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sampleFeeds.map((feed) => {
          const StatusIcon = feed.lastSyncStatus
            ? statusConfig[feed.lastSyncStatus].icon
            : Clock;
          const statusColor = feed.lastSyncStatus
            ? statusConfig[feed.lastSyncStatus].color
            : 'text-muted-foreground';

          return (
            <Card key={feed.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center font-bold text-primary">
                      {providerLogos[feed.provider]}
                    </div>
                    <div>
                      <CardTitle className="text-base">{feed.name}</CardTitle>
                      <CardDescription>
                        {providerNames[feed.provider]}
                      </CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Sync Now
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Settings className="h-4 w-4 mr-2" />
                        Configure
                      </DropdownMenuItem>
                      {feed.isActive ? (
                        <DropdownMenuItem>
                          <Pause className="h-4 w-4 mr-2" />
                          Pause
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem>
                          <Play className="h-4 w-4 mr-2" />
                          Activate
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={feed.isActive ? 'success' : 'secondary'}>
                    {feed.isActive ? 'Active' : 'Paused'}
                  </Badge>
                </div>

                {feed.lastSyncAt && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Last Sync
                      </span>
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                        <span className="text-sm">
                          {formatDate(feed.lastSyncAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Properties
                      </span>
                      <span className="text-sm font-medium">
                        {feed.lastSyncCount} imported
                      </span>
                    </div>
                  </>
                )}

                {feed.isActive && feed.nextSyncAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Next Sync
                    </span>
                    <span className="text-sm">{formatDate(feed.nextSyncAt)}</span>
                  </div>
                )}

                <div className="pt-2 border-t">
                  <Button variant="outline" size="sm" className="w-full">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Add New Feed Card */}
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-full min-h-[280px] text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">Add Feed Source</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Connect to Resales Online, Inmoba, Infocasa, or REDSP
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Source
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
