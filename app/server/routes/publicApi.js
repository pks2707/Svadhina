const express = require("express");
const db = require("../db");
const { getAllSettings } = require("../utils/settings");
const { buildOrderWhatsAppMessage } = require("../utils/whatsapp");

const router = express.Router();

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
    inStock: !row.track_inventory || row.stock > 0,
    featured: !!row.featured,
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
router.get("/settings", (req, res) => {
  res.json(getAllSettings());
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
router.get("/products", (req, res) => {
  const { category } = req.query;
  let rows;
  if (category && category !== "All") {
    rows = db
      .prepare("SELECT * FROM products WHERE active = 1 AND category = ? ORDER BY id")
      .all(category);
  } else {
    rows = db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY id").all();
  }
  res.json(rows.map(serializeProduct));
});

router.get("/products/:slug", (req, res) => {
  const row = db.prepare("SELECT * FROM products WHERE slug = ? AND active = 1").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Product not found" });
  res.json(serializeProduct(row));
});

// ---------------------------------------------------------------------------
// Orders — also upserts a Customer row, so this doubles as the customer DB
// ---------------------------------------------------------------------------
router.post("/orders", (req, res) => {
  const { customer, items, notes } = req.body || {};

  if (!customer || !customer.name || !customer.phone || !customer.address || !customer.city || !customer.state || !customer.pincode) {
    return res.status(400).json({ error: "Missing required shipping details" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const phone = String(customer.phone).replace(/\D/g, "").slice(-10);
  if (phone.length !== 10) {
    return res.status(400).json({ error: "Invalid phone number" });
  }
  const pincode = String(customer.pincode).trim();
  if (!/^\d{6}$/.test(pincode)) {
    return res.status(400).json({ error: "Invalid pincode" });
  }

  // Look up each product fresh from the DB (never trust client-sent prices)
  const productStmt = db.prepare("SELECT * FROM products WHERE slug = ? AND active = 1");
  const resolvedItems = [];
  for (const item of items) {
    const product = productStmt.get(item.slug);
    if (!product) return res.status(400).json({ error: `Product "${item.slug}" not found` });
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    if (product.track_inventory && product.stock < qty) {
      return res.status(409).json({
        error: `Only ${product.stock} left of "${product.name}" — please adjust the quantity in your cart.`,
        slug: product.slug,
        available: product.stock,
      });
    }
    resolvedItems.push({ product, qty });
  }

  const settings = getAllSettings();
  const subtotal = resolvedItems.reduce((sum, { product, qty }) => sum + product.price * qty, 0);
  const shipping = subtotal === 0 ? 0 : subtotal >= settings.shippingFreeAbove ? 0 : settings.shippingFlatRate;
  const total = subtotal + shipping;
  const orderNumber = "SVD" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10);

  const createOrder = db.transaction(() => {
    let customerRow = db.prepare("SELECT * FROM customers WHERE phone = ?").get(phone);
    if (customerRow) {
      db.prepare(
        "UPDATE customers SET name = ?, email = ?, address = ?, city = ?, state = ?, pincode = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(
        customer.name.trim(),
        customer.email ? customer.email.trim() : customerRow.email,
        customer.address.trim(),
        customer.city.trim(),
        customer.state.trim(),
        pincode,
        customerRow.id
      );
    } else {
      const info = db
        .prepare(
          "INSERT INTO customers (name, phone, email, address, city, state, pincode) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .run(customer.name.trim(), phone, customer.email ? customer.email.trim() : null, customer.address.trim(), customer.city.trim(), customer.state.trim(), pincode);
      customerRow = { id: info.lastInsertRowid };
    }

    const orderInfo = db
      .prepare(
        "INSERT INTO orders (order_number, customer_id, subtotal, shipping, total, payment_method, status, notes) VALUES (?, ?, ?, ?, ?, 'whatsapp', 'new', ?)"
      )
      .run(orderNumber, customerRow.id, subtotal, shipping, total, notes ? String(notes).trim() : null);

    const insertItem = db.prepare(
      "INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)"
    );
    const decrementStock = db.prepare(
      "UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ? AND track_inventory = 1"
    );
    for (const { product, qty } of resolvedItems) {
      insertItem.run(orderInfo.lastInsertRowid, product.id, product.name, product.price, qty);
      decrementStock.run(qty, product.id);
    }

    return { orderId: orderInfo.lastInsertRowid, customerId: customerRow.id };
  });

  const { } = createOrder();

  const message = buildOrderWhatsAppMessage({
    brandName: settings.brandName,
    order: { orderNumber, subtotal, shipping, total, notes },
    customer: { ...customer, phone },
    items: resolvedItems.map(({ product, qty }) => ({ name: product.name, price: product.price, qty })),
  });

  res.status(201).json({
    orderNumber,
    subtotal,
    shipping,
    total,
    whatsappUrl: `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(message)}`,
  });
});

// ---------------------------------------------------------------------------
// Contact messages
// ---------------------------------------------------------------------------
router.post("/contact", (req, res) => {
  const { name, contactInfo, message } = req.body || {};
  if (!name || !contactInfo || !message) {
    return res.status(400).json({ error: "Name, contact info, and message are required" });
  }
  db.prepare("INSERT INTO contact_messages (name, contact_info, message) VALUES (?, ?, ?)").run(
    String(name).trim(),
    String(contactInfo).trim(),
    String(message).trim()
  );
  res.status(201).json({ ok: true });
});

module.exports = router;
