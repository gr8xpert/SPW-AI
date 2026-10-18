import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { pickLang } from '../../common/i18n/resolve-name.interceptor';
import { PropertyTitleService } from './property-title.service';
import { patternSetFor, type TitlePatterns } from './title-pattern';
import type { PropertyUrlRequest } from './property-url.interceptor';

export interface PropertyTitleRequest extends PropertyUrlRequest {
  spwTenantId?: number;
  // Settings → Widget → Listing titles, cleaned; null = off.
  spwTitlePatterns?: TitlePatterns | null;
  // The property page uses its own patterns; every other route shows cards.
  spwTitleKind?: 'card' | 'detail';
}

// Swaps each listing's title for the one built from the client's patterns.
// Must run AFTER PropertyUrlInterceptor (list it first in @UseInterceptors,
// so its map runs last): the URL keeps the listing's own title, so turning
// patterns on or editing them never moves a property page.
@Injectable()
export class PropertyTitleInterceptor implements NestInterceptor {
  constructor(private readonly titles: PropertyTitleService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<PropertyTitleRequest>();
    return next.handle().pipe(mergeMap((body) => from(this.apply(body, req))));
  }

  private async apply(body: unknown, req: PropertyTitleRequest): Promise<unknown> {
    const patterns = req.spwTitlePatterns;
    if (!body || !patterns?.enabled || !req.spwTenantId) return body;
    const listings: Record<string, unknown>[] = [];
    collect(body, listings, 0);
    const set = patternSetFor(patterns, req.spwTitleKind ?? 'card');
    await this.titles.apply(listings, req.spwTenantId, set, pickLang(req));
    return body;
  }
}

// Same shape test as PropertyUrlInterceptor: a listing has a reference and a
// (resolved) title; search pages carry them under `data`.
function collect(node: unknown, out: Record<string, unknown>[], depth: number): void {
  if (!node || typeof node !== 'object' || depth > 3) return;
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.reference === 'string' && (obj.title === undefined || typeof obj.title === 'string')) {
    out.push(obj);
    return;
  }
  if (Array.isArray(obj.data)) collect(obj.data, out, depth + 1);
}
