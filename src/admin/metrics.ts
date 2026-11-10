/* Pure date-range and series maths for the dashboard. No DOM, no data
   layer — unit-tested in tests/metrics.test.ts. Times are epoch ms in the
   viewer's local time zone. */

export const DAY = 864e5;
const HOUR = 36e5;

export type RangeKey = 'today' | '7d' | '30d' | '90d' | 'month' | 'all' | 'custom';
export type Unit = 'hour' | 'day' | 'week' | 'month';
export interface Window { from: number; to: number; unit?: Unit; count?: number }
export interface Point { at: number; value: number }
export interface Series {
  unit: Unit; unitLabel: string;
  starts: number[]; values: number[]; counts: number[]; labels: string[]; tips: string[];
}

const startOfDay = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** The [from, to] a range button means. `first` is the earliest order (for "all time"). */
export function periodWindow(
  range: RangeKey,
  opts: { from?: string; to?: string; first?: number; now?: number } = {}
): Window {
  const now = opts.now ?? Date.now();
  const today = startOfDay(now);
  switch (range) {
    case 'today': return { from: today, to: now };
    case '7d': return { from: today - 6 * DAY, to: now };
    case '30d': return { from: today - 29 * DAY, to: now };
    case '90d': return { from: today - 89 * DAY, to: now };
    case 'month': { const d = new Date(now); return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: now }; }
    case 'custom': {
      const f = opts.from ? new Date(opts.from + 'T00:00:00').getTime() : NaN;
      const t = opts.to ? new Date(opts.to + 'T23:59:59.999').getTime() : NaN;
      if (Number.isFinite(f) && Number.isFinite(t)) return f <= t ? { from: f, to: t } : { from: startOfDay(t), to: f + DAY - 1 };
      return { from: today - 29 * DAY, to: now };
    }
    default: return { from: startOfDay(Math.min(opts.first ?? now, now)), to: now };
  }
}

/** The equally long window immediately before `w`. */
export function previousWindow(w: Window): Window {
  const span = w.to - w.from;
  return { from: w.from - span, to: w.from - 1 };
}

export function unitFor(w: Window): Unit {
  const days = (w.to - w.from) / DAY;
  if (days <= 2) return 'hour';
  if (days <= 92) return 'day';
  if (days <= 420) return 'week';
  return 'month';
}

const monthIndex = (t: number) => { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth(); };

/** Sum points into consecutive buckets covering the window. Empty buckets stay 0,
    so a quiet day shows as a dip rather than disappearing from the axis. */
export function bucketSeries(points: Point[], w: Window): Series {
  const unit = w.unit ?? unitFor(w);
  const starts: number[] = [];
  if (unit === 'month') {
    const d0 = new Date(w.from), n = w.count ?? monthIndex(w.to) - monthIndex(w.from) + 1;
    for (let i = 0; i < n; i++) starts.push(new Date(d0.getFullYear(), d0.getMonth() + i, 1).getTime());
  } else {
    const step = unit === 'hour' ? HOUR : unit === 'day' ? DAY : 7 * DAY;
    const first = unit === 'hour' ? Math.floor(w.from / HOUR) * HOUR : startOfDay(w.from);
    const n = w.count ?? Math.max(1, Math.floor((w.to - first) / step) + 1);
    /* built from calendar dates, so a daylight-saving shift cannot split or merge a day */
    for (let i = 0; i < n; i++) {
      if (unit === 'hour') starts.push(first + i * HOUR);
      else { const d = new Date(first); starts.push(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i * (unit === 'week' ? 7 : 1)).getTime()); }
    }
  }
  const values = starts.map(() => 0), counts = starts.map(() => 0);
  for (const p of points) {
    if (p.at < starts[0]) continue;
    let i = starts.length - 1;
    while (i > 0 && starts[i] > p.at) i--;
    values[i] += p.value; counts[i] += 1;
  }
  const fmt = (t: number, o: Intl.DateTimeFormatOptions) => new Date(t).toLocaleString('en-GB', o);
  const labels = starts.map(t =>
    unit === 'hour' ? fmt(t, { hour: '2-digit', minute: '2-digit' })
      : unit === 'month' ? fmt(t, { month: 'short', year: '2-digit' })
        : fmt(t, { day: 'numeric', month: 'short' }));
  const tips = starts.map(t =>
    unit === 'hour' ? fmt(t, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : unit === 'month' ? fmt(t, { month: 'long', year: 'numeric' })
        : unit === 'week' ? 'Week of ' + fmt(t, { day: 'numeric', month: 'short' })
          : fmt(t, { weekday: 'short', day: 'numeric', month: 'short' }));
  const unitLabel = { hour: 'Hourly', day: 'Daily', week: 'Weekly', month: 'Monthly' }[unit];
  return { unit, unitLabel, starts, values, counts, labels, tips };
}

/** Axis ceiling and tick values on round numbers (1, 2, 2.5, 5 × 10ⁿ). */
export function niceScale(top: number, steps = 4): { max: number; ticks: number[] } {
  const raw = Math.max(top, 1) / steps;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw) ?? 10 * pow;
  const max = Math.ceil(Math.max(top, 1) / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { max, ticks };
}

/** Percentage change, or null when there is nothing meaningful to compare against. */
export function pctChange(curr: number, prev: number | null | undefined): number | null {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
  return (curr - prev) / Math.abs(prev) * 100;
}

export function compactMoney(n: number): string {
  const a = Math.abs(n);
  const s = a >= 1e7 ? trim(a / 1e7) + 'Cr' : a >= 1e5 ? trim(a / 1e5) + 'L' : a >= 1e3 ? trim(a / 1e3) + 'k' : String(Math.round(a));
  return (n < 0 ? '−' : '') + '৳' + s;
}
const trim = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, ''));
