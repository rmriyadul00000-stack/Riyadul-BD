import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { RB_DB } from '../../lib/db';
import type { Coupon, PlacedOrder } from '../../lib/types';
import { Icon } from '../components/Icon';
import { cart, cartSubtotal, discountFor, shippingFor, useCart } from '../lib/cart';
import { useDocTitle } from '../lib/hooks';
import { useMe } from '../lib/queries';
import { money } from '../lib/shop';
import { toast } from '../lib/toast';

const PHONE = /^(\+?88)?01[3-9]\d{8}$/;
type Field = 'full_name' | 'phone' | 'email' | 'city' | 'address';

export default function Checkout() {
  useDocTitle('Checkout — Riyadul BD');
  const lines = useCart();
  const { data: me } = useMe();
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', city: '', address: '', note: '' });
  const [zone, setZone] = useState<'inside' | 'outside'>('inside');
  const [payment, setPayment] = useState('cod');
  const [touched, setTouched] = useState(false);
  const [filled, setFilled] = useState(false);
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponNote, setCouponNote] = useState<{ bad: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ order: PlacedOrder; phone: string; payment: string } | null>(null);

  /* An account only pre-fills the form as a convenience. What is typed here is saved on the
     order and never written back over the customer's profile. */
  if (me && !filled) {
    setFilled(true);
    setForm(f => ({ ...f, full_name: me.full_name || '', email: me.email || '', phone: me.phone || '', city: me.city || '', address: me.address || '' }));
  }

  const sub = cartSubtotal(lines);
  const ship = shippingFor(lines, zone, coupon);
  const disc = discountFor(lines, coupon);
  const total = Math.max(0, sub - disc + ship);

  const bad = (k: Field): boolean => {
    if (!touched) return false;
    const v = form[k].trim();
    return !v || (k === 'phone' && !PHONE.test(v.replace(/[\s-]/g, '')));
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function applyCoupon() {
    const c = code.trim(); if (!c) return;
    const r = await RB_DB.validateCoupon(c, sub);
    if (!r.ok) { setCoupon(null); setCouponNote({ bad: true, text: r.error }); }
    else { setCoupon(r.data); setCouponNote({ bad: false, text: `${r.data.code} applied — ${r.data.note ?? ''}` }); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    const invalid = (['full_name', 'phone', 'email', 'city', 'address'] as Field[]).some(k => {
      const v = form[k].trim();
      return !v || (k === 'phone' && !PHONE.test(v.replace(/[\s-]/g, '')));
    });
    if (invalid) { toast('Check the highlighted fields.', true); return; }
    setBusy(true);
    const r = await RB_DB.placeOrder({
      contact_name: form.full_name.trim(), contact_email: form.email.trim(), contact_phone: form.phone.trim(),
      ship_city: form.city.trim(), ship_address: form.address.trim(), ship_zone: zone, note: form.note.trim(),
      payment_method: payment, coupon_code: coupon ? coupon.code : null,
      items: lines.map(i => ({ product_id: i.id, variant_label: i.variant, qty: i.qty }))
    });
    setBusy(false);
    if (!r.ok) { toast(r.error, true); return; }
    cart.clear();
    setDone({ order: r.data, phone: form.phone.trim(), payment });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (done) {
    return (
      <main className="wrap section" id="checkout-wrap">
        <div className="panel" style={{ maxWidth: 620, marginInline: 'auto', textAlign: 'center' }}>
          <div style={{ color: 'var(--leaf)', marginBottom: 10 }}><Icon name="check" /></div>
          <h2>Order placed</h2>
          <p className="muted">Your order number is <b>{done.order.order_code}</b>. Keep it — you can track the order with it.</p>
          <p className="muted">We will call {done.phone} to confirm the delivery slot.{' '}
            {done.payment === 'cod' ? `Pay ${money(done.order.total)} in cash when it arrives.` : 'Payment instructions are on their way by SMS.'}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
            <Link className="btn" to="/products">Keep shopping</Link>
            <Link className="btn btn-ghost" to={`/account?ref=${encodeURIComponent(done.order.order_code)}`}>Track this order</Link>
          </div>
        </div>
      </main>
    );
  }

  const fieldCls = (k: Field) => 'field' + (bad(k) ? ' bad' : '');
  return (
    <main className="wrap section" id="checkout-wrap">
      <div className="section-head">
        <div>
          <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.4rem)' }}>Checkout</h1>
          <p>We call before every delivery to confirm the slot.</p>
        </div>
      </div>
      <div className="notice" id="who">
        {me
          ? <>Ordering as <b>{me.full_name || me.email}</b> ({me.customer_code || 'account'}). Change any detail below if the delivery is for someone else — your account stays as it is.</>
          : <>Checking out as a guest. <Link to="/account">Sign in</Link> first if you want this order kept in your order history.</>}
      </div>
      {lines.length === 0 && <div className="notice warn" id="empty-note">Your basket is empty. <Link to="/products">Add something first.</Link></div>}
      <form className="checkout" id="order-form" noValidate onSubmit={submit}>
        <div className="panel">
          <h3>Where it is going</h3>
          <div className="row2">
            <div className={fieldCls('full_name')}><label htmlFor="ck-name">Full name</label>
              <input id="ck-name" name="full_name" required value={form.full_name} onChange={set('full_name')} /><span className="err">Tell us who to ask for.</span></div>
            <div className={fieldCls('phone')}><label htmlFor="ck-phone">Mobile number</label>
              <input id="ck-phone" name="phone" placeholder="01XXXXXXXXX" required value={form.phone} onChange={set('phone')} /><span className="err">Use an 11-digit Bangladeshi number.</span></div>
          </div>
          <div className={fieldCls('email')}><label htmlFor="ck-email">Email</label>
            <input id="ck-email" name="email" type="email" required value={form.email} onChange={set('email')} /><span className="err">We send the receipt here.</span></div>
          <div className="row2">
            <div className={fieldCls('city')}><label htmlFor="ck-city">City or district</label>
              <input id="ck-city" name="city" required value={form.city} onChange={set('city')} /><span className="err">Enter your city.</span></div>
            <div className="field"><label htmlFor="ck-zone">Delivery area</label>
              <select id="ck-zone" name="zone" value={zone} onChange={e => setZone(e.target.value as 'inside' | 'outside')}>
                <option value="inside">Inside Dhaka — next day</option>
                <option value="outside">Outside Dhaka — 2 to 3 days</option>
              </select></div>
          </div>
          <div className={fieldCls('address')}><label htmlFor="ck-addr">Full address</label>
            <textarea id="ck-addr" name="address" required placeholder="House, road, area, and a landmark" value={form.address} onChange={set('address')} />
            <span className="err">We need the full address to deliver.</span></div>
          <div className="field"><label htmlFor="ck-note">Anything we should know</label>
            <textarea id="ck-note" name="note" placeholder="Gate code, best time to call, substitutions you accept" value={form.note} onChange={set('note')} /></div>
          <h3 style={{ marginTop: 22 }}>How you want to pay</h3>
          <div className="pay">
            {([['cod', 'Cash on delivery', 'Pay the rider when the box reaches you.'],
               ['bkash', 'bKash', 'We send the merchant number by SMS after you order.'],
               ['nagad', 'Nagad', 'Same — number arrives by SMS.']] as const).map(([v, b, d]) => (
              <label key={v} className={payment === v ? 'on' : ''}>
                <input type="radio" name="payment" value={v} checked={payment === v} onChange={() => setPayment(v)} />
                <span><b>{b}</b><span>{d}</span></span>
              </label>
            ))}
          </div>
        </div>
        <aside className="panel summary">
          <h3>Your basket</h3>
          <div id="sum-lines">
            {lines.map(i => (
              <div className="line" key={i.key}>
                <img src={i.image} alt="" />
                <div><b>{i.name}</b><i>{i.variant} × {i.qty}</i></div>
                <b>{money(i.price * i.qty)}</b>
              </div>
            ))}
          </div>
          <div className="coupon">
            <input id="coupon-code" placeholder="Discount code" aria-label="Discount code" value={code} onChange={e => setCode(e.target.value)} />
            <button className="btn btn-ghost" type="button" onClick={applyCoupon}>Apply</button>
          </div>
          {couponNote && <div className={'notice' + (couponNote.bad ? ' bad' : '')} id="coupon-note">{couponNote.text}</div>}
          <div className="totals" id="sum-totals">
            <div><span>Subtotal</span><span>{money(sub)}</span></div>
            {disc > 0 && coupon && <div><span>Discount ({coupon.code})</span><span>−{money(disc)}</span></div>}
            <div><span>Delivery</span><span>{ship ? money(ship) : 'Free'}</span></div>
            <div className="grand"><span>Total</span><span>{money(total)}</span></div>
          </div>
          <button className="btn btn-block" type="submit" id="place" disabled={lines.length === 0 || busy}>{busy ? 'Placing your order…' : 'Place order'}</button>
          <p className="small muted" style={{ margin: '10px 0 0' }}>By ordering you agree to our delivery and return terms.</p>
        </aside>
      </form>
    </main>
  );
}
