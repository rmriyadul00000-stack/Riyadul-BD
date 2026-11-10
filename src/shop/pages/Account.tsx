import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RB_DB } from '../../lib/db';
import type { Customer } from '../../lib/types';
import { Icon } from '../components/Icon';
import { OrderCard } from '../components/OrderCard';
import { useDocTitle } from '../lib/hooks';
import { useMe, useUnreadCount } from '../lib/queries';
import { fmtDate } from '../lib/shop';
import { toast } from '../lib/toast';

function Track({ initial }: { initial?: string }) {
  const [ref, setRef] = useState(initial ?? '');
  const [submitted, setSubmitted] = useState((initial ?? '').trim());
  const result = useQuery({
    queryKey: ['track', submitted],
    enabled: !!submitted,
    retry: false,
    queryFn: async () => {
      const r = await RB_DB.orderByCode(submitted);
      return r.ok ? { ok: true as const, order: r.data } : { ok: false as const, error: r.error };
    }
  });
  const go = () => setSubmitted(ref.trim());
  const r = result.data;
  return (
    <>
      <div className="coupon">
        <input id="track-ref" placeholder="ORD-10001" aria-label="Order number" value={ref}
          onChange={e => setRef(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }} />
        <button className="btn" id="track-go" onClick={go}>Track</button>
      </div>
      <div id="track-result">
        {r && (r.ok ? <OrderCard o={r.order} /> : <div className="notice bad">{r.error}</div>)}
      </div>
    </>
  );
}

function SignedOut({ trackRef }: { trackRef: string | null }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['me'] });

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await RB_DB.login({ email: String(f.get('email')).trim(), password: String(f.get('password')) });
    setBusy(false);
    if (!r.ok) return toast(r.error, true);
    toast('Signed in.'); void refresh();
  }
  async function register(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await RB_DB.register({
      email: String(f.get('email')).trim(), password: String(f.get('password')),
      full_name: String(f.get('full_name')).trim(), phone: String(f.get('phone')).trim()
    });
    setBusy(false);
    if (!r.ok) return toast(r.error, true);
    toast(RB_DB.live ? 'Account created. Check your email to confirm it.' : 'Account created.'); void refresh();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }} className="auth-grid">
      <div className="panel">
        <div className="tabs" id="auth-tabs" style={{ marginTop: 0 }}>
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Sign in</button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Create account</button>
        </div>
        {mode === 'login' ? (
          <form id="login-form" onSubmit={login}>
            <div className="field"><label htmlFor="li-email">Email</label>
              <input id="li-email" name="email" type="email" required /><span className="err">Enter your email.</span></div>
            <div className="field"><label htmlFor="li-pass">Password</label>
              <input id="li-pass" name="password" type="password" required /><span className="err">Enter your password.</span></div>
            <button className="btn btn-block" type="submit" disabled={busy}>Sign in</button>
          </form>
        ) : (
          <form id="reg-form" onSubmit={register}>
            <div className="field"><label htmlFor="rg-name">Full name</label><input id="rg-name" name="full_name" required /></div>
            <div className="field"><label htmlFor="rg-email">Email</label><input id="rg-email" name="email" type="email" required /></div>
            <div className="field"><label htmlFor="rg-phone">Mobile number</label><input id="rg-phone" name="phone" placeholder="01XXXXXXXXX" required /></div>
            <div className="field"><label htmlFor="rg-pass">Password</label><input id="rg-pass" name="password" type="password" minLength={6} required /></div>
            <button className="btn btn-block" type="submit" disabled={busy}>Create account</button>
          </form>
        )}
      </div>
      <div className="panel">
        <h3>Track an order</h3>
        <p className="muted small">No account needed. Use the order number from your confirmation.</p>
        <Track initial={trackRef ?? undefined} />
      </div>
    </div>
  );
}

function Messages() {
  const qc = useQueryClient();
  const thread = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const msgs = useQuery({
    queryKey: ['my-messages'],
    queryFn: async () => { const r = await RB_DB.myMessages(); return r.ok ? r.data : []; },
    refetchInterval: 5000
  });
  const list = msgs.data ?? [];

  useEffect(() => {
    void RB_DB.markMyMessagesRead().then(() => qc.invalidateQueries({ queryKey: ['unread'] }));
  }, [list.length, qc]);
  /* stay at the bottom when a message arrives */
  useEffect(() => { const t = thread.current; if (t) t.scrollTop = t.scrollHeight; }, [list.length]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim(); if (!t || sending) return;
    setSending(true);
    const r = await RB_DB.sendAccountMessage(t);
    setSending(false);
    if (!r.ok) return toast(r.error, true);
    setText(''); void msgs.refetch();
  }

  return (
    <>
      <h3>Messages</h3>
      <p className="muted small">A direct line to the shop. Send a question any time — we usually reply within a day.</p>
      <div className="msg-wrap">
        <div className="msg-thread" id="msg-thread" ref={thread}>
          {msgs.isLoading && <p className="muted small">Loading…</p>}
          {!msgs.isLoading && list.length === 0 && <div className="msg-empty"><Icon name="chat" /><p>No messages yet — ask us anything.</p></div>}
          {list.map(m => (
            <div key={m.id} className={'msg-bubble ' + (m.sender === 'customer' ? 'out' : 'in')}>
              {m.subject && <span className="msg-subject">{m.subject}</span>}{m.message}
              <span className="msg-time">{fmtDate(m.created_at)}</span>
            </div>
          ))}
        </div>
        <form className="msg-composer" onSubmit={send}>
          <textarea placeholder="Type a message…" required value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <button className="btn" type="submit" aria-label="Send" disabled={sending}><Icon name="send" /></button>
        </form>
      </div>
    </>
  );
}

function Profile({ me }: { me: Customer }) {
  const qc = useQueryClient();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await RB_DB.updateMyAccount({
      full_name: String(f.get('full_name')).trim(), phone: String(f.get('phone')).trim(),
      city: String(f.get('city')).trim(), address: String(f.get('address')).trim()
    });
    toast(r.ok ? 'Account saved.' : r.error, !r.ok);
    void qc.invalidateQueries({ queryKey: ['me'] });
  }
  return (
    <>
      <h3>My account</h3>
      <p className="muted small">Customer number <b>{me.customer_code || '—'}</b>. These details are your account's own. Delivery details you type at checkout belong to that order and never change what is saved here.</p>
      <form id="prof" onSubmit={save}>
        <div className="row2">
          <div className="field"><label htmlFor="pf-name">Full name</label><input id="pf-name" name="full_name" defaultValue={me.full_name || ''} /></div>
          <div className="field"><label htmlFor="pf-phone">Mobile number</label><input id="pf-phone" name="phone" defaultValue={me.phone || ''} /></div>
        </div>
        <div className="field"><label htmlFor="pf-email">Email</label><input id="pf-email" value={me.email || ''} disabled readOnly /></div>
        <div className="row2">
          <div className="field"><label htmlFor="pf-city">City</label><input id="pf-city" name="city" defaultValue={me.city || ''} /></div>
          <div className="field"><label htmlFor="pf-addr">Usual delivery address</label><input id="pf-addr" name="address" defaultValue={me.address || ''} /></div>
        </div>
        <button className="btn" type="submit">Save changes</button>
      </form>
    </>
  );
}

function Orders() {
  const q = useQuery({ queryKey: ['my-orders'], queryFn: async () => { const r = await RB_DB.myOrders(); return r.ok ? r.data : []; } });
  return (
    <>
      <h3>My orders</h3>
      {q.isLoading && <p className="muted small">Loading…</p>}
      {!q.isLoading && (q.data?.length
        ? q.data.map(o => <OrderCard key={o.id} o={o} />)
        : <div className="empty"><Icon name="box" /><p>No orders yet.</p><Link className="btn" to="/products">Start shopping</Link></div>)}
    </>
  );
}

type Tab = 'orders' | 'messages' | 'profile' | 'track';

function SignedIn({ me, trackRef }: { me: Customer; trackRef: string | null }) {
  const qc = useQueryClient();
  const unread = useUnreadCount();
  const [tab, setTab] = useState<Tab>(trackRef ? 'track' : 'orders');
  const [confirmOut, setConfirmOut] = useState(false);
  const TABS: [Tab, string][] = [['orders', 'My orders'], ['messages', 'Messages'], ['profile', 'My account'], ['track', 'Track an order']];

  async function signOut() {
    await RB_DB.logout();
    toast('Signed out.');
    qc.removeQueries({ queryKey: ['my-orders'] });
    void qc.invalidateQueries({ queryKey: ['me'] });
    void qc.invalidateQueries({ queryKey: ['unread'] });
  }

  return (
    <>
      <div className="acct">
        <nav className="acct-nav">
          {TABS.map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}{k === 'messages' && <> <span className={'badge' + (unread.data ? '' : ' hide')}>{unread.data ?? 0}</span></>}
            </button>
          ))}
        </nav>
        <div className="panel" id="acct-pane">
          {tab === 'orders' && <Orders />}
          {tab === 'messages' && <Messages />}
          {tab === 'profile' && <Profile me={me} />}
          {tab === 'track' && <><h3>Track an order</h3><Track initial={trackRef ?? undefined} /></>}
        </div>
      </div>
      <div className="signout-zone">
        {confirmOut ? (
          <span className="signout-confirm">
            <span>Sign out for good?</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirmOut(false)}>Cancel</button>
            <button className="btn btn-sm btn-danger" onClick={signOut}>Yes, sign out</button>
          </span>
        ) : <button className="signout-btn" onClick={() => setConfirmOut(true)}>Sign out</button>}
      </div>
    </>
  );
}

export default function Account() {
  useDocTitle('My account — Riyadul BD');
  const [sp] = useSearchParams();
  const me = useMe();
  const trackRef = sp.get('ref');
  return (
    <main className="wrap section">
      <div className="section-head">
        <div>
          <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.4rem)' }}>My account</h1>
          <p>Track a delivery, check past orders, or keep your address up to date.</p>
        </div>
      </div>
      <div id="acct">
        {me.isLoading ? null : me.data ? <SignedIn me={me.data} trackRef={trackRef} /> : <SignedOut trackRef={trackRef} />}
      </div>
    </main>
  );
}
