const db = require("../db");

const BOOLEAN_KEYS = new Set(["gstRegistered", "razorpayEnabled"]);
const NUMBER_KEYS = new Set(["shippingFlatRate", "shippingFreeAbove", "returnWindowDays"]);

function coerce(key, value) {
  if (BOOLEAN_KEYS.has(key)) return value === "true";
  if (NUMBER_KEYS.has(key)) return Number(value);
  return value;
}

function getAllSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const row of rows) out[row.key] = coerce(row.key, row.value);
  return out;
}

const upsertStmt = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);

function updateSettings(partial) {
  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) {
      upsertStmt.run(key, typeof value === "boolean" ? String(value) : String(value ?? ""));
    }
  });
  tx(Object.entries(partial));
  return getAllSettings();
}

module.exports = { getAllSettings, updateSettings };
