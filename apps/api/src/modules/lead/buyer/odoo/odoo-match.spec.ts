import { buildOdooSample } from '../../../../../test/fixtures/make-odoo-sample';
import { readOdooSheet, type OdooBuyer } from './odoo-parse';
import { importNotes, mapOdooBuyer, NOT_MATCHED_HEADING, OdooMatchers, type MatchLists } from './odoo-match';

const lists: MatchLists = {
  agents: [
    { id: 2, name: 'Test Client', email: 'e2e-client@test.local' },
    { id: 3, name: 'Alex Agent', email: 'agent@test.local' },
  ],
  locations: [
    { id: 1, name: { en: 'Marbella' }, level: 'town' },
    { id: 11, name: { en: 'Marbella' }, level: 'area' },
    { id: 4, name: { en: 'Estepona' }, level: 'town', aliases: ['Estepona Town'] },
    { id: 9, name: { en: 'Nueva Andalucia' }, level: 'urbanization' },
  ],
  types: [{ id: 1, name: { en: 'Villa', es: 'Villa' } }, { id: 2, name: { en: 'Apartment', es: 'Apartamento' } }],
  features: [{ id: 3, name: { en: 'Sea Views', es: 'Vistas al mar' } }, { id: 4, name: { en: 'Private Pool' } }],
  stages: [
    { id: 20, name: { en: 'New lead' }, kind: 'open', sortOrder: 0 },
    { id: 21, name: { en: 'Contacted', es: 'Contactado' }, kind: 'open', sortOrder: 1 },
    { id: 27, name: { en: 'Won' }, kind: 'won', sortOrder: 7 },
  ],
  questions: [
    { qkey: 'purpose', options: [{ key: 'holiday', label: { en: 'Holiday home', es: 'Segunda residencia' } }, { key: 'investment', label: { en: 'Investment' } }] },
    { qkey: 'financial', options: [{ key: 'cash', label: { en: 'Cash buyer' } }] },
    { qkey: 'location_setting', options: [{ key: 'coast', label: { en: 'Coast' } }] },
    { qkey: 'distance_airport', options: [{ key: 'm30', label: { en: 'Up to 30 min' } }] },
    { qkey: 'distance_beach', options: [{ key: 'walk', label: { en: 'Walking distance' } }] },
  ],
};

describe('Odoo matching', () => {
  let buyers: OdooBuyer[];
  const m = new OdooMatchers(lists);
  beforeAll(async () => {
    buyers = (await readOdooSheet(await buildOdooSample())).buyers;
  });

  it('maps a full buyer: contact, role, agents, stage, wishlist, answers, suggestions', () => {
    const e = mapOdooBuyer(buyers[0], m);
    expect(e.email).toBe('odoo.update@test.local');
    expect(e.fields).toMatchObject({
      firstName: 'Emma', lastName: 'Odoo-Update', language: 'nl', country: 'NL', role: 'buyer', priority: 2, subStatus: 'reply_sent',
      idType: 'passport', preferredContact: 'whatsapp', referralPercent: 2.5, visitStart: '2026-11-03', visitEnd: '2026-11-10', waitingReplyAt: '2026-10-15',
    });
    expect(e.agentId).toBe(3);
    expect(e.relatedAgentIds).toEqual([2]);
    expect(e.stageId).toBe(21);
    expect(e.wishlist).toEqual({
      listingTypes: ['sale'], locationIds: [1, 9], propertyTypeIds: [1], featureIds: [3, 4], minBedrooms: 3, minBathrooms: 2,
      budgetMin: 400000, budgetMax: 900000, minBuildSize: 200, minPlotSize: 800, sendMatchesTo: 'both', guessed: false,
    });
    expect(e.answers).toEqual({ purpose: ['holiday'], financial: ['cash'], location_setting: ['coast'], distance_airport: ['m30'], distance_beach: ['walk'] });
    expect(e.suggestions.map((s) => [s.reference, s.status])).toEqual([['LT-1', 'sent'], ['BM-2', 'interested'], ['R999999', 'sent']]);
    expect(e.createdAt?.toISOString().slice(0, 10)).toBe('2025-03-14');
  });

  it('collects every unmatched value once, with its column', () => {
    const e = mapOdooBuyer(buyers[0], m);
    expect(e.unmatched.map((u) => `${u.kind}:${u.value}`).sort()).toEqual(
      ['agent:Maria Odoo', 'feature:Front line golf', 'town:Benahavís Hills', 'type:Finca'].sort(),
    );
    expect(e.notMatched).toEqual(expect.arrayContaining(['Towns: Benahavís Hills', 'Property Type: Finca', 'Related Sale Agents: Maria Odoo']));
  });

  it('applies the mapping (and skip keeps a value unmatched)', () => {
    const e = mapOdooBuyer(buyers[0], m, { town: { 'benahavis hills': 4 }, type: { finca: 'skip' }, agent: { 'maria odoo': '2' } });
    expect(e.wishlist?.locationIds).toEqual([1, 9, 4]);
    expect(e.wishlist?.propertyTypeIds).toEqual([1]);
    expect(e.unmatched.map((u) => u.kind).sort()).toEqual(['feature', 'type']);
    // a mapping to an id that doesn't exist is ignored
    expect(mapOdooBuyer(buyers[0], m, { town: { 'benahavis hills': 999 } }).wishlist?.locationIds).toEqual([1, 9]);
  });

  it('a buyer without email, unknown agent / status, long term rent', () => {
    const j = mapOdooBuyer(buyers[1], m);
    expect(j.email).toBeNull();
    expect(j.fields).toMatchObject({ role: 'seller', priority: 0, language: 'es', country: 'ES' });
    expect(j.agentId).toBeNull();
    expect(j.stageId).toBeNull();
    expect(j.wishlist).toEqual({ listingTypes: ['rent'], locationIds: [4], guessed: false });
    expect(j.unmatched.map((u) => `${u.kind}:${u.value}`)).toEqual(['agent:Maria Odoo', 'stage:Hot lead']);
  });

  it('agent by email, Won by stage kind, resale = sale, sub-row towns, lower-case names', () => {
    const l = mapOdooBuyer(buyers[2], m);
    expect(l.agentId).toBe(3);
    expect(l.stageId).toBe(27);
    expect(l.fields).toMatchObject({ role: 'estate_agent', priority: 3, preferredContact: 'email' });
    expect(l.wishlist).toMatchObject({ listingTypes: ['sale'], locationIds: [4, 1], propertyTypeIds: [2], minBedrooms: 2, sendMatchesTo: 'agent' });
    expect(l.answers).toEqual({ purpose: ['investment'] });
    expect(l.suggestions.map((s) => s.status)).toEqual(['visited', 'not_interested']);
  });

  it('matches names in any language and aliases, and prefers the town level', () => {
    expect(m.match('type', 'apartamento')).toBe(2);
    expect(m.match('feature', 'Vistas al Mar')).toBe(3);
    expect(m.match('town', 'ESTEPONA TOWN')).toBe(4);
    expect(m.match('town', 'marbella')).toBe(1);
    expect(m.match('option:purpose', 'segunda residencia')).toBe('holiday');
    expect(m.match('stage', 'contactado')).toBe(21);
    expect(m.match('stage', 'New')).toBe(20);
  });

  it('notes: the Odoo part sits between markers; a re-import replaces only that part', () => {
    const mapped = { odooNotes: 'Wants sea views.', notMatched: ['Towns: X'] };
    const block = `[From Odoo]\nWants sea views.\n\n${NOT_MATCHED_HEADING}\n- Towns: X\n[/From Odoo]`;
    expect(importNotes(null, mapped)).toBe(block);
    expect(importNotes('Agent note', mapped)).toBe(`Agent note\n\n${block}`);
    expect(importNotes(`Agent note\n\n${block}`, mapped)).toBe(`Agent note\n\n${block}`);
    // the agent wrote below it; Odoo's notes changed since
    const later = importNotes(`Agent note\n\n${block}\n\nCalled 21/10`, { odooNotes: 'Now: sea or golf.', notMatched: [] });
    expect(later).toBe('Agent note\n\n[From Odoo]\nNow: sea or golf.\n[/From Odoo]\n\nCalled 21/10');
    expect(importNotes('Agent note', { odooNotes: null, notMatched: [] })).toBe('Agent note');
  });
});
