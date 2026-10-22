import { hotScore, isHot } from './hot';

const none = { opened: 0, clicked: 0, liked: 0, pageViewing: 0, enquiries: 0 };

describe('hotScore', () => {
  it('weighs the signals: viewing request 5, like 3, enquiry 3, click 1, open 0.5', () => {
    expect(hotScore({ ...none, pageViewing: 1 })).toBe(5);
    expect(hotScore({ ...none, liked: 1 })).toBe(3);
    expect(hotScore({ ...none, enquiries: 1 })).toBe(3);
    expect(hotScore({ ...none, clicked: 2 })).toBe(2);
    expect(hotScore({ ...none, opened: 1 })).toBe(0.5);
  });

  it('caps opens at 2 points (mail apps open images by themselves)', () => {
    expect(hotScore({ ...none, opened: 40 })).toBe(2);
  });

  it('adds up', () => {
    expect(hotScore({ opened: 3, clicked: 1, liked: 1, pageViewing: 0, enquiries: 0 })).toBe(5.5);
  });
});

describe('isHot', () => {
  it('is hot at or above the threshold', () => {
    expect(isHot({ ...none, liked: 2 }, 6)).toBe(true);
    expect(isHot({ ...none, liked: 1, clicked: 2 }, 6)).toBe(false);
    expect(isHot({ ...none, pageViewing: 1, opened: 2 }, 6)).toBe(true);
  });

  it('nothing is never hot, whatever the threshold', () => {
    expect(isHot(none, 0)).toBe(false);
  });
});
