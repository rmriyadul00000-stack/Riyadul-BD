import { useState, type FormEvent } from 'react';
import { RB_DB } from '../../lib/db';
import { useDocTitle } from '../lib/hooks';
import { toast } from '../lib/toast';

const SUBJECTS = ['An order I placed', 'A product question', 'Bulk or restaurant supply', 'Selling your farm produce to us', 'Something else'];

export default function Contact() {
  useDocTitle('Contact Riyadul BD');
  const [done, setDone] = useState(false);
  const [touched, setTouched] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', email: '', subject: SUBJECTS[0], message: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));
  const bad = (k: 'name' | 'email' | 'message') => touched && !f[k].trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!f.name.trim() || !f.email.trim() || !f.message.trim()) return toast('Fill in the highlighted fields.', true);
    const r = await RB_DB.saveMessage({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), subject: f.subject, message: f.message.trim() });
    if (!r.ok) return toast(r.error, true);
    setF({ name: '', phone: '', email: '', subject: SUBJECTS[0], message: '' });
    setTouched(false); setDone(true);
    toast('Message sent. We reply within a day.');
  }

  return (
    <main className="wrap section">
      <div className="section-head">
        <div><h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.4rem)' }}>Talk to us</h1><p>A real person answers, usually within a few hours.</p></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 26, alignItems: 'start' }} className="contact-grid">
        <div className="panel">
          {done && <div className="notice" id="contact-done">Message received. We reply within one working day.</div>}
          <form id="contact-form" noValidate onSubmit={submit}>
            <div className="row2">
              <div className={'field' + (bad('name') ? ' bad' : '')}><label htmlFor="ct-name">Your name</label>
                <input id="ct-name" name="name" required value={f.name} onChange={set('name')} /><span className="err">Tell us your name.</span></div>
              <div className="field"><label htmlFor="ct-phone">Mobile number</label>
                <input id="ct-phone" name="phone" placeholder="01XXXXXXXXX" value={f.phone} onChange={set('phone')} /></div>
            </div>
            <div className={'field' + (bad('email') ? ' bad' : '')}><label htmlFor="ct-email">Email</label>
              <input id="ct-email" name="email" type="email" required value={f.email} onChange={set('email')} /><span className="err">We reply to this address.</span></div>
            <div className="field"><label htmlFor="ct-subject">What is it about</label>
              <select id="ct-subject" name="subject" value={f.subject} onChange={set('subject')}>{SUBJECTS.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className={'field' + (bad('message') ? ' bad' : '')}><label htmlFor="ct-msg">Message</label>
              <textarea id="ct-msg" name="message" required value={f.message} onChange={set('message')} /><span className="err">Write a line or two.</span></div>
            <button className="btn" type="submit">Send message</button>
          </form>
        </div>

        <div className="panel">
          <h3>Direct lines</h3>
          <p className="small muted">Phone and WhatsApp: <a href="tel:+8801700000000">+880 1700 000000</a><br />
            Email: <a href="mailto:hello@riyadulbd.com">hello@riyadulbd.com</a><br />
            House 14, Road 7, Dhanmondi, Dhaka 1205<br />Saturday to Thursday, 9am – 8pm</p>
          <h3 id="delivery" style={{ marginTop: 24 }}>Delivery</h3>
          <div className="tablewrap"><table className="data"><tbody>
            <tr><th>Area</th><th>Time</th><th>Charge</th></tr>
            <tr><td>Inside Dhaka</td><td>Next day</td><td>৳60</td></tr>
            <tr><td>Outside Dhaka</td><td>2 to 3 days</td><td>৳120</td></tr>
            <tr><td>Any order over ৳2,000</td><td>—</td><td>Free</td></tr>
          </tbody></table></div>
          <h3 style={{ marginTop: 24 }}>Returns</h3>
          <p className="small muted">Fresh produce cannot be returned once it leaves us, but if something arrives spoiled, short-weight or wrong, photograph it and message us the same day. We replace it on the next delivery run or refund that item — whichever you prefer. Sealed goods such as oil, ghee and honey can be returned unopened within seven days.</p>
        </div>
      </div>
    </main>
  );
}
