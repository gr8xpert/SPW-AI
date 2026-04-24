import { Injectable } from '@nestjs/common';
import { LocationService } from '../location/location.service';
import { FeatureService } from '../feature/feature.service';
import { PropertyTypeService } from '../property-type/property-type.service';
import { TenantService } from '../tenant/tenant.service';
import { ChatContext } from './interfaces/chat-tool.interface';
import { TenantSettings } from '@spw/shared';

@Injectable()
export class AiChatPromptService {
  constructor(
    private readonly locationService: LocationService,
    private readonly featureService: FeatureService,
    private readonly propertyTypeService: PropertyTypeService,
    private readonly tenantService: TenantService,
  ) {}

  async buildSystemPrompt(
    tenantId: number,
    settings: TenantSettings,
    context?: ChatContext,
  ): Promise<string> {
    const [locations, features, propertyTypes] = await Promise.all([
      this.locationService.findAll(tenantId),
      this.featureService.findAll(tenantId),
      this.propertyTypeService.findAll(tenantId),
    ]);

    const tenant = await this.tenantService.findById(tenantId);
    const companyName = settings.companyName || tenant?.name || 'our company';
    const currency = settings.baseCurrency || 'EUR';
    const defaultLang = settings.defaultLanguage || 'en';

    const locationSummary = locations.map((l) => ({
      id: l.id,
      name: l.name?.en || l.name?.[defaultLang] || Object.values(l.name)[0] || '',
      level: l.level,
    }));

    const featureSummary = features.map((f) => ({
      id: f.id,
      name: f.name?.en || f.name?.[defaultLang] || Object.values(f.name)[0] || '',
      category: f.category,
    }));

    const typeSummary = propertyTypes.map((t) => ({
      id: t.id,
      name: t.name?.en || t.name?.[defaultLang] || Object.values(t.name)[0] || '',
    }));

    const parts: string[] = [];

    parts.push(`You are a property search assistant for ${companyName}.`);
    parts.push('You help website visitors find and learn about available properties.');
    parts.push('');

    parts.push(`PROPERTY TYPES: ${JSON.stringify(typeSummary)}`);
    parts.push(`LOCATIONS: ${JSON.stringify(locationSummary)}`);
    parts.push(`FEATURES: ${JSON.stringify(featureSummary)}`);
    parts.push(`CURRENCY: ${currency}`);
    parts.push('');

    parts.push('RULES:');

    if (settings.aiChatMultilingual !== false) {
      parts.push('1. Always respond in the same language the user writes in.');
    } else {
      parts.push(`1. Always respond in ${defaultLang}.`);
    }

    if (settings.aiChatNLSearch !== false) {
      parts.push('2. When a user describes properties they want, use the search_properties tool with appropriate filters.');
      parts.push('3. When you need to resolve a location name to an ID, use get_locations first.');
      parts.push('4. When you need to resolve a feature name (like "pool") to an ID, use get_features first.');
    }

    if (settings.aiChatPropertyQA !== false) {
      parts.push('5. When a user asks about a specific property\'s details, use get_property with its reference.');
    }

    if (settings.aiChatComparison !== false) {
      parts.push('6. When asked to compare properties, use compare_properties with their references.');
    }

    if (settings.aiChatRecommendations !== false) {
      parts.push('7. When a user says "find similar" or "something like this", use the current property\'s attributes as a starting point for search_properties with adjusted filters.');
    }

    parts.push('8. Never invent property data. Only present what the tools return.');
    parts.push('9. Keep responses concise. Show key facts: price, bedrooms, bathrooms, size, location.');
    parts.push('10. If no results are found, suggest broadening the search criteria.');
    parts.push('11. Format prices with the currency symbol. Use commas for thousands.');
    parts.push('');

    if (context?.propertyReference && settings.aiChatPropertyQA !== false) {
      parts.push(`The user is currently viewing property ${context.propertyReference}. They may ask questions about this property. Use get_property to load its details when needed.`);
      parts.push('');
    }

    if (settings.aiChatWelcomeMessage) {
      parts.push(`When greeting the user for the first time, say: "${settings.aiChatWelcomeMessage}"`);
    }

    return parts.join('\n');
  }
}
