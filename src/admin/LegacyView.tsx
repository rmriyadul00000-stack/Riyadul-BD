import { useEffect } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { legacyKeys, mountView, unmountView } from './admin.js';
import { NAV_KEYS } from './nav';

/* Hosts one of the original DOM-based screens. React renders an empty <main id="view">
   and the screen writes into it; the key makes every visit a fresh element. */
export function LegacyView() {
  const { view = '' } = useParams();
  const loc = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    if (!legacyKeys().includes(view)) return;
    const arg = loc.state ?? undefined;
    Promise.resolve(mountView(view, arg)).catch((err: unknown) => {
      console.error('View failed to load:', view, err);
      const el = document.getElementById('view');
      if (el) el.innerHTML = `<div class="bar"><div><h1>Couldn't load this page</h1><p>${String((err as Error)?.message ?? err)}</p></div></div>`;
    });
    /* an "open this order" hint must not re-open it on reload */
    if (loc.state) window.history.replaceState({ ...window.history.state, usr: null }, '');
    window.scrollTo({ top: 0 });
    return () => { unmountView(); void qc.invalidateQueries({ queryKey: ['admin-counts'] }); };
  }, [view, loc.key, qc]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!NAV_KEYS.includes(view) || !legacyKeys().includes(view)) return <Navigate to="/admin/dash" replace />;
  return <main className="main" id="view" key={view + loc.key} />;
}
