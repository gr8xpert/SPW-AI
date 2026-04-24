'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare,
  MessagesSquare,
  Hash,
  Globe,
  Wrench,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

interface StatsData {
  totalConversations: number;
  totalMessages: number;
  avgMessagesPerConversation: number;
  toolUsage: { tool: string; count: string }[];
  languageBreakdown: { language: string; count: string }[];
  dailyVolume: { date: string; count: string }[];
}

interface ConversationRow {
  id: number;
  sessionId: string;
  language: string | null;
  status: 'active' | 'closed';
  messageCount: number;
  lastUserMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

interface ConversationListResponse {
  data: ConversationRow[];
  meta: { total: number; page: number; limit: number; pages: number };
}

const TOOL_LABELS: Record<string, string> = {
  search_properties: 'Property Search',
  get_property: 'Property Details',
  get_locations: 'Location Lookup',
  get_features: 'Feature Lookup',
  compare_properties: 'Comparison',
};

const LANG_LABELS: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French',
  nl: 'Dutch', it: 'Italian', ru: 'Russian', sv: 'Swedish',
  no: 'Norwegian', da: 'Danish', pl: 'Polish', cs: 'Czech',
};

export default function AiChatPage() {
  const [dateRange, setDateRange] = useState('30d');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [convMeta, setConvMeta] = useState<{ total: number; page: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [convPage, setConvPage] = useState(1);

  const api = useApi();
  const { toast } = useToast();

  const fetchData = async (range: string, page = 1) => {
    if (!api.isReady) return;
    setLoading(true);
    try {
      const [statsRes, convRes] = await Promise.all([
        api.get(`/api/dashboard/ai-chat/stats?range=${range}`),
        api.get(`/api/dashboard/ai-chat/conversations?page=${page}&limit=10`),
      ]);

      const unwrap = (res: any) => res?.data ?? res;
      setStats(unwrap(statsRes));
      const convData = unwrap(convRes);
      setConversations(convData?.data || []);
      setConvMeta(convData?.meta || null);
    } catch {
      toast({ title: 'Failed to load AI chat analytics', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(dateRange, convPage); }, [dateRange, convPage, api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRangeChange = (range: string) => {
    setDateRange(range);
    setConvPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Chat</h1>
          <p className="text-muted-foreground">Monitor chat conversations and AI feature usage</p>
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-md">
            {['7d', '30d', '90d'].map((range) => (
              <Button
                key={range}
                variant={dateRange === range ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none first:rounded-l-md last:rounded-r-md"
                onClick={() => handleRangeChange(range)}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Conversations</CardTitle>
                <MessagesSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(stats?.totalConversations ?? 0).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Total chat sessions</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Messages</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(stats?.totalMessages ?? 0).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">User + assistant messages</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg. per Chat</CardTitle>
                <Hash className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.avgMessagesPerConversation ?? 0}</div>
                <p className="text-xs text-muted-foreground">Messages per conversation</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Languages</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.languageBreakdown?.length ?? 0}</div>
                <p className="text-xs text-muted-foreground">Detected languages</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Daily volume */}
            <Card>
              <CardHeader>
                <CardTitle>Daily Conversations</CardTitle>
                <CardDescription>New chat sessions per day</CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.dailyVolume && stats.dailyVolume.length > 0 ? (
                  <div className="space-y-2">
                    {stats.dailyVolume.map((day, i) => {
                      const maxCount = Math.max(...stats.dailyVolume.map((d) => Number(d.count)), 1);
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-20 shrink-0">
                            {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${(Number(day.count) / maxCount) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-8 text-right">{day.count}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center py-8 text-sm text-muted-foreground">No conversation data for this period</p>
                )}
              </CardContent>
            </Card>

            {/* Tool usage + Language breakdown */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Tool Usage</CardTitle>
                  <CardDescription>AI tool calls by type</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.toolUsage && stats.toolUsage.length > 0 ? (
                    <div className="space-y-3">
                      {stats.toolUsage.map((item, i) => {
                        const maxCount = Math.max(...stats.toolUsage.map((t) => Number(t.count)), 1);
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm w-32 shrink-0 truncate">
                              {TOOL_LABELS[item.tool] || item.tool}
                            </span>
                            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary/70 rounded-full transition-all"
                                style={{ width: `${(Number(item.count) / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium w-10 text-right">{item.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-center py-6 text-sm text-muted-foreground">No tool usage data</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Languages</CardTitle>
                  <CardDescription>Conversation languages detected</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.languageBreakdown && stats.languageBreakdown.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {stats.languageBreakdown.map((item, i) => (
                        <Badge key={i} variant="outline" className="text-sm py-1 px-3">
                          {LANG_LABELS[item.language] || item.language}
                          <span className="ml-2 font-bold">{item.count}</span>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-6 text-sm text-muted-foreground">No language data</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recent conversations */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Conversations</CardTitle>
              <CardDescription>Latest chat sessions from your website visitors</CardDescription>
            </CardHeader>
            <CardContent>
              {conversations.length > 0 ? (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-3 font-medium">Session</th>
                        <th className="py-2 pr-3 font-medium">Last Message</th>
                        <th className="py-2 pr-3 font-medium">Messages</th>
                        <th className="py-2 pr-3 font-medium">Language</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conversations.map((conv) => (
                        <tr key={conv.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">{conv.sessionId.slice(0, 12)}…</td>
                          <td className="py-2 pr-3 max-w-[300px] truncate text-muted-foreground">
                            {conv.lastUserMessage || '—'}
                          </td>
                          <td className="py-2 pr-3">{conv.messageCount}</td>
                          <td className="py-2 pr-3">
                            {conv.language ? (
                              <Badge variant="outline" className="text-xs">
                                {LANG_LABELS[conv.language] || conv.language}
                              </Badge>
                            ) : '—'}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant={conv.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                              {conv.status}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground text-xs">
                            {conv.lastMessageAt
                              ? new Date(conv.lastMessageAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : new Date(conv.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {convMeta && convMeta.pages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Page {convMeta.page} of {convMeta.pages} ({convMeta.total} total)
                      </p>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={convPage <= 1}
                          onClick={() => setConvPage((p) => p - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={convPage >= convMeta.pages}
                          onClick={() => setConvPage((p) => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-center py-8 text-sm text-muted-foreground">
                  No conversations yet. Enable AI Chat in Settings to get started.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
