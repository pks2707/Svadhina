/* ===========================================================
   Svadhina Admin — shared helpers: API client, sidebar, auth
=========================================================== */

const ADMIN_API = "/api/admin";

async function adminGet(path) {
  const res = await fetch(ADMIN_API + path);
  if (res.status === 401) {
    window.location.href = "/admin/login.html";
    throw new Error("Not authenticated");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function adminSend(method, path, body) {
  const options = { method, headers: {}, };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(ADMIN_API + path, options);
  // A 401 from /login just means "wrong credentials" — let the caller show that
  // error normally. A 401 from anywhere else means the session expired.
  if (res.status === 401 && path !== "/login") {
    window.location.href = "/admin/login.html";
    throw new Error("Not authenticated");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const adminPost = (path, body) => adminSend("POST", path, body);
const adminPut = (path, body) => adminSend("PUT", path, body);
const adminDelete = (path) => adminSend("DELETE", path);

function formatINR(amount) {
  return "₹" + Math.round(amount || 0).toLocaleString("en-IN");
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const NAV_ITEMS = [
  { href: "/admin/index.html", label: "📊 Dashboard", key: "dashboard" },
  { href: "/admin/products.html", label: "🧵 Products", key: "products" },
  { href: "/admin/orders.html", label: "📦 Orders", key: "orders" },
  { href: "/admin/customers.html", label: "👥 Customers", key: "customers" },
  { href: "/admin/messages.html", label: "✉️ Messages", key: "messages" },
  { href: "/admin/settings.html", label: "⚙️ Settings", key: "settings" },
];

function renderSidebar(activeKey) {
  const mount = document.getElementById("sidebar");
  if (!mount) return;
  mount.innerHTML = `
    <div class="brand">
      <strong>Svadhina</strong>
      <span>Admin Panel</span>
    </div>
    <nav>
      ${NAV_ITEMS.map(
        (item) =>
          `<a href="${item.href}" class="${item.key === activeKey ? "active" : ""}">${item.label}</a>`
      ).join("")}
    </nav>
    <div class="logout-link">
      <a href="#" id="logoutLink" style="padding: 11px 20px; display:block; font-size:0.9rem;">↩ Log Out</a>
    </div>
  `;
  document.getElementById("logoutLink").addEventListener("click", async (e) => {
    e.preventDefault();
    await adminPost("/logout");
    window.location.href = "/admin/login.html";
  });
}

async function initAdminPage(activeKey) {
  renderSidebar(activeKey);
  try {
    const me = await adminGet("/me");
    const who = document.getElementById("whoami");
    if (who) who.textContent = `Signed in as ${me.username}`;
    return me;
  } catch (e) {
    // adminGet already redirects to login on 401
    return null;
  }
}
