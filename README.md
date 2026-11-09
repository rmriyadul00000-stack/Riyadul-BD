# Riyadul BD — organic food storefront

**Already have a live Supabase project?** Run these once, in order, in the SQL editor —
each is additive only and safe on your existing data:
1. `sql/03-migration-v2.sql` — category banners, announcement bar/logo settings
2. `sql/04-hotdeals-migration.sql` — Hot Deals flag/order on products
3. `sql/05-sku-discount-logo-migration.sql` — unique product SKU, discount-badge
   override, admin-configurable logo height

A fresh install just runs `01-schema.sql` then `02-seed.sql`; both already include
everything `03`, `04` and `05` add.

**What changed in this update:**
- Fixed the bug where changing a product's category reverted after refresh — the save
  now always resolves and writes the correct `category_id` alongside the slug.
- Header: topbar removed, logo-only branding, `.hdr-main` stays visible on scroll
  (`position:sticky`, correct `z-index`), a mobile hamburger menu and a sticky mobile
  back button.
- Hero: desktop and mobile slides now render side by side and CSS alone decides which
  one shows, so resizing the browser always shows exactly one — with mouse-drag, touch
  swipe and Prev/Next controls.
- Quick Navigation (desktop): mouse-draggable, Prev/Next buttons that cycle
  continuously; mobile version untouched as required.
- Category browsing: clicking a category or "See All" opens a real category page
  (`products.html?cat=...`) with its own banner and name — no more homepage scrolling.
  Desktop category rows are mouse-draggable with Prev/Next; mobile shows a 2-column
  grid with a dynamic "View More (shown/total)" button.
- New **Hot Deals** section (replaces "Shop all" in the nav, colour `#17402A`), fully
  managed from the admin panel: add, reorder, remove and rename.
- Product card redesigned: bigger image, a basket-icon button instead of a text button.
- Admin: "Stock that needs attention" now triggers at 5 units or fewer, labelled
  "Units Left" / "Out of stock".
- Trust bar + a Policy section (replacing "How an order reaches you") on the homepage,
  category pages and product pages; a clickable contact block at the bottom of the
  homepage.
- Sign-out requires a second tap to confirm; mobile filters open in a proper drawer.

**Second update:**
- Every product now has a unique, human-readable SKU (`P-1001…`), auto-assigned by
  the database, shown in the admin product list/editor, and searchable in Products,
  Hot Deals and Inventory.
- "See All" now shows on mobile category banners too.
- Storefront filters: dropped the farm-name search, added a proper expandable price
  range (dual slider + step buttons), kept at the top of the filter list.
- Logo height is now admin-configurable (works with square or tall 9:16 files);
  saving it re-checks the admin's password first.
- Discount badges can be manually overridden per product from the admin panel
  (blank still means "calculate automatically from Was/Price").
- The wishlist heart moved to the top-right corner of the product photo on the
  product detail page.
- The mobile back button now tracks the real path taken through the site (not just
  `history.length`), so it steps back correctly even deep into the site.
- Hot Deals: admin search-to-add (by name, SKU or aisle); the section itself now sits
  right after Quick Navigation on the homepage, highlighted, cards only, no banner.
- Every Prev/Next control on the site (hero, Quick Nav, category rows) now loops
  continuously; Quick Navigation also auto-advances every 3 seconds.
- Category product-row Prev/Next arrows moved to sit on both sides of the grid
  itself, not against the category banner.
- Admin: Messages is now a proper table (Name / Contact info / Time and date /
  Message) with two-step delete confirmation; Dashboard gained a date-range filter,
  a "Today's revenue" stat and a "View store" button; a new Inventory Management view
  handles stock, cost price and profit/loss per size (kept out of the product editor,
  which still only edits stock).

Plain HTML, CSS and JavaScript. No framework, no build step. Static pages on Netlify,
Supabase behind them, one Netlify function for order email.

Written for a **brand new Supabase project**. The SQL assumes nothing already exists and
depends on nothing from any earlier database.

The site also runs with no backend at all: open `index.html` and it works on local demo
data, so the shop can be reviewed before the Supabase project is created.

---

## Set up Supabase

1. Create the new project.
2. SQL editor → run `sql/01-schema.sql` in full.
3. SQL editor → run `sql/02-seed.sql` (8 aisles, 20 products, 3 discount codes, 4 hero
   placeholders). Safe to re-run; it upserts.
4. Copy the project URL and the **anon / publishable** key into the top of
   `js/supabase.js`. Never put the service role key there — that file ships to every
   visitor's browser.
5. Authentication → Users → **Add user** for the shop owner.
6. Run this with that email:

   ```sql
   insert into admins (user_id, email, name)
   select id, email, 'Owner' from auth.users where email = 'owner@riyadulbd.com';
   ```

Until a row exists in `admins`, the admin panel rejects every login — including a valid
shopper account. Nothing about who is an admin lives in the HTML or JavaScript.

Storage buckets `product-media`, `category-media` and `hero-media` are created by the
schema. They are publicly readable; only admins can upload.

---

## What the database holds

| Table | What it is for |
|---|---|
| `admins` | who may open the admin panel |
| `customers` | one permanent row per registered account, `CUST-10001` upward |
| `categories` | aisles — name, Bangla name, icon SVG, image, order, active |
| `products` | catalogue; sizes held as JSON variants with price, was-price and stock |
| `coupons` | discount codes |
| `orders` | one row per order, `ORD-10001` upward, guest or account |
| `order_items` | the lines of each order |
| `hero_slides` | home page slideshow, separate desktop and mobile sets |
| `messages` | contact form |
| `wishlist` | saved products per account |
| `customer_overview` | view: each customer with order count, lifetime value, last order |

### Customer and order are separate on purpose

A customer row is the **account**: customer number, name, email, phone, address, status,
join date. An order row carries **that order's** contact name, email, phone, delivery
address, city, zone, payment, totals and status.

Ordering never writes back to the account. A customer can order for a sister in Khulna
under her name and number, and the account profile stays exactly as it was. The checkout
form is pre-filled from the account only as a convenience.

### Who an order belongs to

`place_order()` reads the signed-in account from the session:

- Signed in → `customer_id` set, `is_guest` false. Every further order from that account
  attaches to the same customer row. A second order never creates a second customer.
- Not signed in → `customer_id` null, `is_guest` true. The email typed at checkout is
  **never** matched against accounts. Guest orders show a `GUEST` tag in the panel and
  stay out of anyone's order history. They remain trackable by order number.

### One call writes the whole order

`place_order(payload)` runs as a single transaction: it writes the order, writes every
line, checks stock and decrements it, applies the coupon and the delivery rule, and
returns the order number and total. A half-written order is not possible, and stock
cannot be oversold from the browser. `track_order(code)` returns one order with its lines
for the tracking box.

### Status

`pending → confirmed → shipped → delivered`, plus `cancelled`. A trigger stamps
`confirmed_at`, `shipped_at`, `delivered_at` or `cancelled_at` the moment the status
moves, so the timeline on the account page and in the panel is real data, not a guess.

### Row level security

On for every table.

- Anyone may read live categories, products, coupons and hero slides.
- Anyone may place an order and send a contact message.
- A signed-in shopper reads their own customer row, their own orders and order lines, and
  edits their own profile. Nothing else.
- Everything else — editing the catalogue, changing an order, reading the message inbox,
  seeing other customers — requires a row in `admins`.

Verified against Postgres: a shopper's attempt to edit the catalogue or change an order
status changes nothing, and an anonymous visitor cannot read the orders table at all.

---

## What the client does day to day

Everything from `admin.html`.

**Dashboard** — revenue, orders waiting, customer count, guest orders, low and
out-of-stock products. Click any order to open it.

**Orders** — one searchable list. Search by order number, customer number, name, email,
phone, city, status or product. Filter by status, and by accounts versus guests. Open an
order to see the progress line, the timeline with timestamps, this order's contact and
delivery details, the lines and totals, and to change the order status or the payment
status. The customer number on the row opens that customer; guest orders show `GUEST`
instead.

**Customers** — one row per account with its customer number, contact details, order
count, lifetime value and last order date. Search by customer number, name, email or
phone. Open a customer to see their profile, block or unblock the account, and see every
order they have placed. From there, jump to the order, or open their full order list.

Navigation runs both ways: customer → orders → order details, and order → customer.

**Products** — add an item, set sizes (`500 g`, `1 kg`, `1 piece`) each with price, an
optional was-price and stock. Upload photos or paste URLs. Hide anything out of season
rather than deleting it.

**Categories** — name, Bangla name, URL name, position, active or hidden, the icon as SVG
markup with a live preview, and an optional category image. An image replaces the icon on
the aisle tiles. Changes appear on the shop immediately.

**Hero slides** — images only. Upload a desktop set and a mobile set, reorder them, hide
one, delete one, edit the description. The site loads the set that matches the screen and
fades between the active slides every six seconds. Nothing is hardcoded in the front end;
with no active slides, the hero simply does not render.

**Discount codes** — percentage, flat amount or free delivery, each with a minimum spend.

**Messages** — contact form submissions, with a reply button.

---

## Run it locally

```bash
cd riyadul-bd
python3 -m http.server 8080
```

Open `http://localhost:8080`. While the Supabase keys are blank the site runs on browser
storage, and `/admin.html` opens with the placeholder passcode `riyadul2026`. Once the
keys are filled in, that passcode is gone and the panel asks for the admin email and
password instead.

## Deploy

Netlify: drag the folder in, or connect the repo. `netlify.toml` sets the clean URLs,
cache headers, security headers and `noindex` on the admin panel.

Order email is optional. Add these in Netlify → Environment:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | Resend API key |
| `ORDER_FROM` | `Riyadul BD <orders@riyadulbd.com>` |
| `ORDER_BCC` | shop inbox |

Without the key, the function returns quietly and orders still go through.

## Shop details

Phone, WhatsApp, email, address, hours and delivery charges live in one object at the top
of `js/core.js`. The delivery rule also exists in `place_order()` (inside Dhaka ৳60,
outside ৳120, free over ৳2,000) because the database, not the browser, decides what an
order costs. Change both if the rates change.

## Files

```
index.html      home — hero slideshow, today's board, aisles, featured, deals
products.html   listing with filters, sort, search, shareable URLs
product.html    detail — sizes, stock, gallery, tabs, related
checkout.html   this order's contact and delivery details, payment, coupon
account.html    sign in, register, order history with progress, profile, tracking
wishlist.html   saved items
contact.html    contact form, delivery charges, return terms
admin.html      admin panel (noindex)

css/style.css   storefront
css/admin.css   admin panel
js/data.js      starter catalogue, category icons, hero placeholders
js/supabase.js  data layer — Supabase, with a local fallback
js/core.js      header, footer, cart, drawer, toasts, product card
js/pages.js     one controller per public page
js/admin.js     dashboard, orders, customers, products, categories, hero, coupons, messages

sql/01-schema.sql   tables, sequences, triggers, functions, RLS, grants, storage
sql/02-seed.sql     starter content
netlify/functions/send-order-email.js
netlify.toml, robots.txt, sitemap.xml
```

## Notes

- Product, category and hero images in the seed are generated SVG placeholders. They
  disappear as soon as real files are uploaded from the panel.
- Prices are in BDT and formatted with `৳` throughout.
- The basket lives in browser storage, so it survives a reload and a closed tab.
