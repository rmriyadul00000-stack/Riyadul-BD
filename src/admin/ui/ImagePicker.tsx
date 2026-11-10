import { useRef, useState } from 'react';
import { RB_DB } from '../../lib/db';
import { toast } from './toast';

/* Upload a file to a storage bucket, or paste a URL. Calls onPick with the resulting URL. */
export function ImagePicker({ bucket, onPick, label = 'Click to upload an image' }: { bucket: string; onPick: (url: string) => void; label?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  return (
    <>
      <div className="drop" onClick={() => file.current?.click()}>{label}</div>
      <input ref={file} type="file" accept="image/*" multiple className="hide" onChange={async e => {
        for (const f of Array.from(e.target.files ?? [])) {
          const r = await RB_DB.uploadImage(f, bucket);
          if (r.ok) onPick(r.data); else toast(r.error, true);
        }
        e.target.value = '';
      }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} style={{ flex: 1, padding: '9px 11px', border: '1.5px solid var(--a-line)', borderRadius: 8 }} />
        <button className="btn ghost sm" type="button" onClick={() => { const u = url.trim(); if (u) { onPick(u); setUrl(''); } }}>Use URL</button>
      </div>
    </>
  );
}
