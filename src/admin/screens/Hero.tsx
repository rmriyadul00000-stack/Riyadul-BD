import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RB_DB } from '../../lib/db';
import type { HeroSlide } from '../../lib/types';
import { ConfirmDelete } from '../ui/Confirm';
import { ImagePicker } from '../ui/ImagePicker';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/toast';

type Device = 'desktop' | 'mobile';

function AddSlide({ device: d0, onClose, onSaved }: { device: Device; onClose: () => void; onSaved: () => void }) {
  const [device, setDevice] = useState<Device>(d0);
  const [image, setImage] = useState('');
  const [alt, setAlt] = useState('');
  const [active, setActive] = useState(true);
  async function save() {
    if (!image) return toast('Upload an image or paste a URL first.', true);
    const r = await RB_DB.saveHeroSlide({ device, image_url: image, alt: alt.trim(), sort: 99, active });
    if (!r.ok) return toast(r.error, true);
    toast('Slide added.'); onSaved(); onClose();
  }
  return (
    <Modal title="Add hero slide" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Add slide</button></>}>
      <div className="field"><label htmlFor="s-device">Device</label>
        <select id="s-device" value={device} onChange={e => setDevice(e.target.value as Device)}>
          <option value="desktop">Desktop (wide, about 1600 × 640)</option><option value="mobile">Mobile (tall, about 800 × 900)</option></select></div>
      <div className="field"><label>Image</label>
        <ImagePicker bucket="hero-media" label="Click to upload the hero image" onPick={setImage} />
        {image && <div className="imgs"><figure style={{ width: 140, height: 80 }}><img src={image} alt="" /></figure></div>}
      </div>
      <div className="field"><label htmlFor="s-alt">Description</label><input id="s-alt" placeholder="What the photo shows" value={alt} onChange={e => setAlt(e.target.value)} /></div>
      <label className="check"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Show this slide on the site</label>
    </Modal>
  );
}

function SlideRow({ s, i, n, onMove, onChanged, onDelete }: { s: HeroSlide; i: number; n: number; onMove: (dir: -1 | 1) => void; onChanged: () => void; onDelete: () => void }) {
  const [alt, setAlt] = useState(s.alt || '');
  const off = s.active === false;
  return (
    <div className={'slide' + (off ? ' is-off' : '')}>
      <img src={s.image_url} alt={s.alt || ''} />
      <div className="slide-body">
        <div className="slide-head"><b>Slide {i + 1}</b><span className={'pill ' + (off ? 'off' : '')}>{off ? 'Hidden' : 'Live'}</span></div>
        <input className="slide-alt" value={alt} placeholder="Describe the image (for screen readers)" onChange={e => setAlt(e.target.value)}
          onBlur={async () => { if (alt.trim() === (s.alt || '')) return; await RB_DB.saveHeroSlide({ ...s, alt: alt.trim() }); toast('Slide saved.'); onChanged(); }} />
        <div className="rowactions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
          <button className="btn ghost sm" disabled={i === 0} onClick={() => onMove(-1)}>Move up</button>
          <button className="btn ghost sm" disabled={i === n - 1} onClick={() => onMove(1)}>Move down</button>
          <button className="btn ghost sm" onClick={async () => { await RB_DB.saveHeroSlide({ ...s, active: off }); onChanged(); }}>{off ? 'Show' : 'Hide'}</button>
          <button className="btn red sm" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  const qc = useQueryClient();
  const { data: slides = [] } = useQuery({ queryKey: ['hero-all'], staleTime: 0, refetchOnMount: 'always',
    queryFn: async () => { const r = await RB_DB.hero(undefined, true); return r.ok ? r.data : []; } });
  const [device, setDevice] = useState<Device>('desktop');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<HeroSlide | null>(null);
  const reload = () => { void qc.invalidateQueries({ queryKey: ['hero-all'] }); void qc.invalidateQueries({ queryKey: ['hero'] }); };
  const list = useMemo(() => slides.filter(s => s.device === device).sort((a, b) => (a.sort || 0) - (b.sort || 0)), [slides, device]);

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= list.length) return;
    await RB_DB.saveHeroSlide({ ...list[i], sort: j + 1 });
    await RB_DB.saveHeroSlide({ ...list[j], sort: i + 1 });
    reload();
  }

  return (
    <main className="main" id="view">
      <div className="bar">
        <div><h1>Hero slides</h1><p>Images only — no text sits on top of them. Upload a separate set for desktop and mobile; the site picks the right one and fades between the active slides.</p></div>
        <button className="btn" onClick={() => setAdding(true)}>Add slide</button>
      </div>
      <div className="toolbar">
        <select value={device} onChange={e => setDevice(e.target.value as Device)}><option value="desktop">Desktop (wide)</option><option value="mobile">Mobile (tall)</option></select>
        <span style={{ color: 'var(--a-mute)', fontSize: '.86rem' }}>{device === 'desktop' ? 'Best around 1600 × 640. Shown above 760px wide.' : 'Best around 800 × 900. Shown on phones.'}</span>
      </div>
      <div className="slides">
        {list.length === 0 && <div className="empty">No {device} slides yet. The hero stays hidden until one is added.</div>}
        {list.map((s, i) => <SlideRow key={s.id + (s.alt ?? '')} s={s} i={i} n={list.length} onMove={d => move(i, d)} onChanged={reload} onDelete={() => setDeleting(s)} />)}
      </div>
      {adding && <AddSlide device={device} onClose={() => setAdding(false)} onSaved={reload} />}
      {deleting && <ConfirmDelete what="this slide" onClose={() => setDeleting(null)} onConfirm={async () => { await RB_DB.deleteHeroSlide(deleting.id); reload(); toast('Slide deleted.'); }} />}
    </main>
  );
}
