import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { RB_DB, resetLocalData } from '../lib/db';
import { forgetBackendProbe } from '../lib/backend';
import type { AdminUser, BackendMode } from '../lib/types';

export const DEMO_PASS = 'riyadul2026';

interface AdminCtx { admin: AdminUser; mode: BackendMode; signOut: () => void; resetPreview: () => void; retryBackend: () => void }
const Ctx = createContext<AdminCtx | null>(null);
export const useAdmin = (): AdminCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAdmin outside <AdminGate>');
  return c;
};

/* Sign-in. Live: the account must sign in AND have a row in `admins` (checked by the
   database). Preview (database paused or not connected): a placeholder passcode and sample
   data that live only in this browser. */
export function AdminGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<BackendMode | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /* the legacy screens read the signed-in admin from window.RB_ADMIN */
  const adopt = (a: AdminUser) => { window.RB_ADMIN = a; setAdmin(a); };

  useEffect(() => {
    let alive = true;
    (async () => {
      const m = await RB_DB.ready;
      if (!alive) return;
      setMode(m);
      if (m !== 'live') { if (sessionStorage.getItem('rb.admin') === 'ok') adopt({ email: 'preview' }); return; }
      const a = await RB_DB.currentAdmin();
      if (alive && a) adopt(a);
    })();
    return () => { alive = false; };
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const f = new FormData(e.currentTarget);
    if (mode !== 'live') {
      if (String(f.get('password')) !== DEMO_PASS) return setError('Wrong passcode.');
      sessionStorage.setItem('rb.admin', 'ok');
      adopt({ email: 'preview' });
      return;
    }
    setBusy(true);
    const r = await RB_DB.adminLogin({ email: String(f.get('email')).trim(), password: String(f.get('password')) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    adopt(r.data);
  }

  if (admin && mode) {
    const value: AdminCtx = {
      admin, mode,
      signOut: () => { sessionStorage.removeItem('rb.admin'); void RB_DB.logout().then(() => location.assign('/admin')); },
      resetPreview: () => { resetLocalData(); location.reload(); },
      retryBackend: () => { forgetBackendProbe(); location.reload(); }
    };
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  const preview = mode !== null && mode !== 'live';
  return (
    <div className="gate" id="gate">
      <div className="gate-card">
        <h1>Riyadul BD {preview && <span className="mode-pill preview">Preview</span>}</h1>
        <p id="gate-hint">
          {mode === null && 'Checking access…'}
          {mode === 'live' && 'Sign in with your admin account.'}
          {preview && <>
            {mode === 'offline'
              ? <>The database is paused or unreachable, so this is a <b>preview with sample data</b> kept in this browser. Real orders and customers return when the database is resumed.</>
              : <>No database is connected, so this is a <b>preview with sample data</b> kept in this browser.</>}
            <br />Preview passcode: <code>{DEMO_PASS}</code>
          </>}
        </p>
        {mode !== null && (
          <form id="gate-form" onSubmit={submit}>
            {mode === 'live' && (
              <div className="field"><label htmlFor="g-email">Email</label>
                <input id="g-email" name="email" type="email" autoComplete="username" placeholder="you@riyadulbd.com" required /></div>
            )}
            <div className="field"><label htmlFor="g-pass">{preview ? 'Passcode' : 'Password'}</label>
              <input id="g-pass" name="password" type="password" autoComplete="current-password" required /></div>
            {error && <p id="gate-error" style={{ color: 'var(--a-red)', fontSize: '.85rem', margin: '0 0 12px' }}>{error}</p>}
            <button className="btn" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>{busy ? 'Checking…' : 'Sign in'}</button>
            {mode === 'offline' && (
              <button className="btn ghost" type="button" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={() => { forgetBackendProbe(); location.reload(); }}>Check the database again</button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
