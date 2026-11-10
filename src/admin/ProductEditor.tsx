import { useState } from 'react';
import { RB_DB, rbPromoState } from '../lib/db';
import type { Category, Product, Variant } from '../lib/types';
import { when, whenFull } from './format';
import { clamp, effectiveDiscount, fromLocalInput, rowDiscount, slugify, toLocalInput } from './productHelpers';
import { ImagePicker } from './ui/ImagePicker';
import { Modal } from './ui/Modal';
import { toast } from './ui/toast';

const blank = (cats: Category[]): Product => ({
  id: '', slug: '', name: '', name_bn: '', cat: cats[0]?.slug ?? '', farm: '', origin: '',
  variants: [{ label: '', price: 0, mrp: 0, stock: 0 }], images: [], certified: false, featured: false, hot_deal: false,
  hot_deal_sort: 0, discount_pct: null, active: true, description: '', benefits: [], storage_tip: ''
});

export function ProductEditor({ product, cats, onClose, onSaved }: { product: Product | null; cats: Category[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !product;
  const p0 = product ?? blank(cats);

  /* one promo % if every size already agrees, otherwise blank rather than guess */
  const pcts = p0.variants.filter(v => Number(v.promo_price) > 0).map(v => {
    const base = Number(v.mrp) > 0 ? Number(v.mrp) : Number(v.price) || 0;
    return base ? Math.round((base - Number(v.promo_price)) / base * 100) : null;
  }).filter((x): x is number => x != null);
  const promo0 = pcts.length && pcts.every(x => x === pcts[0]) ? String(pcts[0]) : '';

  const [f, setF] = useState({
    name: p0.name, name_bn: p0.name_bn ?? '', cat: p0.cat, farm: p0.farm ?? '', origin: p0.origin ?? '',
    description: p0.description ?? '', benefits: (p0.benefits ?? []).join('\n'), storage_tip: p0.storage_tip ?? '',
    certified: p0.certified, featured: p0.featured, active: p0.active !== false, hot_deal: !!p0.hot_deal, hot_deal_sort: p0.hot_deal_sort ?? 0,
    discount: p0.discount_pct ? String(p0.discount_pct) : '', promoPct: promo0,
    promoStart: toLocalInput(p0.promo_start), promoEnd: toLocalInput(p0.promo_end), promoAuto: !!p0.hot_deal_auto
  });
  const [variants, setVariants] = useState<Variant[]>(p0.variants.map(v => ({ ...v })));
  const [images, setImages] = useState<string[]>(p0.images.slice());
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(s => ({ ...s, [k]: v }));

  /* Price, Was and Discount% stay in sync per size, both ways. Nothing is forced without a Was set. */
  function editVariant(i: number, field: string, raw: string) {
    setVariants(vs => vs.map((v, k) => {
      if (k !== i) return v;
      if (field === 'label') return { ...v, label: raw };
      if (field === 'disc') {
        const d = clamp(Number(raw || 0), 0, 95);
        return v.mrp ? { ...v, price: Math.round(v.mrp * (1 - d / 100)) } : v;
      }
      return { ...v, [field]: Number(raw || 0) };
    }));
  }

  const forced = f.discount === '' ? null : Number(f.discount);
  const badge = forced != null ? forced : effectiveDiscount({ variants, discount_pct: null });

  const startISO = fromLocalInput(f.promoStart), endISO = fromLocalInput(f.promoEnd);
  let promoStatus = <p className="hint">No promotion set.</p>;
  if (f.promoPct) {
    if (f.promoEnd && new Date(f.promoEnd) <= (f.promoStart ? new Date(f.promoStart) : new Date())) promoStatus = <p className="hint neg">The end time has to be after the start time.</p>;
    else {
      const st = rbPromoState({ promo_start: startISO, promo_end: endISO, variants: [{ label: '', price: 0, promo_price: 1 }] });
      promoStatus = <p className={'hint ' + (st === 'expired' ? 'neg' : '')}>{st === 'scheduled' ? `Starts ${when(startISO)}` : st === 'expired' ? 'This window has already passed — pick a later end time.'
        : endISO ? `Running now — ends ${whenFull(endISO)}` : 'Running now — no end time, so it stays on until you clear it.'}</p>;
    }
  }

  async function save() {
    const name = f.name.trim();
    if (!name) return toast('Give the product a name.', true);
    const vs = variants.filter(v => v.label.trim());
    if (!vs.length) return toast('Add at least one size with a label.', true);
    const pct = f.promoPct === '' ? null : clamp(Number(f.promoPct), 0, 95);
    if (endISO && startISO && new Date(endISO) <= new Date(startISO)) return toast('The promotion end has to be after the start.', true);
    const out = pct == null
      ? vs.map(v => { const c = { ...v }; delete c.promo_price; return c; })
      : vs.map(v => { const base = Number(v.mrp) > 0 ? Number(v.mrp) : Number(v.price) || 0; return { ...v, promo_price: Math.round(base * (1 - pct / 100)) }; });
    setBusy(true);
    const r = await RB_DB.saveProduct({
      ...p0, ...(isNew ? { id: undefined } : {}), name, name_bn: f.name_bn.trim(), slug: p0.slug || slugify(name), cat: f.cat,
      farm: f.farm.trim(), origin: f.origin.trim(), variants: out, images, description: f.description.trim(),
      benefits: f.benefits.split('\n').map(s => s.trim()).filter(Boolean), storage_tip: f.storage_tip.trim(),
      certified: f.certified, featured: f.featured, hot_deal: f.hot_deal, hot_deal_sort: Number(f.hot_deal_sort || 0),
      discount_pct: f.discount === '' ? null : Number(f.discount),
      promo_start: pct == null ? null : startISO, promo_end: pct == null ? null : endISO, hot_deal_auto: f.promoAuto, active: f.active
    });
    setBusy(false);
    if (!r.ok) return toast(r.error, true);
    toast(isNew ? 'Product added.' : 'Changes saved.'); onSaved(); onClose();
  }

  return (
    <Modal title={isNew ? 'Add product' : 'Edit product'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={save}>{isNew ? 'Add product' : 'Save changes'}</button></>}>
      {!isNew && <p style={{ margin: '-4px 0 12px' }}><span className="pill">SKU {p0.sku || '—'}</span> <small style={{ color: 'var(--a-mute)' }}>assigned automatically, can't be changed</small></p>}
      <div className="grid2">
        <div className="field"><label htmlFor="f-name">Name</label><input id="f-name" value={f.name} onChange={e => set('name', e.target.value)} /></div>
        <div className="field"><label htmlFor="f-namebn">Name in Bangla</label><input id="f-namebn" value={f.name_bn} onChange={e => set('name_bn', e.target.value)} /></div>
      </div>
      <div className="grid3">
        <div className="field"><label htmlFor="f-cat">Aisle</label><select id="f-cat" value={f.cat} onChange={e => set('cat', e.target.value)}>{cats.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="f-farm">Farm</label><input id="f-farm" value={f.farm} onChange={e => set('farm', e.target.value)} /></div>
        <div className="field"><label htmlFor="f-origin">Grown in</label><input id="f-origin" value={f.origin} onChange={e => set('origin', e.target.value)} /></div>
      </div>

      <div className="field"><label>Sizes, stock &amp; pricing</label>
        <div className="vhead v2"><span>Label</span><span>Price</span><span>Was</span><span>Discount</span><span>Stock</span><span /></div>
        <div className="variants">
          {variants.map((v, i) => (
            <div className="variant v2" key={i}>
              <input placeholder="500 g / 1 kg / 1 piece" value={v.label} onChange={e => editVariant(i, 'label', e.target.value)} />
              <input type="number" min={0} placeholder="Price" value={v.price || ''} onChange={e => editVariant(i, 'price', e.target.value)} />
              <input type="number" min={0} placeholder="Was" value={v.mrp || ''} onChange={e => editVariant(i, 'mrp', e.target.value)} />
              <span className="disc"><input type="number" min={0} max={95} placeholder="Auto" value={rowDiscount(v)} onChange={e => editVariant(i, 'disc', e.target.value)} /></span>
              <input type="number" min={0} placeholder="Stock" value={v.stock ?? 0} onChange={e => editVariant(i, 'stock', e.target.value)} />
              <button type="button" aria-label="Remove size" onClick={() => variants.length === 1 ? toast('Keep at least one size.', true) : setVariants(vs => vs.filter((_, k) => k !== i))}>×</button>
            </div>
          ))}
        </div>
        <button className="btn ghost sm" type="button" style={{ marginTop: 8 }} onClick={() => setVariants(vs => [...vs, { label: '', price: 0, mrp: 0, stock: 0 }])}>Add another size</button>
        <small className="linked-hint">Price, Was and Discount are linked for each size: set “Was” then type a Discount % to set Price automatically, or type a Price to see the Discount work itself out.</small>
      </div>

      <div className="field"><label>Photos</label>
        <ImagePicker bucket="product-media" label="Click to choose photos, or paste an image URL below" onPick={u => setImages(im => [...im, u])} />
        <div className="imgs">{images.map((src, i) => <figure key={src + i}><img src={src} alt="" /><button type="button" aria-label="Remove photo" onClick={() => setImages(im => im.filter((_, k) => k !== i))}>×</button></figure>)}</div>
      </div>

      <div className="field"><label htmlFor="f-desc">Description</label><textarea id="f-desc" value={f.description} onChange={e => set('description', e.target.value)} /></div>
      <div className="field"><label htmlFor="f-benefits">Selling points</label><textarea id="f-benefits" placeholder="One per line" value={f.benefits} onChange={e => set('benefits', e.target.value)} /></div>
      <div className="field"><label htmlFor="f-storage">Storage advice</label><input id="f-storage" value={f.storage_tip} onChange={e => set('storage_tip', e.target.value)} /></div>

      <label className="check"><input type="checkbox" checked={f.certified} onChange={e => set('certified', e.target.checked)} /> Certified organic</label>
      <label className="check"><input type="checkbox" checked={f.featured} onChange={e => set('featured', e.target.checked)} /> Show on the home page</label>
      <label className="check"><input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> Visible in the shop</label>
      <div className="grid2" style={{ alignItems: 'end' }}>
        <div className="field"><label htmlFor="f-discount">Discount badge % (override)</label><input id="f-discount" type="number" min={0} max={95} placeholder="Auto from Was/Price" value={f.discount} onChange={e => set('discount', e.target.value)} /></div>
        <small style={{ paddingBottom: 10 }}>Only overrides the badge shown on the shop. Leave blank to show whatever the sizes above work out to. It never changes a size's actual Price — use the per-size Discount column for that.</small>
      </div>
      {badge ? <span className="badge-preview">🏷 {badge}% OFF {forced != null ? '(forced)' : '(from sizes above)'}</span>
        : <span className="badge-preview off">No badge — set “Was” higher than “Price” on a size, or force a %</span>}

      <div className="card" style={{ margin: '16px 0', background: 'var(--a-panel-2)' }}>
        <h3 style={{ fontSize: '.95rem', marginBottom: 4 }}>Scheduled promotion</h3>
        <p className="hint">Optional. While this is running, every size's price is “Was (or Price) minus this %”. The moment the end time passes, every size returns to the default Price/Was you set above and the badge resets — nothing to undo by hand. Leave the % empty to remove any promotion.</p>
        <div className="grid3">
          <div className="field"><label htmlFor="f-promo-pct">Promotion discount %</label><input id="f-promo-pct" type="number" min={0} max={95} placeholder="e.g. 20" value={f.promoPct} onChange={e => set('promoPct', e.target.value)} /></div>
          <div className="field"><label htmlFor="f-promo-start">Starts</label><input id="f-promo-start" type="datetime-local" value={f.promoStart} onChange={e => set('promoStart', e.target.value)} /></div>
          <div className="field"><label htmlFor="f-promo-end">Ends</label><input id="f-promo-end" type="datetime-local" value={f.promoEnd} onChange={e => set('promoEnd', e.target.value)} /></div>
        </div>
        <label className="check"><input type="checkbox" checked={f.promoAuto} onChange={e => set('promoAuto', e.target.checked)} /> Also remove from Hot Deals automatically when it ends</label>
        {promoStatus}
      </div>

      <div className="grid2" style={{ alignItems: 'end', marginTop: 6 }}>
        <label className="check"><input type="checkbox" checked={f.hot_deal} onChange={e => set('hot_deal', e.target.checked)} /> Show in Hot Deals</label>
        <div className="field"><label htmlFor="f-hotsort">Hot Deals order</label><input id="f-hotsort" type="number" min={0} value={f.hot_deal_sort} onChange={e => set('hot_deal_sort', Number(e.target.value))} /></div>
      </div>
    </Modal>
  );
}
