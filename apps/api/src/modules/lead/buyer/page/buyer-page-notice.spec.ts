import { noticeLines, type FeedbackItem } from './buyer-page-notice';

const at = (m: number) => new Date(Date.UTC(2026, 9, 22, 10, m));
const villa = { propertyId: 1, reference: 'LT-1', title: 'Sea view villa' };
const flat = { propertyId: 2, reference: 'LT-2', title: 'Town flat' };

describe('noticeLines', () => {
  it('one line per property, the latest reaction wins', () => {
    const items: FeedbackItem[] = [
      { ...villa, action: 'like', at: at(1) },
      { ...flat, action: 'reject', reason: 'Ground floor', at: at(2) },
      { ...villa, action: 'reject', reason: null, at: at(3) },
    ];
    expect(noticeLines(items)).toEqual(['Not for me: Sea view villa (LT-1)', 'Not for me: Town flat (LT-2) — “Ground floor”']);
  });

  it('a cleared reaction is reported as taken back', () => {
    expect(noticeLines([{ ...villa, action: 'like', at: at(1) }, { ...villa, action: 'clear', at: at(2) }])).toEqual([
      'Took back their reaction: Sea view villa (LT-1)',
    ]);
  });

  it('likes read as liked; nothing in → nothing out', () => {
    expect(noticeLines([{ ...flat, action: 'like', at: at(1) }])).toEqual(['Liked: Town flat (LT-2)']);
    expect(noticeLines([])).toEqual([]);
  });

  it('falls back to the reference when there is no title', () => {
    expect(noticeLines([{ propertyId: 3, reference: 'R9', title: '', action: 'like', at: at(1) }])).toEqual(['Liked: R9']);
  });
});
