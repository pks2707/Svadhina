# Svadhina — Website + Admin Panel

A full-stack store for Svadhina ("Elegance that Empowers"): a customer-facing site backed by a
real database, plus a password-protected admin panel to manage products, orders, customers,
contact messages, and site branding — all without touching code.

## What changed from the first version

The first draft was a static site with product data hardcoded in a JS file. This version adds:

- **A real database** (SQLite) storing products, customers, orders, and contact messages.
- **Inventory tracking** — each product has a stock count; the storefront shows "Only 3 left" /
  "Out of Stock", and an order can never oversell what's in stock.
- **A customer database** — every checkout creates or updates a customer record automatically.
- **A Contact Us that's actually stored** — messages submitted on the site land in the admin panel,
  not just a WhatsApp popup.
- **An admin panel** (`/admin`) to add/edit products, view and update orders, browse customers,
  read contact messages, and — this is the one you asked for — change your **brand name, tagline,
  logo, theme colors, contact details, and About Us text**, all from a form, with changes appearing
  on the live site immediately.

## Tech stack (and why)

- **Node.js + Express** — the server. Widely supported, easy to deploy anywhere that runs Node.
- **SQLite** (via `better-sqlite3`) — the database. It's a real relational database living in a
  single file (`data/svadhina.db`), so there's no separate database server to set up, pay for, or
  manage. This is the right choice at your current scale; if the shop grows large enough to need
  it, migrating to Postgres/MySQL later is a well-trodden path.
- **Plain HTML/CSS/JS** on both the storefront and admin panel — no build step, no framework to
  learn. Pages fetch data from the API and render it.

## Running it locally

```
cd app
npm install
cp .env.example .env        # then edit .env — see below
npm start
```

The site will be at `http://localhost:3000`, the admin panel at `http://localhost:3000/admin`.

**If `npm install` fails while building `better-sqlite3`** (a native module — it tries to download
a prebuilt binary first, falling back to compiling from source), it's almost always a flaky network
moment: delete `node_modules` and `package-lock.json` and run `npm install` again. If it keeps
failing, your environment needs build tools for the source-compile fallback (`python3`, `make`,
a C++ compiler — on Debian/Ubuntu: `apt install -y python3 build-essential`).

**First login:** the username/password come from `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`),
used only the very first time the server starts (when there's no admin account yet). **Change
this password from the admin panel's Settings page immediately after your first login** — the
`.env` file is a bootstrap mechanism, not where the real password should live long-term.

## Folder structure

```
app/
  server/
    index.js          → Express app entrypoint
    db.js              → database schema + seed data (runs automatically on first start)
    seedProducts.js     → the 8 sample sarees used only to seed an empty database
    routes/
      publicApi.js       → GET /api/products, /api/settings, POST /api/orders, /api/contact
      adminApi.js         → everything under /api/admin/* (products, orders, customers, messages, settings, login)
  public/               → the customer-facing site (HTML/CSS/JS, served as static files)
  admin/                 → the admin panel (HTML/CSS/JS, served as static files, gated by session)
  uploads/                → product photos and logo you upload from the admin panel
  data/                    → svadhina.db lives here (created automatically)
  .env.example
```

## Managing your store day-to-day

Everything below is done from `/admin` — no code editing required:

- **Products** — add/edit sarees, upload photos, set stock quantity, mark featured, hide (soft
  delete) a product without losing its order history.
- **Orders** — see every order placed, with customer details and items, update status (new →
  confirmed → shipped → delivered).
- **Customers** — every customer who's checked out, with their order count and total spend.
- **Messages** — anything submitted through the Contact Us form.
- **Settings** — business name, tagline, logo, theme colors (with a color picker), contact phone/
  WhatsApp/email/address, About Us text, shipping fee and free-shipping threshold, return policy
  text, and GST status. Save, and the live site updates immediately — no deploy needed.

## Connecting Razorpay (next step, not done yet)

Checkout is fully working — it validates stock, creates a real order + customer record in the
database, decrements inventory, and sends the order to your WhatsApp — but real online payment
isn't wired up. That's deliberate: a Razorpay secret key can never safely live in front-end code,
and now that there's a real backend, this is actually straightforward to add properly:

1. Get a Razorpay account activated for live payments (business KYC — PAN, bank details; a sole
   proprietorship works, and this can run alongside your current informal/no-GST setup).
2. Add two routes to `server/routes/publicApi.js`: one that creates a Razorpay order server-side
   (using the secret key from `.env`, never exposed to the browser) when checkout starts, and one
   Razorpay calls back to (a webhook) to verify payment and mark the order paid.
3. Swap the "Reserve via WhatsApp" button in `checkout.html` for the Razorpay Checkout popup,
   which calls those two routes.

I can build this next once your Razorpay account is ready — just say the word.

## Hosting this (important: needs a Node host with persistent disk)

This is no longer a static site — it's a Node server with a SQLite file that needs to persist
between requests. That rules out plain static hosts (Netlify, GitHub Pages) and **serverless**
platforms whose filesystem resets on every request (e.g. Vercel's default serverless functions) —
the database would silently reset or fail to save. Instead, use a host that keeps a Node process
running with a persistent disk:

- **Render.com** — supports a persistent disk on the "Web Service" plan; straightforward for a
  small Node + SQLite app.
- **Railway.app** — attach a volume for the `data/` and `uploads/` folders.
- **A basic VPS** (DigitalOcean, Linode, Hetzner) — run with `pm2` or a systemd service; most
  control, a bit more setup.

Whichever you choose: set the environment variables from `.env.example` in the host's dashboard
(never commit a real `.env` to git), set `NODE_ENV=production`, and make sure `data/` and
`uploads/` are on persistent storage, not ephemeral disk.

## Backups

Your entire store's data — products, orders, customers, messages, settings — lives in one file:
`data/svadhina.db`. Back this up regularly (a simple cron job copying it somewhere safe is enough
at this scale). `uploads/` holds your product photos and logo — back that up too.

## Known limitations (by design, for this stage)

- No live payment processing yet (see above — needs your Razorpay account first).
- Single admin account, no roles/permissions — fine for a one-person or small-team shop.
- Sessions are stored in the same SQLite file, so if you ever run multiple server instances behind
  a load balancer, you'd want a shared session store — not a concern until you're at a scale where
  that's the right problem to have.
