import { applyEvent, stageOf, statusAfter, type TimelineState } from './timeline';

const T0 = new Date('2026-10-22T10:00:00Z');
const T1 = new Date('2026-10-22T11:00:00Z');
const T2 = new Date('2026-10-22T12:00:00Z');
const empty: TimelineState = {
  sentAt: null, openedAt: null, clickedAt: null, likedAt: null, rejectedAt: null, rejectReason: null, viewingAt: null, offerAt: null,
};

describe('applyEvent', () => {
  it('sent sets the latest sentAt', () => {
    const a = applyEvent(empty, 'sent', T0);
    expect(a.sentAt).toEqual(T0);
    expect(applyEvent(a, 'sent', T1).sentAt).toEqual(T1);
  });

  it('opened is set once', () => {
    const a = applyEvent(applyEvent(empty, 'sent', T0), 'opened', T1);
    expect(applyEvent(a, 'opened', T2).openedAt).toEqual(T1);
  });

  it('clicked is set once and fills opened when missing', () => {
    const a = applyEvent(applyEvent(empty, 'sent', T0), 'clicked', T1);
    expect(a.clickedAt).toEqual(T1);
    expect(a.openedAt).toEqual(T1);
    const b = applyEvent(a, 'clicked', T2);
    expect(b.clickedAt).toEqual(T1);
  });

  it('liked and rejected replace each other', () => {
    const r = applyEvent(empty, 'rejected', T0, 'Ground floor');
    expect(r.rejectedAt).toEqual(T0);
    expect(r.rejectReason).toBe('Ground floor');
    const l = applyEvent(r, 'liked', T1);
    expect(l.likedAt).toEqual(T1);
    expect(l.rejectedAt).toBeNull();
    expect(l.rejectReason).toBeNull();
    const r2 = applyEvent(l, 'rejected', T2);
    expect(r2.likedAt).toBeNull();
    expect(r2.rejectReason).toBeNull();
  });

  it('cleared removes liked and rejected', () => {
    const c = applyEvent(applyEvent(empty, 'rejected', T0, 'x'), 'cleared', T1);
    expect(c).toMatchObject({ likedAt: null, rejectedAt: null, rejectReason: null });
  });

  it('viewing and offer clear a rejection', () => {
    const v = applyEvent(applyEvent(empty, 'rejected', T0), 'viewing', T1);
    expect(v.viewingAt).toEqual(T1);
    expect(v.rejectedAt).toBeNull();
    const o = applyEvent(applyEvent(empty, 'rejected', T0), 'offer', T1);
    expect(o.offerAt).toEqual(T1);
    expect(o.rejectedAt).toBeNull();
  });

  it('does not change the state it was given', () => {
    const s = { ...empty };
    applyEvent(s, 'liked', T0);
    expect(s).toEqual(empty);
  });
});

describe('stageOf', () => {
  it('is the furthest point reached', () => {
    expect(stageOf(empty)).toBe('suggested');
    let s = applyEvent(empty, 'sent', T0);
    expect(stageOf(s)).toBe('sent');
    s = applyEvent(s, 'opened', T0);
    expect(stageOf(s)).toBe('opened');
    s = applyEvent(s, 'clicked', T0);
    expect(stageOf(s)).toBe('clicked');
    expect(stageOf(applyEvent(s, 'rejected', T0))).toBe('rejected');
    s = applyEvent(s, 'liked', T0);
    expect(stageOf(s)).toBe('liked');
    s = applyEvent(s, 'viewing', T0);
    expect(stageOf(s)).toBe('viewing');
    expect(stageOf(applyEvent(s, 'offer', T0))).toBe('offer');
  });
});

describe('statusAfter', () => {
  it('maps reactions onto the Phase 1 status', () => {
    expect(statusAfter('sent', 'liked')).toBe('interested');
    expect(statusAfter('sent', 'viewing')).toBe('interested');
    expect(statusAfter('sent', 'offer')).toBe('interested');
    expect(statusAfter('interested', 'rejected')).toBe('not_interested');
  });

  it('keeps visited, and leaves opens/clicks alone', () => {
    expect(statusAfter('visited', 'liked')).toBe('visited');
    expect(statusAfter('visited', 'offer')).toBe('visited');
    expect(statusAfter('sent', 'opened')).toBe('sent');
    expect(statusAfter('suggested', 'clicked')).toBe('suggested');
  });

  it('cleared goes back to sent from a reaction status', () => {
    expect(statusAfter('interested', 'cleared')).toBe('sent');
    expect(statusAfter('not_interested', 'cleared')).toBe('sent');
    expect(statusAfter('visited', 'cleared')).toBe('visited');
  });

  it('sent moves suggested on, nothing else', () => {
    expect(statusAfter('suggested', 'sent')).toBe('sent');
    expect(statusAfter('interested', 'sent')).toBe('interested');
  });
});
