'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Search,
  Eye,
  MousePointerClick,
  Heart,
  MessageSquare,
  FileDown,
  Loader2,
  MapPin,
  Home,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { useLanguage } from '@/i18n/i18n-provider';
import { useAnalyticsText } from './_i18n';

interface OverviewData {
  searches: number;
  views: number;
  cardClicks: number;
  wishlistAdds: number;
  inquiries: number;
  pdfDownloads: number;
}

interface DailyActivity {
  date: string;
  searches: number;
  views: number;
  inquiries: number;
}

interface EventBreakdown {
  name: string;
  value: number;
  color: string;
}

interface TopProperty {
  propertyId: number;
  reference: string;
  title: string;
  location: string;
  listingType: string;
  views: number;
  clicks: number;
  wishlist: number;
  inquiries: number;
  pdfs: number;
  uniqueUsers: number;
}

interface SearchData {
  popularLocations: { locationId: number; name: string; count: number }[];
  popularTypes: { name: string; count: number }[];
  priceRanges: { range: string; percentage: number }[];
}

interface FunnelData {
  visitors: number;
  views: number;
  inquiries: number;
  leads: number;
  won: number;
}

const metricCards = [
  { key: 'searches', icon: Search, color: 'stat-card-icon' },
  { key: 'views', icon: Eye, color: 'stat-card-icon' },
  { key: 'cardClicks', icon: MousePointerClick, color: 'stat-card-icon' },
  { key: 'wishlistAdds', icon: Heart, color: 'stat-card-icon' },
  { key: 'inquiries', icon: MessageSquare, color: 'stat-card-icon' },
  { key: 'pdfDownloads', icon: FileDown, color: 'stat-card-icon' },
] as const;

const CHART_COLORS = {
  searches: '#00246B',
  views: '#00246B',
  inquiries: '#CADCFC',
};

const activityFilters = ['all', 'searches', 'views', 'inquiries'] as const;

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30d');
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [propertyLimit, setPropertyLimit] = useState(10);
  const [propertySearch, setPropertySearch] = useState('');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [eventBreakdown, setEventBreakdown] = useState<EventBreakdown[]>([]);
  const [topProperties, setTopProperties] = useState<TopProperty[]>([]);
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  const api = useApi();
  const { toast } = useToast();
  const t = useAnalyticsText();
  const { locale } = useLanguage();

  const fetchData = async (range: string) => {
    if (!api.isReady) return;
    setLoading(true);
    try {
      const unwrap = (res: any) => res?.data || res;
      const [overviewRes, activityRes, eventsRes, propertiesRes, searchesRes, funnelRes] =
        await Promise.all([
          api.get(`/api/dashboard/analytics/overview?range=${range}`),
          api.get(`/api/dashboard/analytics/activity?range=${range}`),
          api.get(`/api/dashboard/analytics/events?range=${range}`),
          api.get(`/api/dashboard/analytics/properties?range=${range}&limit=100`),
          api.get(`/api/dashboard/analytics/searches?range=${range}`),
          api.get(`/api/dashboard/analytics/funnel?range=${range}`),
        ]);

      setOverview(unwrap(overviewRes));
      const act = unwrap(activityRes);
      setDailyActivity(Array.isArray(act) ? act : []);
      const ev = unwrap(eventsRes);
      setEventBreakdown(Array.isArray(ev) ? ev : []);
      const props = unwrap(propertiesRes);
      setTopProperties(Array.isArray(props) ? props : props?.data || []);
      setSearchData(unwrap(searchesRes));
      setFunnel(unwrap(funnelRes));
    } catch {
      toast({ title: t.loadFailed, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(dateRange);
  }, [dateRange, api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredActivity = useMemo(() => {
    if (activityFilter === 'all') return dailyActivity;
    return dailyActivity.map((d) => ({
      date: d.date,
      searches: activityFilter === 'searches' ? d.searches : 0,
      views: activityFilter === 'views' ? d.views : 0,
      inquiries: activityFilter === 'inquiries' ? d.inquiries : 0,
    }));
  }, [dailyActivity, activityFilter]);

  const filteredProperties = useMemo(() => {
    let list = topProperties;
    if (propertySearch) {
      const q = propertySearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.reference.toLowerCase().includes(q) ||
          (p.title && p.title.toLowerCase().includes(q)),
      );
    }
    return list.slice(0, propertyLimit);
  }, [topProperties, propertySearch, propertyLimit]);

  const activeEvents = eventBreakdown
    .filter((e) => e.value > 0)
    .map((e) => ({ ...e, name: t.events[e.name] ?? e.name }));

  const funnelStages = funnel
    ? [
        { name: t.funnel.visitors, value: funnel.visitors },
        { name: t.funnel.views, value: funnel.views },
        { name: t.funnel.inquiries, value: funnel.inquiries },
        { name: t.funnel.leads, value: funnel.leads },
        { name: t.funnel.won, value: funnel.won },
      ]
    : [];

  const maxFunnel = funnelStages[0]?.value || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">
            {t.description}
          </p>
        </div>
        <div className="flex border rounded-md">
          {['7d', '30d', '90d'].map((range) => (
            <Button
              key={range}
              variant={dateRange === range ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none first:rounded-l-md last:rounded-r-md"
              onClick={() => setDateRange(range)}
            >
              {t.ranges[range]}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* 6 Metric Cards */}
          <motion.div
            variants={staggerContainer}
            initial={false}
            animate="animate"
            className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
          >
            {metricCards.map((metric) => {
              const Icon = metric.icon;
              const value = overview?.[metric.key as keyof OverviewData] ?? 0;
              return (
                <motion.div key={metric.key} variants={staggerItem}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`stat-card-icon ${metric.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t.metrics[metric.key]}</p>
                        <p className="text-2xl font-bold tracking-tight">{value.toLocaleString(locale)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Activity Over Time + Event Breakdown */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t.activityTitle}</CardTitle>
                  <div className="flex border rounded-md">
                    {activityFilters.map((f) => (
                      <Button
                        key={f}
                        variant={activityFilter === f ? 'default' : 'ghost'}
                        size="sm"
                        className="rounded-none first:rounded-l-md last:rounded-r-md text-xs h-7 px-3"
                        onClick={() => setActivityFilter(f)}
                      >
                        {t.filters[f]}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredActivity.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={filteredActivity}>
                      <defs>
                        <linearGradient id="gradSearches" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.searches} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.searches} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradViews" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.views} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.views} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradInquiries" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.inquiries} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.inquiries} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) => {
                          const date = new Date(d);
                          return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
                        }}
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                        labelFormatter={(d) => new Date(d).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })}
                      />
                      {(activityFilter === 'all' || activityFilter === 'searches') && (
                        <Area
                          type="monotone"
                          dataKey="searches"
                          stroke={CHART_COLORS.searches}
                          fill="url(#gradSearches)"
                          strokeWidth={2}
                          name={t.filters.searches}
                        />
                      )}
                      {(activityFilter === 'all' || activityFilter === 'views') && (
                        <Area
                          type="monotone"
                          dataKey="views"
                          stroke={CHART_COLORS.views}
                          fill="url(#gradViews)"
                          strokeWidth={2}
                          name={t.filters.views}
                        />
                      )}
                      {(activityFilter === 'all' || activityFilter === 'inquiries') && (
                        <Area
                          type="monotone"
                          dataKey="inquiries"
                          stroke={CHART_COLORS.inquiries}
                          fill="url(#gradInquiries)"
                          strokeWidth={2}
                          name={t.filters.inquiries}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                    {t.noActivity}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t.eventTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                {activeEvents.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={activeEvents}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {activeEvents.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [value.toLocaleString(locale), '']}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                    {t.noEvents}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Property Analytics Table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">{t.propertyTitle}</CardTitle>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    placeholder={t.filterByRef}
                    className="w-40 h-8 text-sm"
                    value={propertySearch}
                    onChange={(e) => setPropertySearch(e.target.value)}
                  />
                  <div className="flex border rounded-md">
                    {[10, 100].map((n) => (
                      <Button
                        key={n}
                        variant={propertyLimit === n ? 'default' : 'ghost'}
                        size="sm"
                        className="rounded-none first:rounded-l-md last:rounded-r-md text-xs h-7 px-3"
                        onClick={() => setPropertyLimit(n)}
                      >
                        {t.top(n)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredProperties.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-3 pr-4 font-semibold">{t.columns.ref}</th>
                          <th className="pb-3 pr-4 font-semibold">{t.columns.location}</th>
                          <th className="pb-3 pr-4 font-semibold">{t.columns.type}</th>
                          <th className="pb-3 pr-4 font-semibold text-right">{t.columns.views}</th>
                          <th className="pb-3 pr-4 font-semibold text-right">{t.columns.clicks}</th>
                          <th className="pb-3 pr-4 font-semibold text-right">{t.columns.wishlist}</th>
                          <th className="pb-3 pr-4 font-semibold text-right">{t.columns.inquiries}</th>
                          <th className="pb-3 pr-4 font-semibold text-right">{t.columns.pdfs}</th>
                          <th className="pb-3 font-semibold text-right">{t.columns.uniqueUsers}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProperties.map((p) => (
                          <tr key={p.propertyId} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-3 pr-4 font-medium">{p.reference}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{p.location}</td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {t.listingTypes[p.listingType] ?? p.listingType}
                            </td>
                            <td className="py-3 pr-4 text-right">{p.views}</td>
                            <td className="py-3 pr-4 text-right">{p.clicks}</td>
                            <td className="py-3 pr-4 text-right">{p.wishlist}</td>
                            <td className="py-3 pr-4 text-right">{p.inquiries}</td>
                            <td className="py-3 pr-4 text-right">{p.pdfs}</td>
                            <td className="py-3 text-right text-primary font-medium">
                              {p.uniqueUsers}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t.showing(filteredProperties.length, topProperties.length)}
                  </p>
                </>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {t.noProperties}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Searched Locations + Top Property Types */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">{t.locationsTitle}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {searchData?.popularLocations && searchData.popularLocations.length > 0 ? (
                  <div className="space-y-3">
                    {searchData.popularLocations.map((loc, i) => {
                      const max = searchData.popularLocations[0]?.count || 1;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-sm w-28 shrink-0 truncate">
                            {loc.name || t.locationFallback(loc.locationId)}
                          </span>
                          <div className="flex-1 h-7 bg-muted rounded overflow-hidden">
                            <div
                              className="h-full bg-secondary rounded flex items-center px-2"
                              style={{ width: `${Math.max((loc.count / max) * 100, 8)}%` }}
                            >
                              <span className="text-xs font-medium">{loc.count}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {t.noLocations}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">{t.typesTitle}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {searchData?.popularTypes && searchData.popularTypes.length > 0 ? (
                  <div className="space-y-3">
                    {searchData.popularTypes.map((type, i) => {
                      const max = searchData.popularTypes[0]?.count || 1;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-sm w-28 shrink-0 truncate">{type.name}</span>
                          <div className="flex-1 h-7 bg-muted rounded overflow-hidden">
                            <div
                              className="h-full bg-secondary rounded flex items-center px-2"
                              style={{ width: `${Math.max((type.count / max) * 100, 8)}%` }}
                            >
                              <span className="text-xs font-medium">{type.count}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {t.noTypes}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Price Range + Conversion Funnel */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t.priceTitle}</CardTitle>
                <CardDescription>{t.priceDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                {searchData?.priceRanges && searchData.priceRanges.some((p) => p.percentage > 0) ? (
                  <div className="space-y-3">
                    {searchData.priceRanges.map((item, i) => {
                      const colors = ['#00246B', '#1a3d7a', '#335689', '#4d6f98', '#CADCFC'];
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: colors[i % colors.length] }}
                          />
                          <span className="text-sm flex-1">{item.range}</span>
                          <div className="w-24 h-5 bg-muted rounded overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${item.percentage}%`,
                                backgroundColor: colors[i % colors.length],
                                opacity: 0.6,
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium w-10 text-right">
                            {item.percentage}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {t.noPrices}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t.funnelTitle}</CardTitle>
                <CardDescription>{t.funnelDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                {funnelStages.some((s) => s.value > 0) ? (
                  <div className="space-y-3">
                    {funnelStages.map((stage, i) => {
                      const pct = Math.max((stage.value / maxFunnel) * 100, 2);
                      const colors = ['#00246B', '#1a3d7a', '#335689', '#4d6f98', '#CADCFC'];
                      return (
                        <div key={stage.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{stage.name}</span>
                            <span className="text-muted-foreground">
                              {stage.value.toLocaleString(locale)}
                            </span>
                          </div>
                          <div className="h-7 bg-muted rounded overflow-hidden">
                            <div
                              className="h-full rounded flex items-center px-2"
                              style={{ width: `${pct}%`, backgroundColor: colors[i] }}
                            >
                              {pct > 15 && (
                                <span className="text-xs text-white font-medium">
                                  {maxFunnel > 0 ? Math.round((stage.value / maxFunnel) * 100) : 0}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {t.noFunnel}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
