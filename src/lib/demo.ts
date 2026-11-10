/* ============================================================
   Sample trading data for the admin PREVIEW only.
   Used when the database is paused or not connected, so the panel can be
   reviewed with realistic numbers. It lives in this browser's storage and
   never touches Supabase. Deterministic (seeded) apart from dates, which
   are laid out relative to today.
   ============================================================ */

type Row = any;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PEOPLE = [
  ['Nusrat Jahan', 'Dhanmondi, Dhaka', 'inside'], ['Tanvir Ahmed', 'Uttara, Dhaka', 'inside'],
  ['Farzana Akter', 'Mirpur, Dhaka', 'inside'], ['Imran Hossain', 'Chattogram', 'outside'],
  ['Sadia Islam', 'Banani, Dhaka', 'inside'], ['Rakib Hasan', 'Sylhet', 'outside'],
  ['Mahmuda Khatun', 'Mohammadpur, Dhaka', 'inside'], ['Arif Chowdhury', 'Khulna', 'outside'],
  ['Sharmin Sultana', 'Bashundhara, Dhaka', 'inside'], ['Jubayer Rahman', 'Gulshan, Dhaka', 'inside']
];

export function demoDataset(seedProducts: Row[], { unitCost }: { unitCost: (v: Row) => number }): Row {
  const r = rng(20261110);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const now = Date.now(), DAY = 864e5;
  const iso = (t: number) => new Date(t).toISOString();

  /* give every size a landed cost so profit figures mean something */
  const products: Row[] = seedProducts.map((p: Row) => ({
    ...p,
    variants: (p.variants || []).map((v: Row) => {
      const price = Number(v.price) || 0;
      const cost = Math.round(price * (0.52 + r() * 0.2));
      return { ...v, cost, cost_transport: Math.round(price * 0.03), cost_packaging: Math.round(price * 0.02) };
    })
  }));
  /* a few shelves running low, so the alerts have something to show */
  [1, 4, 9].forEach((i, n) => { const v = products[i] && products[i].variants[0]; if (v) v.stock = n === 0 ? 0 : 2 + n; });

  const customers = PEOPLE.slice(0, 8).map(([name, where], i) => ({
    id: 'demo-cu' + i, customer_code: 'CUST-' + (10001 + i),
    email: name.toLowerCase().replace(/\s+/g, '.') + '@example.com', password: null,
    full_name: name, phone: '017' + String(10000000 + Math.floor(r() * 89999999)),
    city: where.split(', ').pop(), address: 'House ' + (3 + i * 4) + ', Road ' + (2 + i) + ', ' + where,
    status: i === 6 ? 'blocked' : 'active', created_at: iso(now - (70 - i * 6) * DAY)
  }));

  const orders: Row[] = [], order_items: Row[] = [], inventory_log: Row[] = [];
  const live = products.filter((p: Row) => p.active !== false);
  let code = 10001;
  for (let day = 59; day >= 0; day--) {
    /* gentle growth plus a weekend lift */
    const weekday = new Date(now - day * DAY).getDay();
    const base = 1.1 + (59 - day) / 45 + (weekday === 5 || weekday === 6 ? 0.9 : 0);
    const n = Math.max(0, Math.round(base + (r() - 0.5) * 2.2));
    for (let k = 0; k < n; k++) {
      const placed = now - day * DAY - Math.floor(r() * 0.6 * DAY) - (day === 0 ? 0 : 0.2 * DAY);
      if (placed > now) continue;
      const guest = r() < 0.3;
      const person = pick(PEOPLE);
      const cust: Row = guest ? null : pick(customers);
      const who: Row = guest || !cust ? { name: person[0], where: person[1], zone: person[2] }
        : { name: cust.full_name, where: cust.address, zone: /Dhaka/.test(cust.address) ? 'inside' : 'outside' };
      const id = 'demo-o' + code;
      let subtotal = 0;
      const lines: Row[] = [], used = new Set<string>();
      const count = 1 + Math.floor(r() * 3.4);
      for (let j = 0; j < count; j++) {
        const p = pick(live); if (used.has(p.id)) continue; used.add(p.id);
        const v: Row = pick(p.variants as Row[]), qty = 1 + Math.floor(r() * 2.6);
        const price = Number(v.price) || 0;
        subtotal += price * qty;
        lines.push({ id: id + '-' + j, order_id: id, product_id: p.id, product_name: p.name, variant_label: v.label,
          unit_price: price, unit_cost: unitCost(v), qty, line_total: price * qty });
      }
      const age = (now - placed) / DAY;
      let status = age > 4 ? 'delivered' : age > 2 ? pick(['delivered', 'shipped', 'shipped']) : age > 0.8 ? pick(['confirmed', 'shipped', 'pending']) : 'pending';
      if (r() < 0.07) status = 'cancelled';
      const coupon = subtotal >= 800 && r() < 0.18;
      const discount = coupon ? Math.round(subtotal * 0.1) : 0;
      let shipping_fee = who.zone === 'outside' ? 120 : 60;
      if (subtotal >= 2000) shipping_fee = 0;
      const order: Row = {
        id, order_code: 'ORD-' + code, customer_id: cust ? cust.id : null, is_guest: guest,
        contact_name: who.name, contact_email: (cust ? cust.email : who.name.toLowerCase().replace(/\s+/g, '.') + '@example.com'),
        contact_phone: cust ? cust.phone : '018' + String(10000000 + Math.floor(r() * 89999999)),
        ship_address: who.where, ship_city: who.where.split(', ').pop(), ship_zone: who.zone, note: '',
        payment_method: r() < 0.75 ? 'cod' : 'bkash', payment_status: status === 'delivered' ? 'paid' : 'unpaid',
        subtotal, discount, shipping_fee, total: Math.max(0, subtotal - discount + shipping_fee),
        coupon_code: coupon ? 'FRESH10' : null, status, placed_at: iso(placed)
      };
      const step = (h: number) => iso(Math.min(now, placed + h * 36e5));
      if (status !== 'pending' && status !== 'cancelled') order.confirmed_at = step(3);
      if (status === 'shipped' || status === 'delivered') order.shipped_at = step(20);
      if (status === 'delivered') order.delivered_at = step(44);
      if (status === 'cancelled') order.cancelled_at = step(5);
      orders.push(order); order_items.push(...lines);
      lines.forEach(l => inventory_log.push({ id: 'demo-lg' + l.id, product_id: l.product_id, variant_label: l.variant_label,
        kind: 'sale', qty: l.qty, unit_cost: l.unit_cost, amount: l.line_total, note: 'Order ' + order.order_code, created_at: order.placed_at }));
      code++;
    }
  }
  orders.sort((a, b) => (a.placed_at < b.placed_at ? 1 : -1));

  /* some stock movements, wastage and one-off expenses */
  [[2, 'wastage', 4, 'Spoiled in transit', 6], [5, 'wastage', 2, 'Bruised, not sellable', 13],
   [0, 'wastage', 3, 'Wilted before sale', 21], [11, 'expense', 0, 'Cold room, one week', 9],
   [7, 'expense', 0, 'Lab purity test', 26], [3, 'purchase', 40, 'Supplier invoice 2217', 3],
   [8, 'purchase', 24, 'Weekly farm pickup', 11], [3, 'note', 0, 'Supplier switches to winter crop next month.', 2]
  ].forEach(([pi, kind, qty, note, daysAgo]: any, i: number) => {
    const p = products[pi]; if (!p) return;
    const v = p.variants[0], uc = unitCost(v);
    inventory_log.push({ id: 'demo-lgx' + i, product_id: p.id, variant_label: kind === 'expense' || kind === 'note' ? null : v.label, kind, qty,
      unit_cost: kind === 'expense' || kind === 'note' ? null : uc,
      amount: kind === 'expense' ? 650 + i * 120 : qty * uc, note, created_by: 'preview', created_at: iso(now - daysAgo * DAY) });
  });
  inventory_log.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const messages = [
    { id: 'demo-m1', name: 'Nusrat Jahan', email: customers[0].email, phone: customers[0].phone, subject: null,
      message: 'Can I change the delivery time for my order to the evening?', customer_id: customers[0].id, sender: 'customer',
      read_by_admin: false, read_by_customer: true, created_at: iso(now - 5 * 36e5) },
    { id: 'demo-m2', name: 'Kamrul Hasan', email: 'kamrul@example.com', phone: '01911000000', subject: 'Wholesale',
      message: 'Do you supply mustard oil in 5 litre tins for a restaurant?', customer_id: null, sender: 'customer',
      read_by_admin: false, read_by_customer: true, created_at: iso(now - 30 * 36e5) }
  ];

  return { products, customers, orders, order_items, inventory_log, messages, seq: { cust: 10001 + customers.length, order: code } };
}
