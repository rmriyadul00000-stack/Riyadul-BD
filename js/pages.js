/* ============================================================
   Riyadul BD — page controllers
   One entry point; the <body data-page="..."> attribute decides which
   controller runs.
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;
  const activePage = page === 'products'
    ? (RB.qs('hotdeals') === '1' ? 'hotdeals' : RB.qs('cat') ? 'cat-' + RB.qs('cat') : page)
    : page;
  await RB.chrome(activePage);
  const run = { home, products, product, checkout, account, wishlist, contact }[page];
  if (run) run().catch(err => { console.error(err); RB.toast('Something went wrong loading this page.', true); });
});

/* ===================== HOME ===================== */
const CAT_PAGE_SIZE = 6;   // products shown per category before "Show More"
const CAT_PAGE_STEP = 6;   // how many more each click reveals

async function home() {
  const [pRes, cRes, sRes] = await Promise.all([RB_DB.products(), RB_DB.categories(), RB_DB.settings()]);
  const all = pRes.data || [], cats = cRes.data || [];
  const settings = sRes.data || RB_SETTINGS;
  const wl = (await RB_DB.wishlist()).data || [];

  await heroSlideshow();
  renderTrustBar();

  /* Quick category rail — a real link to that category's own page,
     never a same-page scroll. Auto-advances every 3s and loops, but
     Prev/Next and dragging keep working exactly as before. */
  RB.el('#cats').innerHTML = cats.map(c => {
    const art = c.image_url
      ? `<img src="${c.image_url}" alt="" loading="lazy">`
      : `<span class="ico">${c.icon_svg || ''}</span>`;
    return `<a class="cat" href="products.html?cat=${c.slug}">
      <span class="cat-img">${art}</span>
      <b>${RB.esc(c.name)}</b></a>`;
  }).join('');
  wireDragRow(RB.el('#cats'), RB.el('#quicknav-prev'), RB.el('#quicknav-next'), { autoMs: 3000 });

  /* Hot Deals: right after Quick Nav, before the category sections —
     highlighted, product cards only, no banner. Hidden entirely when
     nothing is marked as a hot deal in the admin panel. */
  const hotHost = RB.el('#hotdeals-home');
  const hot = all.filter(p => p.hot_deal).sort((a, b) => (a.hot_deal_sort || 0) - (b.hot_deal_sort || 0));
  if (hot.length) {
    hotHost.innerHTML = `
      <div class="wrap">
        <h2 class="cat-section-title hotdeals-title">
          <span class="en">🔥 ${RB.esc(settings.hotdeals_title || 'Hot Deals')}</span>
        </h2>
        <div class="grid hotdeals-grid">${hot.map(p => RB.card(p, wl)).join('')}</div>
      </div>`;
    RB.wireCards(hotHost, all);
  } else {
    hotHost.remove();
  }

  /* One section per category: name → banner → product grid → View More.
     New categories from the admin panel need nothing else — they appear
     here automatically because this loop reads straight from the
     database, and categories with no products yet are skipped. */
  const host = RB.el('#category-sections');
  const withStock = cats
    .map(c => ({ c, items: all.filter(p => p.cat === c.slug) }))
    .filter(x => x.items.length > 0);

  host.innerHTML = withStock.map(({ c, items }, i) => catSectionHTML(c, items, wl, i)).join('');

  withStock.forEach(({ c, items }) => wireCatSection(c, items, all));
  renderPolicySection();
}

function catSectionHTML(c, items, wl, index) {
  const shown = Math.min(CAT_PAGE_SIZE, items.length);
  const banner = `
    <a class="cat-banner" href="products.html?cat=${c.slug}" aria-label="See all ${RB.esc(c.name)}">
      <picture>
        <source media="(min-width: 761px)" srcset="${c.desktop_banner_url || c.image_url || ''}">
        <img src="${c.mobile_banner_url || c.desktop_banner_url || c.image_url || ''}"
             alt="${RB.esc(c.name)}" loading="${index === 0 ? 'eager' : 'lazy'}" width="900" height="900">
      </picture>
      <span class="see-all btn btn-gold">See All</span>
    </a>`;
  return `
  <section class="cat-section" id="section-${c.slug}">
    <div class="wrap">
      <h2 class="cat-section-title">
        <span class="bn">${RB.esc(c.name_bn || '')}</span>
        <span class="en">${RB.esc(c.name)}</span>
      </h2>
      <div class="cat-section-row">
        ${banner}
        <div class="cat-section-body">
          <div class="cat-grid-wrap">
            <button class="row-arrow prev hide" aria-label="Previous products">${RB.svg('back')}</button>
            <div class="grid" id="grid-${c.slug}">
              ${items.slice(0, shown).map(p => RB.card(p, wl)).join('')}
            </div>
            <button class="row-arrow next hide" aria-label="Next products">${RB.svg('back')}</button>
          </div>
          ${items.length > shown
            ? `<div class="cat-view-more"><button class="btn btn-ghost show-more-btn" data-cat="${c.slug}" data-shown="${shown}" data-total="${items.length}">
                 View More (${shown}/${items.length} items)</button></div>`
            : ''}
        </div>
      </div>
    </div>
  </section>`;
}

function wireCatSection(c, items, all) {
  const grid = RB.el('#grid-' + c.slug);
  RB.wireCards(grid, all);

  const wrap = grid.closest('.cat-grid-wrap');
  const prevBtn = RB.el('.row-arrow.prev', wrap), nextBtn = RB.el('.row-arrow.next', wrap);
  if (items.length > 2 && window.matchMedia('(min-width:761px)').matches) {
    prevBtn.classList.remove('hide'); nextBtn.classList.remove('hide');
  }
  wireDragRow(grid, prevBtn, nextBtn);

  const btn = document.querySelector(`.show-more-btn[data-cat="${c.slug}"]`);
  if (!btn) return;
  btn.onclick = async () => {
    const wl = (await RB_DB.wishlist()).data || [];
    const shown = Number(btn.dataset.shown);
    const next = Math.min(items.length, shown + CAT_PAGE_STEP);
    grid.insertAdjacentHTML('beforeend', items.slice(shown, next).map(p => RB.card(p, wl)).join(''));
    btn.dataset.shown = next;
    if (next >= items.length) btn.closest('.cat-view-more').remove();
    else btn.textContent = `View More (${next}/${items.length} items)`;
  };
}

/* ---------- shared drag/scroll behaviour for horizontal rails ----------
   Used by the desktop quick-nav rail and each category's product row.
   Mouse-draggable, with Prev/Next buttons that always loop back to the
   start/end instead of getting stuck — every rail on the site behaves
   this way. `opts.autoMs` optionally auto-advances on a timer (used by
   the quick-nav rail), pausing while the user is interacting. */
function wireDragRow(el, prevBtn, nextBtn, opts) {
  if (!el) return;
  opts = opts || {};
  let down = false, startX = 0, startScroll = 0, moved = false;
  const onDown = x => { down = true; moved = false; startX = x; startScroll = el.scrollLeft; el.classList.add('dragging'); stopAuto(); };
  const onMove = x => { if (!down) return; const dx = x - startX; if (Math.abs(dx) > 4) moved = true; el.scrollLeft = startScroll - dx; };
  const onUp = () => { down = false; el.classList.remove('dragging'); startAuto(); };
  el.addEventListener('mousedown', e => onDown(e.clientX));
  window.addEventListener('mousemove', e => onMove(e.clientX));
  window.addEventListener('mouseup', onUp);
  el.addEventListener('click', e => { if (moved) e.preventDefault(); }, true);

  const step = () => Math.max(220, el.clientWidth * 0.8);
  const atEnd = () => el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
  const atStart = () => el.scrollLeft <= 4;
  const goNext = () => { if (atEnd()) el.scrollTo({ left: 0, behavior: 'smooth' }); else el.scrollBy({ left: step(), behavior: 'smooth' }); };
  const goPrev = () => { if (atStart()) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' }); else el.scrollBy({ left: -step(), behavior: 'smooth' }); };
  if (nextBtn) nextBtn.onclick = () => { goNext(); resetAuto(); };
  if (prevBtn) prevBtn.onclick = () => { goPrev(); resetAuto(); };

  let timer;
  function startAuto() { if (opts.autoMs) timer = setInterval(goNext, opts.autoMs); }
  function stopAuto() { clearInterval(timer); }
  function resetAuto() { stopAuto(); startAuto(); }
  if (opts.autoMs) {
    el.addEventListener('mouseenter', stopAuto);
    el.addEventListener('mouseleave', startAuto);
    el.addEventListener('touchstart', stopAuto, { passive: true });
    el.addEventListener('touchend', startAuto);
    startAuto();
  }
}

function renderTrustBar() {
  const host = RB.el('#trust-bar');
  if (!host) return;
  const items = [
    ['truck', 'Fast delivery', 'Next day inside Dhaka'],
    ['shield', 'Certified organic', 'Verified farms only'],
    ['refresh', 'Easy returns', 'Wrong or spoiled? We fix it'],
    ['box', 'Cash on delivery', 'Pay when it arrives']
  ];
  host.innerHTML = `<div class="wrap">${items.map(([icon, b, s]) =>
    `<div>${RB.svg(icon)}<span><b>${RB.esc(b)}</b><span>${RB.esc(s)}</span></span></div>`).join('')}</div>`;
}

function renderPolicySection() {
  RB.els('.site-policy').forEach(host => {
    host.innerHTML = `
    <div class="wrap">
      <div class="section-head"><div><h2>Our promise to you</h2>
        <p>Simple terms, kept the same on every order.</p></div></div>
      <div class="policy-grid">
        <div class="policy-item">${RB.svg('leaf')}<h3>Certified organic</h3><p class="muted small">Every farm we buy from is checked before it's listed.</p></div>
        <div class="policy-item">${RB.svg('truck')}<h3>Fast, tracked delivery</h3><p class="muted small">Next day inside Dhaka, 2–3 days elsewhere. Track any order with its number.</p></div>
        <div class="policy-item">${RB.svg('refresh')}<h3>No-fuss returns</h3><p class="muted small">Wrong, short-weight or spoiled? Message us the same day — we replace or refund it.</p></div>
        <div class="policy-item">${RB.svg('shield')}<h3>Pay safely</h3><p class="muted small">Cash on delivery, bKash or Nagad. Nothing charged before it reaches you.</p></div>
      </div>
    </div>`;
  });
}


/* ---------- hero: images only, one set per device ----------
   Both device variants render at once; CSS media queries decide which
   one is visible, so resizing the browser (no reload needed) always
   shows exactly one — never both, never neither. */
async function heroSlideshow() {
  const host = RB.el('#hero');
  if (!host) return;
  const [dRes, mRes] = await Promise.all([RB_DB.hero('desktop'), RB_DB.hero('mobile')]);
  const sets = { desktop: dRes.data || [], mobile: mRes.data || [] };
  if (!sets.desktop.length && !sets.mobile.length) { host.remove(); return; }

  host.innerHTML = ['desktop', 'mobile'].map(device => {
    const slides = sets[device];
    if (!slides.length) return '';
    return `
    <div class="hero-device hero-${device}" data-device="${device}">
      <div class="hero-track">${slides.map((s, i) =>
        `<img class="hero-img ${i === 0 ? 'on' : ''}" src="${s.image_url}" alt="${RB.esc(s.alt || '')}"
          ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} draggable="false">`).join('')}</div>
      ${slides.length > 1 ? `
      <button class="hero-arrow prev" aria-label="Previous slide">${RB.svg('back')}</button>
      <button class="hero-arrow next" aria-label="Next slide">${RB.svg('back')}</button>
      <div class="hero-dots">${slides.map((_, i) =>
        `<button class="${i === 0 ? 'on' : ''}" data-slide="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>` : ''}
    </div>`;
  }).join('');

  ['desktop', 'mobile'].forEach(device => {
    const box = RB.el(`.hero-${device}`, host);
    if (box) wireHeroDevice(box);
  });
}

function wireHeroDevice(box) {
  const imgs = RB.els('.hero-img', box), dots = RB.els('.hero-dots button', box);
  if (imgs.length < 2) return;
  const mq = q => (typeof window.matchMedia === 'function' ? window.matchMedia(q).matches : false);
  let at = 0, timer;
  const show = i => {
    at = (i + imgs.length) % imgs.length;
    imgs.forEach((im, n) => im.classList.toggle('on', n === at));
    dots.forEach((d, n) => d.classList.toggle('on', n === at));
  };
  const stop = () => clearInterval(timer);
  const start = () => { stop(); if (!mq('(prefers-reduced-motion: reduce)')) timer = setInterval(() => show(at + 1), 6000); };
  dots.forEach(d => d.onclick = () => { show(Number(d.dataset.slide)); start(); });
  const prev = RB.el('.hero-arrow.prev', box), next = RB.el('.hero-arrow.next', box);
  if (prev) prev.onclick = () => { show(at - 1); start(); };
  if (next) next.onclick = () => { show(at + 1); start(); };
  box.addEventListener('mouseenter', stop);
  box.addEventListener('mouseleave', start);

  // mouse drag + touch swipe
  let startX = null, dx = 0, dragging = false;
  const track = RB.el('.hero-track', box);
  const onDown = x => { startX = x; dx = 0; dragging = true; stop(); };
  const onMove = x => { if (dragging) dx = x - startX; };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    if (dx > 40) show(at - 1); else if (dx < -40) show(at + 1);
    start();
  };
  track.addEventListener('mousedown', e => onDown(e.clientX));
  window.addEventListener('mousemove', e => onMove(e.clientX));
  window.addEventListener('mouseup', onUp);
  track.addEventListener('touchstart', e => onDown(e.touches[0].clientX), { passive: true });
  track.addEventListener('touchmove', e => onMove(e.touches[0].clientX), { passive: true });
  track.addEventListener('touchend', onUp);

  start();
}

/* ===================== PRODUCT LISTING ===================== */
async function products() {
  const [pRes, cRes, sRes] = await Promise.all([RB_DB.products(), RB_DB.categories(), RB_DB.settings()]);
  const all = pRes.data || [], cats = cRes.data || [];
  const settings = sRes.data || RB_SETTINGS;
  let wl = (await RB_DB.wishlist()).data || [];

  const priceMax = Math.max(100, Math.ceil(Math.max(...all.map(p => RB.lowestPrice(p)), 100) / 50) * 50);
  const step = priceMax > 1000 ? 50 : 10;

  const state = {
    cat: RB.qs('cat') || '',
    hotdeals: RB.qs('hotdeals') === '1',
    q: RB.qs('q') || '',
    min: 0, max: priceMax,
    certified: false, inStock: false,
    sort: 'featured'
  };

  /* Real category / Hot Deals page: its own banner + name, and — per
     the requirement — nothing from the other categories mixed in. */
  const catHost = RB.el('#cat-hero');
  const activeCat = cats.find(c => c.slug === state.cat);
  if (state.hotdeals) {
    document.title = `${settings.hotdeals_title || 'Hot Deals'} — Riyadul BD`;
    RB.el('#listing-title').textContent = settings.hotdeals_title || 'Hot Deals';
    RB.el('#listing-sub').textContent = 'Limited-time offers, picked by us.';
    catHost.innerHTML = '';
  } else if (activeCat) {
    document.title = `${activeCat.name} — Riyadul BD`;
    RB.el('#listing-title').textContent = activeCat.name;
    RB.el('#listing-sub').textContent = activeCat.name_bn || '';
    const banner = activeCat.desktop_banner_url || activeCat.image_url || '';
    catHost.innerHTML = banner ? `
      <div class="cat-page-banner">
        <picture>
          <source media="(min-width: 761px)" srcset="${activeCat.desktop_banner_url || activeCat.image_url || ''}">
          <img src="${activeCat.mobile_banner_url || activeCat.desktop_banner_url || activeCat.image_url || ''}" alt="${RB.esc(activeCat.name)}">
        </picture>
      </div>` : '';
  } else {
    catHost.innerHTML = '';
  }

  RB.el('#f-cats').innerHTML = cats.map(c => `
    <label><input type="radio" name="cat" value="${c.slug}" ${state.cat === c.slug ? 'checked' : ''}>
    ${RB.esc(c.name)}</label>`).join('') +
    `<label><input type="radio" name="cat" value="" ${!state.cat ? 'checked' : ''}>All categories</label>`;

  RB.el('#price-filter').innerHTML = `
    <button type="button" class="price-block-toggle" id="price-toggle" aria-expanded="true">
      <h4>Price range</h4><span class="chev">▾</span>
    </button>
    <div class="price-panel" id="price-panel">
      <div class="price-slider">
        <div class="price-track"><div class="price-fill" id="price-fill"></div></div>
        <input type="range" id="price-min-range" min="0" max="${priceMax}" step="${step}" value="0">
        <input type="range" id="price-max-range" min="0" max="${priceMax}" step="${step}" value="${priceMax}">
      </div>
      <div class="price-steppers">
        <div class="stepper-mini">
          <button type="button" data-dec="min" aria-label="Decrease minimum price">−</button>
          <span id="price-min-val">${RB.money(0)}</span>
          <button type="button" data-inc="min" aria-label="Increase minimum price">+</button>
        </div>
        <span class="muted">to</span>
        <div class="stepper-mini">
          <button type="button" data-dec="max" aria-label="Decrease maximum price">−</button>
          <span id="price-max-val">${RB.money(priceMax)}</span>
          <button type="button" data-inc="max" aria-label="Increase maximum price">+</button>
        </div>
      </div>
    </div>`;

  const priceToggleBtn = RB.el('#price-toggle'), pricePanel = RB.el('#price-panel');
  priceToggleBtn.onclick = () => {
    const open = pricePanel.classList.toggle('collapsed');
    priceToggleBtn.setAttribute('aria-expanded', String(!open));
  };
  const minRange = RB.el('#price-min-range'), maxRange = RB.el('#price-max-range');
  const fill = RB.el('#price-fill');
  function syncPriceUI() {
    minRange.value = state.min; maxRange.value = state.max;
    RB.el('#price-min-val').textContent = RB.money(state.min);
    RB.el('#price-max-val').textContent = RB.money(state.max);
    fill.style.left = (state.min / priceMax * 100) + '%';
    fill.style.right = (100 - state.max / priceMax * 100) + '%';
  }
  function setMin(v) { state.min = Math.max(0, Math.min(v, state.max - step)); syncPriceUI(); apply(); }
  function setMax(v) { state.max = Math.min(priceMax, Math.max(v, state.min + step)); syncPriceUI(); apply(); }
  minRange.oninput = () => setMin(Number(minRange.value));
  maxRange.oninput = () => setMax(Number(maxRange.value));
  RB.el('#price-filter').addEventListener('click', e => {
    const dec = e.target.closest('[data-dec]'), inc = e.target.closest('[data-inc]');
    if (dec) dec.dataset.dec === 'min' ? setMin(state.min - step) : setMax(state.max - step);
    if (inc) inc.dataset.inc === 'min' ? setMin(state.min + step) : setMax(state.max + step);
  });
  syncPriceUI();

  const q = RB.el('#search-input');
  if (q) q.value = state.q;

  function apply() {
    let list = all.slice();
    if (state.hotdeals) list = list.filter(p => p.hot_deal).sort((a, b) => (a.hot_deal_sort || 0) - (b.hot_deal_sort || 0));
    if (state.cat) list = list.filter(p => p.cat === state.cat);
    if (state.q) {
      const s = state.q.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s) || (p.name_bn || '').includes(state.q) ||
        (p.description || '').toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s));
    }
    if (state.min > 0) list = list.filter(p => RB.lowestPrice(p) >= state.min);
    if (state.max < priceMax) list = list.filter(p => RB.lowestPrice(p) <= state.max);
    if (state.certified) list = list.filter(p => p.certified);
    if (state.inStock) list = list.filter(p => RB.stockOf(p) > 0);

    if (!state.hotdeals) {
      const sorters = {
        featured: (a, b) => (b.featured === true) - (a.featured === true),
        'price-asc': (a, b) => RB.lowestPrice(a) - RB.lowestPrice(b),
        'price-desc': (a, b) => RB.lowestPrice(b) - RB.lowestPrice(a),
        name: (a, b) => a.name.localeCompare(b.name),
        discount: (a, b) => RB.discountPct(b) - RB.discountPct(a)
      };
      list.sort(sorters[state.sort] || sorters.featured);
    }

    const grid = RB.el('#grid');
    RB.el('#count').textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;
    grid.innerHTML = list.length
      ? list.map(p => RB.card(p, wl)).join('')
      : `<div class="empty" style="grid-column:1/-1">${RB.svg('basket')}
          <p>Nothing matches those filters yet.</p>
          <button class="btn btn-ghost" id="reset">Clear filters</button></div>`;
    const reset = RB.el('#reset');
    if (reset) reset.onclick = () => {
      Object.assign(state, { cat: '', q: '', min: 0, max: priceMax, certified: false, inStock: false });
      RB.els('#filters input[type=checkbox]').forEach(i => i.checked = false);
      RB.el('input[name=cat][value=""]').checked = true;
      if (q) q.value = '';
      syncPriceUI();
      apply();
    };

    // active filter chips
    const chips = [];
    if (state.cat) chips.push(['cat', (cats.find(c => c.slug === state.cat) || {}).name || state.cat]);
    if (state.q) chips.push(['q', `“${state.q}”`]);
    if (state.certified) chips.push(['certified', 'Certified organic']);
    if (state.inStock) chips.push(['inStock', 'In stock']);
    if (state.min > 0 || state.max < priceMax) chips.push(['price', `${RB.money(state.min)}–${RB.money(state.max)}`]);
    RB.el('#chips').innerHTML = chips.map(([k, label]) =>
      `<span class="chip">${RB.esc(label)}<button data-clear="${k}" aria-label="Remove filter">×</button></span>`).join('');

    // keep the URL shareable
    const params = new URLSearchParams();
    if (state.cat) params.set('cat', state.cat);
    if (state.hotdeals) params.set('hotdeals', '1');
    if (state.q) params.set('q', state.q);
    history.replaceState(null, '', params.toString() ? '?' + params : location.pathname);
  }

  RB.el('#chips').onclick = e => {
    const b = e.target.closest('[data-clear]');
    if (!b) return;
    const k = b.dataset.clear;
    if (k === 'price') { state.min = 0; state.max = priceMax; syncPriceUI(); }
    else if (k === 'cat') { state.cat = ''; RB.el('input[name=cat][value=""]').checked = true; }
    else if (k === 'q') { state.q = ''; if (q) q.value = ''; }
    else { state[k] = false; RB.el(`#f-${k}`).checked = false; }
    apply();
  };

  RB.el('#filters').addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'cat') state.cat = t.value;
    if (t.id === 'f-certified') state.certified = t.checked;
    if (t.id === 'f-instock') state.inStock = t.checked;
    apply();
  });
  RB.el('#sort').onchange = e => { state.sort = e.target.value; apply(); };
  if (q) q.oninput = () => { state.q = q.value.trim(); apply(); };

  // mobile filter drawer: open, apply, reset and close all dismiss cleanly
  const filters = RB.el('#filters'), backdrop = RB.el('#filters-backdrop');
  const closeFilters = () => { filters.classList.remove('open'); backdrop.classList.remove('open'); };
  RB.el('#filter-toggle').onclick = () => { filters.classList.add('open'); backdrop.classList.add('open'); };
  RB.el('#filters-close').onclick = closeFilters;
  RB.el('#filters-apply').onclick = closeFilters;
  backdrop.onclick = closeFilters;
  RB.el('#filters-reset').onclick = () => {
    Object.assign(state, { cat: '', q: '', min: 0, max: priceMax, certified: false, inStock: false });
    RB.els('#filters input[type=checkbox]').forEach(i => i.checked = false);
    RB.el('input[name=cat][value=""]').checked = true;
    if (q) q.value = '';
    syncPriceUI();
    apply();
  };

  const grid = RB.el('#grid');
  RB.wireCards(grid, all);
  grid.addEventListener('click', async e => {
    if (e.target.closest('[data-wish]')) wl = (await RB_DB.wishlist()).data || [];
  });

  apply();
  renderPolicySection();
}

/* ===================== PRODUCT DETAIL ===================== */
async function product() {
  const slug = RB.qs('slug');
  const res = await RB_DB.product(slug);
  const host = RB.el('#pdp');
  if (!res.ok) {
    host.innerHTML = `<div class="empty">${RB.svg('basket')}<p>${RB.esc(res.error)}</p>
      <a class="btn" href="products.html">Back to the shop</a></div>`;
    return;
  }
  const p = res.data;
  document.title = `${p.name} — Riyadul BD`;
  const wl = (await RB_DB.wishlist()).data || [];
  let variant = p.variants.find(v => (v.stock || 0) > 0) || p.variants[0];
  let qty = 1;
  let img = 0;

  RB.el('#crumbs').innerHTML =
    `<a href="index.html">Home</a> / <a href="products.html?cat=${p.cat}">${RB.esc(p.cat.replace(/-/g, ' '))}</a> / ${RB.esc(p.name)}`;

  function paint() {
    const out = (variant.stock || 0) <= 0;
    host.innerHTML = `
      <div>
        <div class="gallery-main">
          <img src="${p.images[img]}" alt="${RB.esc(p.name)}">
          <button class="wish pdp-wish ${wl.includes(p.id) ? 'on' : ''}" id="wish" aria-label="Save this item">
            ${RB.svg(wl.includes(p.id) ? 'heartFill' : 'heart')}
          </button>
        </div>
        ${p.images.length > 1 ? `<div class="thumbs">${p.images.map((s, i) =>
          `<button class="${i === img ? 'on' : ''}" data-img="${i}"><img src="${s}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div>
        <span class="card-cat">${RB.esc(p.name_bn || '')}</span>
        <h1 class="pdp-title">${RB.esc(p.name)}</h1>
        <p class="muted small">${RB.esc(p.farm || '')} · ${RB.esc(p.origin || '')}</p>
        <div class="tags" style="position:static;flex-direction:row;margin:10px 0">
          ${p.certified ? '<span class="tag">Certified organic</span>' : ''}
          ${RB.discountPct(p) ? `<span class="tag sale">${RB.discountPct(p)}% off</span>` : ''}
        </div>
        <div class="pdp-price">
          <b>${RB.money(variant.price)}</b>
          ${variant.mrp > variant.price ? `<s>${RB.money(variant.mrp)}</s>` : ''}
          <span class="muted">per ${RB.esc(variant.label)}</span>
        </div>
        <div class="opt-group">
          <span>Choose a size</span>
          <div class="opts">${p.variants.map(v =>
            `<button class="opt ${v.label === variant.label ? 'on' : ''}" data-v="${RB.esc(v.label)}"
              ${(v.stock || 0) <= 0 ? 'disabled' : ''}>${RB.esc(v.label)} — ${RB.money(v.price)}</button>`).join('')}
          </div>
        </div>
        <p class="small ${out ? 'notice bad' : 'muted'}">
          ${out ? 'This size is sold out. Pick another, or check back — farm stock refreshes twice a week.'
                : `${variant.stock} in stock right now`}</p>
        <div class="buy-row">
          <div class="stepper">
            <button id="dec" aria-label="Reduce quantity">−</button><span id="qty">${qty}</span>
            <button id="inc" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn" id="add" ${out ? 'disabled' : ''}>${out ? 'Sold out' : 'Add to basket'}</button>
        </div>
        <div class="facts">
          <div><dt>Farm</dt><dd>${RB.esc(p.farm || '—')}</dd></div>
          <div><dt>Grown in</dt><dd>${RB.esc(p.origin || '—')}</dd></div>
          <div><dt>Sold as</dt><dd>${p.variants.map(v => RB.esc(v.label)).join(' · ')}</dd></div>
          <div><dt>Delivery</dt><dd>Inside Dhaka next day · elsewhere in 2–3 days</dd></div>
        </div>
      </div>`;

    host.querySelectorAll('[data-img]').forEach(b => b.onclick = () => { img = Number(b.dataset.img); paint(); });
    if (p.images.length > 1) {
      const main = RB.el('.gallery-main', host);
      let sx = null;
      main.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
      main.addEventListener('touchend', e => {
        if (sx == null) return;
        const dx = e.changedTouches[0].clientX - sx;
        if (dx < -40) { img = (img + 1) % p.images.length; paint(); }
        else if (dx > 40) { img = (img - 1 + p.images.length) % p.images.length; paint(); }
        sx = null;
      });
    }
    host.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      variant = p.variants.find(v => v.label === b.dataset.v); qty = 1; paint();
    });
    RB.el('#inc').onclick = () => { if (qty < variant.stock) { qty++; RB.el('#qty').textContent = qty; } };
    RB.el('#dec').onclick = () => { if (qty > 1) { qty--; RB.el('#qty').textContent = qty; } };
    const addBtn = RB.el('#add');
    if (addBtn) addBtn.onclick = () => { if (RB.cart.add(p, variant.label, qty)) RB.drawer.open(); };
    RB.el('#wish').onclick = async () => {
      const r = await RB_DB.toggleWishlist(p.id);
      RB.el('#wish').innerHTML = RB.svg(r.data ? 'heartFill' : 'heart');
      RB.toast(r.data ? 'Saved to your list.' : 'Removed from your list.');
    };
  }
  paint();

  // tabs
  const panes = {
    about: `<p>${RB.esc(p.description)}</p>
      <h4>Why this one</h4><ul>${(p.benefits || []).map(b => `<li>${RB.esc(b)}</li>`).join('')}</ul>`,
    keeping: `<h4>Keeping it fresh</h4><p>${RB.esc(p.storage_tip || 'Store cool and dry.')}</p>
      <h4>What to expect</h4><p>Size, colour and weight vary between deliveries. Produce is weighed after trimming, so what you receive matches what you paid for.</p>`,
    delivery: `<h4>Delivery</h4><p>Inside Dhaka we deliver the next day. Outside Dhaka takes two to three days by courier.
      Delivery is ${RB.money(RB.shop.delivery.inside)} inside Dhaka, ${RB.money(RB.shop.delivery.outside)} elsewhere, and free over ${RB.money(RB.shop.delivery.freeOver)}.</p>
      <h4>If something arrives wrong</h4><p>Photograph it and message us the same day on WhatsApp. We replace it on the next run or refund the item — your choice.</p>`
  };
  const tabs = RB.el('#tabs'), pane = RB.el('#pane');
  pane.innerHTML = panes.about;
  tabs.onclick = e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tabs.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    pane.innerHTML = panes[b.dataset.tab];
  };

  // related
  const all = (await RB_DB.products()).data || [];
  const rel = all.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4);
  const relGrid = RB.el('#related');
  if (rel.length) { relGrid.innerHTML = rel.map(x => RB.card(x, wl)).join(''); RB.wireCards(relGrid, all); }
  else RB.el('#related-section').remove();
  renderPolicySection();
}

/* ===================== CHECKOUT ===================== */
async function checkout() {
  let coupon = null;
  const form = RB.el('#order-form');
  /* An account only pre-fills the form as a convenience. Whatever is
     typed here is saved on the order, and never written back over the
     customer's account profile — ordering for a relative is normal. */
  const me = await RB_DB.me();
  if (me) {
    form.elements.full_name.value = me.full_name || '';
    form.elements.email.value = me.email || '';
    form.elements.phone.value = me.phone || '';
    form.elements.city.value = me.city || '';
    form.elements.address.value = me.address || '';
    RB.el('#who').innerHTML =
      `Ordering as <b>${RB.esc(me.full_name || me.email)}</b> (${RB.esc(me.customer_code || 'account')}).
       Change any detail below if the delivery is for someone else — your account stays as it is.`;
  } else {
    RB.el('#who').innerHTML =
      `Checking out as a guest. <a href="account.html">Sign in</a> first if you want this order
       kept in your order history.`;
  }
  RB.el('#who').classList.remove('hide');

  function summary() {
    const items = RB.cart.read();
    const sub = RB.cart.subtotal();
    const zone = (form.elements.zone.value || 'inside');
    const ship = RB.cart.shipping(zone, coupon);
    const disc = RB.cart.discount(coupon);
    const total = Math.max(0, sub - disc + ship);

    RB.el('#sum-lines').innerHTML = items.map(i => `
      <div class="line">
        <img src="${i.image}" alt="">
        <div><b>${RB.esc(i.name)}</b><i>${RB.esc(i.variant)} × ${i.qty}</i></div>
        <b>${RB.money(i.price * i.qty)}</b>
      </div>`).join('');

    RB.el('#sum-totals').innerHTML = `
      <div><span>Subtotal</span><span>${RB.money(sub)}</span></div>
      ${disc ? `<div><span>Discount (${RB.esc(coupon.code)})</span><span>−${RB.money(disc)}</span></div>` : ''}
      <div><span>Delivery</span><span>${ship ? RB.money(ship) : 'Free'}</span></div>
      <div class="grand"><span>Total</span><span>${RB.money(total)}</span></div>`;

    RB.el('#place').disabled = items.length === 0;
    RB.el('#empty-note').classList.toggle('hide', items.length > 0);
    return { items, sub, ship, disc, total, zone };
  }

  form.addEventListener('change', summary);
  RB.els('.pay label').forEach(l => l.onclick = () => {
    RB.els('.pay label').forEach(x => x.classList.remove('on')); l.classList.add('on');
  });

  RB.el('#apply-coupon').onclick = async () => {
    const code = RB.el('#coupon-code').value.trim();
    if (!code) return;
    const r = await RB_DB.validateCoupon(code, RB.cart.subtotal());
    const note = RB.el('#coupon-note');
    if (!r.ok) { coupon = null; note.className = 'notice bad'; note.textContent = r.error; }
    else { coupon = r.data; note.className = 'notice'; note.textContent = `${coupon.code} applied — ${coupon.note}`; }
    note.classList.remove('hide');
    summary();
  };

  form.onsubmit = async e => {
    e.preventDefault();
    let bad = false;
    RB.els('.field', form).forEach(f => {
      const input = f.querySelector('input,select,textarea');
      if (!input || !input.required) return;
      const empty = !input.value.trim();
      const badPhone = input.name === 'phone' && !/^(\+?88)?01[3-9]\d{8}$/.test(input.value.replace(/[\s-]/g, ''));
      f.classList.toggle('bad', empty || badPhone);
      if (empty || badPhone) bad = true;
    });
    if (bad) { RB.toast('Check the highlighted fields.', true); return; }

    const s = summary();
    const btn = RB.el('#place');
    btn.disabled = true; btn.textContent = 'Placing your order…';

    const order = {
      contact_name:  form.elements.full_name.value.trim(),
      contact_email: form.elements.email.value.trim(),
      contact_phone: form.elements.phone.value.trim(),
      ship_city:     form.elements.city.value.trim(),
      ship_address:  form.elements.address.value.trim(),
      ship_zone:     s.zone,
      note:          form.elements.note.value.trim(),
      payment_method: form.elements.payment.value,
      coupon_code:   coupon ? coupon.code : null,
      items: s.items.map(i => ({ product_id: i.id, variant_label: i.variant, qty: i.qty }))
    };

    const r = await RB_DB.placeOrder(order);
    if (!r.ok) {
      btn.disabled = false; btn.textContent = 'Place order';
      RB.toast(r.error, true); return;
    }
    RB.cart.clear();
    RB.el('#checkout-wrap').innerHTML = `
      <div class="panel" style="max-width:620px;margin-inline:auto;text-align:center">
        <div style="color:var(--leaf);margin-bottom:10px">${RB.svg('check')}</div>
        <h2>Order placed</h2>
        <p class="muted">Your order number is <b>${RB.esc(r.data.order_code)}</b>. Keep it — you can track the order with it.</p>
        <p class="muted">We will call ${RB.esc(order.contact_phone)} to confirm the delivery slot.
        ${order.payment_method === 'cod' ? `Pay ${RB.money(r.data.total)} in cash when it arrives.` : 'Payment instructions are on their way by SMS.'}</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px">
          <a class="btn" href="products.html">Keep shopping</a>
          <a class="btn btn-ghost" href="account.html?ref=${encodeURIComponent(r.data.order_code)}">Track this order</a>
        </div>
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  summary();
  document.addEventListener('rb:cart', summary);
}

/* ===================== ACCOUNT ===================== */
async function account() {
  const host = RB.el('#acct');
  let me = await RB_DB.me();

  async function paint() {
    me = await RB_DB.me();
    host.innerHTML = me ? loggedIn() : loggedOut();
    me ? wireIn() : wireOut();
    const ref = RB.qs('ref');
    if (ref) {
      const tab = RB.el('[data-tab=track]');
      if (tab) tab.click();
      setTimeout(() => {
        const i = RB.el('#track-ref');
        if (i) { i.value = ref; RB.el('#track-go').click(); }
      }, 80);
    }
  }

  function loggedOut() {
    return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start" class="auth-grid">
      <div class="panel">
        <div class="tabs" id="auth-tabs" style="margin-top:0">
          <button class="on" data-auth="login">Sign in</button>
          <button data-auth="register">Create account</button>
        </div>
        <form id="login-form">
          <div class="field"><label for="li-email">Email</label>
            <input id="li-email" name="email" type="email" required><span class="err">Enter your email.</span></div>
          <div class="field"><label for="li-pass">Password</label>
            <input id="li-pass" name="password" type="password" required><span class="err">Enter your password.</span></div>
          <button class="btn btn-block" type="submit">Sign in</button>
        </form>
        <form id="reg-form" class="hide">
          <div class="field"><label for="rg-name">Full name</label><input id="rg-name" name="full_name" required></div>
          <div class="field"><label for="rg-email">Email</label><input id="rg-email" name="email" type="email" required></div>
          <div class="field"><label for="rg-phone">Mobile number</label><input id="rg-phone" name="phone" placeholder="01XXXXXXXXX" required></div>
          <div class="field"><label for="rg-pass">Password</label><input id="rg-pass" name="password" type="password" minlength="6" required></div>
          <button class="btn btn-block" type="submit">Create account</button>
        </form>
      </div>
      <div class="panel">
        <h3>Track an order</h3>
        <p class="muted small">No account needed. Use the order number from your confirmation.</p>
        <div class="coupon">
          <input id="track-ref" placeholder="ORD-10001" aria-label="Order number">
          <button class="btn" id="track-go">Track</button>
        </div>
        <div id="track-result"></div>
      </div>
    </div>`;
  }

  function loggedIn() {
    return `
    <div class="acct">
      <nav class="acct-nav">
        <button class="on" data-tab="orders">My orders</button>
        <button data-tab="messages">Messages <span class="badge hide" id="acct-msg-badge">0</span></button>
        <button data-tab="profile">My account</button>
        <button data-tab="track">Track an order</button>
      </nav>
      <div class="panel" id="acct-pane"></div>
    </div>
    <div class="signout-zone">
      <button data-signout-ask class="signout-btn">Sign out</button>
    </div>`;
  }

  function wireOut() {
    const tabs = RB.el('#auth-tabs');
    tabs.onclick = e => {
      const b = e.target.closest('[data-auth]'); if (!b) return;
      tabs.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      RB.el('#login-form').classList.toggle('hide', b.dataset.auth !== 'login');
      RB.el('#reg-form').classList.toggle('hide', b.dataset.auth !== 'register');
    };
    RB.el('#login-form').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      const r = await RB_DB.login({ email: f.elements.email.value.trim(), password: f.elements.password.value });
      if (!r.ok) return RB.toast(r.error, true);
      RB.toast('Signed in.'); paint(); RB.chrome('account');
    };
    RB.el('#reg-form').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      const r = await RB_DB.register({
        email: f.elements.email.value.trim(), password: f.elements.password.value,
        full_name: f.elements.full_name.value.trim(), phone: f.elements.phone.value.trim()
      });
      if (!r.ok) return RB.toast(r.error, true);
      RB.toast(RB_DB.live ? 'Account created. Check your email to confirm it.' : 'Account created.');
      paint(); RB.chrome('account');
    };
    wireTrack();
  }

  function wireTrack() {
    const go = RB.el('#track-go');
    if (!go) return;
    go.onclick = async () => {
      const code = RB.el('#track-ref').value.trim();
      const box = RB.el('#track-result');
      if (!code) return;
      const r = await RB_DB.orderByCode(code);
      box.innerHTML = r.ok ? orderCard(r.data) : `<div class="notice bad">${RB.esc(r.error)}</div>`;
    };
  }

  /* ---------- Messages: a WhatsApp-style thread with the shop ----------
     Customer's own messages sit on the right, the shop's replies on the
     left — same idea as the chat pattern people already know. A message
     sent from here lands in the same thread as anything sent through the
     public Contact page, since both go through the customer's own
     customer_id. Opening this tab marks the shop's replies read, which
     clears the little badge on the header's account icon. */
  function messagesShell() {
    return `
    <style>
      .msg-wrap{display:flex;flex-direction:column;height:min(65vh,540px)}
      .msg-thread{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:6px 2px 14px}
      .msg-bubble{max-width:78%;padding:10px 14px;border-radius:16px;font-size:.92rem;line-height:1.45;white-space:pre-wrap;word-break:break-word}
      .msg-bubble .msg-time{display:block;font-size:.7rem;opacity:.65;margin-top:4px;text-align:right}
      .msg-bubble.out{align-self:flex-end;background:#2E7D4F;color:#fff;border-bottom-right-radius:4px}
      .msg-bubble.in{align-self:flex-start;background:#EDEDE6;color:#22281F;border-bottom-left-radius:4px}
      .msg-bubble.out .msg-time{color:rgba(255,255,255,.75)}
      .msg-bubble .msg-subject{display:block;font-size:.72rem;font-weight:700;opacity:.8;margin-bottom:3px;text-transform:uppercase;letter-spacing:.03em}
      .msg-composer{display:flex;gap:8px;align-items:flex-end;border-top:1px solid rgba(0,0,0,.08);padding-top:12px;margin-top:4px}
      .msg-composer textarea{flex:1;resize:none;min-height:42px;max-height:120px;border-radius:12px;padding:10px 12px;border:1px solid rgba(0,0,0,.15);font:inherit}
      .msg-composer button{flex:0 0 auto;width:42px;height:42px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;padding:0}
      .msg-composer button svg{width:18px;height:18px}
      .msg-empty{margin:auto;text-align:center;color:inherit;opacity:.6;padding:20px}
      .msg-empty svg{width:34px;height:34px;margin-bottom:8px;opacity:.7}
    </style>
    <h3>Messages</h3>
    <p class="muted small">A direct line to the shop. Send a question any time — we usually reply within a day.</p>
    <div class="msg-wrap">
      <div class="msg-thread" id="msg-thread"><p class="muted small">Loading…</p></div>
      <form class="msg-composer" id="msg-composer">
        <textarea id="msg-text" placeholder="Type a message…" required></textarea>
        <button class="btn" type="submit" aria-label="Send">${RB.svg('send')}</button>
      </form>
    </div>`;
  }

  let msgLastCount = 0;
  async function paintThread(isPoll) {
    const thread = RB.el('#msg-thread');
    if (!thread) return;
    const list = (await RB_DB.myMessages()).data || [];
    const wasAtBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 40;
    thread.innerHTML = list.length ? list.map(m => `
      <div class="msg-bubble ${m.sender === 'customer' ? 'out' : 'in'}">
        ${m.subject ? `<span class="msg-subject">${RB.esc(m.subject)}</span>` : ''}${RB.esc(m.message)}
        <span class="msg-time">${new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      </div>`).join('') : `<div class="msg-empty">${RB.svg('chat')}<p>No messages yet — ask us anything.</p></div>`;
    if (!isPoll || list.length !== msgLastCount || wasAtBottom) thread.scrollTop = thread.scrollHeight;
    msgLastCount = list.length;

    await RB_DB.markMyMessagesRead();
    RB.els('[data-msg-count]').forEach(b => b.classList.add('hide'));
    const tabBadge = RB.el('#acct-msg-badge');
    if (tabBadge) tabBadge.classList.add('hide');

    const form = RB.el('#msg-composer');
    const box = RB.el('#msg-text');
    box.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
    form.onsubmit = async e => {
      e.preventDefault();
      const text = box.value.trim();
      if (!text) return;
      const btn = form.querySelector('button');
      btn.disabled = true;
      const r = await RB_DB.sendAccountMessage(text);
      btn.disabled = false;
      if (!r.ok) return RB.toast(r.error, true);
      box.value = '';
      await paintThread();
    };
  }

  function wireIn() {
    const nav = RB.el('.acct-nav'), pane = RB.el('#acct-pane');
    let msgPollTimer = null;
    const stopMsgPoll = () => { if (msgPollTimer) { clearInterval(msgPollTimer); msgPollTimer = null; } };
    const render = async (tab) => {
      stopMsgPoll();
      if (tab === 'out') {
        await RB_DB.logout(); RB.toast('Signed out.'); paint(); RB.chrome('account'); return;
      }
      if (tab === 'orders') {
        pane.innerHTML = '<h3>My orders</h3><p class="muted small">Loading…</p>';
        const list = (await RB_DB.myOrders()).data || [];
        pane.innerHTML = '<h3>My orders</h3>' + (list.length
          ? list.map(orderCard).join('')
          : `<div class="empty">${RB.svg('box')}<p>No orders yet.</p><a class="btn" href="products.html">Start shopping</a></div>`);
      }
      if (tab === 'messages') {
        pane.innerHTML = messagesShell();
        await paintThread();
        msgPollTimer = setInterval(async () => {
          if (!RB.el('#msg-thread')) { stopMsgPoll(); return; }
          await paintThread(true);
        }, 5000);
      }
      if (tab === 'profile') {
        pane.innerHTML = `<h3>My account</h3>
          <p class="muted small">Customer number <b>${RB.esc(me.customer_code || '—')}</b>.
             These details are your account's own. Delivery details you type at checkout belong to
             that order and never change what is saved here.</p>
          <form id="prof">
            <div class="row2">
              <div class="field"><label for="pf-name">Full name</label><input id="pf-name" name="full_name" value="${RB.esc(me.full_name || '')}"></div>
              <div class="field"><label for="pf-phone">Mobile number</label><input id="pf-phone" name="phone" value="${RB.esc(me.phone || '')}"></div>
            </div>
            <div class="field"><label for="pf-email">Email</label><input id="pf-email" value="${RB.esc(me.email || '')}" disabled></div>
            <div class="row2">
              <div class="field"><label for="pf-city">City</label><input id="pf-city" name="city" value="${RB.esc(me.city || '')}"></div>
              <div class="field"><label for="pf-addr">Usual delivery address</label><input id="pf-addr" name="address" value="${RB.esc(me.address || '')}"></div>
            </div>
            <button class="btn" type="submit">Save changes</button>
          </form>`;
        RB.el('#prof').onsubmit = async e => {
          e.preventDefault();
          const f = e.target;
          const r = await RB_DB.updateMyAccount({
            full_name: f.elements.full_name.value.trim(), phone: f.elements.phone.value.trim(),
            city: f.elements.city.value.trim(), address: f.elements.address.value.trim()
          });
          RB.toast(r.ok ? 'Account saved.' : r.error, !r.ok);
          me = await RB_DB.me();
        };
      }
      if (tab === 'track') {
        pane.innerHTML = `<h3>Track an order</h3>
          <div class="coupon"><input id="track-ref" placeholder="ORD-10001" aria-label="Order number">
          <button class="btn" id="track-go">Track</button></div><div id="track-result"></div>`;
        wireTrack();
      }
    };
    nav.onclick = e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      nav.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      render(b.dataset.tab);
    };
    render('orders');
    RB_DB.unreadMessageCount().then(r => {
      const b = RB.el('#acct-msg-badge');
      if (b && r.ok && r.data) { b.textContent = r.data; b.classList.remove('hide'); }
    });

    const signoutZone = RB.el('.signout-zone');
    if (signoutZone) signoutZone.onclick = e => {
      const ask = e.target.closest('[data-signout-ask]');
      const yes = e.target.closest('[data-signout-yes]');
      const no = e.target.closest('[data-signout-no]');
      if (ask) {
        signoutZone.innerHTML = `
          <span class="signout-confirm">
            <span>Sign out for good?</span>
            <button class="btn btn-sm btn-ghost" data-signout-no>Cancel</button>
            <button class="btn btn-sm btn-danger" data-signout-yes>Yes, sign out</button>
          </span>`;
      }
      if (no) resetSignoutBtn();
      if (yes) render('out');
    };
    function resetSignoutBtn() {
      signoutZone.innerHTML = `<button data-signout-ask class="signout-btn">Sign out</button>`;
    }
  }

  paint();
}

/* ---------- order card with a horizontal progress line ---------- */
const ORDER_STEPS = ['pending', 'confirmed', 'shipped', 'delivered'];
const STEP_LABEL = { pending: 'Pending', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered' };
const STEP_NOTE = {
  pending: 'We have your order and will call to confirm.',
  confirmed: 'Confirmed — being packed at the farm desk.',
  shipped: 'On the way with the courier.',
  delivered: 'Delivered. Thank you.',
  cancelled: 'This order was cancelled. Call us if that looks wrong.'
};

function orderProgress(status) {
  if (status === 'cancelled') {
    return `<div class="progress cancelled"><span class="pstep done">Cancelled</span></div>`;
  }
  const at = Math.max(0, ORDER_STEPS.indexOf(status));
  return `<div class="progress" style="--at:${at}">
    ${ORDER_STEPS.map((s, i) =>
      `<span class="pstep ${i < at ? 'done' : i === at ? 'now' : ''}">${STEP_LABEL[s]}</span>`).join('')}
  </div>`;
}

function orderCard(o) {
  const items = o.items || [];
  return `
  <div class="order">
    <div class="order-head">
      <div><b>${RB.esc(o.order_code)}</b><br>
        <span class="muted small">${new Date(o.placed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
      <span class="status ${RB.esc(o.status)}">${RB.esc(o.status)}</span>
    </div>
    ${orderProgress(o.status)}
    <p class="small muted" style="margin:0 0 12px">${STEP_NOTE[o.status] || ''}</p>
    <div class="tablewrap"><table class="data">
      <tr><th>Item</th><th>Size</th><th>Qty</th><th>Price</th></tr>
      ${items.map(i => `<tr><td>${RB.esc(i.product_name)}</td><td>${RB.esc(i.variant_label)}</td><td>${i.qty}</td><td>${RB.money(i.unit_price * i.qty)}</td></tr>`).join('')}
    </table></div>
    <div class="totals" style="margin-top:12px">
      <div><span>Delivered to</span><span>${RB.esc(o.contact_name)} · ${RB.esc(o.ship_address)}, ${RB.esc(o.ship_city)}</span></div>
      <div class="grand"><span>Total</span><span>${RB.money(o.total)}</span></div>
    </div>
  </div>`;
}

/* ===================== WISHLIST ===================== */
async function wishlist() {
  const all = (await RB_DB.products()).data || [];
  const host = RB.el('#wish-grid');
  async function paint() {
    const ids = (await RB_DB.wishlist()).data || [];
    const list = all.filter(p => ids.includes(p.id));
    host.innerHTML = list.length
      ? list.map(p => RB.card(p, ids)).join('')
      : `<div class="empty" style="grid-column:1/-1">${RB.svg('heart')}
          <p>Nothing saved yet. Tap the heart on any product to keep it here.</p>
          <a class="btn" href="products.html">Browse the shop</a></div>`;
  }
  RB.wireCards(host, all);
  host.addEventListener('click', e => { if (e.target.closest('[data-wish]')) setTimeout(paint, 60); });
  paint();
}

/* ===================== CONTACT ===================== */
async function contact() {
  const form = RB.el('#contact-form');
  form.onsubmit = async e => {
    e.preventDefault();
    let bad = false;
    RB.els('.field', form).forEach(f => {
      const i = f.querySelector('input,textarea,select');
      if (i && i.required && !i.value.trim()) { f.classList.add('bad'); bad = true; } else f.classList.remove('bad');
    });
    if (bad) return RB.toast('Fill in the highlighted fields.', true);
    const r = await RB_DB.saveMessage({
      name: form.elements.name.value.trim(), email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(), subject: form.elements.subject.value,
      message: form.elements.message.value.trim()
    });
    if (!r.ok) return RB.toast(r.error, true);
    form.reset();
    RB.el('#contact-done').classList.remove('hide');
    RB.toast('Message sent. We reply within a day.');
  };
}