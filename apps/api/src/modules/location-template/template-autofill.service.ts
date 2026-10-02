import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, IsNull, Repository } from 'typeorm';
import { LocationTemplateNode } from '../../database/entities';
import { AiEnrichmentService } from '../ai-enrichment/ai-enrichment.service';
import { checkCoords, findOutliers } from './template-coords';
import {
  AiQuestion,
  anchorOf,
  ancestorsOf,
  AutoFillRecord,
  buildFillPrompt,
  cleanPostcode,
  FILL_LEVELS,
  FillNode,
  GeocoderHit,
  hasCoords,
  hasPostcode,
  pickHit,
  pointProblem,
  postcodeProblem,
  provinceOf,
  provincePrefixes,
  queriesFor,
  readFillAnswers,
} from './template-autofill';

// Nominatim's conditions of use: one request a second, a User-Agent naming the
// caller (same as LocationGeocodeService).
const RATE_LIMIT_MS = 1100;
const USER_AGENT = 'SmartPropertyManager/1.0 (+https://spw-ai.com)';
const NOMINATIM = 'https://nominatim.openstreetmap.org';

// One call from Super Admin works this long, then hands back progress; the page
// calls again until nothing is left. Keeps each request under proxy timeouts.
const TIME_BUDGET_MS = 35_000;
const AI_BATCH = 25;

export interface FillProgress {
  checked: number;
  coordsFilled: number;
  postcodesFilled: number;
  byAi: number;
  notFound: number;
  aiFailed: boolean;
  remaining: number;
}

/**
 * "Fill missing coordinates & postcodes" on the location template: map
 * geocoder first, AI for what it can't find, every value checked against the
 * place's parent before it is kept. See template-autofill.ts.
 */
@Injectable()
export class TemplateAutoFillService {
  private readonly logger = new Logger(TemplateAutoFillService.name);
  private running = false;
  private lastRequest = 0;

  constructor(
    @InjectRepository(LocationTemplateNode)
    private readonly nodeRepository: Repository<LocationTemplateNode>,
    private readonly ai: AiEnrichmentService,
  ) {}

  /** Places still missing a point or postcode that the fill hasn't tried. */
  private todo(nodes: LocationTemplateNode[]): LocationTemplateNode[] {
    return nodes.filter(
      (n) => FILL_LEVELS.includes(n.level) && !n.autoFill?.tried && (!hasCoords(n) || !hasPostcode(n)),
    );
  }

  async status(): Promise<{ remaining: number; filled: number; notFound: number }> {
    const nodes = await this.nodeRepository.find();
    return {
      remaining: this.todo(nodes).length,
      filled: nodes.filter((n) => n.autoFill?.coordsSource || n.autoFill?.postcodeSource).length,
      notFound: nodes.filter((n) => n.autoFill?.problem).length,
    };
  }

  /**
   * Work through the next places for up to TIME_BUDGET_MS. `retry` first
   * clears the "tried" mark on places nothing could be found for, so they are
   * asked again.
   */
  async fillNext(retry = false): Promise<FillProgress> {
    if (this.running) throw new ConflictException('A fill is already running');
    this.running = true;
    try {
      if (retry) await this.clearFailed();
      return await this.run();
    } finally {
      this.running = false;
    }
  }

  private async run(): Promise<FillProgress> {
    const started = Date.now();
    const nodes = await this.nodeRepository.find();
    const byId = new Map<number, FillNode>(nodes.map((n) => [n.id, n]));
    const prefixes = provincePrefixes(nodes, byId);
    const prefixFor = (n: FillNode) => {
      const p = provinceOf(n, byId);
      return p ? prefixes.get(p.id) ?? null : null;
    };
    const queue = this.todo(nodes);
    const out: FillProgress = { checked: 0, coordsFilled: 0, postcodesFilled: 0, byAi: 0, notFound: 0, aiFailed: false, remaining: 0 };
    const changed = new Map<number, LocationTemplateNode>();
    const forAi: AiQuestion[] = [];

    for (const node of queue) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      out.checked++;
      const record: AutoFillRecord = { ...(node.autoFill || {}), tried: true, at: new Date().toISOString() };
      const problems: string[] = [];

      if (!hasCoords(node)) {
        const anchor = anchorOf(node, byId);
        let found = false;
        for (const q of queriesFor(node, byId)) {
          const hits = await this.search(q);
          if (hits === null) break; // geocoder down: leave it to the AI
          const pick = pickHit(hits, anchor);
          if ('problem' in pick) {
            problems[0] = pick.problem;
            continue;
          }
          node.lat = pick.lat;
          node.lng = pick.lng;
          node.coordsIssue = null;
          node.coordsConfirmed = false;
          Object.assign(record, { lat: pick.lat, lng: pick.lng, coordsSource: 'map' as const });
          out.coordsFilled++;
          if (!hasPostcode(node) && pick.postcode && !postcodeProblem(pick.postcode, prefixFor(node))) {
            node.postcode = pick.postcode;
            Object.assign(record, { postcode: pick.postcode, postcodeSource: 'map' as const });
            out.postcodesFilled++;
          }
          found = true;
          break;
        }
        if (found) problems.length = 0;
      }

      // A point but no postcode: ask the map what postcode that point is in.
      if (hasCoords(node) && !hasPostcode(node)) {
        const postcode = await this.reversePostcode(Number(node.lat), Number(node.lng));
        const bad = postcode ? postcodeProblem(postcode, prefixFor(node)) : 'no postcode on the map';
        if (postcode && !bad) {
          node.postcode = postcode;
          Object.assign(record, { postcode, postcodeSource: 'map' as const });
          out.postcodesFilled++;
        } else if (bad) {
          problems.push(bad);
        }
      }

      node.autoFill = record;
      changed.set(node.id, node);
      if (!hasCoords(node) || !hasPostcode(node)) {
        forAi.push({
          node,
          path: ancestorsOf(node, byId).reverse().map((a) => a.name).concat(node.name).join(' > '),
          needCoords: !hasCoords(node),
          needPostcode: !hasPostcode(node),
        });
        record.problem = problems.join('; ') || undefined;
      } else {
        delete record.problem;
      }
    }

    for (let i = 0; i < forAi.length; i += AI_BATCH) {
      const batch = forAi.slice(i, i + AI_BATCH);
      const answer = await this.ai.completeJson(0, buildFillPrompt(batch));
      if (!answer) {
        out.aiFailed = true;
        continue;
      }
      const answers = readFillAnswers(batch, answer);
      for (const q of batch) {
        const a = answers.get(q.node.id);
        const node = q.node as LocationTemplateNode;
        const record = node.autoFill!;
        const problems: string[] = [];
        let used = false;
        if (q.needCoords) {
          if (a?.lat != null && a.lng != null) {
            const bad = pointProblem(a.lat, a.lng, anchorOf(node, byId));
            if (bad) problems.push(`AI point refused: ${bad}`);
            else {
              const c = checkCoords(a.lat, a.lng) as { ok: true; lat: number; lng: number };
              node.lat = c.lat;
              node.lng = c.lng;
              node.coordsIssue = null;
              node.coordsConfirmed = false;
              Object.assign(record, { lat: c.lat, lng: c.lng, coordsSource: 'ai' as const });
              out.coordsFilled++;
              used = true;
            }
          } else problems.push('point not found by map or AI');
        }
        if (q.needPostcode) {
          const postcode = cleanPostcode(a?.postcode);
          const bad = postcode ? postcodeProblem(postcode, prefixFor(node)) : 'postcode not found by map or AI';
          if (postcode && !bad) {
            node.postcode = postcode;
            Object.assign(record, { postcode, postcodeSource: 'ai' as const });
            out.postcodesFilled++;
            used = true;
          } else if (bad) problems.push(postcode ? `AI ${bad}` : bad);
        }
        if (used) out.byAi++;
        if (problems.length) record.problem = problems.join('; ').slice(0, 300);
        else delete record.problem;
      }
    }

    // A filled point far from the other places of its municipality is wrong
    // even if it passed the parent check: take it back off.
    const filledNow = new Set([...changed.values()].filter((n) => n.autoFill?.coordsSource && hasCoords(n)).map((n) => n.id));
    for (const o of findOutliers(nodes)) {
      if (!filledNow.has(o.id)) continue;
      const n = changed.get(o.id)!;
      const r = n.autoFill!;
      n.lat = null;
      n.lng = null;
      n.coordsIssue = `Refused ${o.problem}`.slice(0, 300);
      r.problem = `${r.coordsSource === 'ai' ? 'AI' : 'map'} point refused: ${o.problem}`.slice(0, 300);
      delete r.lat;
      delete r.lng;
      delete r.coordsSource;
      out.coordsFilled--;
    }

    for (const n of changed.values()) {
      if (n.autoFill?.problem) out.notFound++;
      await this.nodeRepository.update(
        { id: n.id },
        {
          lat: n.lat,
          lng: n.lng,
          postcode: n.postcode,
          coordsIssue: n.coordsIssue,
          coordsConfirmed: n.coordsConfirmed,
          autoFill: n.autoFill as any,
        },
      );
    }
    out.remaining = this.todo(nodes).length;
    this.logger.log(
      `Auto-fill: ${out.checked} checked, ${out.coordsFilled} points, ${out.postcodesFilled} postcodes (${out.byAi} by AI), ${out.remaining} left`,
    );
    return out;
  }

  /**
   * Undo: clear every value the fill put in that is still the same (a value a
   * person has since changed is theirs and stays), and forget what was tried.
   */
  async undoAll(): Promise<{ places: number; coords: number; postcodes: number }> {
    if (this.running) throw new ConflictException('A fill is running — wait for it to finish');
    const nodes = await this.nodeRepository.find({ where: { autoFill: Not(IsNull()) } });
    let coords = 0;
    let postcodes = 0;
    for (const n of nodes) {
      const r = n.autoFill!;
      const patch: Partial<LocationTemplateNode> = { autoFill: null };
      if (r.coordsSource && sameNumber(n.lat, r.lat) && sameNumber(n.lng, r.lng) && !n.coordsConfirmed) {
        patch.lat = null;
        patch.lng = null;
        coords++;
      }
      if (r.postcodeSource && n.postcode === r.postcode) {
        patch.postcode = null;
        postcodes++;
      }
      await this.nodeRepository.update({ id: n.id }, patch as any);
    }
    return { places: nodes.length, coords, postcodes };
  }

  private async clearFailed(): Promise<void> {
    const nodes = await this.nodeRepository.find({ where: { autoFill: Not(IsNull()) } });
    for (const n of nodes) {
      if (!n.autoFill?.problem) continue;
      const { tried: _t, problem: _p, ...rest } = n.autoFill;
      const keep = rest.coordsSource || rest.postcodeSource ? (rest as AutoFillRecord) : null;
      // Keep what was filled (for undo) but drop the "tried" mark.
      await this.nodeRepository.update({ id: n.id }, { autoFill: keep ? ({ ...keep, tried: undefined } as any) : null });
    }
  }

  private async throttle(): Promise<void> {
    const wait = RATE_LIMIT_MS - (Date.now() - this.lastRequest);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequest = Date.now();
  }

  /** Null when the geocoder couldn't be reached (as opposed to found nothing). */
  private async search(query: string): Promise<GeocoderHit[] | null> {
    await this.throttle();
    try {
      const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&countrycodes=es&limit=5&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
      if (!res.ok) {
        this.logger.warn(`Geocoder answered ${res.status} for "${query}"`);
        return null;
      }
      const body = await res.json();
      return Array.isArray(body) ? (body as GeocoderHit[]) : [];
    } catch (err) {
      this.logger.warn(`Geocoding "${query}" failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async reversePostcode(lat: number, lng: number): Promise<string | null> {
    await this.throttle();
    try {
      const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=16&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
      if (!res.ok) return null;
      const body = (await res.json()) as GeocoderHit;
      return cleanPostcode(body?.address?.postcode);
    } catch (err) {
      this.logger.warn(`Reverse geocoding ${lat},${lng} failed: ${(err as Error).message}`);
      return null;
    }
  }
}

const sameNumber = (a: unknown, b: unknown) => a != null && b != null && Number(a).toFixed(6) === Number(b).toFixed(6);
