/* ===========================================================
   Svadhina — API client for the public storefront
=========================================================== */

const API_BASE = "/api";

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed");
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

let _settingsPromise = null;
function fetchSettings() {
  if (!_settingsPromise) _settingsPromise = apiGet("/settings");
  return _settingsPromise;
}

let _productsCache = null;
async function fetchAllProducts() {
  if (!_productsCache) _productsCache = await apiGet("/products");
  return _productsCache;
}

async function fetchProductBySlug(slug) {
  return apiGet(`/products/${encodeURIComponent(slug)}`);
}

function formatINR(amount) {
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}
