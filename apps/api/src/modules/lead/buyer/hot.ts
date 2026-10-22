// Hot buyers: simple rules, no AI. Signals from the last HOT_WINDOW_DAYS:
// a viewing request on their page 5, a like 3, a website enquiry or the
// wishlist form 3, a click in an email 1, an email open 0.5 (opens count
// for at most 2 points: mail apps open images by themselves). Pure.

export const HOT_WINDOW_DAYS = 14;

export interface HotCounts {
  opened: number;
  clicked: number;
  liked: number;
  pageViewing: number;
  enquiries: number;
}

export function hotScore(c: HotCounts): number {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  return Math.min(n(c.opened) * 0.5, 2) + n(c.clicked) + n(c.liked) * 3 + n(c.pageViewing) * 5 + n(c.enquiries) * 3;
}

export function isHot(c: HotCounts, threshold: number): boolean {
  const s = hotScore(c);
  return s > 0 && s >= threshold;
}
