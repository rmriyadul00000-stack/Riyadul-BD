import { useEffect, useRef, useState } from 'react';
import { money } from './format';
import { compactMoney, niceScale, type Series } from './metrics';

/* One y-axis. Current period: line + soft area. Period before: thin dashed line.
   A crosshair and tooltip follow the pointer. Drawn at the pixel width of its card. */
export function TrendChart({ series, prev, label }: { series: Series; prev: Series | null; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = host.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(320, Math.floor(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(320, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const H = 260, m = { l: 52, r: 14, t: 14, b: 30 };
  const iw = w - m.l - m.r, ih = H - m.t - m.b;
  const vals = series.values, n = vals.length;
  const { max, ticks } = niceScale(Math.max(1, ...vals, ...(prev ? prev.values : [])), 4);
  const x = (i: number) => m.l + (n > 1 ? i / (n - 1) * iw : iw / 2);
  const y = (v: number) => m.t + ih - v / max * ih;
  const path = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 78))));
  const last = Math.floor((n - 1) / every) * every;

  const at = (clientX: number) => {
    const r = host.current!.getBoundingClientRect();
    setHover(n > 1 ? Math.max(0, Math.min(n - 1, Math.round((clientX - r.left - m.l) / iw * (n - 1)))) : 0);
  };
  const tipLeft = hover == null ? 0 : (x(hover) + 14 + 190 > w ? x(hover) - 190 - 14 : x(hover) + 14);

  return (
    <div className="d-chart" ref={host} role="img" aria-label={label}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`}>
        <defs><linearGradient id="dFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--c-series)" stopOpacity=".22" /><stop offset="1" stopColor="var(--c-series)" stopOpacity="0" /></linearGradient></defs>
        {ticks.map(t => (
          <g key={t}>
            <line className="c-grid" x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />
            <text className="c-axis" x={m.l - 8} y={y(t) + 4} textAnchor="end">{compactMoney(t)}</text>
          </g>
        ))}
        {series.labels.map((l, i) => (i % every || (i !== last && n - 1 - i < every / 2)) ? null : (
          <text key={i} className="c-axis" x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{l}</text>
        ))}
        {prev && <path className="c-prev" d={path(prev.values)} />}
        {n > 1 && <path d={`${path(vals)} L${x(n - 1)} ${m.t + ih} L${x(0)} ${m.t + ih} Z`} fill="url(#dFill)" />}
        <path className="c-line" d={path(vals)} />
        {n === 1 && <circle className="c-dot" cx={x(0)} cy={y(vals[0])} r={4.5} />}
        {hover != null && (
          <g>
            <line className="c-cross" x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} />
            {prev && <circle className="c-dot prev" cx={x(hover)} cy={y(prev.values[hover] || 0)} r={4} />}
            <circle className="c-dot" cx={x(hover)} cy={y(vals[hover])} r={4.5} />
          </g>
        )}
        <rect className="c-hit" x={m.l} y={m.t} width={iw} height={ih} fill="transparent"
          onPointerMove={e => at(e.clientX)} onPointerDown={e => at(e.clientX)} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover != null && (
        <div className="c-tip" style={{ left: Math.max(0, tipLeft), top: m.t }}>
          <b>{series.tips[hover]}</b>
          <span><i className="k-cur" />{money(vals[hover])} <small>{series.counts[hover]} order{series.counts[hover] === 1 ? '' : 's'}</small></span>
          {prev && <span><i className="k-prev" />{money(prev.values[hover] || 0)} <small>{prev.tips[hover] || 'before'}</small></span>}
        </div>
      )}
    </div>
  );
}
