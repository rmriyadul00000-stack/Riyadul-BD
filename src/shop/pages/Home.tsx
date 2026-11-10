import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Category, Product } from '../../lib/types';
import { Hero } from '../components/Hero';
import { Icon, RawSvg } from '../components/Icon';
import { PolicySection } from '../components/Policy';
import { ProductCard } from '../components/ProductCard';
import { useDocTitle, useDragRow } from '../lib/hooks';
import { useCategories, useProducts, useSettings } from '../lib/queries';
import { SHOP } from '../lib/shop';

const PAGE_SIZE = 6;   // products shown per category before "View More"
const STEP = 6;

const TRUST: [string, string, string][] = [
  ['truck', 'Fast delivery', 'Next day inside Dhaka'],
  ['shield', 'Certified organic', 'Verified farms only'],
  ['refresh', 'Easy returns', 'Wrong or spoiled? We fix it'],
  ['box', 'Cash on delivery', 'Pay when it arrives']
];

function QuickNav({ cats }: { cats: Category[] }) {
  const [railRef, railPrev, railNext] = useDragRow<HTMLDivElement>(3000);
  return (
    <section className="section quicknav-section">
      <div className="wrap quicknav-wrap">
        <button className="quicknav-arrow prev" id="quicknav-prev" aria-label="Previous categories" onClick={railPrev}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 6 12l9 7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="cats" id="cats" ref={railRef}>
          {cats.length === 0 && Array.from({ length: 6 }, (_, i) => <div key={i} className="cat cat-skel" />)}
          {cats.map(c => (
            <Link key={c.id} className="cat" to={`/category/${c.slug}`}>
              <span className="cat-img">
                {c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : <RawSvg className="ico" html={c.icon_svg || ''} />}
              </span>
              <b>{c.name}</b>
            </Link>
          ))}
        </div>
        <button className="quicknav-arrow next" id="quicknav-next" aria-label="Next categories" onClick={railNext}>
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}><path d="M15 5 6 12l9 7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </section>
  );
}

function CatSection({ c, items, index }: { c: Category; items: Product[]; index: number }) {
  const [shown, setShown] = useState(Math.min(PAGE_SIZE, items.length));
  const [gridRef, gridPrev, gridNext] = useDragRow<HTMLDivElement>();
  const showArrows = items.length > 2 && typeof window !== 'undefined' && window.matchMedia('(min-width:761px)').matches;
  const banner = c.desktop_banner_url || c.image_url || '';
  return (
    <section className="cat-section" id={`section-${c.slug}`}>
      <div className="wrap">
        <h2 className="cat-section-title">
          <span className="bn">{c.name_bn || ''}</span>
          <span className="en">{c.name}</span>
        </h2>
        <div className="cat-section-row">
          <Link className="cat-banner" to={`/category/${c.slug}`} aria-label={`See all ${c.name}`}>
            <picture>
              <source media="(min-width: 761px)" srcSet={banner} />
              <img src={c.mobile_banner_url || banner} alt={c.name} loading={index === 0 ? 'eager' : 'lazy'} width={900} height={900} />
            </picture>
            <span className="see-all btn btn-gold">See All</span>
          </Link>
          <div className="cat-section-body">
            <div className="cat-grid-wrap">
              <button className={'row-arrow prev' + (showArrows ? '' : ' hide')} aria-label="Previous products" onClick={gridPrev}><Icon name="back" /></button>
              <div className="grid" id={`grid-${c.slug}`} ref={gridRef}>
                {items.slice(0, shown).map(p => <ProductCard key={p.id} p={p} />)}
              </div>
              <button className={'row-arrow next' + (showArrows ? '' : ' hide')} aria-label="Next products" onClick={gridNext}><Icon name="back" /></button>
            </div>
            {items.length > shown && (
              <div className="cat-view-more">
                <button className="btn btn-ghost show-more-btn" onClick={() => setShown(s => Math.min(items.length, s + STEP))}>
                  View More ({shown}/{items.length} items)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  useDocTitle('Riyadul BD — organic food from named farms, delivered in Dhaka');
  const { data: products = [] } = useProducts();
  const { data: cats = [] } = useCategories();
  const { data: settings = {} } = useSettings();

  const hot = useMemo(() => products.filter(p => p.hot_deal).sort((a, b) => (a.hot_deal_sort || 0) - (b.hot_deal_sort || 0)), [products]);
  /* One section per aisle; aisles with no products are skipped. New aisles from the admin appear automatically. */
  const sections = useMemo(
    () => cats.map(c => ({ c, items: products.filter(p => p.cat === c.slug) })).filter(x => x.items.length > 0),
    [cats, products]
  );

  return (
    <>
      <Hero />
      <div className="trust" id="trust-bar" aria-label="Why shop with us">
        <div className="wrap">
          {TRUST.map(([icon, b, s]) => <div key={b}><Icon name={icon} /><span><b>{b}</b><span>{s}</span></span></div>)}
        </div>
      </div>

      <QuickNav cats={cats} />

      {hot.length > 0 && (
        <section className="section hotdeals-section" id="hotdeals-home">
          <div className="wrap">
            <h2 className="cat-section-title hotdeals-title"><span className="en">🔥 {String(settings.hotdeals_title || 'Hot Deals')}</span></h2>
            <div className="grid hotdeals-grid">{hot.map(p => <ProductCard key={p.id} p={p} />)}</div>
          </div>
        </section>
      )}

      <div id="category-sections">
        {sections.length === 0 && <><div className="cat-section-skel" /><div className="cat-section-skel" /></>}
        {sections.map(({ c, items }, i) => <CatSection key={c.id} c={c} items={items} index={i} />)}
      </div>

      <PolicySection />

      <section className="section" id="home-contact">
        <div className="wrap">
          <div className="section-head"><div><h2>Talk to us</h2></div></div>
          <div className="contact-strip">
            <a href={`mailto:${SHOP.email}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" fill="none" /><path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.7" fill="none" /></svg>
              <b>Email</b><span>{SHOP.email}</span></a>
            <a href="tel:+8801700000000">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.5 2.3.8 3.6.9.6 0 1 .5 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.1c.5 0 1 .4 1 1 .1 1.3.4 2.5.9 3.6.1.4 0 .8-.2 1L6.6 10.8Z" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" /></svg>
              <b>Phone</b><span>{SHOP.phone}</span></a>
            <a href="https://maps.google.com/?q=House+14,+Road+7,+Dhanmondi,+Dhaka+1205" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinejoin="round" /><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" fill="none" /></svg>
              <b>Location</b><span>{SHOP.address}</span></a>
          </div>
        </div>
      </section>
    </>
  );
}
