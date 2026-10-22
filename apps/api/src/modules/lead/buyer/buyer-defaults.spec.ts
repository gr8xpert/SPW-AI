import { DEFAULT_STAGES, statusToStageIndex, stageKindToStatus, splitName } from './buyer-defaults';

describe('buyer defaults', () => {
  it('has 9 stages ending in won + lost', () => {
    expect(DEFAULT_STAGES).toHaveLength(9);
    expect(DEFAULT_STAGES[7].kind).toBe('won');
    expect(DEFAULT_STAGES[8].kind).toBe('lost');
    expect(DEFAULT_STAGES.slice(0, 7).every((s) => s.kind === 'open')).toBe(true);
  });

  it.each([
    ['new', 0],
    ['contacted', 1],
    ['qualified', 2],
    ['viewing_scheduled', 4],
    ['offer_made', 5],
    ['negotiating', 5],
    ['won', 7],
    ['lost', 8],
  ])('maps status %s to stage %i', (status, index) => {
    expect(statusToStageIndex(status as never)).toBe(index);
  });

  it('keeps an open status and forces won/lost', () => {
    expect(stageKindToStatus('open', 'qualified')).toBe('qualified');
    expect(stageKindToStatus('open', 'won')).toBe('contacted');
    expect(stageKindToStatus('open', 'lost')).toBe('contacted');
    expect(stageKindToStatus('won', 'new')).toBe('won');
    expect(stageKindToStatus('lost', 'new')).toBe('lost');
  });

  it('splits names into first and last', () => {
    expect(splitName('Ana María López')).toEqual({ firstName: 'Ana', lastName: 'María López' });
    expect(splitName('Cher')).toEqual({ firstName: 'Cher', lastName: null });
    expect(splitName('  ')).toEqual({ firstName: null, lastName: null });
    expect(splitName(null)).toEqual({ firstName: null, lastName: null });
  });
});
