import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { propertyUrlSegment } from './property-url';
import type { SiteMinPrices } from './site-limits';

// The controller puts the tenant's slug format here once it has resolved the key.
export interface PropertyUrlRequest extends Request {
  spwSlugFormat?: unknown;
  // The client's enabled listing types (null = all).
  spwListingTypes?: string[] | null;
  // The client's "Hide properties below" prices (null = none).
  spwMinPrices?: SiteMinPrices | null;
}

// Adds `urlSegment` to every property in a public response. Must run AFTER
// ResolveNameInterceptor (list it first in @UseInterceptors, so its map runs
// last) — the title has to be a string in the visitor's language by then.
@Injectable()
export class PropertyUrlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<PropertyUrlRequest>();
    return next.handle().pipe(map((body) => attach(body, req.spwSlugFormat, 0)));
  }
}

function attach(node: unknown, format: unknown, depth: number): unknown {
  if (!node || typeof node !== 'object' || depth > 3) return node;
  if (Array.isArray(node)) {
    for (const item of node) attach(item, format, depth + 1);
    return node;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.reference === 'string' && (obj.title === undefined || typeof obj.title === 'string')) {
    obj.urlSegment = propertyUrlSegment(obj as any, format);
    return node;
  }
  if (Array.isArray(obj.data)) attach(obj.data, format, depth + 1);
  return node;
}
