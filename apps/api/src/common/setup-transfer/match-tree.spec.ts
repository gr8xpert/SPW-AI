import { matchTree, TransferAccountNode, TransferFileNode } from './match-tree';

const f = (ref: number, parentRef: number | null, key: string, extra: Partial<TransferFileNode> = {}): TransferFileNode => ({
  ref,
  parentRef,
  templateIds: [],
  places: [{ parentRef, key }],
  ...extra,
});
const a = (id: number, parentId: number | null, keys: string[], extra: Partial<TransferAccountNode> = {}): TransferAccountNode => ({
  id,
  parentId,
  templateIds: [],
  keys,
  ...extra,
});

describe('matchTree', () => {
  it('matches by template link wherever the row sits', () => {
    const file = [f(1, null, 'costa del sol'), f(2, 1, 'marbella east', { templateIds: [77] })];
    const account = [a(10, null, ['malaga']), a(11, 10, ['marbella este'], { templateIds: [77] })];
    expect(matchTree(file, account).refFor.get(11)).toBe(2);
    expect(matchTree(file, account).refFor.has(10)).toBe(false);
  });

  it('never matches rows only one account has', () => {
    const file = [f(1, null, 'my custom group')];
    const account = [a(10, null, ['malaga'])];
    expect(matchTree(file, account).refFor.size).toBe(0);
  });

  it('tells same-named places apart by their parent', () => {
    const file = [f(1, null, 'marbella'), f(2, null, 'mijas'), f(3, 1, 'la cala'), f(4, 2, 'la cala')];
    const account = [a(10, null, ['mijas']), a(11, 10, ['la cala']), a(12, null, ['marbella']), a(13, 12, ['la cala'])];
    const { refFor } = matchTree(file, account);
    expect(refFor.get(11)).toBe(4);
    expect(refFor.get(13)).toBe(3);
  });

  it('finds a place client 1 moved and renamed through its feed origin', () => {
    // Client 1 moved "san pedro" from Marbella into its own group and renamed it.
    const file = [
      f(1, null, 'marbella'),
      f(2, null, 'west'),
      { ref: 3, parentRef: 2, templateIds: [], places: [{ parentRef: 2, key: 'san pedro de alcantara' }, { parentRef: 1, key: 'san pedro' }] },
    ];
    const account = [a(10, null, ['marbella']), a(11, 10, ['san pedro'])];
    expect(matchTree(file, account).refFor.get(11)).toBe(3);
  });

  it('does not match by name across different template places', () => {
    const file = [f(1, null, 'la cala', { templateIds: [5] })];
    const account = [a(10, null, ['la cala'], { templateIds: [6] })];
    expect(matchTree(file, account).refFor.size).toBe(0);
  });

  it('skips a row with two equally good candidates', () => {
    const file = [f(1, null, 'a'), f(2, null, 'b'), f(3, 1, 'x'), f(4, 2, 'x')];
    const account = [a(10, null, ['other']), a(11, 10, ['x'])];
    const { refFor, ambiguous } = matchTree(file, account);
    expect(refFor.has(11)).toBe(false);
    expect(ambiguous).toBe(1);
  });
});
