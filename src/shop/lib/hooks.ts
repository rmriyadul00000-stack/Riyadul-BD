import { useCallback, useEffect, useRef } from 'react';

export function useDocTitle(title: string | undefined): void {
  useEffect(() => { if (title) document.title = title; }, [title]);
}

/** Mouse-draggable horizontal rail whose Prev/Next buttons loop instead of sticking. `autoMs` auto-advances. */
export function useDragRow<T extends HTMLElement>(autoMs?: number) {
  const ref = useRef<T>(null);
  const timer = useRef<number | undefined>(undefined);

  const goNext = useCallback(() => {
    const el = ref.current; if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (atEnd) el.scrollTo({ left: 0, behavior: 'smooth' });
    else el.scrollBy({ left: Math.max(220, el.clientWidth * 0.8), behavior: 'smooth' });
  }, []);
  const goPrev = useCallback(() => {
    const el = ref.current; if (!el) return;
    if (el.scrollLeft <= 4) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    else el.scrollBy({ left: -Math.max(220, el.clientWidth * 0.8), behavior: 'smooth' });
  }, []);

  const stop = useCallback(() => window.clearInterval(timer.current), []);
  const start = useCallback(() => {
    if (!autoMs) return;
    window.clearInterval(timer.current);
    timer.current = window.setInterval(goNext, autoMs);
  }, [autoMs, goNext]);
  const restart = useCallback(() => { stop(); start(); }, [stop, start]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    let down = false, startX = 0, startScroll = 0, moved = false;
    const onDown = (e: MouseEvent) => { down = true; moved = false; startX = e.clientX; startScroll = el.scrollLeft; el.classList.add('dragging'); stop(); };
    const onMove = (e: MouseEvent) => { if (!down) return; const dx = e.clientX - startX; if (Math.abs(dx) > 4) moved = true; el.scrollLeft = startScroll - dx; };
    const onUp = () => { if (!down) return; down = false; el.classList.remove('dragging'); start(); };
    const onClick = (e: MouseEvent) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } };
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('click', onClick, true);
    if (autoMs) {
      el.addEventListener('mouseenter', stop);
      el.addEventListener('mouseleave', start);
      el.addEventListener('touchstart', stop, { passive: true });
      el.addEventListener('touchend', start);
      start();
    }
    return () => {
      stop();
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('mouseenter', stop);
      el.removeEventListener('mouseleave', start);
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('touchend', start);
    };
  }, [autoMs, start, stop]);

  return [ref, () => { goPrev(); restart(); }, () => { goNext(); restart(); }] as const;
}
