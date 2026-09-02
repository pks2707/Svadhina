/* ===========================================================
   Svadhina — cart utilities (localStorage-backed)
=========================================================== */

const CART_KEY = "svadhina_cart_v1";

function readCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function writeCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}

function addToCart(slug, qty = 1) {
  const items = readCart();
  const existing = items.find((i) => i.slug === slug);
  if (existing) {
    existing.qty += qty;
  } else {
    items.push({ slug, qty });
  }
  writeCart(items);
}

function updateCartQty(slug, qty) {
  let items = readCart();
  if (qty <= 0) {
    items = items.filter((i) => i.slug !== slug);
  } else {
    const existing = items.find((i) => i.slug === slug);
    if (existing) existing.qty = qty;
  }
  writeCart(items);
}

function removeFromCart(slug) {
  const items = readCart().filter((i) => i.slug !== slug);
  writeCart(items);
}

function clearCart() {
  writeCart([]);
}

// Needs the product catalog (fetched from the API) to resolve name/price/image.
async function getCartLines() {
  const products = await fetchAllProducts();
  const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
  return readCart()
    .map((i) => {
      const product = bySlug[i.slug];
      if (!product) return null;
      return { ...i, product, lineTotal: product.price * i.qty };
    })
    .filter(Boolean);
}

function getCartCount() {
  return readCart().reduce((sum, i) => sum + i.qty, 0);
}

async function getCartSubtotal() {
  const lines = await getCartLines();
  return lines.reduce((sum, l) => sum + l.lineTotal, 0);
}

function getShippingCost(subtotal, settings) {
  if (subtotal === 0) return 0;
  return subtotal >= settings.shippingFreeAbove ? 0 : settings.shippingFlatRate;
}

function updateCartBadge() {
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = getCartCount();
  });
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

document.addEventListener("DOMContentLoaded", updateCartBadge);
