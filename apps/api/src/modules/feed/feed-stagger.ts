// Daily feed imports used to all start at 06:00 UTC, which made one queue of
// 5-6 hours: feeds near the back were not fresh until midday, and a feed added
// in the morning waited behind all of them. Feeds without a chosen time now
// get a night hour of their own, balanced by listing count.

// 00:00-05:00 UTC = 01:00-06:00 (winter) / 02:00-07:00 (summer) in Spain.
export const NIGHT_HOURS = [0, 1, 2, 3, 4, 5] as const;

// The time the dashboard filled in for every feed before this change.
export const OLD_DEFAULT_SCHEDULE = '0 6 * * *';

// A new feed's size is unknown until its first import.
const UNKNOWN_FEED_SIZE = 500;

export interface ScheduledFeed {
  syncSchedule: string | null;
  lastSyncCount: number | null;
}

export const dailyAt = (hour: number): string => `0 ${hour} * * *`;

// The hour of a plain "M H * * *" daily schedule, else null.
export function dailyHour(schedule: string | null | undefined): number | null {
  const m = /^\s*\d{1,2}\s+(\d{1,2})\s+\*\s+\*\s+\*\s*$/.exec(schedule || '');
  if (!m) return null;
  const hour = Number(m[1]);
  return hour >= 0 && hour <= 23 ? hour : null;
}

const feedSize = (f: ScheduledFeed) => (f.lastSyncCount && f.lastSyncCount > 0 ? f.lastSyncCount : UNKNOWN_FEED_SIZE);

// Listings already planned in each night hour.
export function nightLoad(feeds: ScheduledFeed[]): Map<number, number> {
  const load = new Map<number, number>(NIGHT_HOURS.map((h) => [h, 0]));
  for (const f of feeds) {
    const hour = dailyHour(f.syncSchedule);
    if (hour !== null && load.has(hour)) load.set(hour, load.get(hour)! + feedSize(f));
  }
  return load;
}

// The night hour with the fewest listings; the earliest one on a tie.
export function quietestHour(load: Map<number, number>): number {
  let best: number = NIGHT_HOURS[0];
  for (const h of NIGHT_HOURS) if (load.get(h)! < load.get(best)!) best = h;
  return best;
}

// Spreads feeds over the night hours, biggest first, each to the quietest
// hour so far. `planned` are feeds whose time stays as it is.
export function spreadOverNight<T extends ScheduledFeed>(
  feeds: T[],
  planned: ScheduledFeed[] = [],
): Array<{ feed: T; schedule: string }> {
  const load = nightLoad(planned);
  return [...feeds]
    .sort((a, b) => feedSize(b) - feedSize(a))
    .map((feed) => {
      const hour = quietestHour(load);
      load.set(hour, load.get(hour)! + feedSize(feed));
      return { feed, schedule: dailyAt(hour) };
    });
}
