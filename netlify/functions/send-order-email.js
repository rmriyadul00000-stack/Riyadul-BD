/* ============================================================
   Riyadul BD — order confirmation email
   Called from RB_DB.placeOrder once an order lands in the database.

   Environment variables (Netlify → Site settings → Environment):
     RESEND_API_KEY   your Resend API key
     ORDER_FROM       e.g. "Riyadul BD <orders@riyadulbd.com>"
     ORDER_BCC        the shop inbox, e.g. hello@riyadulbd.com
   Without RESEND_API_KEY the function returns 200 and does nothing,
   so orders never fail because email is not set up yet.
   ============================================================ */

const money = n => '৳' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Use POST' };
  }

  let order;
  try {
    order = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body is not valid JSON' }) };
  }
  if (!order.order_code || !order.contact_email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'order_code and contact_email are required' }) };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: 'email not configured' }) };
  }

  const rows = (order.items || []).map(i => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #DED8C6">${esc(i.product_name || i.name || '')}<br>
        <span style="color:#6B7269;font-size:13px">${esc(i.variant_label || i.variant || '')} × ${i.qty}</span></td>
      <td style="padding:8px 0;border-bottom:1px solid #DED8C6;text-align:right">${money((i.unit_price || i.price || 0) * i.qty)}</td>
    </tr>`).join('');

  const html = `
  <div style="font-family:Georgia,serif;max-width:560px;margin:auto;color:#1E1B16">
    <h2 style="color:#17402A;margin:0 0 4px">Thank you, ${esc(order.contact_name)}</h2>
    <p style="color:#5D564C;margin:0 0 18px">Your order <b>${esc(order.order_code)}</b> is with us.
       We will call ${esc(order.contact_phone)} to confirm the delivery slot.</p>
    <table style="width:100%;border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px">
      ${rows}
      <tr><td style="padding:8px 0">Subtotal</td><td style="text-align:right">${money(order.subtotal)}</td></tr>
      ${order.discount ? `<tr><td style="padding:4px 0">Discount${order.coupon_code ? ' (' + esc(order.coupon_code) + ')' : ''}</td><td style="text-align:right">−${money(order.discount)}</td></tr>` : ''}
      <tr><td style="padding:4px 0">Delivery</td><td style="text-align:right">${order.shipping_fee ? money(order.shipping_fee) : "Free"}</td></tr>
      <tr><td style="padding:10px 0;font-weight:700;border-top:2px solid #17402A">Total</td>
          <td style="padding:10px 0;text-align:right;font-weight:700;border-top:2px solid #17402A">${money(order.total)}</td></tr>
    </table>
    <p style="font-family:system-ui,sans-serif;font-size:13px;color:#5D564C;margin-top:18px">
      Delivering to: ${esc(order.ship_address)}, ${esc(order.ship_city)}<br>
      Payment: ${esc((order.payment_method || 'cod').toUpperCase())}
    </p>
    <p style="font-family:system-ui,sans-serif;font-size:13px;color:#5D564C">
      Something wrong with the order? Reply to this email or message us on WhatsApp the same day.
    </p>
    <p style="color:#17402A;font-weight:700;margin-top:24px">Riyadul BD</p>
  </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.ORDER_FROM || 'Riyadul BD <onboarding@resend.dev>',
        to: [order.contact_email],
        bcc: process.env.ORDER_BCC ? [process.env.ORDER_BCC] : undefined,
        subject: `Order ${order.order_code} confirmed — Riyadul BD`,
        html
      })
    });
    if (!res.ok) {
      const detail = await res.text();
      return { statusCode: 502, body: JSON.stringify({ sent: false, detail }) };
    }
    return { statusCode: 200, body: JSON.stringify({ sent: true }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ sent: false, error: String(err) }) };
  }
};
