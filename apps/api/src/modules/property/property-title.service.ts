import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location, Property } from '../../database/entities';
import { LabelService } from '../label/label.service';
import { resolveOne } from '../../common/i18n/resolve-name.interceptor';
import {
  LISTING_TYPE_LABEL_KEYS,
  TitlePatterns,
  TitlePatternSet,
  bedroomsText,
  cleanTitlePatterns,
  patternSetFor,
  pickTitlePattern,
  renderTitle,
  tokensUsed,
} from './title-pattern';

type Obj = Record<string, unknown>;

// A name that is already a string (public responses, after
// ResolveNameInterceptor) or still an i18n map (dashboard rows).
function text(value: unknown, lang: string): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) return resolveOne(value as Obj, lang);
  return '';
}

export interface TitlePreviewRow {
  reference: string;
  original: Record<string, string>;
  card: Record<string, string>;
  detail: Record<string, string>;
}

// Builds listing titles from the client's patterns (see title-pattern.ts).
@Injectable()
export class PropertyTitleService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    private readonly labelService: LabelService,
  ) {}

  /** Replaces `title` on each listing that the patterns can fill. */
  async apply(listings: Obj[], tenantId: number, set: TitlePatternSet, lang: string): Promise<void> {
    if (!listings.length || !Object.keys(set).length) return;
    const used = tokensUsed(set);
    const labels = used.has('listingType') ? await this.labelService.getLabelsForWidget(tenantId, lang) : {};
    const areas = used.has('area') ? await this.parentNames(tenantId, listings, lang) : new Map<number, string>();
    for (const p of listings) {
      const title = this.build(p, set, lang, labels, areas);
      if (title) p.title = title;
    }
  }

  private build(p: Obj, set: TitlePatternSet, lang: string, labels: Record<string, string>, areas: Map<number, string>): string | null {
    const listingType = typeof p.listingType === 'string' ? p.listingType : null;
    const pattern = pickTitlePattern(set, listingType, lang);
    if (!pattern) return null;
    const location = p.location as Obj | null | undefined;
    const type = p.propertyType as Obj | null | undefined;
    const locationId = Number(location?.id ?? p.locationId);
    return renderTitle(pattern, {
      type: text(type?.name, lang),
      location: text(location?.name, lang),
      area: areas.get(locationId),
      listingType: listingType ? labels[LISTING_TYPE_LABEL_KEYS[listingType]] : '',
      bedrooms: bedroomsText(p.bedrooms, p.bedroomsTo),
      ref: typeof p.reference === 'string' ? p.reference : '',
      title: text(p.title, lang),
    });
  }

  // The name of the place each listing's location sits in ("Marbella" for
  // Nueva Andalucía), keyed by the listing's location id.
  private async parentNames(tenantId: number, listings: Obj[], lang: string): Promise<Map<number, string>> {
    const ids = [
      ...new Set(
        listings
          .map((p) => Number((p.location as Obj | null | undefined)?.id ?? p.locationId))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
    const out = new Map<number, string>();
    if (!ids.length) return out;
    const rows = await this.locationRepository
      .createQueryBuilder('l')
      .leftJoin('l.parent', 'parent')
      .select(['l.id', 'parent.id', 'parent.name'])
      .where('l.tenantId = :tenantId', { tenantId })
      .andWhere('l.id IN (:...ids)', { ids })
      .getMany();
    for (const row of rows) {
      const name = row.parent ? text(row.parent.name, lang) : '';
      if (name) out.set(row.id, name);
    }
    return out;
  }

  /**
   * Settings preview: unsaved patterns applied to a few of the client's
   * published listings, in each of the given languages.
   */
  async preview(tenantId: number, value: unknown, languages: string[]): Promise<TitlePreviewRow[]> {
    const patterns: TitlePatterns = { ...cleanTitlePatterns(value), enabled: true };
    const langs = [...new Set(languages.map((l) => String(l).toLowerCase()).filter((l) => /^[a-z]{2}(-[a-z]{2})?$/.test(l)))].slice(0, 15);
    if (!langs.length) langs.push('en');
    const rows = await this.propertyRepository.find({
      where: { tenantId, status: 'active', isPublished: true },
      relations: ['location', 'propertyType'],
      order: { updatedAt: 'DESC' },
      take: 3,
    });
    const out: TitlePreviewRow[] = rows.map((r) => ({ reference: r.reference, original: {}, card: {}, detail: {} }));
    for (const lang of langs) {
      for (const kind of ['card', 'detail'] as const) {
        const copies = rows.map((r) => ({ ...r }) as unknown as Obj);
        await this.apply(copies, tenantId, patternSetFor(patterns, kind), lang);
        copies.forEach((c, i) => {
          out[i][kind][lang] = text(c.title, lang);
          out[i].original[lang] = text(rows[i].title, lang);
        });
      }
    }
    return out;
  }
}

