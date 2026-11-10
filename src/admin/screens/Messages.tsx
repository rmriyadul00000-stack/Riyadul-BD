import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RB_DB } from '../../lib/db';
import type { Customer, Message } from '../../lib/types';
import { AdminIcon } from '../AdminIcon';
import { whenFull } from '../format';
import { ConfirmDelete } from '../ui/Confirm';
import { toast } from '../ui/toast';

interface Convo {
  key: string; isGuest: boolean; customerId: string | null; name: string; code: string | null;
  email: string; phone: string; status: string | null; items: Message[]; last: Message; unread: number;
}

const initials = (name: string) => {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
};
const shortTime = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

function buildConversations(msgs: Message[], customers: Customer[]): Convo[] {
  const groups = new Map<string, Omit<Convo, 'last' | 'unread'>>();
  msgs.forEach(m => {
    const key = m.customer_id ? 'c:' + m.customer_id : 'g:' + (m.email || '').toLowerCase().trim();
    if (!groups.has(key)) {
      const c = m.customer_id ? customers.find(x => x.id === m.customer_id) : undefined;
      groups.set(key, {
        key, isGuest: !m.customer_id, customerId: m.customer_id || null,
        name: c?.full_name || m.name || 'Unknown', code: c?.customer_code ?? null,
        email: c?.email || m.email || '', phone: c?.phone || m.phone || '', status: c?.status ?? null, items: []
      });
    }
    groups.get(key)!.items.push(m);
  });
  return [...groups.values()].map(g => {
    const items = g.items.slice().sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    return { ...g, items, last: items[items.length - 1], unread: items.filter(m => m.sender !== 'admin' && !m.read_by_admin).length };
  }).sort((a, b) => +new Date(b.last.created_at) - +new Date(a.last.created_at));
}

function Thread({ c, onChanged }: { c: Convo; onChanged: () => void }) {
  const thread = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [del, setDel] = useState<Message | null>(null);
  const seen = useRef(0);

  /* opening a conversation marks it read; the quiet poll keeps marking new arrivals */
  useEffect(() => {
    if (!c.unread) return;
    void (async () => {
      if (c.isGuest) await Promise.all(c.items.filter(m => !m.read_by_admin).map(m => RB_DB.markGuestMessageRead(m.id)));
      else await RB_DB.markThreadReadByAdmin(c.customerId!);
      onChanged();
    })();
  }, [c.unread, c.key]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* scroll to the bottom only when a bubble actually arrived */
  useEffect(() => {
    const t = thread.current; if (!t) return;
    if (c.items.length !== seen.current) t.scrollTop = t.scrollHeight;
    seen.current = c.items.length;
  }, [c.items.length]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim(); if (!t || sending) return;
    setSending(true);
    const r = await RB_DB.adminReplyToMessage(c.customerId!, t);
    setSending(false);
    if (!r.ok) return toast(r.error, true);
    setText(''); onChanged();
  }

  const mailHref = `mailto:${c.email}?subject=${encodeURIComponent('Re: your message to Riyadul BD')}`;
  return (
    <>
      <div className="msg-chat-head">
        <span className="msg-avatar">{initials(c.name)}</span>
        <div className="msg-chat-who"><b>{c.name}</b>
          <small>{c.isGuest ? 'Guest · no account' : `${c.code || 'Account'} · signed in`}{c.email ? ' · ' + c.email : ''}{c.phone ? ' · ' + c.phone : ''}</small></div>
        <a className="btn ghost sm" href={mailHref}><AdminIcon name="out" /> Reply by email</a>
      </div>
      <div className="msg-thread" id="mg-thread" ref={thread}>
        {c.items.map(m => {
          const seenByCustomer = m.sender === 'admin' ? !!m.read_by_customer : null;
          return (
            <div key={m.id} className={'abubble ' + (m.sender === 'admin' ? 'out' : 'in')}>
              {m.subject && <span className="abubble-subject">{m.subject}</span>}{m.message}
              <span className="abubble-time">{whenFull(m.created_at)}
                {seenByCustomer !== null && (
                  <span className={'abubble-status ' + (seenByCustomer ? 'seen' : '')} title={seenByCustomer ? 'Seen' : 'Sent'}>
                    <svg viewBox="0 0 20 16" width="15" height="12" aria-hidden="true">
                      <path d="M3 8.5 6.3 11.8 11 5.5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      {seenByCustomer && <path d="M7.5 8.5 10.8 11.8 15.5 5.5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                    </svg></span>)}
                <button type="button" className="abubble-del" aria-label="Delete" onClick={() => setDel(m)}>×</button></span>
            </div>
          );
        })}
      </div>
      {c.isGuest
        ? <div className="msg-noaccount">This person doesn't have an account, so a reply only reaches them by email — use the button above.</div>
        : (
          <form className="msg-composer" onSubmit={send}>
            <textarea placeholder="Type a reply — it appears in their account inbox" rows={1} required value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
            <button className="btn" type="submit" aria-label="Send" disabled={sending}><AdminIcon name="out" /></button>
          </form>
        )}
      {del && <ConfirmDelete what="this message" onClose={() => setDel(null)} onConfirm={async () => { await RB_DB.deleteMessage(del.id); toast('Message deleted.'); onChanged(); }} />}
    </>
  );
}

export default function Messages() {
  const qc = useQueryClient();
  /* no real-time push: a quiet poll picks up new messages and "seen" marks while the page is open.
     It only updates data — the reply box you're typing in is never rebuilt. */
  const { data } = useQuery({
    queryKey: ['admin-messages'], staleTime: 0, refetchOnMount: 'always', refetchInterval: 5000,
    queryFn: async () => {
      const [m, c] = await Promise.all([RB_DB.messages(), RB_DB.customers()]);
      return { msgs: m.ok ? m.data : [], customers: c.ok ? c.data : [] };
    }
  });
  const [q, setQ] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const convos = useMemo(() => buildConversations(data?.msgs ?? [], data?.customers ?? []), [data]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return !s ? convos : convos.filter(c => c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s) || c.phone.toLowerCase().includes(s) || c.items.some(m => (m.message || '').toLowerCase().includes(s)));
  }, [convos, q]);
  const active = convos.find(c => c.key === activeKey);
  const changed = () => { void qc.invalidateQueries({ queryKey: ['admin-messages'] }); void qc.invalidateQueries({ queryKey: ['admin-counts'] }); };
  const totalUnread = convos.reduce((s, c) => s + c.unread, 0), guests = convos.filter(c => c.isGuest).length;

  return (
    <main className="main" id="view">
      <div className="bar"><div><h1>Messages</h1><p>Everything sent through the contact page, and anything customers send from their account.</p></div></div>
      <div className="stats" style={{ marginBottom: 14 }}>
        <div className="stat"><span>Conversations</span><b>{convos.length}</b><i>{convos.length - guests} with an account</i></div>
        <div className="stat"><span>Unread</span><b>{totalUnread}</b><i>waiting on a reply</i></div>
        <div className="stat"><span>Guest inquiries</span><b>{guests}</b><i>reply by email only</i></div>
      </div>
      <div className="msgshell">
        <div className="msg-list">
          <div className="toolbar" style={{ margin: '0 0 8px' }}><input type="search" id="mg-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or message" /></div>
          <div className="msg-list-items" id="mg-items">
            {shown.length === 0 && <div className="empty">No messages match that.</div>}
            {shown.map(c => (
              <button key={c.key} className={'msg-item' + (c.key === activeKey ? ' on' : '') + (c.unread ? ' has-unread' : '')} onClick={() => setActiveKey(c.key)}>
                <span className="msg-avatar">{initials(c.name)}</span>
                <span className="msg-item-body">
                  <span className="msg-item-top"><b>{c.name}</b><span className="msg-item-time">{shortTime(c.last.created_at)}</span></span>
                  <span className="msg-item-preview">{c.last.sender === 'admin' && <i>You: </i>}{(c.last.message || '').slice(0, 60)}{(c.last.message || '').length > 60 ? '…' : ''}</span>
                  <span className="msg-item-tags">{c.isGuest ? <span className="pill off">Guest</span> : <span className="pill">{c.code || 'Account'}</span>}{c.status === 'blocked' && <> <span className="pill cancelled">Blocked</span></>}</span>
                </span>
                {c.unread > 0 && <span className="msg-badge">{c.unread}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="msg-chat" id="mg-chat">
          {active ? <Thread key={active.key} c={active} onChanged={changed} /> : <div className="empty" style={{ margin: 'auto' }}>Select a conversation to read it.</div>}
        </div>
      </div>
    </main>
  );
}
