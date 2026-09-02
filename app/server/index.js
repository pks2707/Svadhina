const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const session = require("express-session");

const db = require("./db"); // initializes schema + seed data as a side effect
const SqliteSessionStore = require("./sessionStore");
const publicApi = require("./routes/publicApi");
const adminApi = require("./routes/adminApi");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const ADMIN_DIR = path.join(__dirname, "..", "admin");
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "..", "uploads");

app.set("trust proxy", 1); // needed if deployed behind a reverse proxy (Render, Railway, nginx) serving HTTPS

app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    store: new SqliteSessionStore(),
    secret: process.env.SESSION_SECRET || "svadhina-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use("/api", publicApi);
app.use("/api/admin", adminApi);

// ---------------------------------------------------------------------------
// Uploaded files (product photos, logo)
// ---------------------------------------------------------------------------
app.use("/uploads", express.static(UPLOADS_DIR));

// ---------------------------------------------------------------------------
// Admin panel — the shell itself is static, but every admin/*.html page except
// login.html redirects to login if there's no active session. All the real
// data still only ever comes from /api/admin/*, which is protected regardless.
// ---------------------------------------------------------------------------
app.use("/admin", (req, res, next) => {
  const isLoginPage = req.path === "/login.html" || req.path === "/login";
  const isAsset = /\.(css|js|svg|png|jpg|jpeg|webp|ico)$/.test(req.path);
  if (isLoginPage || isAsset) return next();
  if (req.session && req.session.adminId) return next();
  return res.redirect("/admin/login.html");
});
app.use("/admin", express.static(ADMIN_DIR));

// ---------------------------------------------------------------------------
// Customer-facing storefront
// ---------------------------------------------------------------------------
app.use(express.static(PUBLIC_DIR));

// ---------------------------------------------------------------------------
// Error handling (e.g. multer file-type/size errors)
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  if (req.path.startsWith("/api")) {
    console.error(err);
    return res.status(400).json({ error: err.message || "Something went wrong" });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Svadhina server running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin`);
});
