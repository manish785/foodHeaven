/**
 * Read a field from a DB row across MySQL and Postgres drivers.
 * Postgres lowercases unquoted aliases (customerEmail -> customeremail).
 */
function pickRowField(row, camel, snake) {
  if (!row) return undefined;
  return (
    row[camel] ??
    row[snake] ??
    row[camel.toLowerCase()] ??
    row[snake.replace(/_/g, "")]
  );
}

function normalizeOrderSummary(row) {
  if (!row) return row;

  return {
    ...row,
    id: row.id,
    orderNumber: pickRowField(row, "orderNumber", "order_number"),
    customerEmail: pickRowField(row, "customerEmail", "customer_email"),
    customerName: pickRowField(row, "customerName", "customer_name"),
    customerPhone: pickRowField(row, "customerPhone", "customer_phone"),
    deliveryAddress: pickRowField(row, "deliveryAddress", "delivery_address"),
    deliveryPincode: pickRowField(row, "deliveryPincode", "delivery_pincode"),
    paymentMethod: pickRowField(row, "paymentMethod", "payment_method"),
    subtotalAmount: pickRowField(row, "subtotalAmount", "subtotal_amount"),
    taxAmount: pickRowField(row, "taxAmount", "tax_amount"),
    deliveryFee: pickRowField(row, "deliveryFee", "delivery_fee"),
    totalAmount: pickRowField(row, "totalAmount", "total_amount"),
    createdAt: pickRowField(row, "createdAt", "created_at"),
    updatedAt: pickRowField(row, "updatedAt", "updated_at"),
    status: row.status,
  };
}

function normalizeOrderItem(row) {
  if (!row) return row;

  return {
    ...row,
    menuItemId: pickRowField(row, "menuItemId", "menu_item_id"),
    itemName: pickRowField(row, "itemName", "item_name"),
    unitPrice: pickRowField(row, "unitPrice", "unit_price"),
    lineTotal: pickRowField(row, "lineTotal", "line_total"),
    quantity: row.quantity,
  };
}

function normalizeTimelineEvent(row) {
  if (!row) return row;

  return {
    ...row,
    status: row.status,
    occurredAt: pickRowField(row, "occurredAt", "created_at"),
  };
}

module.exports = {
  pickRowField,
  normalizeOrderSummary,
  normalizeOrderItem,
  normalizeTimelineEvent,
};
