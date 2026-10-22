import { buildOdooSample } from '../../../../../test/fixtures/make-odoo-sample';
import { cellText, parseOdooRows, readOdooSheet, splitMulti } from './odoo-parse';

describe('Odoo export parser', () => {
  let sheet: Awaited<ReturnType<typeof readOdooSheet>>;
  beforeAll(async () => {
    sheet = await readOdooSheet(await buildOdooSample());
  });

  it('reads one buyer per ID row', () => {
    expect(sheet.buyers.map((b) => b.id)).toEqual([
      '__export__.res_partner_101_a1b2', '__export__.res_partner_102_c3d4', '__export__.res_partner_103_e5f6',
    ]);
    expect(sheet.unknownHeaders).toEqual([]);
    expect(sheet.missingColumns).toEqual([]);
  });

  it('attaches sub-rows (empty ID) to the buyer above as suggestions', () => {
    const emma = sheet.buyers[0];
    expect(emma.suggestions.map((s) => s.reference)).toEqual(['LT-1', 'BM-2', 'R999999']);
    expect(emma.suggestions[0]).toMatchObject({ status: 'Sent', visitDate: '2026-11-04', note: 'Liked the garden' });
    const lisa = sheet.buyers[2];
    expect(lisa.suggestions.map((s) => s.agentReference ?? s.reference)).toEqual(['NO-SUCH-AGENT-REF', 'LT-3']);
  });

  it('splits multi-value cells and adds sub-row values to them', () => {
    const emma = sheet.buyers[0];
    expect(emma.multi.towns).toEqual(['Marbella', 'Nueva Andalucía', 'Benahavís Hills']);
    expect(emma.multi.relatedAgents).toEqual(['Test Client', 'Maria Odoo']);
    expect(sheet.buyers[2].multi.towns).toEqual(['estepona', 'Marbella']);
  });

  it('turns cell types into text: numbers, dates, multi-line notes', () => {
    const emma = sheet.buyers[0].values;
    expect(emma.budgetMin).toBe('400000');
    expect(emma.referralPercent).toBe('2.5');
    expect(emma.visitStart).toBe('2026-11-03');
    expect(emma.notes).toBe('Wants south facing.\nNo ground floor.');
    expect(emma.email).toBe('Odoo.Update@test.local');
    expect(sheet.buyers[1].values.email).toBeUndefined();
  });

  it('handles rich text, hyperlinks and formulas', () => {
    expect(cellText({ richText: [{ text: 'Mar' }, { text: 'bella' }] })).toBe('Marbella');
    expect(cellText({ text: 'a@b.c', hyperlink: 'mailto:a@b.c' })).toBe('a@b.c');
    expect(cellText({ formula: 'A1', result: 7 })).toBe('7');
    expect(cellText({ error: '#N/A' })).toBe('');
    expect(splitMulti('a, b;c\nb')).toEqual(['a', 'b', 'c']);
  });

  it('finds the header below a title row, lists unknown headers, needs an ID column', () => {
    const parsed = parseOdooRows([['Buyers export'], ['ID', 'Email', 'Shoe size'], ['x1', 'a@b.c', '42']]);
    expect(parsed.buyers[0]).toMatchObject({ id: 'x1', values: { email: 'a@b.c' } });
    expect(parsed.unknownHeaders).toEqual(['shoe size']);
    expect(() => parseOdooRows([['Email'], ['a@b.c']])).toThrow(/ID column/);
    expect(() => parseOdooRows([['nothing']])).toThrow(/header/);
  });
});
