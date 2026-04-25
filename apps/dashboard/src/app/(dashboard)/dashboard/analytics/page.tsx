'use client';

import { useState, useEffect, useMemo } from 'react';
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
  { key: 'searches', label: 'Searches', icon: Search, color: 'bg-blue-50 text-blue-600' },
  { key: 'views', label: 'Property Views', icon: Eye, color: 'bg-green-50 text-green-600' },
  { key: 'cardClicks', label: 'Card Clicks', icon: MousePointerClick, color: 'bg-cyan-50 text-cyan-600' },
  { key: 'wishlistAdds', label: 'Wishlist Adds', icon: Heart, color: 'bg-red-50 text-red-600' },
  { key: 'inquiries', label: 'Inquiries', icon: MessageSquare, color: 'bg-purple-50 text-purple-600' },
  { key: 'pdfDownloads', label: 'PDF Downloads', icon: FileDown, color: 'bg-gray-100 text-gray-600' },
] as const;

const CHART_COLORS = {
  searches: '#3b82f6',
  views: '#10b981',
  inquiries: '#f59e0b',
};

const activityFilters = [
  { key: 'all', label: 'All' },
  { key: 'searches', label: 'Searches' },
  { key: 'views', label: 'Views' },
  { key: 'inquiries', label: 'Inquiries' },
] as const;

function formatListingType(type: string): string {
  const map: Record<string, string> = {
    sale: 'Sale',
    rent: 'Rent',
    holiday_rent: 'Holiday',
    development: 'Dev',
  };
  return map[type] || type;
}

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
      toast({ title: 'Failed to load analytics', variant: 'destructive' });
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

  const activeEvents = eventBreakdown.filter((e) => e.value > 0);

  const funnelStages = funnel
    ? [
        { name: 'Visitors', value: funnel.visitors },
        { name: 'Views', value: funnel.views },
        { name: 'Inquiries', value: funnel.inquiries },
        { name: 'Leads', value: funnel.leads },
        { name: 'Won', value: funnel.won },
      ]
    : [];

  const maxFunnel = funnelStages[0]?.value || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-description mt-1">
            Track property performance and visitor behavior
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
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
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
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {metricCards.map((metric) => {
              const Icon = metric.icon;
              const value = overview?.[metric.key as keyof OverviewData] ?? 0;
              return (
                <Card key={metric.key}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`stat-card-icon ${metric.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{metric.label}</p>
                        <p className="text-2xl font-bold tracking-tight">{value.toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Activity Over Time + Event Breakdown */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Activity Over Time</CardTitle>
                  <div className="flex border rounded-md">
                    {activityFilters.map((f) => (
                      <Button
                        key={f.key}
                        variant={activityFilter === f.key ? 'default' : 'ghost'}
                        size="sm"
                        className="rounded-none first:rounded-l-md last:rounded-r-md text-xs h-7 px-3"
                        onClick={() => setActivityFilter(f.key)}
                      >
                        {f.label}
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
                          return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }}
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                        labelFormatter={(d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      />
                      {(activityFilter === 'all' || activityFilter === 'searches') && (
                        <Area
                          type="monotone"
                          dataKey="searches"
                          stroke={CHART_COLORS.searches}
                          fill="url(#gradSearches)"
                          strokeWidth={2}
                          name="Searches"
                        />
                      )}
                      {(activityFilter === 'all' || activityFilter === 'views') && (
                        <Area
                          type="monotone"
                          dataKey="views"
                          stroke={CHART_COLORS.views}
                          fill="url(#gradViews)"
                          strokeWidth={2}
                          name="Views"
                        />
                      )}
                      {(activityFilter === 'all' || activityFilter === 'inquiries') && (
                        <Area
                          type="monotone"
                          dataKey="inquiries"
                          stroke={CHART_COLORS.inquiries}
                          fill="url(#gradInquiries)"
                          strokeWidth={2}
                          name="Inquiries"
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                    No activity data for this period
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Event Breakdown</CardTitle>
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
                        formatter={(value: number) => [value.toLocaleString(), '']}
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
                    No event data
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
                  <CardTitle className="text-base">Property Analytics</CardTitle>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    placeholder="Filter by ref..."
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
                        Top {n}
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
                          <th className="pb-3 pr-4 font-semibold">Property Ref</th>
                          <th className="pb-3 pr-4 font-semibold">Location</th>
                          <th className="pb-3 pr-4 font-semibold">Type</th>
                          <th className="pb-3 pr-4 font-semibold text-right">Views</th>
                          <th className="pb-3 pr-4 font-semibold text-right">Clicks</th>
                          <th className="pb-3 pr-4 font-semibold text-right">Wishlist</th>
                          <th className="pb-3 pr-4 font-semibold text-right">Inquiries</th>
                          <th className="pb-3 pr-4 font-semibold text-right">PDFs</th>
                          <th className="pb-3 font-semibold text-right">Unique Users</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProperties.map((p) => (
                          <tr key={p.propertyId} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-3 pr-4 font-medium">{p.reference}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{p.location}</td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {formatListingType(p.listingType)}
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
                    Showing {filteredProperties.length} of {topProperties.length} most active
                    properties
                  </p>
                </>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No property data for this period
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
                  <CardTitle className="text-base">Top Searched Locations</CardTitle>
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
                            {loc.name || `Location #${loc.locationId}`}
                          </span>
                          <div className="flex-1 h-7 bg-muted rounded overflow-hidden">
                            <div
                              className="h-full bg-blue-500/20 rounded flex items-center px-2"
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
                    No search location data
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Top Property Types</CardTitle>
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
                              className="h-full bg-green-500/20 rounded flex items-center px-2"
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
                    No property type data
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Price Range + Conversion Funnel */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Price Range Interest</CardTitle>
                <CardDescription>Search distribution by budget</CardDescription>
              </CardHeader>
              <CardContent>
                {searchData?.priceRanges && searchData.priceRanges.some((p) => p.percentage > 0) ? (
                  <div className="space-y-3">
                    {searchData.priceRanges.map((item, i) => {
                      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
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
                    No price range data
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Conversion Funnel</CardTitle>
                <CardDescription>Visitor journey from search to close</CardDescription>
              </CardHeader>
              <CardContent>
                {funnelStages.some((s) => s.value > 0) ? (
                  <div className="space-y-3">
                    {funnelStages.map((stage, i) => {
                      const pct = Math.max((stage.value / maxFunnel) * 100, 2);
                      const colors = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6'];
                      return (
                        <div key={stage.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{stage.name}</span>
                            <span className="text-muted-foreground">
                              {stage.value.toLocaleString()}
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
                    No funnel data for this period
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
