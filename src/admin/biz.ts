/* ============================================================
   Business engine — everything money-related, computed from live data and
   never stored: landed cost per unit, promo-aware price, margin, realized
   and potential profit per size / item / aisle, wastage and expenses.
   Used by the dashboard and by the inventory / item screens.
   ============================================================ */
import { RB_DB, rbEffPrice, rbUnitCost } from '../lib/db';
import type { Category, InventoryLogEntry, Order, Product } from '../lib/types';

type Row = any;

export interface Biz {
  products: Product[];
  cats: Category[];
  orders: Order[];
  logs: InventoryLogEntry[];
  needsUpgrade: boolean;
}

export interface Totals {
  units: number; revenue: number; cogs: number; estUnits: number; pUnits: number; pRevenue: number; pCogs: number;
  wasteQty: number; waste: number; expenses: number; coupons: number; stockUnits: number; stockCost: number; stockValue: number;
  gross: number; net: number; margin: number | null; pGross: number; potential: number;
}
export interface Analysis {
  tot: Totals;
  P: Record<string, Totals>; V: Record<string, Totals>; C: Record<string, Totals>;
  monthly: Record<string, Row>;
  pById: Record<string, Product>;
  blank: () => Totals;
}

export async function loadBiz(): Promise<Biz> {
  const [pr, cr, or_, lg] = await Promise.all([
    RB_DB.products(true), RB_DB.categories(true), RB_DB.allOrders(), RB_DB.inventoryLog()
  ]);
  return {
    products: pr.ok ? pr.data : [], cats: cr.ok ? cr.data : [], orders: or_.ok ? or_.data : [], logs: lg.ok ? lg.data : [],
    needsUpgrade: !lg.ok
  };
}

/* range = { from: Date|null, to: Date|null } applies to sales, wastage and expenses.
   Stock and potential figures are always "right now". */
export function analyze(biz: Biz, range: { from: Date | null; to: Date | null } | null): Analysis {
  const { products, orders, logs } = biz;
  const from = range && range.from ? +range.from : null, to = range && range.to ? +range.to : null;
  const inR = (d: string | number | Date) => { const t = +new Date(d); return (!from || t >= from) && (!to || t <= to); };
  const pById: Record<string, Row> = {}; products.forEach((p: Row) => { pById[p.id] = p; });
  const blank = (): Row => ({ units: 0, revenue: 0, cogs: 0, estUnits: 0, pUnits: 0, pRevenue: 0, pCogs: 0,
    wasteQty: 0, waste: 0, expenses: 0, coupons: 0, stockUnits: 0, stockCost: 0, stockValue: 0 });
  const P: Record<string, Row> = {}, V: Record<string, Row> = {}, C: Record<string, Row> = {}, tot = blank();
  const get = (m: Record<string, Row>, k: string): Row => m[k] || (m[k] = blank());
  const monthly: Record<string, Row> = {};   // 'YYYY-MM' -> { revenue, cogs } for delivered orders

  orders.forEach(o => {
    if (o.status === 'cancelled' || !inR(o.placed_at)) return;
    const real = o.status === 'delivered';
    if (real) tot.coupons += Number(o.discount) || 0;
    (o.items || []).forEach(it => {
      const p: Row = (it.product_id ? pById[it.product_id] : undefined) || products.find(x => x.name === it.product_name);
      const v = p && (p.variants || []).find((x: Row) => x.label === it.variant_label);
      const est = it.unit_cost == null;
      const uc = est ? (v ? rbUnitCost(v) : 0) : Number(it.unit_cost) || 0;
      const q = Number(it.qty) || 0, rev = (Number(it.unit_price) || 0) * q, cg = uc * q;
      const targets = [tot];
      if (p) targets.push(get(P, p.id), get(V, p.id + '|' + it.variant_label), get(C, p.cat));
      targets.forEach(t => {
        if (real) { t.units += q; t.revenue += rev; t.cogs += cg; if (est) t.estUnits += q; }
        else { t.pUnits += q; t.pRevenue += rev; t.pCogs += cg; }
      });
      if (real && p) {
        const k = new Date(o.placed_at).toISOString().slice(0, 7);
        const m = monthly[k] || (monthly[k] = { revenue: 0, cogs: 0, byCat: {}, byProd: {} });
        m.revenue += rev; m.cogs += cg;
        (m.byProd[p.id] = m.byProd[p.id] || { revenue: 0, cogs: 0 }).revenue += rev; m.byProd[p.id].cogs += cg;
        (m.byCat[p.cat] = m.byCat[p.cat] || { revenue: 0, cogs: 0 }).revenue += rev; m.byCat[p.cat].cogs += cg;
      }
    });
  });

  logs.forEach(l => {
    if (!inR(l.created_at ?? 0)) return;
    const p = pById[l.product_id]; if (!p) return;
    if (l.kind === 'wastage') {
      const q = Number(l.qty) || 0, loss = q * (Number(l.unit_cost) || 0);
      [tot, get(P, p.id), get(V, p.id + '|' + l.variant_label), get(C, p.cat)].forEach(t => { t.wasteQty += q; t.waste += loss; });
    } else if (l.kind === 'expense') {
      [tot, get(P, p.id), get(C, p.cat)].forEach(t => { t.expenses += Number(l.amount) || 0; });
    }
  });

  products.forEach(p => (p.variants || []).forEach(v => {
    const st = Number(v.stock) || 0, uc = rbUnitCost(v), pr = rbEffPrice(p, v);
    [tot, get(P, p.id), get(V, p.id + '|' + v.label), get(C, p.cat)].forEach(t => {
      t.stockUnits += st; t.stockCost += st * uc; t.stockValue += st * pr;
    });
  }));

  const fin = (t: Row) => {
    t.gross = t.revenue - t.cogs;
    t.net = t.gross - t.waste - t.expenses;
    t.margin = t.revenue ? t.gross / t.revenue * 100 : null;
    t.pGross = t.pRevenue - t.pCogs;
    t.potential = t.stockValue - t.stockCost;
    return t;
  };
  fin(tot); tot.net -= tot.coupons;
  Object.values(P).forEach(fin); Object.values(V).forEach(fin); Object.values(C).forEach(fin);
  return { tot, P, V, C, monthly, pById, blank: () => fin(blank()) };
}
