import { describe, expect, it } from 'vitest';
import { DAY, bucketSeries, compactMoney, niceScale, pctChange, periodWindow, previousWindow, unitFor } from '../src/admin/metrics';

const NOW = new Date(2026, 10, 10, 15, 30).getTime();          // 10 Nov 2026, 15:30 local
const midnight = new Date(2026, 10, 10).getTime();

describe('periodWindow', () => {
  it('starts ranges at local midnight and ends now', () => {
    expect(periodWindow('today', { now: NOW })).toEqual({ from: midnight, to: NOW });
    expect(periodWindow('7d', { now: NOW }).from).toBe(new Date(2026, 10, 4).getTime());
    expect(periodWindow('30d', { now: NOW }).from).toBe(new Date(2026, 9, 12).getTime());
    expect(periodWindow('month', { now: NOW }).from).toBe(new Date(2026, 10, 1).getTime());
  });
  it('uses the first order for all time', () => {
    const first = new Date(2026, 5, 3, 9).getTime();
    expect(periodWindow('all', { now: NOW, first }).from).toBe(new Date(2026, 5, 3).getTime());
  });
  it('covers whole days for custom dates and tolerates reversed input', () => {
    const w = periodWindow('custom', { now: NOW, from: '2026-11-01', to: '2026-11-03' });
    expect(w.from).toBe(new Date(2026, 10, 1).getTime());
    expect(new Date(w.to).getDate()).toBe(3);
    const r = periodWindow('custom', { now: NOW, from: '2026-11-03', to: '2026-11-01' });
    expect(r.from).toBeLessThan(r.to);
  });
});

describe('previousWindow', () => {
  it('is the same length and ends just before the window', () => {
    const w = periodWindow('30d', { now: NOW }), p = previousWindow(w);
    expect(p.to).toBe(w.from - 1);
    expect(p.to - p.from).toBe(w.to - w.from - 1);
  });
});

describe('bucketSeries', () => {
  it('picks a sensible unit', () => {
    expect(unitFor({ from: NOW - DAY, to: NOW })).toBe('hour');
    expect(unitFor({ from: NOW - 30 * DAY, to: NOW })).toBe('day');
    expect(unitFor({ from: NOW - 200 * DAY, to: NOW })).toBe('week');
    expect(unitFor({ from: NOW - 800 * DAY, to: NOW })).toBe('month');
  });
  it('keeps empty days and sums each order into its own day', () => {
    const w = periodWindow('7d', { now: NOW });
    const s = bucketSeries([
      { at: new Date(2026, 10, 4, 0, 0).getTime(), value: 100 },
      { at: new Date(2026, 10, 4, 23, 59).getTime(), value: 50 },
      { at: new Date(2026, 10, 10, 9).getTime(), value: 70 }
    ], w);
    expect(s.unit).toBe('day');
    expect(s.values).toEqual([150, 0, 0, 0, 0, 0, 70]);
    expect(s.counts).toEqual([2, 0, 0, 0, 0, 0, 1]);
    expect(s.labels).toHaveLength(7);
  });
  it('lines the previous period up bucket for bucket', () => {
    const w = periodWindow('7d', { now: NOW });
    const cur = bucketSeries([], w);
    const prev = bucketSeries([{ at: new Date(2026, 9, 28, 12).getTime(), value: 9 }], { ...previousWindow(w), unit: cur.unit, count: cur.values.length });
    expect(prev.values).toHaveLength(7);
    expect(prev.starts[0]).toBe(new Date(2026, 9, 28).getTime());
    expect(prev.values[0]).toBe(9);
  });
  it('buckets by calendar month over long ranges', () => {
    const s = bucketSeries([{ at: new Date(2025, 0, 31, 23).getTime(), value: 5 }, { at: new Date(2025, 1, 1, 0).getTime(), value: 7 }],
      { from: new Date(2025, 0, 1).getTime(), to: new Date(2026, 5, 1).getTime() });
    expect(s.unit).toBe('month');
    expect(s.values.slice(0, 2)).toEqual([5, 7]);
  });
});

describe('formatting helpers', () => {
  it('rounds the axis to friendly numbers', () => {
    expect(niceScale(13800, 4)).toEqual({ max: 15000, ticks: [0, 5000, 10000, 15000] });
    expect(niceScale(0, 4).max).toBeGreaterThan(0);
  });
  it('does not invent a percentage without a baseline', () => {
    expect(pctChange(50, 0)).toBeNull();
    expect(pctChange(50, null)).toBeNull();
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(-50, -100)).toBe(50);
  });
  it('shortens money for axis labels', () => {
    expect(compactMoney(950)).toBe('৳950');
    expect(compactMoney(12500)).toBe('৳12.5k');
    expect(compactMoney(250000)).toBe('৳2.5L');
  });
});
