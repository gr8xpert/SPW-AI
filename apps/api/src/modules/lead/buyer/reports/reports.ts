// Agency dashboard numbers (pure; the service runs the SQL).

export interface ReportStage {
  id: number;
  name: string;
  sortOrder: number;
  kind: 'open' | 'won' | 'lost';
  probability: number | null;
}

// 'YYYY-MM' keys of the last `months` months up to `now`, oldest first, in
// the agency time zone.
export function monthKeys(now: Date, months: number, timeZone = 'UTC'): string[] {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now);
  let y = Number(parts.find((p) => p.type === 'year')!.value);
  let m = Number(parts.find((p) => p.type === 'month')!.value);
  const out: string[] = [];
  for (let i = 0; i < months; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

// Rows (month, source, n) → one entry per month with a count per source,
// zero-filled, plus the list of sources seen (most buyers first).
export function sourceSeries(keys: string[], rows: { month: string; source: string; n: number }[]) {
  const totals = new Map<string, number>();
  rows.forEach((r) => totals.set(r.source, (totals.get(r.source) ?? 0) + Number(r.n)));
  const sources = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
  const series = keys.map((month) => {
    const entry: Record<string, string | number> = { month };
    sources.forEach((s) => (entry[s] = 0));
    rows.filter((r) => r.month === month).forEach((r) => (entry[r.source] = Number(entry[r.source]) + Number(r.n)));
    return entry;
  });
  return { sources, series };
}

// How far each buyer got: the furthest open stage they were ever in (current
// stage or a stage change in their history), won buyers reached everything.
// A stage counts every buyer who reached it or a later one.
export function funnel(stages: ReportStage[], buyers: { stageId: number | null; history: string[] }[]) {
  const open = stages.filter((s) => s.kind === 'open').sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(stages.map((s) => [s.id, s]));
  const openByName = new Map(open.map((s) => [s.name.toLowerCase(), s]));
  const counts = new Map(open.map((s) => [s.id, 0]));
  let won = 0;
  let lost = 0;
  for (const b of buyers) {
    const current = b.stageId ? byId.get(b.stageId) : undefined;
    if (current?.kind === 'won') won++;
    if (current?.kind === 'lost') lost++;
    let reached = -Infinity;
    if (current?.kind === 'won') reached = Infinity;
    else if (current?.kind === 'open') reached = current.sortOrder;
    for (const name of b.history) {
      const s = openByName.get(name.toLowerCase());
      if (s && s.sortOrder > reached) reached = s.sortOrder;
    }
    for (const s of open) if (reached >= s.sortOrder) counts.set(s.id, counts.get(s.id)! + 1);
  }
  return {
    stages: open.map((s) => ({ stageId: s.id, name: s.name, count: counts.get(s.id)! })),
    won,
    lost,
  };
}

// Probability of a stage: the stored % or, when empty, open stages spread
// evenly from 10% to 90% by order; won 100, lost 0.
export function stageProbabilities(stages: ReportStage[]): Map<number, number> {
  const open = stages.filter((s) => s.kind === 'open').sort((a, b) => a.sortOrder - b.sortOrder);
  const out = new Map<number, number>();
  for (const s of stages) {
    if (s.probability !== null && s.probability !== undefined) out.set(s.id, s.probability);
    else if (s.kind === 'won') out.set(s.id, 100);
    else if (s.kind === 'lost') out.set(s.id, 0);
    else {
      const i = open.indexOf(s);
      out.set(s.id, open.length === 1 ? 50 : Math.round(10 + (80 * i) / (open.length - 1)));
    }
  }
  return out;
}

export function expectedRevenue(buyers: { stageId: number | null; dealValue: number | null }[], probabilities: Map<number, number>): number {
  let sum = 0;
  for (const b of buyers) {
    if (!b.stageId || !b.dealValue) continue;
    sum += (Number(b.dealValue) * (probabilities.get(b.stageId) ?? 0)) / 100;
  }
  return Math.round(sum);
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function conversion(won: number, lost: number): number | null {
  return won + lost ? Math.round((won / (won + lost)) * 100) : null;
}
