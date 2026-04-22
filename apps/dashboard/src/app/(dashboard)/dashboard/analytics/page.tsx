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
  Eye,
  MessageSquare,
  TrendingUp,
  Search,
  Loader2,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

interface OverviewData {
  totalViews: number;
  totalInquiries: number;
  totalSearches: number;
  conversionRate: number;
  viewsTrend: number;
  inquiriesTrend: number;
  searchesTrend: number;
  dailyViews: { date: string; views: number }[];
}

interface TopProperty {
  id: number;
  reference: string;
  title: string;
  views: number;
  inquiries: number;
}

interface SearchData {
  topLocations: { location: string; searches: number }[];
  priceRanges: { name: string; value: number }[];
}

interface FunnelStage {
  stage: string;
  value: number;
  percent: number;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('7d');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [topProperties, setTopProperties] = useState<TopProperty[]>([]);
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [loading, setLoading] = useState(true);

  const api = useApi();
  const { toast } = useToast();

  const fetchData = async (range: string) => {
    setLoading(true);
    try {
      const [overviewRes, propertiesRes, searchesRes, funnelRes] = await Promise.all([
        api.get(`/api/dashboard/analytics/overview?range=${range}`),
        api.get(`/api/dashboard/analytics/properties?range=${range}&limit=5`),
        api.get(`/api/dashboard/analytics/searches?range=${range}`),
        api.get(`/api/dashboard/analytics/funnel?range=${range}`),
      ]);

      const unwrap = (res: any) => res?.data || res;
      setOverview(unwrap(overviewRes));
      const props = unwrap(propertiesRes);
      setTopProperties(Array.isArray(props) ? props : props?.data || []);
      setSearchData(unwrap(searchesRes));
      const f = unwrap(funnelRes);
      setFunnel(Array.isArray(f) ? f : f?.data || f?.stages || []);
    } catch {
      toast({ title: 'Failed to load analytics', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(dateRange); }, [dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRangeChange = (range: string) => {
    setDateRange(range);
  };

  const trendIcon = (val: number | undefined) => {
    if (!val) return null;
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <TrendingUp className={`h-3 w-3 ${val >= 0 ? 'text-green-500' : 'text-red-500 rotate-180'}`} />
        <span className={val >= 0 ? 'text-green-500' : 'text-red-500'}>
          {val >= 0 ? '+' : ''}{val.toFixed(0)}%
        </span>{' '}
        vs last period
      </p>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Track property performance and visitor behavior</p>
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
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Views</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(overview?.totalViews ?? 0).toLocaleString()}</div>
                {trendIcon(overview?.viewsTrend)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Inquiries</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(overview?.totalInquiries ?? 0).toLocaleString()}</div>
                {trendIcon(overview?.inquiriesTrend)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(overview?.conversionRate ?? 0).toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">View to inquiry rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Searches</CardTitle>
                <Search className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(overview?.totalSearches ?? 0).toLocaleString()}</div>
                {trendIcon(overview?.searchesTrend)}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Daily Views</CardTitle>
                <CardDescription>Property view count over time</CardDescription>
              </CardHeader>
              <CardContent>
                {overview?.dailyViews && overview.dailyViews.length > 0 ? (
                  <div className="space-y-2">
                    {overview.dailyViews.map((day, i) => {
                      const maxViews = Math.max(...overview.dailyViews.map((d) => d.views), 1);
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-20 shrink-0">
                            {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${(day.views / maxViews) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-12 text-right">{day.views}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center py-8 text-sm text-muted-foreground">No view data for this period</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Popular Locations</CardTitle>
                <CardDescription>Most searched locations</CardDescription>
              </CardHeader>
              <CardContent>
                {searchData?.topLocations && searchData.topLocations.length > 0 ? (
                  <div className="space-y-2">
                    {searchData.topLocations.map((loc, i) => {
                      const maxSearches = Math.max(...searchData.topLocations.map((l) => l.searches), 1);
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-sm w-28 shrink-0 truncate">{loc.location}</span>
                          <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${(loc.searches / maxSearches) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-12 text-right">{loc.searches}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center py-8 text-sm text-muted-foreground">No search data for this period</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Price Range Interest</CardTitle>
                <CardDescription>Search distribution by budget</CardDescription>
              </CardHeader>
              <CardContent>
                {searchData?.priceRanges && searchData.priceRanges.length > 0 ? (
                  <div className="space-y-3">
                    {searchData.priceRanges.map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-sm flex-1">{item.name}</span>
                        <span className="text-sm font-medium">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-8 text-sm text-muted-foreground">No price range data</p>
                )}
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Top Performing Properties</CardTitle>
                <CardDescription>Most viewed properties this period</CardDescription>
              </CardHeader>
              <CardContent>
                {topProperties.length > 0 ? (
                  <div className="space-y-4">
                    {topProperties.map((property, i) => (
                      <div
                        key={property.id || i}
                        className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-lg font-bold text-muted-foreground w-6">{i + 1}</span>
                          <div>
                            <p className="font-medium">{property.title || 'Untitled'}</p>
                            <p className="text-sm text-muted-foreground">{property.reference}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right">
                            <p className="font-medium">{property.views}</p>
                            <p className="text-xs text-muted-foreground">views</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{property.inquiries}</p>
                            <p className="text-xs text-muted-foreground">inquiries</p>
                          </div>
                          <Badge variant="outline">
                            {property.views > 0 ? ((property.inquiries / property.views) * 100).toFixed(1) : '0.0'}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-8 text-sm text-muted-foreground">No property data for this period</p>
                )}
              </CardContent>
            </Card>
          </div>

          {funnel.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Conversion Funnel</CardTitle>
                <CardDescription>Visitor journey from search to close</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {funnel.map((stage) => (
                    <div key={stage.stage} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{stage.stage}</span>
                        <span className="text-muted-foreground">
                          {stage.value.toLocaleString()} ({stage.percent}%)
                        </span>
                      </div>
                      <div className="h-8 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.max((stage.value / (funnel[0]?.value || 1)) * 100, 1)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
