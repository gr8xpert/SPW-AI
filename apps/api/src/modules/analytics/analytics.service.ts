import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Between } from 'typeorm';
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

  async markPdfDownload(
    tenantId: number,
    propertyId: number,
    sessionId: string,
  ): Promise<void> {
    await this.propertyViewRepository.update(
      { tenantId, propertyId, sessionId },
      { pdfDownloaded: true },
    );
  }

  async getOverview(
    tenantId: number,
    dateRange: { start: Date; end: Date },
  ) {
    const searches = await this.searchLogRepository.count({
      where: { tenantId, searchedAt: MoreThanOrEqual(dateRange.start) },
    });

    const views = await this.propertyViewRepository.count({
      where: { tenantId, viewedAt: MoreThanOrEqual(dateRange.start) },
    });

    const cardClicks = await this.searchLogRepository.count({
      where: { tenantId, searchedAt: MoreThanOrEqual(dateRange.start), clickedPropertyId: MoreThanOrEqual(1) as any },
    });

    const wishlistAdds = await this.favoriteRepository.count({
      where: { tenantId, createdAt: MoreThanOrEqual(dateRange.start) },
    });

    const inquiries = await this.propertyViewRepository.count({
      where: { tenantId, inquiryMade: true, viewedAt: MoreThanOrEqual(dateRange.start) },
    });

    const pdfDownloads = await this.propertyViewRepository.count({
      where: { tenantId, pdfDownloaded: true, viewedAt: MoreThanOrEqual(dateRange.start) },
    });

    return { searches, views, cardClicks, wishlistAdds, inquiries, pdfDownloads };
  }

  async getDailyActivity(
    tenantId: number,
    dateRange: { start: Date; end: Date },
  ) {
    const days: { date: string; searches: number; views: number; inquiries: number }[] = [];
    const current = new Date(dateRange.start);
    current.setHours(0, 0, 0, 0);

    while (current <= dateRange.end) {
      const dayStart = new Date(current);
      const dayEnd = new Date(current);
      dayEnd.setHours(23, 59, 59, 999);

      const [searchCount, viewCount, inquiryCount] = await Promise.all([
        this.searchLogRepository.count({
          where: { tenantId, searchedAt: Between(dayStart, dayEnd) },
        }),
        this.propertyViewRepository.count({
          where: { tenantId, viewedAt: Between(dayStart, dayEnd) },
        }),
        this.propertyViewRepository.count({
          where: { tenantId, inquiryMade: true, viewedAt: Between(dayStart, dayEnd) },
        }),
      ]);

      days.push({
        date: dayStart.toISOString().split('T')[0],
        searches: searchCount,
        views: viewCount,
        inquiries: inquiryCount,
      });

      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  async getEventBreakdown(
    tenantId: number,
    dateRange: { start: Date; end: Date },
  ) {
    const [searches, views, cardClicks, wishlistAdds, inquiries] = await Promise.all([
      this.searchLogRepository.count({
        where: { tenantId, searchedAt: MoreThanOrEqual(dateRange.start) },
      }),
      this.propertyViewRepository.count({
        where: { tenantId, viewedAt: MoreThanOrEqual(dateRange.start) },
      }),
      this.searchLogRepository.count({
        where: { tenantId, searchedAt: MoreThanOrEqual(dateRange.start), clickedPropertyId: MoreThanOrEqual(1) as any },
      }),
      this.favoriteRepository.count({
        where: { tenantId, createdAt: MoreThanOrEqual(dateRange.start) },
      }),
      this.propertyViewRepository.count({
        where: { tenantId, inquiryMade: true, viewedAt: MoreThanOrEqual(dateRange.start) },
      }),
    ]);

    return [
      { name: 'Searches', value: searches, color: '#3b82f6' },
      { name: 'Property Views', value: views, color: '#10b981' },
      { name: 'Card Clicks', value: cardClicks, color: '#06b6d4' },
      { name: 'Wishlist Adds', value: wishlistAdds, color: '#ef4444' },
      { name: 'Inquiries', value: inquiries, color: '#f59e0b' },
    ];
  }

  async getTopProperties(
    tenantId: number,
    dateRange: { start: Date; end: Date },
    limit: number = 10,
  ) {
    const result = await this.propertyViewRepository
      .createQueryBuilder('view')
      .select('view.propertyId', 'propertyId')
      .addSelect('property.reference', 'reference')
      .addSelect("JSON_UNQUOTE(JSON_EXTRACT(property.title, '$.en'))", 'title')
      .addSelect("JSON_UNQUOTE(JSON_EXTRACT(location.name, '$.en'))", 'location')
      .addSelect('property.listingType', 'listingType')
      .addSelect('COUNT(*)', 'views')
      .addSelect('SUM(CASE WHEN view.inquiryMade = true THEN 1 ELSE 0 END)', 'inquiries')
      .addSelect('SUM(CASE WHEN view.pdfDownloaded = true THEN 1 ELSE 0 END)', 'pdfs')
      .addSelect('COUNT(DISTINCT view.sessionId)', 'uniqueUsers')
      .innerJoin('view.property', 'property')
      .leftJoin('property.location', 'location')
      .where('view.tenantId = :tenantId', { tenantId })
      .andWhere('view.viewedAt >= :start', { start: dateRange.start })
      .andWhere('view.viewedAt <= :end', { end: dateRange.end })
      .groupBy('view.propertyId')
      .addGroupBy('property.reference')
      .addGroupBy('property.title')
      .addGroupBy('property.listingType')
      .addGroupBy('location.name')
      .orderBy('views', 'DESC')
      .limit(limit)
      .getRawMany();

    const propertyIds = result.map((r) => parseInt(r.propertyId));

    let clickCounts: Record<number, number> = {};
    let wishlistCounts: Record<number, number> = {};

    if (propertyIds.length > 0) {
      const clicks = await this.searchLogRepository
        .createQueryBuilder('log')
        .select('log.clickedPropertyId', 'propertyId')
        .addSelect('COUNT(*)', 'clicks')
        .where('log.tenantId = :tenantId', { tenantId })
        .andWhere('log.searchedAt >= :start', { start: dateRange.start })
        .andWhere('log.clickedPropertyId IN (:...ids)', { ids: propertyIds })
        .groupBy('log.clickedPropertyId')
        .getRawMany();

      clickCounts = Object.fromEntries(clicks.map((c) => [c.propertyId, parseInt(c.clicks)]));

      const wishlists = await this.favoriteRepository
        .createQueryBuilder('fav')
        .select('fav.propertyId', 'propertyId')
        .addSelect('COUNT(*)', 'count')
        .where('fav.tenantId = :tenantId', { tenantId })
        .andWhere('fav.createdAt >= :start', { start: dateRange.start })
        .andWhere('fav.propertyId IN (:...ids)', { ids: propertyIds })
        .groupBy('fav.propertyId')
        .getRawMany();

      wishlistCounts = Object.fromEntries(wishlists.map((w) => [w.propertyId, parseInt(w.count)]));
    }

    return result.map((r) => ({
      propertyId: parseInt(r.propertyId),
      reference: r.reference,
      title: r.title || '',
      location: r.location || '-',
      listingType: r.listingType || '-',
      views: parseInt(r.views),
      clicks: clickCounts[parseInt(r.propertyId)] || 0,
      wishlist: wishlistCounts[parseInt(r.propertyId)] || 0,
      inquiries: parseInt(r.inquiries),
      pdfs: parseInt(r.pdfs),
      uniqueUsers: parseInt(r.uniqueUsers),
    }));
  }

  async getSearchAnalytics(
    tenantId: number,
    dateRange: { start: Date; end: Date },
  ) {
    const searches = await this.searchLogRepository.find({
      where: { tenantId, searchedAt: MoreThanOrEqual(dateRange.start) },
    });

    const locationCounts: Record<number, number> = {};
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

    // Top property types by actual views (not search filters)
    const typeViews = await this.propertyViewRepository
      .createQueryBuilder('view')
      .select("JSON_UNQUOTE(JSON_EXTRACT(pt.name, '$.en'))", 'typeName')
      .addSelect('COUNT(*)', 'count')
      .innerJoin('view.property', 'property')
      .innerJoin('property_types', 'pt', 'pt.id = property.propertyTypeId')
      .where('view.tenantId = :tenantId', { tenantId })
      .andWhere('view.viewedAt >= :start', { start: dateRange.start })
      .andWhere('property.propertyTypeId IS NOT NULL')
      .groupBy('pt.id')
      .addGroupBy('pt.name')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      popularLocations: Object.entries(locationCounts)
        .map(([id, count]) => ({ locationId: parseInt(id), name: '', count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      popularTypes: typeViews.map((t) => ({
        name: t.typeName || 'Unknown',
        count: parseInt(t.count),
      })),
      priceRanges: Object.entries(priceRanges).map(([range, count]) => ({
        range,
        percentage: Math.round((count / totalSearches) * 100),
      })),
    };
  }

  async getFunnel(
    tenantId: number,
    dateRange: { start: Date; end: Date },
  ) {
    const uniqueSessions = await this.propertyViewRepository
      .createQueryBuilder('view')
      .select('COUNT(DISTINCT view.sessionId)', 'count')
      .where('view.tenantId = :tenantId', { tenantId })
      .andWhere('view.viewedAt >= :start', { start: dateRange.start })
      .getRawOne();

    const views = await this.propertyViewRepository.count({
      where: { tenantId, viewedAt: MoreThanOrEqual(dateRange.start) },
    });

    const inquiries = await this.propertyViewRepository.count({
      where: { tenantId, inquiryMade: true, viewedAt: MoreThanOrEqual(dateRange.start) },
    });

    const leads = await this.leadRepository.count({
      where: { tenantId, createdAt: MoreThanOrEqual(dateRange.start) },
    });

    const won = await this.leadRepository.count({
      where: { tenantId, status: 'won', wonAt: MoreThanOrEqual(dateRange.start) },
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
