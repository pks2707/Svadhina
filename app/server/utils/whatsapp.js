function formatINR(amount) {
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}

function buildOrderWhatsAppMessage({ brandName, order, customer, items }) {
  const itemLines = items.map((i) => `• ${i.name} × ${i.qty} — ${formatINR(i.price * i.qty)}`).join("\n");
  return (
    `New order from ${brandName} website\n\n` +
    `*Order:* ${order.orderNumber}\n` +
    `*Name:* ${customer.name}\n` +
    `*Phone:* ${customer.phone}\n` +
    `*Address:* ${customer.address}, ${customer.city}, ${customer.state} - ${customer.pincode}\n` +
    (order.notes ? `*Notes:* ${order.notes}\n` : "") +
    `\n*Items:*\n${itemLines}\n\n` +
    `Subtotal: ${formatINR(order.subtotal)}\n` +
    `Shipping: ${order.shipping === 0 ? "Free" : formatINR(order.shipping)}\n` +
    `*Total: ${formatINR(order.total)}*`
  );
}

module.exports = { formatINR, buildOrderWhatsAppMessage };
