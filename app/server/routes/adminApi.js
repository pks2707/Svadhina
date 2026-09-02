const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const db = require("../db");
const requireAdmin = require("../middleware/requireAdmin");
const { getAllSettings, updateSettings } = require("../utils/settings");

const router = express.Router();

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(String(username).trim());
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  req.session.adminId = admin.id;
  req.session.username = admin.username;
  res.json({ ok: true, username: admin.username });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/me", requireAdmin, (req, res) => {
  res.json({ username: req.session.username });
});

router.post("/change-password", requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }
  const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(req.session.adminId);
  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(hash, admin.id);
  res.json({ ok: true });
});

// Everything below requires an authenticated admin session
router.use(requireAdmin);

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------
router.get("/summary", (req, res) => {
  const totalOrders = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
  const newOrders = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'new'").get().n;
  const totalCustomers = db.prepare("SELECT COUNT(*) AS n FROM customers").get().n;
  const lowStock = db
    .prepare("SELECT COUNT(*) AS n FROM products WHERE active = 1 AND track_inventory = 1 AND stock <= 3")
    .get().n;
  const unresolvedMessages = db
    .prepare("SELECT COUNT(*) AS n FROM contact_messages WHERE resolved = 0")
    .get().n;
  const revenue = db.prepare("SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE status != 'cancelled'").get().n;
  res.json({ totalOrders, newOrders, totalCustomers, lowStock, unresolvedMessages, revenue });
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
function serializeProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    fabric: row.fabric,
    category: row.category,
    occasion: row.occasion,
    price: row.price,
    compareAtPrice: row.compare_at_price,
    description: row.description,
    details: row.details_json ? JSON.parse(row.details_json) : {},
    image: row.image,
    stock: row.stock,
    trackInventory: !!row.track_inventory,
    featured: !!row.featured,
    active: !!row.active,
  };
}

router.get("/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY id DESC").all();
  res.json(rows.map(serializeProduct));
});

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

router.post("/products", (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.price) return res.status(400).json({ error: "Name and price are required" });

  let slug = b.slug ? slugify(b.slug) : slugify(b.name);
  const exists = db.prepare("SELECT id FROM products WHERE slug = ?").get(slug);
  if (exists) slug = `${slug}-${Date.now().toString().slice(-5)}`;

  const info = db
    .prepare(
      `INSERT INTO products
        (slug, name, fabric, category, occasion, price, compare_at_price, description, details_json, image, stock, track_inventory, featured, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      slug,
      b.name,
      b.fabric || "",
      b.category || "",
      b.occasion || "",
      Math.round(Number(b.price) || 0),
      b.compareAtPrice ? Math.round(Number(b.compareAtPrice)) : null,
      b.description || "",
      JSON.stringify(b.details || {}),
      b.image || "/assets/products/placeholder.svg",
      Math.max(0, parseInt(b.stock, 10) || 0),
      b.trackInventory === false ? 0 : 1,
      b.featured ? 1 : 0,
      b.active === false ? 0 : 1
    );

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(serializeProduct(row));
});

router.put("/products/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Product not found" });
  const b = req.body || {};

  db.prepare(
    `UPDATE products SET
      name = ?, fabric = ?, category = ?, occasion = ?, price = ?, compare_at_price = ?,
      description = ?, details_json = ?, image = ?, stock = ?, track_inventory = ?,
      featured = ?, active = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    b.name ?? existing.name,
    b.fabric ?? existing.fabric,
    b.category ?? existing.category,
    b.occasion ?? existing.occasion,
    b.price !== undefined ? Math.round(Number(b.price)) : existing.price,
    b.compareAtPrice !== undefined ? (b.compareAtPrice ? Math.round(Number(b.compareAtPrice)) : null) : existing.compare_at_price,
    b.description ?? existing.description,
    b.details !== undefined ? JSON.stringify(b.details) : existing.details_json,
    b.image ?? existing.image,
    b.stock !== undefined ? Math.max(0, parseInt(b.stock, 10) || 0) : existing.stock,
    b.trackInventory !== undefined ? (b.trackInventory ? 1 : 0) : existing.track_inventory,
    b.featured !== undefined ? (b.featured ? 1 : 0) : existing.featured,
    b.active !== undefined ? (b.active ? 1 : 0) : existing.active,
    req.params.id
  );

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  res.json(serializeProduct(row));
});

router.delete("/products/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Product not found" });
  // Soft-delete: keep history/order references intact, just hide from the storefront
  db.prepare("UPDATE products SET active = 0, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
router.get("/orders", (req, res) => {
  const rows = db
    .prepare(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
       FROM orders o JOIN customers c ON c.id = o.customer_id
       ORDER BY o.id DESC`
    )
    .all();
  res.json(
    rows.map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      subtotal: r.subtotal,
      shipping: r.shipping,
      total: r.total,
      status: r.status,
      paymentMethod: r.payment_method,
      notes: r.notes,
      createdAt: r.created_at,
    }))
  );
});

router.get("/orders/:id", (req, res) => {
  const order = db
    .prepare(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
              c.address AS customer_address, c.city AS customer_city, c.state AS customer_state, c.pincode AS customer_pincode
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = ?`
    )
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
  res.json({
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentMethod: order.payment_method,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    notes: order.notes,
    createdAt: order.created_at,
    customer: {
      name: order.customer_name,
      phone: order.customer_phone,
      email: order.customer_email,
      address: order.customer_address,
      city: order.customer_city,
      state: order.customer_state,
      pincode: order.customer_pincode,
    },
    items: items.map((i) => ({ name: i.name, price: i.price, qty: i.qty })),
  });
});

const VALID_STATUSES = ["new", "confirmed", "shipped", "delivered", "cancelled"];
router.put("/orders/:id/status", (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const existing = db.prepare("SELECT id FROM orders WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Order not found" });
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
router.get("/customers", (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*,
              COUNT(o.id) AS order_count,
              COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS total_spent
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    )
    .all();
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      city: r.city,
      state: r.state,
      pincode: r.pincode,
      orderCount: r.order_count,
      totalSpent: r.total_spent,
      createdAt: r.created_at,
    }))
  );
});

// ---------------------------------------------------------------------------
// Contact messages
// ---------------------------------------------------------------------------
router.get("/messages", (req, res) => {
  const rows = db.prepare("SELECT * FROM contact_messages ORDER BY id DESC").all();
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      contactInfo: r.contact_info,
      message: r.message,
      resolved: !!r.resolved,
      createdAt: r.created_at,
    }))
  );
});

router.put("/messages/:id", (req, res) => {
  const { resolved } = req.body || {};
  const existing = db.prepare("SELECT id FROM contact_messages WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Message not found" });
  db.prepare("UPDATE contact_messages SET resolved = ? WHERE id = ?").run(resolved ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
router.get("/settings", (req, res) => {
  res.json(getAllSettings());
});

router.put("/settings", (req, res) => {
  const updated = updateSettings(req.body || {});
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Uploads (product photos, logo)
// ---------------------------------------------------------------------------
const UPLOAD_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = req.query.type === "branding" ? "branding" : "products";
    const dir = path.join(UPLOAD_ROOT, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const base = req.query.type === "branding" ? "logo" : slugify(path.basename(file.originalname, ext));
    const unique = `${base}-${Date.now()}${ext}`;
    cb(null, unique);
  },
});

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) return cb(new Error("Only JPG, PNG, WebP or SVG images are allowed"));
    cb(null, true);
  },
});

router.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const sub = req.query.type === "branding" ? "branding" : "products";
  res.status(201).json({ url: `/uploads/${sub}/${req.file.filename}` });
});

module.exports = router;
