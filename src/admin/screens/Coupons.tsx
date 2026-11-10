import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RB_DB } from '../../lib/db';
import type { Coupon, CouponType } from '../../lib/types';
import { money } from '../format';
import { ConfirmDelete } from '../ui/Confirm';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/toast';

const describe = (c: Coupon) => c.type === 'percent' ? `${c.value}% off` : c.type === 'flat' ? `${money(c.value)} off` : 'Free delivery';

function EditCoupon({ coupon, onClose, onSaved }: { coupon: Coupon | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !coupon;
  const [f, setF] = useState({ code: coupon?.code ?? '', type: (coupon?.type ?? 'percent') as CouponType, value: coupon?.value ?? 10, min: coupon?.min_subtotal ?? 0, note: coupon?.note ?? '', active: coupon?.active !== false });
  async function save() {
    const code = f.code.trim().toUpperCase();
    if (!code) return toast('Enter a code.', true);
    const r = await RB_DB.saveCoupon({ code, type: f.type, value: Number(f.value || 0), min_subtotal: Number(f.min || 0), note: f.note.trim(), active: f.active });
    if (!r.ok) return toast(r.error, true);
    toast('Code saved.'); onSaved(); onClose();
  }
  return (
    <Modal title={isNew ? 'Add code' : 'Edit code'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <div className="grid2">
        <div className="field"><label htmlFor="k-code">Code</label><input id="k-code" value={f.code} disabled={!isNew} placeholder="FRESH10" onChange={e => setF({ ...f, code: e.target.value })} /></div>
        <div className="field"><label htmlFor="k-type">Type</label><select id="k-type" value={f.type} onChange={e => setF({ ...f, type: e.target.value as CouponType })}>
          <option value="percent">Percentage off</option><option value="flat">Flat amount off</option><option value="shipping">Free delivery</option></select></div>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="k-value">Value</label><input id="k-value" type="number" min={0} value={f.value} onChange={e => setF({ ...f, value: Number(e.target.value) })} /><small>Ignored for free delivery.</small></div>
        <div className="field"><label htmlFor="k-min">Minimum spend</label><input id="k-min" type="number" min={0} value={f.min} onChange={e => setF({ ...f, min: Number(e.target.value) })} /></div>
      </div>
      <div className="field"><label htmlFor="k-note">Short description</label><input id="k-note" value={f.note} placeholder="Shown to the shopper when the code works" onChange={e => setF({ ...f, note: e.target.value })} /></div>
      <label className="check"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Code is live</label>
    </Modal>
  );
}

export default function Coupons() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: ['coupons-all'], staleTime: 0, refetchOnMount: 'always',
    queryFn: async () => { const r = await RB_DB.coupons(true); return r.ok ? r.data : []; } });
  const [edit, setEdit] = useState<Coupon | null | undefined>(undefined);   // undefined = closed, null = new
  const [del, setDel] = useState<Coupon | null>(null);
  const reload = () => void qc.invalidateQueries({ queryKey: ['coupons-all'] });
  return (
    <main className="main" id="view">
      <div className="bar"><div><h1>Discount codes</h1><p>Codes shoppers type at checkout. Percentage, flat amount, or free delivery.</p></div>
        <button className="btn" onClick={() => setEdit(null)}>Add code</button></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Code</th><th>What it does</th><th>Minimum spend</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={5}><div className="empty">No codes yet.</div></td></tr>}
          {list.map(c => (
            <tr key={c.code}>
              <td><b>{c.code}</b></td>
              <td>{describe(c)}<br /><small style={{ color: 'var(--a-mute)' }}>{c.note || ''}</small></td>
              <td>{money(c.min_subtotal || 0)}</td>
              <td><span className={'pill ' + (c.active === false ? 'off' : '')}>{c.active === false ? 'Off' : 'Active'}</span></td>
              <td><div className="rowactions"><button className="btn ghost sm" onClick={() => setEdit(c)}>Edit</button><button className="btn red sm" onClick={() => setDel(c)}>Delete</button></div></td>
            </tr>))}
        </tbody></table></div>
      {edit !== undefined && <EditCoupon coupon={edit} onClose={() => setEdit(undefined)} onSaved={reload} />}
      {del && <ConfirmDelete what={del.code} onClose={() => setDel(null)} onConfirm={async () => { await RB_DB.deleteCoupon(del.code); reload(); toast('Code deleted.'); }} />}
    </main>
  );
}
