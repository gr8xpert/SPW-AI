import { Injectable, Logger } from '@nestjs/common';
import { PropertySearchService } from '../property/property-search.service';
import { PropertyService } from '../property/property.service';
import { LocationService } from '../location/location.service';
import { FeatureService } from '../feature/feature.service';
import { ToolDefinition, ToolCall } from '../ai/ai.service';
import { TenantSettings, ApiKeyScope } from '@spm/shared';
import { siteListingTypes, siteMinPrices } from '../property/site-limits';

const SEARCH_PROPERTIES_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_properties',
    description: 'Search for properties matching the given filters. Use this when a user wants to find properties.',
    parameters: {
      type: 'object',
      properties: {
        locationId: { type: 'number', description: 'Location ID to filter by' },
        propertyTypeId: { type: 'number', description: 'Property type ID to filter by' },
        listingType: { type: 'string', enum: ['sale', 'rent', 'holiday_rent', 'development'], description: 'Listing type' },
        minPrice: { type: 'number', description: 'Minimum price' },
        maxPrice: { type: 'number', description: 'Maximum price' },
        minBedrooms: { type: 'number', description: 'Minimum number of bedrooms' },
        maxBedrooms: { type: 'number', description: 'Maximum number of bedrooms' },
        minBathrooms: { type: 'number', description: 'Minimum number of bathrooms' },
        maxBathrooms: { type: 'number', description: 'Maximum number of bathrooms' },
        minBuildSize: { type: 'number', description: 'Minimum build size in m²' },
        maxBuildSize: { type: 'number', description: 'Maximum build size in m²' },
        minPlotSize: { type: 'number', description: 'Minimum plot size in m²' },
        maxPlotSize: { type: 'number', description: 'Maximum plot size in m²' },
        features: { type: 'array', items: { type: 'number' }, description: 'Array of feature IDs to require' },
        isFeatured: { type: 'boolean', description: 'Only show featured properties' },
        sortBy: { type: 'string', enum: ['create_date_desc', 'create_date', 'write_date_desc', 'write_date', 'list_price', 'list_price_desc', 'ref_desc', 'ref_asc'] },
        page: { type: 'number', description: 'Page number (default 1)' },
        limit: { type: 'number', description: 'Results per page (default 10, max 20)' },
      },
    },
  },
};

const GET_PROPERTY_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_property',
    description: 'Get full details of a specific property by its reference code. Use this for property Q&A.',
    parameters: {
      type: 'object',
      properties: {
        reference: { type: 'string', description: 'The property reference code' },
      },
      required: ['reference'],
    },
  },
};

const GET_LOCATIONS_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_locations',
    description: 'Find locations and their IDs. Use this when the user mentions a place name: pass the name as "search".',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Part of the place name (any language)' },
        level: { type: 'string', enum: ['region', 'province', 'area', 'municipality', 'town', 'urbanization'], description: 'Filter by location level' },
      },
    },
  },
};

const GET_FEATURES_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_features',
    description: 'Get available property features. Use this to find feature IDs when the user mentions amenities like pool, garden, etc.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['interior', 'exterior', 'community', 'climate', 'views', 'security', 'parking', 'other'], description: 'Filter by feature category' },
      },
    },
  },
};

const COMPARE_PROPERTIES_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'compare_properties',
    description: 'Compare multiple properties side by side. Provide 2-4 property references.',
    parameters: {
      type: 'object',
      properties: {
        references: { type: 'array', items: { type: 'string' }, description: 'Array of property reference codes to compare', minItems: 2, maxItems: 4 },
      },
      required: ['references'],
    },
  },
};

const MAX_LOCATIONS = 100;

// Lowercase without accents, so "malaga" finds "Málaga".
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

@Injectable()
export class AiChatToolsService {
  private readonly logger = new Logger(AiChatToolsService.name);

  constructor(
    private readonly searchService: PropertySearchService,
    private readonly propertyService: PropertyService,
    private readonly locationService: LocationService,
    private readonly featureService: FeatureService,
  ) {}

  getTools(settings: TenantSettings): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    if (settings.aiChatNLSearch !== false) {
      tools.push(SEARCH_PROPERTIES_TOOL, GET_LOCATIONS_TOOL, GET_FEATURES_TOOL);
    }

    if (settings.aiChatPropertyQA !== false) {
      tools.push(GET_PROPERTY_TOOL);
    }

    if (settings.aiChatComparison !== false) {
      tools.push(COMPARE_PROPERTIES_TOOL);
    }

    return tools;
  }

  async executeTool(
    tenantId: number,
    toolCall: ToolCall,
    settings?: TenantSettings,
    keyScope?: ApiKeyScope | null,
  ): Promise<{ name: string; result: any }> {
    const name = toolCall.function.name;
    let args: any;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return { name, result: { error: 'Invalid tool arguments' } };
    }

    try {
      switch (name) {
        case 'search_properties':
          return { name, result: await this.executeSearch(tenantId, args, settings, keyScope) };
        case 'get_property':
          return { name, result: await this.executeGetProperty(tenantId, args, keyScope) };
        case 'get_locations':
          return { name, result: await this.executeGetLocations(tenantId, args) };
        case 'get_features':
          return { name, result: await this.executeGetFeatures(tenantId, args) };
        case 'compare_properties':
          return { name, result: await this.executeCompare(tenantId, args, keyScope) };
        default:
          return { name, result: { error: `Unknown tool: ${name}` } };
      }
    } catch (err) {
      this.logger.warn(`Tool ${name} failed: ${(err as Error).message}`);
      return { name, result: { error: `Tool execution failed: ${(err as Error).message}` } };
    }
  }

  private async executeSearch(tenantId: number, args: any, settings?: TenantSettings, keyScope?: ApiKeyScope | null) {
    const dto = {
      locationId: args.locationId,
      propertyTypeId: args.propertyTypeId,
      listingType: args.listingType,
      minPrice: args.minPrice,
      maxPrice: args.maxPrice,
      minBedrooms: args.minBedrooms,
      maxBedrooms: args.maxBedrooms,
      minBathrooms: args.minBathrooms,
      maxBathrooms: args.maxBathrooms,
      minBuildSize: args.minBuildSize,
      maxBuildSize: args.maxBuildSize,
      minPlotSize: args.minPlotSize,
      maxPlotSize: args.maxPlotSize,
      features: args.features,
      isFeatured: args.isFeatured,
      sortBy: args.sortBy,
      page: args.page || 1,
      limit: Math.min(args.limit || 10, 20),
      // The website's own limits (Settings -> Widget), as in the widget's search.
      siteListingTypes: siteListingTypes(settings) ?? undefined,
      siteMinPrices: siteMinPrices(settings) ?? undefined,
      keyScope: keyScope ?? undefined,
    };
    const result = await this.searchService.search(tenantId, dto);
    return {
      properties: result.data.map((p) => this.summarizeProperty(p)),
      total: result.meta.total,
      page: result.meta.page,
      pages: result.meta.pages,
    };
  }

  // Only listings that are live on the website; the chat is public.
  // And, on a website key, only what that site shows.
  private async findLive(tenantId: number, reference: unknown, keyScope?: ApiKeyScope | null) {
    if (typeof reference !== 'string' || !reference.trim()) return null;
    const property = await this.propertyService.findByReference(tenantId, reference.trim());
    if (!property || property.status !== 'active' || !property.isPublished) return null;
    return (await this.searchService.isInKeyScope(tenantId, property.id, keyScope)) ? property : null;
  }

  private async executeGetProperty(tenantId: number, args: { reference: string }, keyScope?: ApiKeyScope | null) {
    const property = await this.findLive(tenantId, args.reference, keyScope);
    if (!property) return { error: 'Property not found' };
    return this.detailProperty(property);
  }

  private async executeGetLocations(tenantId: number, args: { level?: string; search?: string }) {
    const locations = await this.locationService.findAll(tenantId, args.level as any);
    const needle = typeof args.search === 'string' ? fold(args.search.trim()) : '';
    const matches = needle
      ? locations.filter((l) => Object.values(l.name || {}).some((n) => typeof n === 'string' && fold(n).includes(needle)))
      : locations;
    return {
      total: matches.length,
      // Capped: a feed can bring thousands of places.
      locations: matches.slice(0, MAX_LOCATIONS).map((l) => ({
        id: l.id,
        name: l.name?.en || Object.values(l.name || {})[0] || '',
        level: l.level,
        parentId: l.parentId,
      })),
    };
  }

  private async executeGetFeatures(tenantId: number, args: { category?: string }) {
    const features = await this.featureService.findAll(tenantId, args.category as any);
    return features.map((f) => ({
      id: f.id,
      name: f.name?.en || Object.values(f.name)[0] || '',
      category: f.category,
    }));
  }

  private async executeCompare(tenantId: number, args: { references: string[] }, keyScope?: ApiKeyScope | null) {
    const refs = Array.isArray(args.references) ? args.references.slice(0, 4) : [];
    const properties = await Promise.all(refs.map((ref) => this.findLive(tenantId, ref, keyScope)));
    return properties
      .filter((p) => p !== null)
      .map((p) => this.detailProperty(p!));
  }

  private summarizeProperty(p: any) {
    return {
      id: p.id,
      reference: p.reference,
      slug: p.slug || null,
      title: p.title?.en || (typeof p.title === 'string' ? p.title : Object.values(p.title || {})[0]) || '',
      listingType: p.listingType,
      price: p.price,
      priceOnRequest: p.priceOnRequest,
      currency: p.currency,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      buildSize: p.buildSize,
      plotSize: p.plotSize,
      location: p.location?.name?.en || '',
      propertyType: p.propertyType?.name?.en || '',
      image: p.images?.[0]?.url || null,
      isFeatured: p.isFeatured,
    };
  }

  private detailProperty(p: any) {
    return {
      ...this.summarizeProperty(p),
      description: p.description?.en || (typeof p.description === 'string' ? p.description : Object.values(p.description || {})[0]) || '',
      terraceSize: p.terraceSize,
      gardenSize: p.gardenSize,
      solariumSize: p.solariumSize,
      floor: p.floor,
      builtYear: p.builtYear,
      energyConsumption: p.energyConsumption,
      distanceToBeach: p.distanceToBeach,
      communityFees: p.communityFees,
      basuraTax: p.basuraTax,
      ibiFees: p.ibiFees,
      features: p.features,
      lat: p.lat,
      lng: p.lng,
      videoUrl: p.videoUrl,
      virtualTourUrl: p.virtualTourUrl,
      images: (p.images || []).slice(0, 5).map((img: any) => img.url),
    };
  }
}
