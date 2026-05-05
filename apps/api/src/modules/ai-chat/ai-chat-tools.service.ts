import { Injectable, Logger } from '@nestjs/common';
import { PropertySearchService } from '../property/property-search.service';
import { PropertyService } from '../property/property.service';
import { LocationService } from '../location/location.service';
import { FeatureService } from '../feature/feature.service';
import { ToolDefinition, ToolCall } from '../ai/ai.service';
import { TenantSettings } from '@spm/shared';

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
        sortBy: { type: 'string', enum: ['create_date_desc', 'create_date', 'write_date_desc', 'write_date', 'list_price', 'list_price_desc', 'is_featured_desc', 'location_id'] },
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
    description: 'Get available locations. Use this to find a location ID when the user mentions a place name.',
    parameters: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['country', 'province', 'municipality', 'town', 'area'], description: 'Filter by location level' },
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
          return { name, result: await this.executeSearch(tenantId, args) };
        case 'get_property':
          return { name, result: await this.executeGetProperty(tenantId, args) };
        case 'get_locations':
          return { name, result: await this.executeGetLocations(tenantId, args) };
        case 'get_features':
          return { name, result: await this.executeGetFeatures(tenantId, args) };
        case 'compare_properties':
          return { name, result: await this.executeCompare(tenantId, args) };
        default:
          return { name, result: { error: `Unknown tool: ${name}` } };
      }
    } catch (err) {
      this.logger.warn(`Tool ${name} failed: ${(err as Error).message}`);
      return { name, result: { error: `Tool execution failed: ${(err as Error).message}` } };
    }
  }

  private async executeSearch(tenantId: number, args: any) {
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
    };
    const result = await this.searchService.search(tenantId, dto);
    return {
      properties: result.data.map((p) => this.summarizeProperty(p)),
      total: result.meta.total,
      page: result.meta.page,
      pages: result.meta.pages,
    };
  }

  private async executeGetProperty(tenantId: number, args: { reference: string }) {
    const property = await this.propertyService.findByReference(tenantId, args.reference);
    if (!property) return { error: 'Property not found' };
    return this.detailProperty(property);
  }

  private async executeGetLocations(tenantId: number, args: { level?: string }) {
    const locations = await this.locationService.findAll(tenantId, args.level as any);
    return locations.map((l) => ({
      id: l.id,
      name: l.name?.en || Object.values(l.name)[0] || '',
      level: l.level,
      parentId: l.parentId,
    }));
  }

  private async executeGetFeatures(tenantId: number, args: { category?: string }) {
    const features = await this.featureService.findAll(tenantId, args.category as any);
    return features.map((f) => ({
      id: f.id,
      name: f.name?.en || Object.values(f.name)[0] || '',
      category: f.category,
    }));
  }

  private async executeCompare(tenantId: number, args: { references: string[] }) {
    const properties = await Promise.all(
      args.references.map((ref) => this.propertyService.findByReference(tenantId, ref)),
    );
    return properties
      .filter((p) => p !== null)
      .map((p) => this.detailProperty(p!));
  }

  private summarizeProperty(p: any) {
    return {
      id: p.id,
      reference: p.reference,
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
      status: p.status,
      isPublished: p.isPublished,
    };
  }
}
