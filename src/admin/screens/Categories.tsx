import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RB_DB } from '../../lib/db';
import type { Category } from '../../lib/types';
import { useAdminUi } from '../AdminUi';
import { slugify } from '../productHelpers';
import { useCategoriesAdmin, useProductsAdmin } from '../queries';
import { ConfirmDelete } from '../ui/Confirm';
import { ImagePicker } from '../ui/ImagePicker';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/toast';

function Banner({ title, value, wide, onPick }: { title: string; value: string; wide?: boolean; onPick: (u: string) => void }) {
  return (
    <div className="banner-slot">
      <h4>{title}</h4>
      <div className={'banner-preview ' + (wide ? 'wide ' : '') + (value ? '' : 'empty')}>{value && <img src={value} alt="" />}</div>
      <ImagePicker bucket="category-media" label="Click to upload" onPick={onPick} />
    </div>
  );
}

function EditCategory({ cat, count, onClose, onSaved }: { cat: Category | null; count: number; onClose: () => void; onSaved: () => void }) {
  const isNew = !cat;
  const [f, setF] = useState({
    name: cat?.name ?? '', name_bn: cat?.name_bn ?? '', slug: cat?.slug ?? '', sort: cat?.sort ?? count + 1, icon_svg: cat?.icon_svg ?? '',
    image_url: cat?.image_url ?? '', desktop_banner_url: cat?.desktop_banner_url ?? '', mobile_banner_url: cat?.mobile_banner_url ?? '', active: cat?.active !== false
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(s => ({ ...s, [k]: v }));
  async function save() {
    const name = f.name.trim();
    if (!name) return toast('Give the category a name.', true);
    const r = await RB_DB.saveCategory({ ...cat, name, name_bn: f.name_bn.trim(), slug: f.slug.trim() || slugify(name), sort: Number(f.sort || 0),
      icon_svg: f.icon_svg.trim(), image_url: f.image_url, desktop_banner_url: f.desktop_banner_url, mobile_banner_url: f.mobile_banner_url, active: f.active });
    if (!r.ok) return toast(r.error, true);
    toast('Category saved.'); onSaved(); onClose();
  }
  return (
    <Modal title={isNew ? 'Add category' : 'Edit category'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <div className="grid2">
        <div className="field"><label htmlFor="c-name">Name</label><input id="c-name" value={f.name} onChange={e => set('name', e.target.value)} /></div>
        <div className="field"><label htmlFor="c-bn">Name in Bangla</label><input id="c-bn" value={f.name_bn} onChange={e => set('name_bn', e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="c-slug">URL name</label><input id="c-slug" value={f.slug} placeholder="leave blank to generate" onChange={e => set('slug', e.target.value)} /></div>
        <div className="field"><label htmlFor="c-sort">Position</label><input id="c-sort" type="number" value={f.sort} onChange={e => set('sort', Number(e.target.value))} /></div>
      </div>
      <div className="field"><label htmlFor="c-svg">Icon (SVG markup)</label>
        <textarea id="c-svg" spellCheck={false} placeholder='<svg viewBox="0 0 24 24">…</svg>' value={f.icon_svg} onChange={e => set('icon_svg', e.target.value)} />
        <small>Use <code>stroke="currentColor"</code> or <code>fill="currentColor"</code> so the icon picks up the shop colours.</small>
        <div className="svg-preview" dangerouslySetInnerHTML={{ __html: f.icon_svg }} />
      </div>
      <div className="field"><label>Category image</label>
        <ImagePicker bucket="category-media" label="Click to upload an image for this aisle" onPick={u => set('image_url', u)} />
        {f.image_url && <div className="imgs"><figure><img src={f.image_url} alt="" /><button type="button" aria-label="Remove image" onClick={() => set('image_url', '')}>×</button></figure></div>}
        <small>Used on the small "shop by category" tile and as a fallback if no banner is set. Leave empty to show the SVG icon there instead.</small>
      </div>
      <div className="field"><label>Homepage category banner</label>
        <small>Shown on the homepage above this category's products. Upload both — the site swaps between them by screen size.</small>
        <div className="banner-pair">
          <Banner title="Desktop — 1:1 square" value={f.desktop_banner_url} onPick={u => set('desktop_banner_url', u)} />
          <Banner title="Mobile — 16:9 wide" wide value={f.mobile_banner_url} onPick={u => set('mobile_banner_url', u)} />
        </div>
      </div>
      <label className="check"><input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> Visible in the shop</label>
    </Modal>
  );
}

export default function Categories() {
  const qc = useQueryClient();
  const ui = useAdminUi();
  const { data: cats = [] } = useCategoriesAdmin();
  const { data: products = [] } = useProductsAdmin();
  const [edit, setEdit] = useState<Category | null | undefined>(undefined);
  const [del, setDel] = useState<Category | null>(null);
  const reload = () => void qc.invalidateQueries();
  const sorted = cats.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const countOf = (slug: string) => products.filter(p => p.cat === slug).length;
  return (
    <main className="main" id="view">
      <div className="bar"><div><h1>Categories</h1><p>Name, icon, image, order and visibility. Saving here changes the shop straight away.</p></div><button className="btn" onClick={() => setEdit(null)}>Add category</button></div>
      <div className="stats" style={{ marginBottom: 16 }}>
        <div className="stat"><span>Aisles</span><b>{cats.length}</b><i>{cats.filter(c => c.active !== false).length} live</i></div>
        <div className="stat"><span>Products catalogued</span><b>{products.length}</b><i>across all aisles</i></div>
        <div className="stat"><span>Empty aisles</span><b>{cats.filter(c => !countOf(c.slug)).length}</b><i>no products assigned yet</i></div>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Icon</th><th>Name</th><th>Image</th><th>URL</th><th>Order</th><th>Products</th><th>Status</th><th /></tr></thead>
        <tbody id="c-rows">{sorted.map(c => (
          <tr key={c.id}>
            <td><span className="cat-icon" dangerouslySetInnerHTML={{ __html: c.icon_svg || '' }} /></td>
            <td><a href="#" className="item-link" onClick={e => { e.preventDefault(); ui.openCategory(c.slug); }}><b>{c.name}</b></a><br /><small style={{ color: 'var(--a-mute)' }}>{c.name_bn || ''}</small></td>
            <td>{c.image_url ? <img className="thumb" src={c.image_url} alt="" /> : <small style={{ color: 'var(--a-mute)' }}>—</small>}</td>
            <td><code>/category/{c.slug}</code></td><td>{c.sort || 0}</td><td>{countOf(c.slug)}</td>
            <td><span className={'pill ' + (c.active === false ? 'off' : '')}>{c.active === false ? 'Hidden' : 'Live'}</span></td>
            <td><div className="rowactions">
              <button className="btn ghost sm" onClick={() => ui.openCategory(c.slug)}>Performance</button>
              <button className="btn ghost sm" onClick={() => setEdit(c)}>Edit</button>
              <button className="btn red sm" onClick={() => { const n = countOf(c.slug); n ? toast(`Move the ${n} product(s) in this aisle first.`, true) : setDel(c); }}>Delete</button></div></td>
          </tr>))}</tbody></table></div>
      {edit !== undefined && <EditCategory cat={edit} count={cats.length} onClose={() => setEdit(undefined)} onSaved={reload} />}
      {del && <ConfirmDelete what={del.name} onClose={() => setDel(null)} onConfirm={async () => { await RB_DB.deleteCategory(del.id); reload(); toast('Category deleted.'); }} />}
    </main>
  );
}
