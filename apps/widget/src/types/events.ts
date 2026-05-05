import type { Property, SearchResults } from './property';
import type { SearchFilters } from './search';

export interface SPMEvents {
  'ready': void;
  'search': { filters: SearchFilters; results: SearchResults };
  'property:click': { property: Property };
  'property:view': { property: Property };
  'inquiry:submit': { propertyReference: string; data: InquiryData };
  'inquiry:success': { propertyReference: string };
  'inquiry:error': { propertyReference: string; error: string };
  'favorite:add': { propertyId: number };
  'favorite:remove': { propertyId: number };
  'sync:changed': { oldVersion: number; newVersion: number };
  'error': { message: string; code?: string };
  'chat:open': void;
  'chat:close': void;
  'chat:message': { role: string; content: string };
  'map:bounds': { bounds: string };
  'map:radius': { lat: number; lng: number; radius: number };
}

export interface InquiryData {
  propertyId?: number;
  propertyReference?: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  preferredContact?: 'email' | 'phone';
}

export interface TrackingEvent {
  type: 'view' | 'search' | 'inquiry' | 'favorite' | 'pdf';
  propertyId?: number;
  sessionId: string;
  filters?: SearchFilters;
  referrer?: string;
  timestamp: number;
}
