import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { PolicySection } from '../components/Policy';
import { ProductCard } from '../components/ProductCard';
import { useDocTitle } from '../lib/hooks';
import { useCategories, useProducts, useSettings } from '../lib/queries';
import { discountPct, lowestPrice, money, stockOf } from '../lib/shop';

type Sort = 'featured' | 'price-asc' | 'price-desc' | 'discount' | 'name';

export default function Products() {
  const params = useParams();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const { data: all = [] } = useProducts();
  const { data: cats = [] } = useCategories();
  const { data: settings = {} } = useSettings();

  const cat = params.cat ?? sp.get('cat') ?? '';
  const hotdeals = sp.get('hotdeals') === '1';
  const q = sp.get('q') ?? '';

  const priceMax = useMemo(() => Math.max(100, Math.ceil(Math.max(...all.map(lowestPrice), 100) / 50) * 50), [all]);
  const step = priceMax > 1000 ? 50 : 10;
  const [minV, setMin] = useState(0);
  const [maxV, setMax] = useState<number | null>(null);
  const max = Math.min(maxV ?? priceMax, priceMax);
  const [certified, setCertified] = useState(false);
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState<Sort>('featured');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(true);

  const activeCat = cats.find(c => c.slug === cat);
  const hotTitle = String(settings.hotdeals_title || 'Hot Deals');
  const title = hotdeals ? hotTitle : activeCat ? activeCat.name : 'The shop';
  const sub = hotdeals ? 'Limited-time offers, picked by us.' : activeCat ? (activeCat.name_bn || '') : 'Everything we have in right now. Stock changes as the farms deliver.';
  useDocTitle(hotdeals ? `${hotTitle} — Riyadul BD` : activeCat ? `${activeCat.name} — Riyadul BD` : 'Shop all organic food — Riyadul BD');

  const setQuery = (v: string) => setSp(prev => { const n = new URLSearchParams(prev); if (v) n.set('q', v); else n.delete('q'); return n; }, { replace: true });
  const setCat = (slug: string) => navigate({ pathname: slug ? `/category/${slug}` : '/products', search: q ? `?q=${encodeURIComponent(q)}` : '' }, { replace: true });
  const setMinClamped = (v: number) => setMin(Math.max(0, Math.min(v, max - step)));
  const setMaxClamped = (v: number) => setMax(Math.min(priceMax, Math.max(v, minV + step)));
  const resetAll = () => { setCat(''); setQuery(''); setMin(0); setMax(null); setCertified(false); setInStock(false); };

  const list = useMemo(() => {
    let l = all.slice();
    if (hotdeals) l = l.filter(p => p.hot_deal).sort((a, b) => (a.hot_deal_sort || 0) - (b.hot_deal_sort || 0));
    if (cat) l = l.filter(p => p.cat === cat);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter(p => p.name.toLowerCase().includes(s) || (p.name_bn || '').includes(q) ||
        p.description.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s));
    }
    if (minV > 0) l = l.filter(p => lowestPrice(p) >= minV);
    if (max < priceMax) l = l.filter(p => lowestPrice(p) <= max);
    if (certified) l = l.filter(p => p.certified);
    if (inStock) l = l.filter(p => stockOf(p) > 0);
    if (!hotdeals) {
      const by: Record<Sort, (a: typeof l[number], b: typeof l[number]) => number> = {
        featured: (a, b) => Number(b.featured) - Number(a.featured),
        'price-asc': (a, b) => lowestPrice(a) - lowestPrice(b),
        'price-desc': (a, b) => lowestPrice(b) - lowestPrice(a),
        name: (a, b) => a.name.localeCompare(b.name),
        discount: (a, b) => discountPct(b) - discountPct(a)
      };
      l.sort(by[sort]);
    }
    return l;
  }, [all, hotdeals, cat, q, minV, max, priceMax, certified, inStock, sort]);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (cat) chips.push({ key: 'cat', label: activeCat?.name ?? cat, clear: () => setCat('') });
  if (q) chips.push({ key: 'q', label: `“${q}”`, clear: () => setQuery('') });
  if (certified) chips.push({ key: 'certified', label: 'Certified organic', clear: () => setCertified(false) });
  if (inStock) chips.push({ key: 'inStock', label: 'In stock', clear: () => setInStock(false) });
  if (minV > 0 || max < priceMax) chips.push({ key: 'price', label: `${money(minV)}–${money(max)}`, clear: () => { setMin(0); setMax(null); } });

  const banner = activeCat && !hotdeals ? (activeCat.desktop_banner_url || activeCat.image_url || '') : '';

  return (
    <>
      <div id="cat-hero">
        {banner && (
          <div className="cat-page-banner">
            <picture>
              <source media="(min-width: 761px)" srcSet={banner} />
              <img src={activeCat?.mobile_banner_url || banner} alt={activeCat?.name} />
            </picture>
          </div>
        )}
      </div>
      <main className="wrap section">
        <div className="section-head">
          <div>
            <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.5rem)' }} id="listing-title">{title}</h1>
            <p id="listing-sub">{sub}</p>
          </div>
          <button className="btn btn-ghost btn-sm filter-toggle" onClick={() => setFiltersOpen(true)}>Filters</button>
        </div>

        <div className="listing">
          <aside className={'filters' + (filtersOpen ? ' open' : '')} id="filters">
            <div className="filters-head">
              <h4 className="filters-title">Filters</h4>
              <button className="filters-close" aria-label="Close filters" onClick={() => setFiltersOpen(false)}>✕</button>
            </div>
            <div id="price-filter">
              <button type="button" className="price-block-toggle" aria-expanded={priceOpen} onClick={() => setPriceOpen(o => !o)}>
                <h4>Price range</h4><span className="chev">▾</span>
              </button>
              <div className={'price-panel' + (priceOpen ? '' : ' collapsed')}>
                <div className="price-slider">
                  <div className="price-track"><div className="price-fill" style={{ left: `${minV / priceMax * 100}%`, right: `${100 - max / priceMax * 100}%` }} /></div>
                  <input type="range" min={0} max={priceMax} step={step} value={minV} onChange={e => setMinClamped(Number(e.target.value))} aria-label="Minimum price" />
                  <input type="range" min={0} max={priceMax} step={step} value={max} onChange={e => setMaxClamped(Number(e.target.value))} aria-label="Maximum price" />
                </div>
                <div className="price-steppers">
                  <div className="stepper-mini">
                    <button type="button" aria-label="Decrease minimum price" onClick={() => setMinClamped(minV - step)}>−</button>
                    <span>{money(minV)}</span>
                    <button type="button" aria-label="Increase minimum price" onClick={() => setMinClamped(minV + step)}>+</button>
                  </div>
                  <span className="muted">to</span>
                  <div className="stepper-mini">
                    <button type="button" aria-label="Decrease maximum price" onClick={() => setMaxClamped(max - step)}>−</button>
                    <span>{money(max)}</span>
                    <button type="button" aria-label="Increase maximum price" onClick={() => setMaxClamped(max + step)}>+</button>
                  </div>
                </div>
              </div>
            </div>
            <h4>Search</h4>
            <div className="field" style={{ margin: '0 0 6px' }}>
              <input id="search-input" type="search" placeholder="Search products" aria-label="Search products" value={q} onChange={e => setQuery(e.target.value)} />
            </div>
            <h4>Aisle</h4>
            <div id="f-cats">
              {cats.map(c => (
                <label key={c.id}><input type="radio" name="cat" value={c.slug} checked={cat === c.slug} onChange={() => setCat(c.slug)} /> {c.name}</label>
              ))}
              <label><input type="radio" name="cat" value="" checked={!cat} onChange={() => setCat('')} />All categories</label>
            </div>
            <h4>Only show</h4>
            <label><input type="checkbox" id="f-certified" checked={certified} onChange={e => setCertified(e.target.checked)} /> Certified organic</label>
            <label><input type="checkbox" id="f-instock" checked={inStock} onChange={e => setInStock(e.target.checked)} /> In stock</label>
            <div className="filters-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => { resetAll(); }}>Reset</button>
              <button className="btn btn-sm filters-apply" onClick={() => setFiltersOpen(false)}>Show results</button>
            </div>
          </aside>
          <div className={'filters-backdrop' + (filtersOpen ? ' open' : '')} onClick={() => setFiltersOpen(false)} />

          <section>
            <div className="toolbar">
              <span className="muted" id="count">{list.length} product{list.length === 1 ? '' : 's'}</span>
              <label>Sort{' '}
                <select id="sort" value={sort} onChange={e => setSort(e.target.value as Sort)}>
                  <option value="featured">Featured first</option>
                  <option value="price-asc">Price, low to high</option>
                  <option value="price-desc">Price, high to low</option>
                  <option value="discount">Biggest discount</option>
                  <option value="name">Name A–Z</option>
                </select>
              </label>
            </div>
            <div className="chips" id="chips">
              {chips.map(c => <span className="chip" key={c.key}>{c.label}<button aria-label="Remove filter" onClick={c.clear}>×</button></span>)}
            </div>
            <div className="grid" id="grid">
              {list.length ? list.map(p => <ProductCard key={p.id} p={p} />) : (
                <div className="empty" style={{ gridColumn: '1/-1' }}><Icon name="basket" />
                  <p>Nothing matches those filters yet.</p>
                  <button className="btn btn-ghost" onClick={resetAll}>Clear filters</button></div>
              )}
            </div>
          </section>
        </div>
      </main>
      <PolicySection />
    </>
  );
}
