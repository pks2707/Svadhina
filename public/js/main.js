/* ===========================================================
   Svadhina — shared header/footer, theme + nav behaviour
   Exposes `window.SITE_READY`, a promise that resolves with the current
   settings object once fetched. Page scripts can `await SITE_READY` before
   doing anything that needs brand/contact/shipping info.
=========================================================== */

function applyTheme(settings) {
  const root = document.documentElement.style;
  if (settings.colorPrimary) {
    root.setProperty("--maroon-800", settings.colorPrimary);
    root.setProperty("--maroon-700", shade(settings.colorPrimary, 12));
    root.setProperty("--maroon-900", shade(settings.colorPrimary, -18));
  }
  if (settings.colorGold) {
    root.setProperty("--gold-500", settings.colorGold);
    root.setProperty("--gold-600", shade(settings.colorGold, -12));
    root.setProperty("--gold-300", shade(settings.colorGold, 30));
  }
  if (settings.colorCream) {
    root.setProperty("--cream-200", settings.colorCream);
  }
}

// Lightens (positive percent) or darkens (negative) a hex color.
function shade(hex, percent) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  let r = (num >> 16) + Math.round((percent / 100) * 255);
  let g = ((num >> 8) & 0x00ff) + Math.round((percent / 100) * 255);
  let b = (num & 0x0000ff) + Math.round((percent / 100) * 255);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

function renderHeader(settings) {
  const mount = document.getElementById("site-header");
  if (!mount) return;
  const page = document.body.dataset.page || "";
  const navItem = (href, label, key) =>
    `<li><a href="${href}" class="${page === key ? "active" : ""}">${label}</a></li>`;

  mount.innerHTML = `
    <div class="announcement-bar">Free shipping on orders above ${formatINR(
      settings.shippingFreeAbove
    )} · Pan-India delivery</div>
    <div class="navbar">
      <a href="index.html" class="brand">
        <span class="brand-name">${settings.brandName}</span>
        <span class="brand-tagline">${settings.tagline}</span>
      </a>
      <button class="nav-toggle" aria-label="Toggle menu" id="navToggle">&#9776;</button>
      <ul class="nav-links" id="navLinks">
        ${navItem("index.html", "Home", "home")}
        ${navItem("shop.html", "Shop", "shop")}
        ${navItem("about.html", "About", "about")}
        ${navItem("contact.html", "Contact", "contact")}
        ${navItem("policies.html", "Shipping &amp; Returns", "policies")}
      </ul>
      <div class="nav-actions">
        <a href="cart.html" class="cart-link">
          🛍️ Cart <span class="cart-count" data-cart-count>0</span>
        </a>
      </div>
    </div>
  `;

  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
  }
  updateCartBadge();
}

function renderFooter(settings) {
  const mount = document.getElementById("site-footer");
  if (!mount) return;
  mount.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-brand-name">${settings.brandName}</div>
          <div class="footer-tagline">${settings.tagline}</div>
          <p style="opacity:0.75; font-size:0.85rem; max-width:280px;">
            Handpicked sarees blending traditional weaves with everyday elegance.
          </p>
        </div>
        <div>
          <h4>Shop</h4>
          <ul>
            <li><a href="shop.html">All Sarees</a></li>
            <li><a href="cart.html">My Cart</a></li>
          </ul>
        </div>
        <div>
          <h4>Company</h4>
          <ul>
            <li><a href="about.html">About Us</a></li>
            <li><a href="contact.html">Contact Us</a></li>
            <li><a href="policies.html">Shipping &amp; Returns</a></li>
          </ul>
        </div>
        <div>
          <h4>Get in touch</h4>
          <ul>
            <li>📞 ${settings.phonePrimary}${settings.phoneSecondary ? " / " + settings.phoneSecondary : ""}</li>
            <li>✉️ ${settings.email}</li>
            <li>📍 ${settings.address}</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ${settings.brandName}. All rights reserved.</span>
        <span>Made with care in Noida, India</span>
      </div>
    </div>
  `;
}

window.SITE_READY = (async () => {
  const settings = await fetchSettings();
  applyTheme(settings);
  document.addEventListener("DOMContentLoaded", () => {
    renderHeader(settings);
    renderFooter(settings);
  });
  if (document.readyState !== "loading") {
    renderHeader(settings);
    renderFooter(settings);
  }
  return settings;
})();
