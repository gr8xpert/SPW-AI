import { cleanProposal, proposalChanges, type ProposalLists } from './ai-proposal';

const lists: ProposalLists = {
  featureIds: new Set([1, 3, 12]),
  typeIds: new Set([1, 2]),
  places: [
    { id: 10, name: { en: 'Marbella' }, level: 'town' },
    { id: 11, name: { en: 'The Golden Mile' }, level: 'urbanization' },
  ],
};

describe('cleanProposal', () => {
  it('keeps valid wishlist fields, resolves places and reads amounts', () => {
    const p = cleanProposal(
      {
        wishlist: {
          listingTypes: ['sale', 'castle'],
          places: ['Golden Mile', 'Atlantis'],
          propertyTypeIds: [2, 77],
          featureIds: [1, '3', 999],
          minBedrooms: '2',
          budgetMax: '400k',
          budgetMin: 0,
          currency: 'eur',
          minBuildSize: 90,
        },
        rules: [{ kind: 'floor', mode: 'avoid', value: 'ground', text: 'no ground floor' }],
        note: '  Called Joaquin.  ',
      },
      lists,
    );
    expect(p.wishlist).toEqual({
      listingTypes: ['sale'],
      locationIds: [11],
      propertyTypeIds: [2],
      featureIds: [1, 3],
      minBedrooms: 2,
      budgetMax: 400000,
      currency: 'EUR',
      minBuildSize: 90,
    });
    expect(p.places).toEqual([
      { name: 'Golden Mile', id: 11, label: 'The Golden Mile' },
      { name: 'Atlantis', id: null, label: null },
    ]);
    expect(p.rules.map((r) => r.id)).toEqual(['floor:avoid:ground']);
    expect(p.note).toBe('Called Joaquin.');
  });

  it('understands 1.5m, 450.000 and swaps a reversed range', () => {
    const p = cleanProposal({ wishlist: { budgetMin: '1.5m', budgetMax: '450.000' } }, lists);
    expect(p.wishlist).toEqual({ budgetMin: 450000, budgetMax: 1500000 });
  });

  it('caps silly numbers', () => {
    const p = cleanProposal({ wishlist: { minBedrooms: 400, minBathrooms: 3, budgetMax: 1e13, maxPlotSize: 50000 } }, lists);
    expect(p.wishlist).toEqual({ minBathrooms: 3, maxPlotSize: 50000 });
  });

  it('survives junk', () => {
    expect(cleanProposal(null, lists)).toEqual({ wishlist: {}, places: [], rules: [] });
    expect(cleanProposal({ wishlist: 'x', rules: 'y', note: 5 }, lists)).toEqual({ wishlist: {}, places: [], rules: [] });
  });

  it('keeps a transcript and a note, clipped', () => {
    const p = cleanProposal({ transcript: 'a'.repeat(5000), note: 'b'.repeat(3000) }, lists);
    expect(p.transcript).toHaveLength(3000);
    expect(p.note).toHaveLength(2000);
  });
});

describe('proposalChanges', () => {
  it('adds to lists, replaces numbers, skips what is already there', () => {
    const current = { locationIds: [10], featureIds: [1], minBedrooms: 3, budgetMax: 500000 };
    const changes = proposalChanges(current, { locationIds: [11, 10], featureIds: [1], minBedrooms: 2, budgetMax: 500000, listingTypes: ['sale'] });
    expect(changes).toEqual([
      { field: 'listingTypes', from: null, to: ['sale'] },
      { field: 'locationIds', from: [10], to: [10, 11] },
      { field: 'minBedrooms', from: 3, to: 2 },
    ]);
  });

  it('replaces the lists of a wishlist guessed from an enquiry', () => {
    const changes = proposalChanges({ locationIds: [10], propertyTypeIds: [1], guessed: true }, { locationIds: [11] });
    expect(changes).toEqual([{ field: 'locationIds', from: [10], to: [11] }]);
  });

  it('nothing to change for an empty proposal or no wishlist yet', () => {
    expect(proposalChanges({ minBedrooms: 2 }, {})).toEqual([]);
    expect(proposalChanges(null, { minBedrooms: 2, currency: 'EUR' })).toEqual([
      { field: 'minBedrooms', from: null, to: 2 },
      { field: 'currency', from: null, to: 'EUR' },
    ]);
  });
});
