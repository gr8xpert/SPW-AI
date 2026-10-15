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

// The listing's agent, sales agent and last editor are dashboard user
// accounts: the public answer sent each whole (login email, role,
// permissions, 2FA and last login). A website only needs the agent's name and
// photo; the contact details shown come from Settings → Website agent.
export function publicPeople(obj: Record<string, unknown>): void {
  const agent = obj.agent as { name?: unknown; avatarUrl?: unknown } | null | undefined;
  if (agent && typeof agent === 'object') {
    obj.agent = {
      name: typeof agent.name === 'string' ? agent.name : '',
      ...(typeof agent.avatarUrl === 'string' && agent.avatarUrl ? { photo: agent.avatarUrl } : {}),
    };
  }
  delete obj.salesAgent;
  delete obj.lastUpdatedByUser;
  delete obj.agentId;
  delete obj.salesAgentId;
  delete obj.lastUpdatedById;
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
    publicPeople(obj);
    return node;
  }
  if (Array.isArray(obj.data)) attach(obj.data, format, depth + 1);
  return node;
}
