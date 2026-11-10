# Riyadul BD — organic food storefront

Storefront and admin panel for an organic grocery in Dhaka. Supabase (Postgres, Auth,
Storage) is the back end; the front end is a Vite multi-page app.

## Stack

| Layer | What |
|---|---|
| UI | React 19 (function components, hooks), React Router 8 |
| Language | TypeScript (strict) — domain types in `src/lib/types.ts`, typed data layer |
| Data fetching | TanStack Query 5 over the Supabase client (`@supabase/supabase-js` 2) |
| Build | Vite 8 (Rolldown), two single-page apps: storefront (`index.html`) and admin (`admin.html`), vendor chunks cached separately |
| Quality | ESLint 9 (typescript-eslint + React hooks rules), Vitest 5, `tsc --noEmit` before every build |
| Hosting | Netlify — `npm run build`, publishes `dist/`, SPA routing, one function for order email |

The storefront keeps the same markup, class names, stylesheet and URLs as the multi-page site it
replaced (`/product/<slug>`, `/category/<aisle>`, …); the old `*.html` addresses redirect.

TypeScript is on 6.0, not 7: typescript-eslint needs the JavaScript compiler API, which TypeScript 7
(the native port) does not provide yet. Move to 7 once typescript-eslint supports it.

```bash
npm install
npm run dev        # http://localhost:5173  (storefront)  ·  /admin  (panel)
npm run build      # type-check, then build to dist/
npm run preview    # serve dist/ exactly as it will be deployed
npm test           # unit tests
npm run lint
```

### Admin

Every admin screen is a React + TypeScript component under `src/admin/` — shell, dashboard,
orders, customers, products, categories, inventory, hot deals, hero slides, discount codes,
messages and settings. Popups (order, customer, product editor, item detail, aisle performance)
share one `Modal`; lists load through TanStack Query and refresh after every save.

## While the Supabase project is paused

The site checks once per visit whether the database answers (`src/lib/backend.ts`).

- **Shop** — keeps working read-only: it shows the last catalogue this browser saw, or the
  starter catalogue. A bar at the top says online ordering is paused and gives the phone
  and WhatsApp number. Checkout, sign-in and the contact form answer with the same
  message instead of failing silently or pretending to take an order.
- **Admin** — opens in **Preview** with sample data stored in the browser (passcode
  `riyadul2026`). Nothing in preview is real or saved to the shop. "Check database again"
  switches back to the live sign-in as soon as the project is resumed.

### SQL saved to run later

**`sql/pending/2026-11-10_run_when_supabase_resumes.sql` has not been run.** After
resuming the project, paste the whole file into the Supabase SQL editor and run it once.
It is one transaction, safe to run twice, and never drops or deletes data. It contains:

- every earlier migration (now in `sql/archive/`), so it no longer matters which ones
  were already applied — promotions, cost tracking, inventory history, threaded messages;
- fixes: placeholder hero text "undefined" and broken category banners; a blocked customer
  could unblock their own account; a customer could edit the shop's replies; order
  tracking exposed phone, email and address to anyone guessing an order number;
  cancelling an order did not return stock; three indexes.

Until it is run, the live panel works as before, minus those fixes.

## Set up a new Supabase project

1. Create the project. SQL editor → run `sql/01-schema.sql`.
2. Run `sql/pending/2026-11-10_run_when_supabase_resumes.sql`.
3. Run `sql/02-seed.sql` (8 aisles, 20 products, 3 discount codes, 4 hero placeholders;
   safe to re-run).
4. Put the project URL and the **publishable (anon)** key in `src/lib/config.ts`, or set
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see `.env.example`). Never the service
   role key — this code ships to every visitor's browser.
5. Authentication → Users → **Add user** for the shop owner, then:

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

Everything from `/admin`. A search box in the top bar (`Ctrl/⌘ K`) jumps to any page, order,
customer or product; the sun/moon button switches light and dark.

**Dashboard** — planned top to bottom around three questions: *what needs me now*
(orders to confirm or ship, unread messages, sold-out and low stock, unpaid deliveries,
promotions about to end, plus a clickable order pipeline), *how is the shop doing* (sales,
orders, average order, net profit and customers, each compared with the period before, and
a sales chart for the chosen range) and *where is the money* (profit statement, sales by
aisle, best sellers, latest orders, stock to watch).

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

## Deploy

Netlify: connect the repo. `netlify.toml` sets the build command, the clean URLs
(`/product/<slug>`, `/category/<aisle>`, `/admin` …), cache and security headers, and
`noindex` on the admin panel.

Order email is optional. Add these in Netlify → Environment:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | Resend API key |
| `ORDER_FROM` | `Riyadul BD <orders@riyadulbd.com>` |
| `ORDER_BCC` | shop inbox |

Without the key, the function returns quietly and orders still go through.

## Shop details

Phone, WhatsApp, email, address, hours and delivery charges live in one object in
`src/shop/lib/shop.ts`. The delivery rule also exists in `place_order()` (inside Dhaka ৳60,
outside ৳120, free over ৳2,000) because the database, not the browser, decides what an
order costs. Change both if the rates change.

## Files

```
index.html            storefront entry (one SPA for every shop URL)
admin.html            admin entry (noindex), served for /admin and /admin/*

src/lib/types.ts      domain types
src/lib/config.ts     Supabase URL + publishable key (env-overridable)
src/lib/backend.ts    "is the database answering?" probe
src/lib/db.ts         typed data layer: Supabase, with the browser fallback
src/lib/seed.ts       starter catalogue, icons, placeholders
src/lib/demo.ts       sample trading data for the admin preview only

src/shop/main.tsx     storefront entry: router + providers
src/shop/components/  Layout (header, search, footer, basket drawer), ProductCard, Hero, …
src/shop/pages/       Home, Products, ProductPage, Checkout, Account, Wishlist, Contact
src/shop/lib/         cart store, toasts, query hooks, shop details (phone, delivery rules)
src/shop/style.css

src/admin/main.tsx    admin entry and routes (/admin/<screen>)
src/admin/auth.tsx    sign-in gate (live or preview)
src/admin/Shell.tsx   sidebar, top bar, search palette, theme
src/admin/screens/    Orders, Customers, Products, Categories, Inventory, HotDeals, Hero, Coupons, Messages, Settings
src/admin/Dashboard.tsx, TrendChart.tsx, metrics.ts, biz.ts   dashboard and business engine
src/admin/ItemModal.tsx, ProductEditor.tsx, AdminUi.tsx   shared popups
src/admin/ui/         Modal, ConfirmDelete, ImagePicker, CSV, toast
src/admin/admin.css, shell.css

sql/01-schema.sql     tables, triggers, functions, RLS, grants, storage
sql/02-seed.sql       starter content
sql/pending/          SQL waiting to be run (see above)
sql/archive/          earlier migrations, superseded by the pending file

public/               robots.txt, sitemap.xml, logo
netlify/functions/send-order-email.js
tests/
```

## Notes

- Product, category and hero images in the seed are generated SVG placeholders. They
  disappear as soon as real files are uploaded from the panel.
- Prices are in BDT and formatted with `৳` throughout.
- The basket lives in browser storage, so it survives a reload and a closed tab.
- Search engines: pages now render in the browser, so each page's title is set on load but its
  description is the site-wide one. Pre-rendering product and category pages is the next step if
  search traffic matters.
- Known and not changed here: per-size cost fields live inside `products.variants`, which
  the public can read, so buying costs are visible to anyone who inspects the API. Moving
  them to an admin-only table is a schema change worth doing before costs are entered for
  real.
