const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "svadhina.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  slug              TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  fabric            TEXT,
  category          TEXT,
  occasion          TEXT,
  price             INTEGER NOT NULL,
  compare_at_price  INTEGER,
  description       TEXT,
  details_json      TEXT,
  image             TEXT,
  stock             INTEGER NOT NULL DEFAULT 0,
  track_inventory   INTEGER NOT NULL DEFAULT 1,
  featured          INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  phone       TEXT UNIQUE NOT NULL,
  email       TEXT,
  address     TEXT,
  city        TEXT,
  state       TEXT,
  pincode     TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number   TEXT UNIQUE NOT NULL,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  subtotal       INTEGER NOT NULL,
  shipping       INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'whatsapp',
  status         TEXT NOT NULL DEFAULT 'new',
  notes          TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  product_id  INTEGER REFERENCES products(id),
  name        TEXT NOT NULL,
  price       INTEGER NOT NULL,
  qty         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  contact_info  TEXT NOT NULL,
  message       TEXT NOT NULL,
  resolved      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  sess    TEXT NOT NULL,
  expires INTEGER NOT NULL
);
`);

// ---------------------------------------------------------------------------
// Seed default settings (only inserted if the key doesn't already exist,
// so re-running the server never overwrites values changed in the admin panel)
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  brandName: "Svadhina",
  tagline: "Elegance that Empowers",
  logoUrl: "/uploads/branding/logo.jpg",
  colorPrimary: "#5a0f24", // maroon
  colorGold: "#bf9b30",
  colorCream: "#fdf0e1",
  aboutText:
    "Svadhina was founded on a simple belief: a saree is more than fabric — it's a quiet statement of confidence. The name itself means self-reliance, and every piece we curate is chosen to help the women who wear it feel exactly that — grounded, graceful, and empowered.\n\nWe work directly with weavers and trusted textile partners to bring you Banarasi silks, Kanjivarams, handloom cottons, and contemporary drapes — pieces that honour traditional craftsmanship while fitting easily into modern life.",
  phonePrimary: "8447863044",
  phoneSecondary: "9871372611",
  whatsapp: "919871372611",
  email: "urmi.mahapatra@gmail.com",
  address: "Urbtech Hilston, Sector 79, Noida, Uttar Pradesh - 201305",
  gstRegistered: "false",
  gstNumber: "",
  shippingFlatRate: "99",
  shippingFreeAbove: "2999",
  shippingNote: "Ships across India in 4-7 business days.",
  returnWindowDays: "7",
  returnCondition: "Tags must be intact and the saree unused/unwashed.",
  razorpayEnabled: "false",
};

const insertSettingIfMissing = db.prepare(
  "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
);
const seedSettings = db.transaction((entries) => {
  for (const [key, value] of entries) insertSettingIfMissing.run(key, value);
});
seedSettings(Object.entries(DEFAULT_SETTINGS));

// ---------------------------------------------------------------------------
// Seed default admin account from env vars, only if no admin exists yet
// ---------------------------------------------------------------------------
const adminCount = db.prepare("SELECT COUNT(*) AS n FROM admins").get().n;
if (adminCount === 0) {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "svadhina123";
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(username, hash);
  console.log(`[seed] Created initial admin account "${username}". Change this password after first login!`);
}

// ---------------------------------------------------------------------------
// Seed sample products, only if the products table is empty
// ---------------------------------------------------------------------------
const productCount = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
if (productCount === 0) {
  const sampleProducts = require("./seedProducts");
  const insertProduct = db.prepare(`
    INSERT INTO products
      (slug, name, fabric, category, occasion, price, compare_at_price, description, details_json, image, stock, track_inventory, featured, active)
    VALUES
      (@slug, @name, @fabric, @category, @occasion, @price, @compareAtPrice, @description, @detailsJson, @image, @stock, @trackInventory, @featured, 1)
  `);
  const seedAll = db.transaction((rows) => {
    for (const p of rows) insertProduct.run(p);
  });
  seedAll(sampleProducts);
  console.log(`[seed] Inserted ${sampleProducts.length} sample products.`);
}

module.exports = db;
