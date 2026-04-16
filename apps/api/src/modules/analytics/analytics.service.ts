import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { PropertyView, SearchLog, Favorite, SavedSearch, Property, Lead } from '../../database/entities';
import { TrackViewDto, TrackSearchDto } from './dto';
import * as crypto from 'crypto';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(PropertyView)
    private propertyViewRepository: Repository<PropertyView>,
    @InjectRepository(SearchLog)
    private searchLogRepository: Repository<SearchLog>,
    @InjectRepository(Favorite)
    private favoriteRepository: Repository<Favorite>,
    @InjectRepository(SavedSearch)
    private savedSearchRepository: Repository<SavedSearch>,
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    @InjectRepository(Lead)
    private leadRepository: Repository<Lead>,
  ) {}

  private hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }

  async trackView(
    tenantId: number,
    dto: TrackViewDto,
    ip: string,
    userAgent: string,
  ): Promise<void> {
    const view = this.propertyViewRepository.create({
      tenantId,
      propertyId: dto.propertyId,
      sessionId: dto.sessionId,
      visitorIpHash: this.hashIp(ip),
      referrer: dto.referrer,
      userAgent,
      durationSeconds: dto.duration,
    });

    await this.propertyViewRepository.save(view);
  }

  async trackSearch(
    tenantId: number,
    dto: TrackSearchDto,
  ): Promise<void> {
    const log = this.searchLogRepository.create({
      tenantId,
      sessionId: dto.sessionId,
      filters: dto.filters || {},
      resultsCount: dto.resultsCount || 0,
      clickedPropertyId: dto.clickedPropertyId,
    });

    await this.searchLogRepository.save(log);
  }

  async markInquiry(
    tenantId: number,
    propertyId: number,
    sessionId: string,
  ): Promise<void> {
    await this.propertyViewRepository.update(
      { tenantId, propertyId, sessionId },
      { inquiryMade: true },
    );
  }

  async getOverview(
    tenantId: number,
    dateRange: { start: Date; end: Date },
  ): Promise<{
    properties: { total: number; change: number };
    views: { total: number; change: number };
    inquiries: { total: number; change: number };
    leads: { total: number; newThisWeek: number };
  }> {
    const rangeDays = Math.ceil(
      (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24),
    );

    const previousStart = new Date(dateRange.start);
    previousStart.setDate(previousStart.getDate() - rangeDays);

    // Properties count
    const totalProperties = await this.propertyRepository.count({
      where: { tenantId, status: 'active' },
    });

    const newPropertiesThisMonth = await this.propertyRepository.count({
      where: {
        tenantId,
        createdAt: MoreThanOrEqual(dateRange.start),
      },
    });

    // Views
    const currentViews = await this.propertyViewRepository.count({
      where: {
        tenantId,
        viewedAt: MoreThanOrEqual(dateRange.start),
      },
    });

    const previousViews = await this.propertyViewRepository.count({
      where: {
        tenantId,
        viewedAt: MoreThanOrEqual(previousStart),
      },
    });

    const viewsChange = previousViews > 0
      ? Math.round(((currentViews - previousViews) / previousViews) * 100)
      : 0;

    // Inquiries
    const currentInquiries = await this.propertyViewRepository.count({
      where: {
        tenantId,
        inquiryMade: true,
        viewedAt: MoreThanOrEqual(dateRange.start),
      },
    });

    const previousInquiries = await this.propertyViewRepository.count({
      where: {
        tenantId,
        inquiryMade: true,
        viewedAt: MoreThanOrEqual(previousStart),
      },
    });

    const inquiriesChange = previousInquiries > 0
      ? Math.round(((currentInquiries - previousInquiries) / previousInquiries) * 100)
      : 0;

    // Leads
    const totalLeads = await this.leadRepository.count({
      where: { tenantId },
    });

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const newLeadsThisWeek = await this.leadRepository.count({
      where: {
        tenantId,
        createdAt: MoreThanOrEqual(weekAgo),
      },
    });

    return {
      properties: { total: totalProperties, change: newPropertiesThisMonth },
      views: { total: currentViews, change: viewsChange },
      inquiries: { total: currentInquiries, change: inquiriesChange },
      leads: { total: totalLeads, newThisWeek: newLeadsThisWeek },
    };
  }

  async getTopProperties(
    tenantId: number,
    dateRange: { start: Date; end: Date },
    limit: number = 10,
  ): Promise<Array<{
    propertyId: number;
    reference: string;
    title: string;
    views: number;
    inquiries: number;
  }>> {
    const result = await this.propertyViewRepository
      .createQueryBuilder('view')
      .select('view.propertyId', 'propertyId')
      .addSelect('property.reference', 'reference')
      .addSelect("JSON_UNQUOTE(JSON_EXTRACT(property.title, '$.en'))", 'title')
      .addSelect('COUNT(*)', 'views')
      .addSelect('SUM(CASE WHEN view.inquiryMade = true THEN 1 ELSE 0 END)', 'inquiries')
      .innerJoin('view.property', 'property')
      .where('view.tenantId = :tenantId', { tenantId })
      .andWhere('view.viewedAt >= :start', { start: dateRange.start })
      .andWhere('view.viewedAt <= :end', { end: dateRange.end })
      .groupBy('view.propertyId')
      .addGroupBy('property.reference')
      .addGroupBy('property.title')
      .orderBy('views', 'DESC')
      .limit(limit)
      .getRawMany();

    return result.map((r) => ({
      propertyId: parseInt(r.propertyId),
      reference: r.reference,
      title: r.title || '',
      views: parseInt(r.views),
      inquiries: parseInt(r.inquiries),
    }));
  }

  async getSearchAnalytics(
    tenantId: number,
    dateRange: { start: Date; end: Date },
  ): Promise<{
    popularLocations: Array<{ locationId: number; name: string; count: number }>;
    popularFilters: Record<string, number>;
    priceRanges: Array<{ range: string; percentage: number }>;
  }> {
    const searches = await this.searchLogRepository.find({
      where: {
        tenantId,
        searchedAt: MoreThanOrEqual(dateRange.start),
      },
    });

    const locationCounts: Record<number, number> = {};
    const filterCounts: Record<string, number> = {};
    const priceRanges: Record<string, number> = {
      '0-200k': 0,
      '200k-400k': 0,
      '400k-700k': 0,
      '700k-1M': 0,
      '1M+': 0,
    };

    for (const search of searches) {
      const filters = search.filters || {};

      if (filters.locationId) {
        locationCounts[filters.locationId] = (locationCounts[filters.locationId] || 0) + 1;
      }

      if (filters.bedrooms) {
        filterCounts[`${filters.bedrooms}+ bedrooms`] = (filterCounts[`${filters.bedrooms}+ bedrooms`] || 0) + 1;
      }

      if (filters.features) {
        for (const feature of filters.features) {
          filterCounts[feature] = (filterCounts[feature] || 0) + 1;
        }
      }

      const maxPrice = filters.maxPrice || filters.priceMax;
      if (maxPrice) {
        if (maxPrice <= 200000) priceRanges['0-200k']++;
        else if (maxPrice <= 400000) priceRanges['200k-400k']++;
        else if (maxPrice <= 700000) priceRanges['400k-700k']++;
        else if (maxPrice <= 1000000) priceRanges['700k-1M']++;
        else priceRanges['1M+']++;
      }
    }

    const totalSearches = searches.length || 1;

    return {
      popularLocations: Object.entries(locationCounts)
        .map(([id, count]) => ({ locationId: parseInt(id), name: '', count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      popularFilters: filterCounts,
      priceRanges: Object.entries(priceRanges).map(([range, count]) => ({
        range,
        percentage: Math.round((count / totalSearches) * 100),
      })),
    };
  }

  async getFunnel(
    tenantId: number,
    dateRange: { start: Date; end: Date },
  ): Promise<{
    visitors: number;
    views: number;
    inquiries: number;
    leads: number;
    won: number;
  }> {
    const uniqueSessions = await this.propertyViewRepository
      .createQueryBuilder('view')
      .select('COUNT(DISTINCT view.sessionId)', 'count')
      .where('view.tenantId = :tenantId', { tenantId })
      .andWhere('view.viewedAt >= :start', { start: dateRange.start })
      .getRawOne();

    const views = await this.propertyViewRepository.count({
      where: {
        tenantId,
        viewedAt: MoreThanOrEqual(dateRange.start),
      },
    });

    const inquiries = await this.propertyViewRepository.count({
      where: {
        tenantId,
        inquiryMade: true,
        viewedAt: MoreThanOrEqual(dateRange.start),
      },
    });

    const leads = await this.leadRepository.count({
      where: {
        tenantId,
        createdAt: MoreThanOrEqual(dateRange.start),
      },
    });

    const won = await this.leadRepository.count({
      where: {
        tenantId,
        status: 'won',
        wonAt: MoreThanOrEqual(dateRange.start),
      },
    });

    return {
      visitors: parseInt(uniqueSessions?.count || '0'),
      views,
      inquiries,
      leads,
      won,
    };
  }

  // Favorites
  async addFavorite(
    tenantId: number,
    propertyId: number,
    sessionId?: string,
    contactId?: number,
  ): Promise<Favorite> {
    const existing = await this.favoriteRepository.findOne({
      where: contactId
        ? { tenantId, propertyId, contactId }
        : { tenantId, propertyId, sessionId },
    });

    if (existing) {
      return existing;
    }

    const favorite = this.favoriteRepository.create({
      tenantId,
      propertyId,
      sessionId,
      contactId,
    });

    return this.favoriteRepository.save(favorite);
  }

  async removeFavorite(
    tenantId: number,
    propertyId: number,
    sessionId?: string,
    contactId?: number,
  ): Promise<void> {
    await this.favoriteRepository.delete(
      contactId
        ? { tenantId, propertyId, contactId }
        : { tenantId, propertyId, sessionId },
    );
  }

  async getFavorites(
    tenantId: number,
    sessionId?: string,
    contactId?: number,
  ): Promise<Favorite[]> {
    return this.favoriteRepository.find({
      where: contactId
        ? { tenantId, contactId }
        : { tenantId, sessionId },
      relations: ['property'],
    });
  }

  // Saved Searches
  async saveSearch(
    tenantId: number,
    contactId: number,
    name: string,
    filters: Record<string, any>,
    notify: boolean = false,
  ): Promise<SavedSearch> {
    const savedSearch = this.savedSearchRepository.create({
      tenantId,
      contactId,
      name,
      filters,
      notifyNewMatches: notify,
    });

    return this.savedSearchRepository.save(savedSearch);
  }

  async getSavedSearches(
    tenantId: number,
    contactId: number,
  ): Promise<SavedSearch[]> {
    return this.savedSearchRepository.find({
      where: { tenantId, contactId },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteSavedSearch(
    tenantId: number,
    contactId: number,
    searchId: number,
  ): Promise<void> {
    await this.savedSearchRepository.delete({
      id: searchId,
      tenantId,
      contactId,
    });
  }
}
