import { Icon } from './Icon';

export function PolicySection() {
  return (
    <section className="section site-policy" id="policy">
      <div className="wrap">
        <div className="section-head"><div><h2>Our promise to you</h2>
          <p>Simple terms, kept the same on every order.</p></div></div>
        <div className="policy-grid">
          <div className="policy-item"><Icon name="leaf" /><h3>Certified organic</h3><p className="muted small">Every farm we buy from is checked before it's listed.</p></div>
          <div className="policy-item"><Icon name="truck" /><h3>Fast, tracked delivery</h3><p className="muted small">Next day inside Dhaka, 2–3 days elsewhere. Track any order with its number.</p></div>
          <div className="policy-item"><Icon name="refresh" /><h3>No-fuss returns</h3><p className="muted small">Wrong, short-weight or spoiled? Message us the same day — we replace or refund it.</p></div>
          <div className="policy-item"><Icon name="shield" /><h3>Pay safely</h3><p className="muted small">Cash on delivery, bKash or Nagad. Nothing charged before it reaches you.</p></div>
        </div>
      </div>
    </section>
  );
}
