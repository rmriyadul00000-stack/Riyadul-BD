import { useCallback, useEffect, useRef, useState } from 'react';
import type { HeroSlide } from '../../lib/types';
import { Icon } from './Icon';
import { useHero } from '../lib/queries';

/* Both device sets render; CSS media queries decide which one is visible,
   so resizing the browser always shows exactly one. */
function HeroDevice({ device, slides }: { device: 'desktop' | 'mobile'; slides: HeroSlide[] }) {
  const [at, setAt] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const drag = useRef<{ x: number; dx: number } | null>(null);
  const n = slides.length;

  const show = useCallback((i: number) => setAt(((i % n) + n) % n), [n]);
  const stop = useCallback(() => window.clearInterval(timer.current), []);
  const start = useCallback(() => {
    stop();
    if (n < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    timer.current = window.setInterval(() => setAt(a => (a + 1) % n), 6000);
  }, [n, stop]);
  useEffect(() => { start(); return stop; }, [start, stop]);

  /* mouse drag is tracked on window so a release outside the slide still ends it */
  useEffect(() => {
    const move = (e: MouseEvent) => { if (drag.current) drag.current.dx = e.clientX - drag.current.x; };
    const up = () => end();
    const end = () => {
      const d = drag.current; if (!d) return;
      drag.current = null;
      if (d.dx > 40) setAt(a => (a - 1 + n) % n); else if (d.dx < -40) setAt(a => (a + 1) % n);
      start();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [n, start]);

  const down = (x: number) => { drag.current = { x, dx: 0 }; stop(); };
  const touchEnd = () => {
    const d = drag.current; if (!d) return;
    drag.current = null;
    if (d.dx > 40) show(at - 1); else if (d.dx < -40) show(at + 1);
    start();
  };

  if (!n) return null;
  return (
    <div className={`hero-device hero-${device}`} data-device={device} onMouseEnter={stop} onMouseLeave={start}>
      <div className="hero-track"
        onMouseDown={e => down(e.clientX)}
        onTouchStart={e => down(e.touches[0].clientX)}
        onTouchMove={e => { if (drag.current) drag.current.dx = e.touches[0].clientX - drag.current.x; }}
        onTouchEnd={touchEnd}>
        {slides.map((s, i) => (
          <img key={s.id} className={'hero-img' + (i === at ? ' on' : '')} src={s.image_url} alt={s.alt || ''}
            {...(i === 0 ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })} draggable={false} />
        ))}
      </div>
      {n > 1 && (
        <>
          <button className="hero-arrow prev" aria-label="Previous slide" onClick={() => { show(at - 1); start(); }}><Icon name="back" /></button>
          <button className="hero-arrow next" aria-label="Next slide" onClick={() => { show(at + 1); start(); }}><Icon name="back" /></button>
          <div className="hero-dots">
            {slides.map((s, i) => <button key={s.id} className={i === at ? 'on' : ''} aria-label={`Slide ${i + 1}`} onClick={() => { show(i); start(); }} />)}
          </div>
        </>
      )}
    </div>
  );
}

export function Hero() {
  const d = useHero('desktop'), m = useHero('mobile');
  const desktop = d.data ?? [], mobile = m.data ?? [];
  if (!desktop.length && !mobile.length) return null;
  return (
    <section className="hero" id="hero" aria-label="Featured">
      <HeroDevice device="desktop" slides={desktop} />
      <HeroDevice device="mobile" slides={mobile} />
    </section>
  );
}
