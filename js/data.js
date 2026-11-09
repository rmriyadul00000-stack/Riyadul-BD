/* ============================================================
   Riyadul BD — seed catalog
   Used as-is when Supabase is not configured (demo mode), and as the
   seed for sql/02-seed.sql. Prices in BDT.
   ============================================================ */

/* Produce-toned SVG placeholder so the shop renders before real photos
   are uploaded. Replace `images` with real URLs and this disappears. */
function rbArt(name, a, b) {
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<rect width="400" height="400" fill="url(#g)"/>` +
    `<circle cx="200" cy="186" r="96" fill="rgba(255,255,255,.22)"/>` +
    `<text x="200" y="208" font-family="Georgia,serif" font-size="74" font-weight="700" ` +
    `fill="rgba(255,255,255,.92)" text-anchor="middle">${initials}</text>` +
    `<text x="200" y="352" font-family="system-ui,sans-serif" font-size="19" ` +
    `fill="rgba(255,255,255,.75)" text-anchor="middle">Riyadul BD</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* Inline SVG icons for the aisles. These are stored in the database
   (categories.icon_svg) and editable from the admin panel — the strings
   here are only the starting set. */
const ICON_SVG = {
  leaf:   '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20c0-8 6-14 16-15 0 10-6 15-14 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20c2-5 6-8 10-10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  fruit:  '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="14" r="7" stroke="currentColor" stroke-width="1.7"/><path d="M12 7V4M12 4c2 0 3.5-1 4-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  grain:  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 21V8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 8c0-3 2-5 5-5 0 3-2 5-5 5ZM12 8c0-3-2-5-5-5 0 3 2 5 5 5ZM12 14c0-3 2-5 5-5 0 3-2 5-5 5ZM12 14c0-3-2-5-5-5 0 3 2 5 5 5Z" stroke="currentColor" stroke-width="1.5"/></svg>',
  bottle: '<svg viewBox="0 0 24 24" fill="none"><path d="M10 2h4v3l2 3v11a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V8l2-3V2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 13h8" stroke="currentColor" stroke-width="1.5"/></svg>',
  honey:  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3 5 7v8l7 4 7-4V7l-7-4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.5 11h7M9.5 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  milk:   '<svg viewBox="0 0 24 24" fill="none"><path d="M9 2h6v3l2 4v10a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V9l2-4V2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  spice:  '<svg viewBox="0 0 24 24" fill="none"><path d="M7 9h10l-1 11H8L7 9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" stroke-width="1.7"/></svg>',
  basket: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 9h16l-1.6 10.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8L4 9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m8.5 9 2-6M15.5 9l-2-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
};

const RB_CATEGORIES = [
  { id: 'c1', slug: 'vegetables',  name: 'Vegetables',     name_bn: 'সবজি',        icon_svg: ICON_SVG.leaf,   image_url: '', sort: 1, active: true },
  { id: 'c2', slug: 'fruits',      name: 'Fruits',         name_bn: 'ফল',          icon_svg: ICON_SVG.fruit,  image_url: '', sort: 2, active: true },
  { id: 'c3', slug: 'rice-grains', name: 'Rice & Grains',  name_bn: 'চাল ও শস্য',   icon_svg: ICON_SVG.grain,  image_url: '', sort: 3, active: true },
  { id: 'c4', slug: 'oil-ghee',    name: 'Oil & Ghee',     name_bn: 'তেল ও ঘি',     icon_svg: ICON_SVG.bottle, image_url: '', sort: 4, active: true },
  { id: 'c5', slug: 'honey-dates', name: 'Honey & Dates',  name_bn: 'মধু ও খেজুর',  icon_svg: ICON_SVG.honey,  image_url: '', sort: 5, active: true },
  { id: 'c6', slug: 'dairy-eggs',  name: 'Dairy & Eggs',   name_bn: 'দুধ ও ডিম',    icon_svg: ICON_SVG.milk,   image_url: '', sort: 6, active: true },
  { id: 'c7', slug: 'spices',      name: 'Spices',         name_bn: 'মসলা',        icon_svg: ICON_SVG.spice,  image_url: '', sort: 7, active: true },
  { id: 'c8', slug: 'dry-food',    name: 'Dry Food',       name_bn: 'শুকনো খাবার',  icon_svg: ICON_SVG.basket, image_url: '', sort: 8, active: true }
];

/* Category banner placeholders — desktop (1:1) and mobile (16:9). Real
   photos replace these from the admin panel; these only exist so the
   layout looks right on day one. */
function rbBanner(w, h, a, b, label) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    `<circle cx="${w * 0.8}" cy="${h * 0.22}" r="${Math.min(w, h) * 0.28}" fill="rgba(255,255,255,.12)"/>` +
    `<text x="${w / 2}" y="${h / 2}" font-family="Georgia,serif" font-size="${Math.min(w, h) * 0.11}" ` +
    `fill="rgba(255,255,255,.88)" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const BANNER_TONES = {
  vegetables: ['#2F6B3C', '#7FB069'], fruits: ['#C07A12', '#F0C04A'], 'rice-grains': ['#8A7A4E', '#D6C89A'],
  'oil-ghee': ['#A87E10', '#EFC64B'], 'honey-dates': ['#8F5A0E', '#E8A93B'], 'dairy-eggs': ['#8C8677', '#E6E0D2'],
  spices: ['#B07A05', '#F0C244'], 'dry-food': ['#9E9377', '#EDE6D0']
};
RB_CATEGORIES.forEach(c => {
  const [a, b] = BANNER_TONES[c.slug] || ['#17402A', '#3E7A47'];
  c.desktop_banner_url = rbBanner(900, 900, a, b, c.name);
  c.mobile_banner_url = rbBanner(1280, 720, a, b, c.name);
});

/* Header announcement bar and logo — editable from the admin panel
   (Settings). These are the defaults until an admin changes them. */
const RB_SETTINGS = {
  announcement_text: 'Free Delivery Across Bangladesh • Easy Returns • Trusted Products',
  logo_url: '',
  logo_height: 40,
  hotdeals_title: 'Hot Deals'
};

/* Hero slideshow — images only, one set per device. Replace these from
   the admin panel; they are stored in hero_slides. */
function rbHero(device, a, b, label) {
  const w = device === 'desktop' ? 1600 : 800, h = device === 'desktop' ? 640 : 900;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    `<circle cx="${w * 0.78}" cy="${h * 0.3}" r="${h * 0.22}" fill="rgba(255,255,255,.14)"/>` +
    `<circle cx="${w * 0.2}" cy="${h * 0.75}" r="${h * 0.3}" fill="rgba(255,255,255,.08)"/>` +
    `<text x="${w / 2}" y="${h / 2}" font-family="Georgia,serif" font-size="${h * 0.09}" ` +
    `fill="rgba(255,255,255,.9)" text-anchor="middle">${label}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const RB_HERO = [
  { id: 'h1', device: 'desktop', image_url: rbHero('desktop', '#14331F', '#3E7A47'), alt: 'Fresh harvest', sort: 1, active: true },
  { id: 'h2', device: 'desktop', image_url: rbHero('desktop', '#7A4B10', '#E3A008'), alt: 'Honey and ghee', sort: 2, active: true },
  { id: 'h3', device: 'mobile',  image_url: rbHero('mobile', '#14331F', '#3E7A47'), alt: 'Fresh harvest', sort: 1, active: true },
  { id: 'h4', device: 'mobile',  image_url: rbHero('mobile', '#7A4B10', '#E3A008'), alt: 'Honey and ghee', sort: 2, active: true }
];

const RB_PRODUCTS = [
  {
    id: 'p01', sku: 'P-1001', slug: 'red-amaranth-lal-shak', name: 'Red Amaranth', name_bn: 'লাল শাক',
    cat: 'vegetables', farm: 'Shapla Organic Farm', origin: 'Savar, Dhaka',
    variants: [{ label: '250 g', price: 45, mrp: 55, stock: 40 }, { label: '500 g', price: 80, mrp: 100, stock: 25 }],
    images: [rbArt('Red Amaranth', '#8C2B2B', '#D0563B')],
    certified: true, featured: true, active: true, hot_deal: true, hot_deal_sort: 1,
    description: 'Cut the same morning it reaches you. No urea, no pesticide — grown on compost beds and washed in clean water before packing.',
    benefits: ['High in iron and folate', 'Harvested within 12 hours of delivery', 'Sold by weight after trimming'],
    storage_tip: 'Wrap in a dry cloth and keep in the fridge. Best used within 2 days.'
  },
  {
    id: 'p02', sku: 'P-1002', slug: 'bottle-gourd-lau', name: 'Bottle Gourd', name_bn: 'লাউ',
    cat: 'vegetables', farm: 'Shapla Organic Farm', origin: 'Savar, Dhaka',
    variants: [{ label: '1 piece (approx. 1.2 kg)', price: 90, mrp: 110, stock: 30 }],
    images: [rbArt('Bottle Gourd', '#2F6B3C', '#7FB069')],
    certified: true, featured: true, active: true, hot_deal: true, hot_deal_sort: 2,
    description: 'Tender young gourd, picked before the skin hardens. Soft enough that the seeds cook down with the flesh.',
    benefits: ['Grown without chemical fertiliser', 'Picked young for a softer cook', 'Stem left on to keep it fresh'],
    storage_tip: 'Keep whole at room temperature for up to 4 days; refrigerate once cut.'
  },
  {
    id: 'p03', sku: 'P-1003', slug: 'green-chilli', name: 'Green Chilli', name_bn: 'কাঁচা মরিচ',
    cat: 'vegetables', farm: 'Bogura Grower Group', origin: 'Bogura',
    variants: [{ label: '100 g', price: 35, mrp: 0, stock: 60 }, { label: '250 g', price: 80, mrp: 95, stock: 35 }],
    images: [rbArt('Green Chilli', '#2C6E49', '#8FBF56')],
    certified: false, featured: false, active: true,
    description: 'Thin-skinned local chilli with real heat. Sorted by hand so you do not pay for soft or broken pieces.',
    benefits: ['Hand-sorted before packing', 'Local variety, not hybrid', 'Sharp heat, thin skin'],
    storage_tip: 'Store dry in a paper bag in the fridge. Do not wash before storing.'
  },
  {
    id: 'p04', sku: 'P-1004', slug: 'tomato', name: 'Tomato', name_bn: 'টমেটো',
    cat: 'vegetables', farm: 'Rajshahi Krishok Somiti', origin: 'Rajshahi',
    variants: [{ label: '500 g', price: 65, mrp: 80, stock: 50 }, { label: '1 kg', price: 120, mrp: 150, stock: 30 }],
    images: [rbArt('Tomato', '#A32A1E', '#E2664A')],
    certified: true, featured: false, active: true,
    description: 'Field-ripened, never gas-ripened. Firm enough for salad and soft enough for a curry base.',
    benefits: ['Ripened on the vine', 'No carbide or ripening agent', 'Packed in a single layer'],
    storage_tip: 'Keep out of the fridge until fully ripe, then refrigerate for up to 5 days.'
  },
  {
    id: 'p05', sku: 'P-1005', slug: 'himsagar-mango', name: 'Himsagar Mango', name_bn: 'হিমসাগর আম',
    cat: 'fruits', farm: 'Sattyar Bagan', origin: 'Sathkhira',
    variants: [{ label: '1 kg', price: 220, mrp: 280, stock: 40 }, { label: '5 kg box', price: 1050, mrp: 1350, stock: 12 }],
    images: [rbArt('Himsagar Mango', '#C07A12', '#F0C04A')],
    certified: true, featured: true, active: true, hot_deal: true, hot_deal_sort: 3,
    description: 'Picked at 85% maturity and ripened in straw, the way the orchard has always done it. Fibreless flesh, small stone.',
    benefits: ['Naturally ripened in straw', 'Small stone, thick flesh', 'Season: mid-May to late June'],
    storage_tip: 'Leave at room temperature until fragrant, then refrigerate for 2–3 days.'
  },
  {
    id: 'p06', sku: 'P-1006', slug: 'sweet-papaya', name: 'Sweet Papaya', name_bn: 'পাকা পেঁপে',
    cat: 'fruits', farm: 'Tangail Hill Orchard', origin: 'Tangail',
    variants: [{ label: '1 piece (approx. 1 kg)', price: 130, mrp: 160, stock: 22 }],
    images: [rbArt('Sweet Papaya', '#C25E1C', '#F2A65A')],
    certified: true, featured: false, active: true,
    description: 'Deep orange inside with a honey finish. Each one is checked by hand so you do not get a green centre.',
    benefits: ['Tree-ripened', 'Checked by hand for ripeness', 'Rich in papain and vitamin C'],
    storage_tip: 'Refrigerate once soft to the touch. Eat within 3 days of cutting.'
  },
  {
    id: 'p07', sku: 'P-1007', slug: 'malta-orange', name: 'Malta Orange', name_bn: 'মাল্টা',
    cat: 'fruits', farm: 'Sylhet Valley Growers', origin: 'Sylhet',
    variants: [{ label: '1 kg', price: 260, mrp: 300, stock: 26 }],
    images: [rbArt('Malta Orange', '#B8661A', '#F4A93C')],
    certified: false, featured: false, active: true,
    description: 'Country malta from the Sylhet hills — thinner skin and far more juice than the imported kind.',
    benefits: ['Grown in Sylhet, not imported', 'No wax coating', 'Juicy with a light tartness'],
    storage_tip: 'Keeps a week in the fridge, four days on the counter.'
  },
  {
    id: 'p08', sku: 'P-1008', slug: 'kalijira-rice', name: 'Kalijira Rice', name_bn: 'কালিজিরা চাল',
    cat: 'rice-grains', farm: 'Dinajpur Mill Cooperative', origin: 'Dinajpur',
    variants: [{ label: '1 kg', price: 145, mrp: 170, stock: 80 }, { label: '5 kg', price: 690, mrp: 850, stock: 30 }, { label: '25 kg sack', price: 3300, mrp: 4100, stock: 8 }],
    images: [rbArt('Kalijira Rice', '#8A7A4E', '#D6C89A')],
    certified: true, featured: true, active: true, hot_deal: true, hot_deal_sort: 4,
    description: 'The small aromatic grain used for polao and payesh. Stone-free, unpolished, and milled in small batches.',
    benefits: ['Milled in small batches', 'Unpolished, no synthetic shine', 'Stone-free — sifted twice'],
    storage_tip: 'Keep in an airtight container away from sunlight. Add a few dried chillies to deter insects.'
  },
  {
    id: 'p09', sku: 'P-1009', slug: 'red-rice-lal-chal', name: 'Red Rice', name_bn: 'লাল চাল',
    cat: 'rice-grains', farm: 'Dinajpur Mill Cooperative', origin: 'Dinajpur',
    variants: [{ label: '2 kg', price: 210, mrp: 250, stock: 45 }, { label: '5 kg', price: 500, mrp: 600, stock: 20 }],
    images: [rbArt('Red Rice', '#7B3B2A', '#C08E6A')],
    certified: true, featured: false, active: true,
    description: 'Whole-grain red rice with the bran left on. Takes longer to cook and holds its shape.',
    benefits: ['Bran layer intact', 'Lower glycaemic load than white rice', 'Soak 30 minutes before cooking'],
    storage_tip: 'Airtight container, cool shelf. Use within 4 months for best aroma.'
  },
  {
    id: 'p10', sku: 'P-1010', slug: 'masoor-dal', name: 'Masoor Dal', name_bn: 'মসুর ডাল',
    cat: 'rice-grains', farm: 'Faridpur Pulse Growers', origin: 'Faridpur',
    variants: [{ label: '1 kg', price: 135, mrp: 155, stock: 70 }],
    images: [rbArt('Masoor Dal', '#B25B1E', '#E39A54')],
    certified: false, featured: false, active: true,
    description: 'Local red lentil, hand-cleaned. Cooks down soft in fifteen minutes without a pressure cooker.',
    benefits: ['Local crop, not imported', 'Hand-cleaned, no polish oil', 'Cooks in 15 minutes'],
    storage_tip: 'Store dry and airtight; keeps a year.'
  },
  {
    id: 'p11', sku: 'P-1011', slug: 'cold-pressed-mustard-oil', name: 'Cold Pressed Mustard Oil', name_bn: 'ঘানি ভাঙা সরিষার তেল',
    cat: 'oil-ghee', farm: 'Rupganj Ghani Press', origin: 'Narayanganj',
    variants: [{ label: '500 ml', price: 310, mrp: 360, stock: 40 }, { label: '1 litre', price: 590, mrp: 700, stock: 25 }, { label: '5 litre', price: 2750, mrp: 3300, stock: 6 }],
    images: [rbArt('Mustard Oil', '#A87E10', '#EFC64B')],
    certified: true, featured: true, active: true, hot_deal: true, hot_deal_sort: 5,
    description: 'Pressed on a wooden ghani at low speed, so the oil never heats and the pungency survives. Unrefined and naturally cloudy.',
    benefits: ['Wooden ghani, no heat', 'Unrefined — sediment is normal', 'Strong natural pungency'],
    storage_tip: 'Keep the bottle capped and out of direct light. Cloudiness in winter is normal.'
  },
  {
    id: 'p12', sku: 'P-1012', slug: 'pure-cow-ghee', name: 'Pure Cow Ghee', name_bn: 'খাঁটি গাওয়া ঘি',
    cat: 'oil-ghee', farm: 'Pabna Dairy Collective', origin: 'Pabna',
    variants: [{ label: '250 g', price: 480, mrp: 560, stock: 30 }, { label: '500 g', price: 930, mrp: 1100, stock: 18 }, { label: '1 kg', price: 1790, mrp: 2150, stock: 10 }],
    images: [rbArt('Cow Ghee', '#B98A10', '#F5D26B')],
    certified: true, featured: true, active: true,
    description: 'Made the slow way — cream is cultured into curd, churned to butter, then simmered. Nothing blended in.',
    benefits: ['Churned from cultured curd', 'No vegetable fat blended in', 'Grainy set in cool weather'],
    storage_tip: 'A dry spoon every time. No refrigeration needed; keeps 12 months.'
  },
  {
    id: 'p13', sku: 'P-1013', slug: 'sundarban-honey', name: 'Sundarban Honey', name_bn: 'সুন্দরবনের মধু',
    cat: 'honey-dates', farm: 'Mawali Collectors Group', origin: 'Sundarbans, Khulna',
    variants: [{ label: '250 g', price: 520, mrp: 600, stock: 24 }, { label: '500 g', price: 990, mrp: 1200, stock: 15 }, { label: '1 kg', price: 1850, mrp: 2300, stock: 7 }],
    images: [rbArt('Sundarban Honey', '#8F5A0E', '#E8A93B')],
    certified: true, featured: true, active: true,
    description: 'Wild honey cut by mawali collectors in the Khulna range, strained cold through cloth. Never heated, never thinned.',
    benefits: ['Wild-collected, not farmed', 'Strained cold — never heated', 'Crystallises in winter, which is a good sign'],
    storage_tip: 'Room temperature, dry spoon only. If it sets, stand the jar in warm water.'
  },
  {
    id: 'p14', sku: 'P-1014', slug: 'ajwa-dates', name: 'Ajwa Dates', name_bn: 'আজওয়া খেজুর',
    cat: 'honey-dates', farm: 'Madinah Import Lot', origin: 'Madinah, KSA',
    variants: [{ label: '500 g', price: 1250, mrp: 1500, stock: 20 }, { label: '1 kg', price: 2400, mrp: 2900, stock: 9 }],
    images: [rbArt('Ajwa Dates', '#4A2B1E', '#8B5E3C')],
    certified: false, featured: false, active: true,
    description: 'Soft, dark, and not sugared. Imported in sealed cartons and re-packed here in small jars.',
    benefits: ['Sealed carton lot, re-packed small', 'No added glucose syrup', 'Soft texture, low moisture loss'],
    storage_tip: 'Refrigerate in an airtight box through the summer.'
  },
  {
    id: 'p15', sku: 'P-1015', slug: 'farm-eggs', name: 'Free Range Eggs', name_bn: 'দেশি মুরগির ডিম',
    cat: 'dairy-eggs', farm: 'Manikganj Homestead Flock', origin: 'Manikganj',
    variants: [{ label: '12 pieces', price: 240, mrp: 280, stock: 40 }, { label: '30 pieces tray', price: 580, mrp: 680, stock: 14 }],
    images: [rbArt('Free Range Eggs', '#9A7C3A', '#E4CE93')],
    certified: true, featured: false, active: true,
    description: 'Birds that walk, scratch and eat what they find. Shells vary in size and colour because the flock is mixed.',
    benefits: ['Birds kept loose, not caged', 'Deep orange yolk', 'Collected daily'],
    storage_tip: 'Do not wash before storing. Refrigerate pointed end down.'
  },
  {
    id: 'p16', sku: 'P-1016', slug: 'buffalo-yogurt', name: 'Buffalo Milk Yogurt', name_bn: 'মহিষের দই',
    cat: 'dairy-eggs', farm: 'Bhola Buffalo Dairy', origin: 'Bhola',
    variants: [{ label: '500 g pot', price: 180, mrp: 210, stock: 18 }],
    images: [rbArt('Buffalo Yogurt', '#8C8677', '#E6E0D2')],
    certified: false, featured: false, active: true,
    description: 'Set in clay pots overnight. Thick enough to hold a spoon upright, with no starch or gelatin.',
    benefits: ['Set in clay, not plastic', 'No thickener or starch', 'Made to order twice a week'],
    storage_tip: 'Refrigerate immediately. Eat within 4 days.'
  },
  {
    id: 'p17', sku: 'P-1017', slug: 'turmeric-powder', name: 'Stone Ground Turmeric', name_bn: 'হলুদ গুঁড়া',
    cat: 'spices', farm: 'Khagrachari Hill Growers', origin: 'Khagrachari',
    variants: [{ label: '200 g', price: 150, mrp: 180, stock: 50 }, { label: '500 g', price: 350, mrp: 420, stock: 22 }],
    images: [rbArt('Turmeric Powder', '#B07A05', '#F0C244')],
    certified: true, featured: true, active: true,
    description: 'Hill turmeric, sun-dried and ground on stone so it does not scorch. Colour comes from the root, not from dye.',
    benefits: ['Stone ground, low heat', 'No colouring agent or starch', 'High natural curcumin'],
    storage_tip: 'Airtight glass jar away from the stove.'
  },
  {
    id: 'p18', sku: 'P-1018', slug: 'panch-phoron', name: 'Panch Phoron', name_bn: 'পাঁচ ফোড়ন',
    cat: 'spices', farm: 'Riyadul BD Kitchen', origin: 'Dhaka',
    variants: [{ label: '200 g', price: 120, mrp: 0, stock: 45 }],
    images: [rbArt('Panch Phoron', '#7A5B20', '#C9A55C')],
    certified: false, featured: false, active: true,
    description: 'Five seeds in equal measure — fenugreek, nigella, cumin, black mustard, fennel. Mixed in-house each week.',
    benefits: ['Blended weekly in small batches', 'Whole seed, nothing ground', 'Equal parts, no filler'],
    storage_tip: 'Airtight jar. Dry roast just before use for the best aroma.'
  },
  {
    id: 'p19', sku: 'P-1019', slug: 'muri-puffed-rice', name: 'Hand Puffed Muri', name_bn: 'হাতে ভাজা মুড়ি',
    cat: 'dry-food', farm: 'Kushtia Muri House', origin: 'Kushtia',
    variants: [{ label: '500 g', price: 110, mrp: 130, stock: 35 }, { label: '1 kg', price: 200, mrp: 240, stock: 20 }],
    images: [rbArt('Puffed Muri', '#9E9377', '#EDE6D0')],
    certified: true, featured: false, active: true,
    description: 'Puffed in hot sand over a clay stove, with no urea used to whiten it. Slightly off-white, the way it should be.',
    benefits: ['No urea whitening', 'Sand-roasted, not machine puffed', 'Stays crisp in a sealed tin'],
    storage_tip: 'Sealed tin only. Re-crisp in a dry pan if it softens.'
  },
  {
    id: 'p20', sku: 'P-1020', slug: 'nakshi-pitha-mix', name: 'Pitha Rice Flour', name_bn: 'পিঠার চালের গুঁড়া',
    cat: 'dry-food', farm: 'Dinajpur Mill Cooperative', origin: 'Dinajpur',
    variants: [{ label: '1 kg', price: 130, mrp: 0, stock: 28 }],
    images: [rbArt('Pitha Flour', '#A89A7C', '#EFE7D4')],
    certified: false, featured: false, active: true,
    description: 'Finely milled from soaked and dried rice, the grind used for bhapa and chitoi pitha.',
    benefits: ['Milled from soaked rice', 'Fine, even grind', 'No bleaching'],
    storage_tip: 'Airtight container; refrigerate in summer to keep it from turning.'
  }
];

const RB_COUPONS = [
  { code: 'FRESH10', type: 'percent', value: 10, min_subtotal: 800, active: true, note: '10% off orders over ৳800' },
  { code: 'FREEDELIVERY', type: 'shipping', value: 0, min_subtotal: 1000, active: true, note: 'Free delivery over ৳1000' },
  { code: 'NEW150', type: 'flat', value: 150, min_subtotal: 1200, active: true, note: '৳150 off your first order over ৳1200' }
];
