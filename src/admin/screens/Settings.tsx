import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RB_DB } from '../../lib/db';
import type { Settings as SettingsMap } from '../../lib/types';
import { DEMO_PASS, useAdmin } from '../auth';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/toast';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const LOGO_DEFAULT = '/assets/img/logo.svg';

function ConfirmPassword({ onClose, onConfirmed }: { onClose: () => void; onConfirmed: () => Promise<void> }) {
  const { admin, mode } = useAdmin();
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true); setErr('');
    const ok = mode === 'live'
      ? (await RB_DB.adminLogin({ email: admin.email, password: pass })).ok
      : pass === DEMO_PASS;
    if (!ok) { setBusy(false); setErr(mode === 'live' ? 'Wrong password.' : 'Wrong passcode.'); return; }
    await onConfirmed();
    onClose();
  }
  return (
    <Modal title="Confirm your password" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={confirm}>{busy ? 'Checking…' : 'Confirm & save'}</button></>}>
      <p style={{ color: 'var(--a-mute)', fontSize: '.9rem', margin: '0 0 14px' }}>Logo changes are visible on every page right away — re-enter your admin password to confirm.</p>
      <div className="field"><label htmlFor="s-logo-pass">Password</label>
        <input id="s-logo-pass" type="password" autoComplete="current-password" autoFocus value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void confirm(); }} /></div>
      {err && <p style={{ color: 'var(--a-red)', fontSize: '.85rem', marginTop: 8 }}>{err}</p>}
    </Modal>
  );
}

function Form({ s }: { s: SettingsMap }) {
  const qc = useQueryClient();
  const [announce, setAnnounce] = useState(String(s.announcement_text ?? ''));
  const [logo, setLogo] = useState(String(s.logo_url ?? ''));
  const [height, setHeight] = useState(Number(s.logo_height) || 40);
  const [width, setWidth] = useState(s.logo_width ? Number(s.logo_width) : 0);
  const [lock, setLock] = useState(!s.logo_width);
  const [fit, setFit] = useState(String(s.logo_fit || 'contain'));
  const [shape, setShape] = useState(String(s.logo_shape || 'none'));
  const [asking, setAsking] = useState(false);
  const fileRef = useState<{ current: HTMLInputElement | null }>(() => ({ current: null }))[0];

  const h = Math.max(16, height);
  const imgStyle = {
    height: h, objectFit: (shape === 'circle' ? 'cover' : fit) as 'cover' | 'contain',
    width: shape === 'circle' ? h : (lock || !width ? 'auto' : width)
  };
  const imgClass = shape === 'circle' ? 'shape-circle' : shape === 'rounded' ? 'shape-rounded' : 'shape-none';

  async function saveAnnounce() {
    const r = await RB_DB.saveSetting('announcement_text', announce.trim());
    toast(r.ok ? 'Announcement saved.' : r.error, !r.ok);
    void qc.invalidateQueries({ queryKey: ['settings'] });
  }
  async function saveLogo() {
    const w = lock ? '' : String(clamp(width, 0, 400) || '');
    const results = await Promise.all([
      RB_DB.saveSetting('logo_url', logo), RB_DB.saveSetting('logo_height', String(clamp(height, 16, 200))),
      RB_DB.saveSetting('logo_width', w), RB_DB.saveSetting('logo_fit', fit), RB_DB.saveSetting('logo_shape', shape)
    ]);
    const bad = results.find(r => !r.ok);
    toast(bad && !bad.ok ? bad.error : 'Logo saved.', !!bad);
    void qc.invalidateQueries({ queryKey: ['settings'] });
  }

  return (
    <>
      <div className="card" style={{ maxWidth: 640, marginBottom: 18 }}>
        <h3 style={{ fontSize: '1.05rem', marginBottom: 4 }}>Announcement bar</h3>
        <p style={{ color: 'var(--a-mute)', fontSize: '.86rem', margin: '0 0 12px' }}>Shown under the header on every page. It scrolls continuously on phones and stays still on desktop. Leave it empty to hide the bar entirely.</p>
        <div className="field"><label htmlFor="s-announce">Announcement text</label>
          <input id="s-announce" value={announce} placeholder="Free Delivery Across Bangladesh • Easy Returns • Trusted Products" onChange={e => setAnnounce(e.target.value)} /></div>
        <div className="settings-preview"><div className="announce-demo">{announce.trim() || '(nothing set — bar is hidden)'}</div></div>
        <button className="btn" style={{ marginTop: 14 }} onClick={saveAnnounce}>Save announcement</button>
      </div>

      <div className="card" style={{ maxWidth: 820 }}>
        <h3 style={{ fontSize: '1.05rem', marginBottom: 4 }}>Logo studio</h3>
        <p style={{ color: 'var(--a-mute)', fontSize: '.86rem', margin: '0 0 12px' }}>Used in the header on every page. Upload a file, or point it at an image path (for example <code>/assets/img/logo.svg</code>). Leave empty to use the default mark. Set the size and fit below and it's shown consistently without stretching.</p>
        <div className="logo-studio">
          <div>
            <div className="field"><label htmlFor="s-logo-url">Logo URL or path</label>
              <input id="s-logo-url" value={logo} placeholder="/assets/img/logo.svg" onChange={e => setLogo(e.target.value.trim())} /></div>
            <div className="drop" onClick={() => fileRef.current?.click()}>Click to upload a logo file instead</div>
            <input ref={el => { fileRef.current = el; }} type="file" accept="image/*" className="hide" onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return;
              const r = await RB_DB.uploadImage(f, 'category-media');
              if (!r.ok) return toast(r.error, true);
              setLogo(r.data);
            }} />
          </div>
          <div>
            <div className="grid2">
              <div className="field"><label htmlFor="s-logo-height">Height (px)</label><input id="s-logo-height" type="number" min={16} max={200} value={height} onChange={e => setHeight(Number(e.target.value))} /></div>
              <div className="field"><label htmlFor="s-logo-width">Width (px)</label><input id="s-logo-width" type="number" min={0} max={400} value={width || ''} placeholder="Auto" disabled={lock} onChange={e => setWidth(Number(e.target.value))} /></div>
            </div>
            <label className="check"><input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} /> Lock width to auto (keeps the logo's own proportions)</label>
            <div className="field"><label htmlFor="s-logo-fit">Image fit</label>
              <select id="s-logo-fit" value={fit} onChange={e => setFit(e.target.value)}><option value="contain">Contain — show the whole logo</option><option value="cover">Cover — fill the box, crop edges</option></select></div>
            <div className="field"><label htmlFor="s-logo-shape">Frame shape</label>
              <select id="s-logo-shape" value={shape} onChange={e => setShape(e.target.value)}><option value="none">None</option><option value="rounded">Rounded corners</option><option value="circle">Circle</option></select></div>
          </div>
        </div>
        <div className="logo-preview-pair">
          <div className="pv light"><img className={imgClass} style={imgStyle} src={logo || LOGO_DEFAULT} alt="" /><small>On a light header</small></div>
          <div className="pv dark"><img className={imgClass} style={imgStyle} src={logo || LOGO_DEFAULT} alt="" /><small>On a dark header</small></div>
        </div>
        <p style={{ color: 'var(--a-mute)', fontSize: '.8rem', margin: '14px 0 0' }}>Saving the logo asks for your admin password again, as a safety check.</p>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => setAsking(true)}>Save logo</button>
      </div>
      {asking && <ConfirmPassword onClose={() => setAsking(false)} onConfirmed={saveLogo} />}
    </>
  );
}

export default function Settings() {
  const { data, isLoading } = useQuery({ queryKey: ['settings-admin'], staleTime: 0, refetchOnMount: 'always',
    queryFn: async () => { const r = await RB_DB.settings(); return r.ok ? r.data : {}; } });
  return (
    <main className="main" id="view">
      <div className="bar"><div><h1>Settings</h1><p>The announcement bar text and the site logo — both update everywhere the moment you save.</p></div></div>
      {isLoading || !data ? <div className="empty">Loading…</div> : <Form s={data} />}
    </main>
  );
}
