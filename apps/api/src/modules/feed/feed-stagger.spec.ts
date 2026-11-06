import { dailyHour, nightLoad, quietestHour, spreadOverNight, OLD_DEFAULT_SCHEDULE } from './feed-stagger';

describe('feed-stagger', () => {
  it('reads the hour of a daily schedule only', () => {
    expect(dailyHour('0 3 * * *')).toBe(3);
    expect(dailyHour('30 23 * * *')).toBe(23);
    expect(dailyHour('0 */4 * * *')).toBeNull();
    expect(dailyHour('0 6 * * 1')).toBeNull();
    expect(dailyHour(null)).toBeNull();
  });

  it('picks the night hour with the fewest listings', () => {
    const load = nightLoad([
      { syncSchedule: '0 0 * * *', lastSyncCount: 9000 },
      { syncSchedule: '0 1 * * *', lastSyncCount: 100 },
      { syncSchedule: '0 2 * * *', lastSyncCount: 5000 },
      { syncSchedule: '0 3 * * *', lastSyncCount: 5000 },
      { syncSchedule: '0 4 * * *', lastSyncCount: 5000 },
      { syncSchedule: '0 5 * * *', lastSyncCount: 5000 },
      { syncSchedule: OLD_DEFAULT_SCHEDULE, lastSyncCount: 50 },
    ]);
    expect(quietestHour(load)).toBe(1);
  });

  it('starts at hour 0 when nothing is planned', () => {
    expect(quietestHour(nightLoad([]))).toBe(0);
  });

  it('balances feeds over the six night hours, biggest first', () => {
    const sizes = [14000, 10000, 9700, 8700, 8400, 8300, 7100, 4600, 3000, 2000, 1000, 500, 300, 100];
    const feeds = sizes.map((n, id) => ({ id, syncSchedule: OLD_DEFAULT_SCHEDULE, lastSyncCount: n }));
    const plan = spreadOverNight(feeds);

    expect(plan).toHaveLength(feeds.length);
    const perHour = new Map<string, number>();
    for (const { feed, schedule } of plan) {
      expect(dailyHour(schedule)).toBeGreaterThanOrEqual(0);
      expect(dailyHour(schedule)).toBeLessThanOrEqual(5);
      perHour.set(schedule, (perHour.get(schedule) ?? 0) + feed.lastSyncCount);
    }
    expect(perHour.size).toBe(6);
    const loads = [...perHour.values()];
    // 77,700 listings over 6 hours is about 13,000 each; no hour far off it.
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(5000);
  });

  it('counts feeds that keep their time', () => {
    const plan = spreadOverNight(
      [{ id: 1, syncSchedule: OLD_DEFAULT_SCHEDULE, lastSyncCount: 10 }],
      [0, 1, 2, 3, 5].map((h) => ({ syncSchedule: `0 ${h} * * *`, lastSyncCount: 1000 })),
    );
    expect(plan[0].schedule).toBe('0 4 * * *');
  });
});
