# Smart Canteen

A campus food-ordering platform: students browse the menu, pay online, get a pickup number and track their order live. Canteen staff run a real-time order queue, manage the menu and stock, and see reports computed from real orders.

**Stack:** React 19 · Vite 8 · TypeScript (strict) · Tailwind CSS 4 · Radix UI primitives (shadcn-style components) · Lucide · Motion · TanStack Query · Supabase (Postgres, Auth, Realtime, Storage) · Razorpay · Vercel.

---

## Contents

1. [Architecture](#architecture)
2. [Quick start (local, no Docker)](#quick-start-local-no-docker)
3. [Set up Supabase](#set-up-supabase)
4. [Create the first administrator](#create-the-first-administrator)
5. [Configure Razorpay](#configure-razorpay)
6. [Environment variables](#environment-variables)
7. [Tests and quality checks](#tests-and-quality-checks)
8. [Deploy to Vercel](#deploy-to-vercel)
9. [Security model](#security-model)
10. [Feature checklist & remaining setup](#feature-checklist--remaining-setup)

---

## Architecture

```
src/                     React app (student site + /admin dashboard)
  components/            Design-system components (ui/), layout, brand
  features/              Domain logic: auth, cart, menu, orders, admin
  pages/                 Route screens (lazy-loaded) incl. pages/admin/*
  styles/index.css       Design tokens (colour, type, radius, shadow, motion)
server/                  Trusted payment logic (framework-agnostic handlers)
api/                     Vercel serverless entry points → server/
supabase/migrations/     Schema, order workflow, reports, RLS & grants
supabase/seed.sql        DEMONSTRATION menu data (no orders, no sales)
scripts/                 make-admin, local Supabase emulator (QA only)
tests/                   DB/RLS tests (PGlite), payment API tests, unit tests
```

**How an order flows**

1. The browser calls `place_order(items, idempotency_key)` — a `SECURITY DEFINER` Postgres function. It re-prices every item from the database, checks availability and opening hours, locks menu rows (`FOR UPDATE`) and reserves stock so concurrent orders cannot oversell, then creates an `awaiting_payment` order. Repeating the call with the same key returns the same order (no duplicates from double clicks).
2. `/api/payments/create` (server, service-role key) creates or reuses a Razorpay order for the **database** total.
3. Razorpay Checkout runs in the browser. Its response goes to `/api/payments/verify`, which checks the HMAC signature **and** fetches the payment from Razorpay (status, amount, order id) before calling the service-role-only `confirm_payment` function. Only then does the order become `placed` and receive a daily pickup number.
4. Razorpay webhooks (`/api/payments/webhook`, signature-verified) and `/api/payments/reconcile` cover closed browsers and late confirmations. Everything is idempotent.
5. Staff move orders through `placed → accepted → preparing → ready → completed` (or `rejected` with a reason) via `update_order_status`, which validates the transition, uses optimistic concurrency (two staff can't double-update), records timestamps and an audit trail, and releases stock on rejection.
6. Students see changes through Supabase Realtime, with automatic polling as a fallback.

Unpaid orders expire after 30 minutes and release their stock.

---

## Quick start (local, no Docker)

Requires **Node 22+** (tested with Node 24).

```bash
npm install
```

The repository includes a **local Supabase emulator for QA** (`scripts/local-supabase/`). It runs the real migrations, RLS policies and SQL functions on PGlite (Postgres compiled to WebAssembly) behind a PostgREST/GoTrue-compatible API. It does **not** emulate Realtime (the app falls back to polling) and must never be used in production.

Terminal 1:

```bash
npm run local:db
```

On first run it applies `supabase/migrations/*`, loads `supabase/seed.sql`, and writes `.env.local` with local keys and `PAYMENT_MODE=demo`.

Terminal 2:

```bash
npm run dev
```

Open http://localhost:5173, create an account, then make yourself an administrator:

```bash
npm run make-admin -- you@example.com
```

To reset the local database, stop the emulator and delete the `.local-supabase/` folder.

> Prefer the official stack? With Docker installed, `npx supabase start` runs real Supabase locally; then `npx supabase db reset` applies the migrations and seed, and you copy the printed URL/keys into `.env.local`.

---

## Set up Supabase

1. Create a project at [supabase.com](https://supabase.com) (region close to your campus, e.g. Mumbai).
2. **Apply the migrations** — either:
   - **CLI (recommended):**
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>
     npx supabase db push
     ```
   - **SQL editor:** run each file in `supabase/migrations/` **in filename order**.
3. **Optional demo data:** run `supabase/seed.sql` in the SQL editor. It contains only sample menu items, prices, photos (free Unsplash images) and opening hours — no orders or sales. Replace it from `/admin/menu` before going live.
4. **Auth settings** (Authentication → URL Configuration):
   - Site URL: your production URL (e.g. `https://canteen.example.edu`)
   - Redirect URLs: `https://<your-domain>/sign-in`, `https://<your-domain>/reset-password` (plus `http://localhost:5173/*` for development)
   - Keep **email confirmation** on for production.
5. **Realtime:** the security migration adds `orders`, `menu_items` and `canteen_settings` to the `supabase_realtime` publication. Realtime respects RLS, so students only receive their own orders.
6. **Storage:** the migration creates a public `menu-images` bucket (2 MB, JPG/PNG/WebP) writable only by staff.
7. Copy **Project URL**, **anon/publishable key** and **service_role key** (Settings → API) into your environment (see below).

**Campus-only sign-up:** in `/admin/settings`, set *Allowed sign-up email domains* (e.g. `college.edu.in`). This is enforced by a database trigger, not just the UI. We do not assume a domain — set your institution's real one.

**Timezone & hours:** business dates, pickup numbers and reports use `canteen_settings.timezone` (default `Asia/Kolkata`). Opening hours, open days and the “accepting orders” switch are in `/admin/settings`; `place_order` refuses orders outside them.

**Adding SQL functions later:** Supabase grants `EXECUTE` on new public functions to `anon`/`authenticated` by default. Revoke it explicitly for anything privileged, as `20261014000400_security.sql` does.

---

## Create the first administrator

Roles live in `profiles.role` (`student`, `staff`, `admin`). Students cannot change their own role — the column is not writable by clients and `admin_set_role` checks the caller.

1. Sign up through the app with the administrator's email.
2. Promote that account using **one** of:
   - `npm run make-admin -- admin@college.edu.in` (reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`; the key never leaves your machine), or
   - Supabase SQL editor:
     ```sql
     update public.profiles set role = 'admin' where email = 'admin@college.edu.in';
     ```
3. After that, administrators grant **staff** or **admin** access from `/admin/settings` → *Staff access*.

Staff can run the order queue, menu, stock and reports. Only admins can change canteen settings and staff access.

---

## Configure Razorpay

1. Create a Razorpay account and switch the dashboard to **Test mode**.
2. Settings → API Keys → generate a **test** key pair (`rzp_test_…`). Put them in `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (server-only variables).
3. Webhooks → add `https://<your-domain>/api/payments/webhook`, choose a secret (`RAZORPAY_WEBHOOK_SECRET`), and enable `payment.captured`, `payment.authorized`, `payment.failed` and `order.paid`.
4. Payment capture: auto-capture is recommended; if your account only authorises, the server captures verified payments automatically.
5. Use Razorpay's [test cards / UPI IDs](https://razorpay.com/docs/payments/payments/test-card-upi-details/) to try payments.

**Demo mode:** if the Razorpay keys are empty and `PAYMENT_MODE=demo`, checkout shows a clearly labelled *“Demo payment mode — no real money is charged”* panel. Orders are stored with `payment_status = 'simulated'`, labelled “Demo payment” for students and staff, and **excluded from revenue**. Demo mode is ignored whenever Razorpay keys are present, and with neither configured, online payment is disabled rather than faked.

---

## Environment variables

See [`.env.example`](.env.example).

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | browser | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | Anon/publishable key (RLS protects data) |
| `VITE_SUPPORT_EMAIL` | browser | Optional footer contact |
| `SUPABASE_URL` | server | Same project URL for `/api` |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Confirms verified payments. **Secret** |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | server | Razorpay API. **Secret** |
| `RAZORPAY_WEBHOOK_SECRET` | server | Webhook signature verification. **Secret** |
| `PAYMENT_MODE` | server | `demo` to enable simulated payments when Razorpay is not configured |

Never give a secret a `VITE_` prefix — Vite would bundle it into the browser.

---

## Tests and quality checks

```bash
npm test            # 61 tests: database/RLS, payment API, client logic
npm run typecheck   # TypeScript strict, app + server + tests
npm run lint        # ESLint (typescript-eslint, react-hooks)
npm run build       # production build with route-level code splitting
```

- `tests/db/` runs the **real migrations** on PGlite with Supabase's roles stubbed, and attacks them: reading other students' orders, changing prices, forging payment status, self-promotion, overselling stock, invalid transitions, duplicate submissions, report accuracy.
- `tests/server/` covers signature verification, forged signatures, amount mismatch, cross-user access, demo gating and webhook idempotency.
- `tests/unit/` covers cart maths, opening hours, formatting, CSV export safety and the status model.

---

## Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel (framework preset: **Vite**; `vercel.json` sets the build and SPA rewrites).
2. Add every variable from the table above in **Project Settings → Environment Variables** (Production and Preview).
3. Deploy. The `/api/*` files become Node serverless functions; everything else is static.
4. Update the Supabase Auth Site URL / redirect URLs and the Razorpay webhook URL to the production domain.
5. Smoke test: sign up, place a test-mode order, watch it appear in `/admin/orders`, move it to *Ready*, and confirm the student tracking page updates.

---

## Security model

- **Row Level Security on every table.** Students read only their own orders, items, payments and history; staff read all. Anonymous visitors can read the public menu and canteen settings only.
- **No client writes to orders or payments.** Orders are created by `place_order`; payment state changes only through service-role functions called after server-side verification.
- **Column-level grants:** students may update only `profiles.display_name`.
- **Prices are integers in paise**, re-read from the database at order time, and snapshotted on `order_items` so history never changes.
- **Menu items with order history cannot be deleted** (FK `RESTRICT`) — archive them instead.
- **Secrets** live only in server environment variables; API errors never echo provider responses, keys or signatures.
- The admin UI is hidden from non-staff, but every admin action is also enforced in the database.

---

## Feature checklist & remaining setup

### Implemented and verified locally
Verified in the browser against the local emulator (real SQL + RLS) and/or by automated tests:

- [x] Home: hero, live open/closed status, categories with real counts, highlights (real popularity once paid orders exist, otherwise “Picked by the canteen team”), how it works, hours, FAQ, footer
- [x] Menu: search, category/veg/availability filters, sorting, item detail dialog, unavailable & low-stock states, skeletons, empty state
- [x] Cart: persisted across refreshes and tabs, quantity limits, live re-validation of price/availability/stock, transparent charges
- [x] Sign up / sign in / sign out / password reset / profile; checkout requires sign-in, browsing doesn't
- [x] Checkout with idempotent order placement (double-click tested: one order), demo payment, failure/dismiss recovery
- [x] Confirmation page with large pickup number and printable receipt
- [x] Order tracking with progress, rejection/cancellation states, accessible status announcements, polling fallback
- [x] Order history with pagination
- [x] Staff dashboard: live metrics, order queue tabs, accept / prepare / ready / complete / reject-with-reason, stale-update protection
- [x] Menu management: create/edit, image upload, price, category, stock, availability, featured, archive/restore, safe delete; category management
- [x] Reports: date ranges, verified revenue, orders per day (chart + table), popular items, payment outcomes, status distribution, CSV export — cross-checked against raw order data
- [x] Settings: hours, open days, pause ordering, announcement, service charge, campus email domains, staff access
- [x] Responsive at 360, 375, 768 and desktop widths with no horizontal overflow; reduced-motion support

### Implemented but not verifiable without external accounts
- [ ] **Razorpay checkout end-to-end** — implemented (`server/payments.ts`) and unit-tested with signed fixtures, but needs your Razorpay test keys to run against Razorpay.
- [ ] **Supabase Realtime** — implemented; the local emulator has no Realtime, so live push was not exercised (the polling fallback was).
- [ ] **Vercel deployment** — configuration provided; not deployed from this environment.
- [ ] **Password-reset and confirmation emails** — sent by Supabase Auth; configure SMTP for production volumes.

### Before going live
- Replace the demo menu, prices and photos. The seed photos are hot-linked from Unsplash; for reliability, upload your own photos in `/admin/menu` (stored in Supabase Storage) so the menu doesn't depend on a third-party CDN.
- Set opening hours, the campus email domain and contact details in `/admin/settings`.
- Switch Razorpay to live keys only after test-mode orders work end to end.
- Refunds for rejected paid orders are handled at the counter / in the Razorpay dashboard; reports show the amount due (“refund due”).
