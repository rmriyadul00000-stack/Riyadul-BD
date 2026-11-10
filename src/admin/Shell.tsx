import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { RB_DB } from '../lib/db';
import { AdminIcon } from './AdminIcon';
import { useAdmin } from './auth';
import { NAV_GROUPS, NAV_LABEL } from './nav';
import { searchAdmin, type SearchHit } from './search';
import { AdminUiProvider, useAdminUi } from './AdminUi';

/** Navigate to an admin screen; `arg` carries "open this order / customer / status" to the screen. */
export function useAdminGo() {
  const navigate = useNavigate();
  return useCallback((key: string, arg?: unknown) => navigate(`/admin/${key}`, { state: arg ?? null }), [navigate]);
}

/* badge counts next to nav items: orders waiting, unread messages, stock alerts */
function useCounts(): Record<string, number> {
  const q = useQuery({
    queryKey: ['admin-counts'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [o, p, s, m] = await Promise.all([RB_DB.allOrders(), RB_DB.products(true), RB_DB.settings(), RB_DB.messages()]);
      const threshold = Number((s.ok ? s.data : {}).low_stock_threshold || 5);
      const stock = (v: { stock?: number }[]) => v.reduce((t, x) => t + (Number(x.stock) || 0), 0);
      return {
        orders: o.ok ? o.data.filter(x => x.status === 'pending').length : 0,
        inventory: p.ok ? p.data.filter(x => stock(x.variants) <= threshold).length : 0,
        messages: m.ok ? m.data.filter(x => x.sender !== 'admin' && !x.read_by_admin).length : 0
      } as Record<string, number>;
    }
  });
  return q.data ?? {};
}

function Sidebar() {
  const { admin, mode, signOut } = useAdmin();
  const counts = useCounts();
  const who = mode === 'live' ? (admin.name || admin.email || 'Admin') : 'Preview';
  const sub = mode === 'live' ? admin.email : 'Sample data';
  return (
    <nav className="side" id="side" aria-label="Admin sections">
      <div className="mark"><AdminIcon name="leaf" /><span><b>Riyadul BD</b><small>ADMIN</small></span></div>
      <div className="side-nav">
        {NAV_GROUPS.map(g => (
          <div key={g.label}>
            <div className="group-label">{g.label}</div>
            {g.items.map(it => {
              const n = counts[it.key];
              return (
                <NavLink key={it.key} to={`/admin/${it.key}`} className={({ isActive }) => 'nav-btn' + (isActive ? ' on' : '')} data-nav={it.key}>
                  <AdminIcon name={it.icon} /><span className="lbl">{it.label}</span>
                  {n ? <span className="count">{n > 99 ? '99+' : n}</span> : null}
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>
      <div className="side-user">
        <span className="avatar">{String(who).trim()[0]?.toUpperCase() || 'A'}</span>
        <span className="who"><b>{who}</b><small>{sub}</small></span>
        <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={signOut}><AdminIcon name="out" /></button>
      </div>
    </nav>
  );
}

/* mounted only while open, so every opening starts with an empty query */
function Palette({ onClose }: { onClose: () => void }) {
  const go = useAdminGo();
  const ui = useAdminUi();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => { requestAnimationFrame(() => input.current?.focus()); }, []);

  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchAdmin(q, go, ui.openItem).catch(() => []);
      if (mine === seq.current) { setHits(r); setAt(0); }
    }, q ? 90 : 0);
    return () => clearTimeout(t);
  }, [q, go, ui]);

  const pick = (i: number) => { const h = hits[i]; if (h) { onClose(); h.run(); } };
  const shown = hits.map((h, i) => ({ h, i, head: i === 0 || hits[i - 1].group !== h.group }));
  return (
    <div className="palette on" id="palette" role="dialog" aria-modal="true" aria-label="Search" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette-card">
        <input ref={input} id="palette-q" type="search" placeholder="Search orders, customers, products or pages…" autoComplete="off" spellCheck={false}
          value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => Math.min(hits.length - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => Math.max(0, a - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); pick(at); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
          }} />
        <div className="palette-list" id="palette-list">
          {hits.length === 0 && <div className="palette-empty">Nothing matches.</div>}
          {shown.map(({ h, i, head }) => {
            return (
              <div key={h.group + h.title + i}>
                {head && <div className="palette-group">{h.group}</div>}
                <button className={'palette-item' + (i === at ? ' on' : '')} onMouseMove={() => setAt(i)} onClick={() => pick(i)}>
                  <b>{h.title}</b>{h.sub && <small>{h.sub}</small>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
      </div>
    </div>
  );
}

const readTheme = (): 'light' | 'dark' => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

function Topbar({ onSearch, onMenu }: { onSearch: () => void; onMenu: () => void }) {
  const { mode } = useAdmin();
  const { pathname } = useLocation();
  const [theme, setTheme] = useState(readTheme);
  const key = pathname.split('/')[2] || 'dash';
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  const go = useAdminGo();

  useEffect(() => { document.title = `${NAV_LABEL[key] ?? 'Admin'} · Riyadul BD Admin`; }, [key]);

  const flip = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('rb.admin.theme', next); } catch { /* private mode */ }
    setTheme(next);
    window.dispatchEvent(new Event('rb-theme'));
  };
  return (
    <header className="topbar" id="topbar">
      <button className="icon-btn only-mobile" aria-label="Open menu" onClick={onMenu}><AdminIcon name="menu" /></button>
      <div className="crumb"><span>Admin</span><b>{NAV_LABEL[key] ?? ''}</b></div>
      <button className="tb-search" onClick={onSearch}><AdminIcon name="search" /><span>Search orders, customers, products…</span><kbd>{mac ? '⌘' : 'Ctrl'} K</kbd></button>
      <div className="tb-actions">
        <span className={'mode-pill ' + (mode === 'live' ? 'live' : 'preview')} title={mode === 'live' ? 'Connected to the database' : 'Sample data in this browser'}>{mode === 'live' ? 'Live' : 'Preview'}</span>
        <button className="icon-btn" title="Reload this page’s data" aria-label="Reload data" onClick={() => go(key)}><AdminIcon name="refresh" /></button>
        <button className="icon-btn" title="Switch light / dark" aria-label="Switch theme" onClick={flip}><AdminIcon name={theme === 'light' ? 'moon' : 'sun'} /></button>
        <a className="btn ghost sm hide-mobile" href="/" target="_blank" rel="noopener noreferrer">View store <AdminIcon name="ext" /></a>
      </div>
    </header>
  );
}

function ModeBar() {
  const { mode, resetPreview, retryBackend } = useAdmin();
  if (mode === 'live') return null;
  return (
    <div className="modebar" id="modebar">
      <span><b>Preview.</b> {mode === 'offline'
        ? 'The database is paused or unreachable. You are looking at sample data kept in this browser — nothing here is real and nothing is saved to the shop.'
        : 'No database is connected. You are looking at sample data kept in this browser.'}</span>
      <span className="modebar-actions">
        {mode === 'offline' && <button className="link-btn" onClick={retryBackend}>Check database again</button>}
        <button className="link-btn" onClick={() => { if (confirm('Reset the sample data in this browser?')) resetPreview(); }}>Reset sample data</button>
      </span>
    </div>
  );
}

export function Shell() {
  return <AdminUiProvider><ShellInner /></AdminUiProvider>;
}

function ShellInner() {
  const [palette, setPalette] = useState(false);
  const { pathname } = useLocation();
  const [menuAt, setMenuAt] = useState<string | null>(null);   // drawer open for this path only: any navigation closes it
  const menu = menuAt === pathname;

  useEffect(() => { document.body.classList.toggle('side-open', menu); }, [menu]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setPalette(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="shell" id="shell">
      <Sidebar />
      <div className="side-scrim" id="side-scrim" onClick={() => setMenuAt(null)} />
      <div className="frame">
        <Topbar onSearch={() => setPalette(true)} onMenu={() => setMenuAt(pathname)} />
        <ModeBar />
        <Outlet />
      </div>
      {palette && <Palette onClose={() => setPalette(false)} />}
      <div className="toasts" id="toasts" />
    </div>
  );
}
