'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
  AlertCircle,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/i18n-provider';
import { useAiChatText } from './_i18n';
import { useAiChatTranscriptText } from './_i18n/transcript';
import { ConversationDialog } from './_components/conversation-dialog';

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

// A detected language code (e.g. "es") named in the dashboard language; an
// unknown code is shown as it came.
function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function AiChatPageInner() {
  const [dateRange, setDateRange] = useState('30d');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [convMeta, setConvMeta] = useState<{ total: number; page: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [convPage, setConvPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  // Why the chat might be missing from the website (null = it is shown).
  const [widgetOff, setWidgetOff] = useState<'settings' | 'admin' | null>(null);

  const api = useApi();
  const { toast } = useToast();
  const t = useAiChatText();
  const x = useAiChatTranscriptText();
  const { locale } = useLanguage();

  useEffect(() => {
    if (!api.isReady) return;
    api
      .get('/api/dashboard/ai-chat/status')
      .then((res: any) => {
        const status = res?.data ?? res;
        if (!status?.allowed) setWidgetOff('admin');
        else if (!status?.enabled) setWidgetOff('settings');
        else setWidgetOff(null);
      })
      .catch(() => {});
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // A paged list comes as { data, meta } (not wrapped again).
      const convData = convRes?.meta ? convRes : unwrap(convRes);
      setConversations(convData?.data || []);
      setConvMeta(convData?.meta || null);
    } catch {
      toast({ title: t.loadFailed, variant: 'destructive' });
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
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">{t.description}</p>
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
                {t.ranges[range]}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {widgetOff && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/30">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{widgetOff === 'admin' ? x.widgetOffAdmin : x.widgetOff}</span>
          {widgetOff === 'settings' && (
            <Link href="/dashboard/settings?tab=ai-chat" className="font-medium text-primary underline">{x.settingsLink}</Link>
          )}
        </div>
      )}

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
                <CardTitle className="text-sm font-medium">{t.conversations}</CardTitle>
                <div className="stat-card-icon">
                  <MessagesSquare className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">{(stats?.totalConversations ?? 0).toLocaleString(locale)}</div>
                <p className="text-xs text-muted-foreground">{t.totalSessions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{t.messages}</CardTitle>
                <div className="stat-card-icon">
                  <MessageSquare className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">{(stats?.totalMessages ?? 0).toLocaleString(locale)}</div>
                <p className="text-xs text-muted-foreground">{t.messagesHint}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{t.avgPerChat}</CardTitle>
                <div className="stat-card-icon">
                  <Hash className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">{Number(stats?.avgMessagesPerConversation ?? 0).toLocaleString(locale)}</div>
                <p className="text-xs text-muted-foreground">{t.perConversation}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{t.languages}</CardTitle>
                <div className="stat-card-icon">
                  <Globe className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">{stats?.languageBreakdown?.length ?? 0}</div>
                <p className="text-xs text-muted-foreground">{t.detectedLanguages}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Daily volume */}
            <Card>
              <CardHeader>
                <CardTitle>{t.dailyTitle}</CardTitle>
                <CardDescription>{t.dailyDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.dailyVolume && stats.dailyVolume.length > 0 ? (
                  <div className="space-y-2">
                    {stats.dailyVolume.map((day, i) => {
                      const maxCount = Math.max(...stats.dailyVolume.map((d) => Number(d.count)), 1);
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-20 shrink-0">
                            {new Date(day.date).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })}
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
                  <p className="text-center py-8 text-sm text-muted-foreground">{t.noDaily}</p>
                )}
              </CardContent>
            </Card>

            {/* Tool usage + Language breakdown */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t.toolTitle}</CardTitle>
                  <CardDescription>{t.toolDescription}</CardDescription>
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
                              {t.tools[item.tool] || item.tool}
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
                    <p className="text-center py-6 text-sm text-muted-foreground">{t.noTools}</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t.languages}</CardTitle>
                  <CardDescription>{t.languagesDescription}</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.languageBreakdown && stats.languageBreakdown.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {stats.languageBreakdown.map((item, i) => (
                        <Badge key={i} variant="outline" className="text-sm py-1 px-3">
                          {languageName(item.language, locale)}
                          <span className="ml-2 font-bold">{item.count}</span>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-6 text-sm text-muted-foreground">{t.noLanguages}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recent conversations */}
          <Card>
            <CardHeader>
              <CardTitle>{t.recentTitle}</CardTitle>
              <CardDescription>{t.recentDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {conversations.length > 0 ? (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-3 font-medium">{x.colChat}</th>
                        <th className="py-2 pr-3 font-medium">{t.colLastMessage}</th>
                        <th className="py-2 pr-3 font-medium">{t.colMessages}</th>
                        <th className="py-2 pr-3 font-medium">{t.colLanguage}</th>
                        <th className="py-2 pr-3 font-medium">{t.colStatus}</th>
                        <th className="py-2 font-medium">{t.colDate}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conversations.map((conv) => (
                        <tr
                          key={conv.id}
                          className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                          onClick={() => setOpenId(conv.id)}
                        >
                          <td className="py-2 pr-3">
                            <button type="button" className="font-mono text-xs text-primary underline" onClick={(e) => { e.stopPropagation(); setOpenId(conv.id); }}>
                              #{conv.id}
                            </button>
                          </td>
                          <td className="py-2 pr-3 max-w-[300px] truncate text-muted-foreground">
                            {conv.lastUserMessage || '—'}
                          </td>
                          <td className="py-2 pr-3">{conv.messageCount}</td>
                          <td className="py-2 pr-3">
                            {conv.language ? (
                              <Badge variant="outline" className="text-xs">
                                {languageName(conv.language, locale)}
                              </Badge>
                            ) : '—'}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant={conv.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                              {t.status[conv.status] ?? conv.status}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground text-xs">
                            {conv.lastMessageAt
                              ? new Date(conv.lastMessageAt).toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : new Date(conv.createdAt).toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {convMeta && convMeta.pages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        {t.pageOf(convMeta.page, convMeta.pages, convMeta.total)}
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
                  {t.empty}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConversationDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

import { LockedRouteGuard } from '@/components/locked-route-guard';

export default function AiChatPage() {
  const t = useAiChatText();
  return (
    <LockedRouteGuard addon="aiChat" featureName={t.title}>
      <AiChatPageInner />
    </LockedRouteGuard>
  );
}
