/**
 * Order repository — SQL data access for orders, line items, and payments.
 *
 * Responsibilities:
 * - Execute parameterized SQL against orders, order_items, menu_items, payments
 * - Accept a connection object so callers can wrap calls in transactions
 * - Map DB rows to plain JS objects (via rowMappers where needed)
 *
 * Does NOT contain HTTP logic, pricing rules, or validation.
 * All functions take a DB connection as the first argument (from pool.getConnection).
 *
 * Postgres vs MySQL:
 * - Uses `?` placeholders (translated to `$1…` by config/db.js for Postgres)
 * - Postgres INSERTs use `RETURNING id`; MySQL uses `result.insertId`
 * - `activeFilter` adapts boolean column syntax per engine
 */

const pool = require("../config/db");
const { mapMenuItemRow } = require("./rowMappers");

// Postgres uses TRUE; MySQL uses 1 for is_active checks
const activeFilter = pool.isPostgres ? "TRUE" : "1";

/**
 * Detect missing idempotency_key column on older databases.
 * MySQL: ER_BAD_FIELD_ERROR; Postgres: 42703 (undefined_column).
 */
function isMissingIdempotencyColumnError(error) {
  return (
    error?.code === "ER_BAD_FIELD_ERROR" || error?.code === "42703"
  );
}

/** Extract inserted row id from Postgres RETURNING result. */
function getInsertId(rows) {
  return Number(rows?.[0]?.id || 0);
}

/**
 * Fetch active menu items by id — used to price order lines server-side.
 *
 * @param {object} connection - Transaction connection from pool.getConnection()
 * @param {number[]} itemIds - Menu item primary keys
 * @returns {Promise<object[]>} Items with id, name, pricePaise, defaultPricePaise
 */
async function findMenuItemsByIds(connection, itemIds) {
  if (!itemIds.length) {
    return [];
  }

  const placeholders = itemIds.map(() => "?").join(", ");
  const [rows] = await connection.query(
    `SELECT id, name, price_paise AS pricePaise, default_price_paise AS defaultPricePaise
     FROM menu_items
     WHERE id IN (${placeholders}) AND is_active = ${activeFilter}`,
    itemIds
  );

  return rows.map((row) => {
    const mapped = mapMenuItemRow({
      ...row,
      price_paise: row.pricePaise ?? row.price_paise,
      default_price_paise: row.defaultPricePaise ?? row.default_price_paise,
    });
    return {
      id: mapped.id,
      name: mapped.name,
      pricePaise: mapped.price,
      defaultPricePaise: mapped.defaultPrice,
    };
  });
}

/**
 * INSERT a new order header row.
 *
 * Tries INSERT with idempotency_key first. If the column is missing on an
 * older DB (before migrate.js ran), falls back to INSERT without that column.
 *
 * @param {object} connection
 * @param {object} payload - Order fields (orderNumber, customer info, amounts, status)
 * @returns {Promise<number>} New order id
 */
async function createOrder(connection, payload) {
  const returning = pool.isPostgres ? " RETURNING id" : "";

  try {
    const [rows] = await connection.query(
      `INSERT INTO orders (
        order_number,
        idempotency_key,
        customer_name,
        customer_email,
        customer_phone,
        delivery_address,
        delivery_pincode,
        payment_method,
        subtotal_amount,
        tax_amount,
        delivery_fee,
        total_amount,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)${returning}`,
      [
        payload.orderNumber,
        payload.idempotencyKey,
        payload.customerName,
        payload.customerEmail,
        payload.customerPhone,
        payload.deliveryAddress,
        payload.deliveryPincode,
        payload.paymentMethod,
        payload.subtotalAmount,
        payload.taxAmount,
        payload.deliveryFee,
        payload.totalAmount,
        payload.status,
      ]
    );

    return pool.isPostgres ? getInsertId(rows) : rows.insertId;
  } catch (error) {
    if (!isMissingIdempotencyColumnError(error)) {
      throw error;
    }

    const returningFallback = pool.isPostgres ? " RETURNING id" : "";
    const [rows] = await connection.query(
      `INSERT INTO orders (
        order_number,
        customer_name,
        customer_email,
        customer_phone,
        delivery_address,
        delivery_pincode,
        payment_method,
        subtotal_amount,
        tax_amount,
        delivery_fee,
        total_amount,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)${returningFallback}`,
      [
        payload.orderNumber,
        payload.customerName,
        payload.customerEmail,
        payload.customerPhone,
        payload.deliveryAddress,
        payload.deliveryPincode,
        payload.paymentMethod,
        payload.subtotalAmount,
        payload.taxAmount,
        payload.deliveryFee,
        payload.totalAmount,
        payload.status,
      ]
    );

    return pool.isPostgres ? getInsertId(rows) : rows.insertId;
  }
}

/**
 * Lookup a prior order by Idempotency-Key header value.
 *
 * Returns null if no match, or if idempotency_key column does not exist yet.
 *
 * @param {object} connection
 * @param {string} idempotencyKey
 * @returns {Promise<object|null>}
 */
async function findOrderByIdempotencyKey(connection, idempotencyKey) {
  let rows;
  try {
    [rows] = await connection.query(
      `SELECT
        id,
        order_number AS orderNumber,
        customer_email AS customerEmail,
        subtotal_amount AS subtotalAmount,
        tax_amount AS taxAmount,
        delivery_fee AS deliveryFee,
        total_amount AS totalAmount,
        status
       FROM orders
       WHERE idempotency_key = ?
       LIMIT 1`,
      [idempotencyKey]
    );
  } catch (error) {
    if (!isMissingIdempotencyColumnError(error)) {
      throw error;
    }
    return null;
  }
  return rows[0] || null;
}

/**
 * Bulk INSERT order line items (one row per cart line).
 *
 * Snapshots item name and unit price at order time so price changes
 * on menu_items do not affect historical orders.
 *
 * @param {object} connection
 * @param {object[]} orderItems - Lines with orderId, menuItemId, itemName, unitPrice, quantity, lineTotal
 */
async function createOrderItems(connection, orderItems) {
  if (!orderItems.length) {
    return;
  }

  for (const item of orderItems) {
    await connection.query(
      `INSERT INTO order_items (
        order_id,
        menu_item_id,
        item_name,
        unit_price,
        quantity,
        line_total
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        item.orderId,
        item.menuItemId,
        item.itemName,
        item.unitPrice,
        item.quantity,
        item.lineTotal,
      ]
    );
  }
}

/**
 * INSERT initial payment record when an order is created.
 *
 * @param {object} connection
 * @param {object} payload - orderId, provider, paymentMethod, amount, status
 * @returns {Promise<number>} New payment id
 */
async function createPayment(connection, payload) {
  const returning = pool.isPostgres ? " RETURNING id" : "";
  const [rows] = await connection.query(
    `INSERT INTO payments (
      order_id,
      provider,
      payment_method,
      amount,
      status
    ) VALUES (?, ?, ?, ?, ?)${returning}`,
    [
      payload.orderId,
      payload.provider,
      payload.paymentMethod,
      payload.amount,
      payload.status,
    ]
  );

  return pool.isPostgres ? getInsertId(rows) : rows.insertId;
}

/** Append an immutable order-status event. */
async function createTimelineEvent(connection, { orderId, status }) {
  await connection.query(
    "INSERT INTO order_timeline (order_id, status) VALUES (?, ?)",
    [orderId, status]
  );
}

/** Return an order summary with status events in chronological order. */
async function findOrderTimeline(connection, orderId) {
  const [orderRows] = await connection.query(
    `SELECT id, order_number AS orderNumber, customer_email AS customerEmail,
            status, created_at AS createdAt
     FROM orders
     WHERE id = ?
     LIMIT 1`,
    [orderId]
  );
  const order = orderRows[0];
  if (!order) return null;

  const [timeline] = await connection.query(
    `SELECT status, created_at AS occurredAt
     FROM order_timeline
     WHERE order_id = ?
     ORDER BY created_at ASC, id ASC`,
    [orderId]
  );

  // Orders created before this table was introduced still have a useful timeline.
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmail,
    currentStatus: order.status,
    timeline: timeline.length
      ? timeline
      : [{ status: order.status, occurredAt: order.createdAt }],
  };
}

/**
 * Load order header by primary key (used during payment confirmation).
 *
 * @param {object} connection
 * @param {number} orderId
 * @returns {Promise<object|null>}
 */
async function findOrderById(connection, id, { forUpdate = false } = {}) {
  const [rows] = await connection.query(
    `SELECT
      id,
      order_number AS orderNumber,
      customer_email AS customerEmail,
      total_amount AS totalAmount,
      status
     FROM orders
     WHERE id = ?
     LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Update payment row after mock gateway success or failure.
 * Sets payment_ref, provider, status, and paid_at timestamp.
 *
 * @param {object} connection
 * @param {object} payload - orderId, paymentRef, provider, status
 */
async function updatePaymentByOrderId(connection, payload) {
  await connection.query(
    `UPDATE payments
     SET payment_ref = ?, provider = ?, status = ?, paid_at = NOW()
     WHERE order_id = ?`,
    [payload.paymentRef, payload.provider, payload.status, payload.orderId]
  );
}

/**
 * Set orders.status (e.g. PENDING → PAID or FAILED).
 *
 * @param {object} connection
 * @param {number} orderId
 * @param {string} status - Order status enum value
 */
async function updateOrderStatus(connection, orderId, status) {
  await connection.query(`UPDATE orders SET status = ? WHERE id = ?`, [
    status,
    orderId,
  ]);
}

// repositories/orderRepository.js

async function findOrdersByEmail(
  connection,
  email,
  limit,
  offset
) {
  const [rows] = await connection.query(
    `
    SELECT
      id,
      order_number AS orderNumber,
      total_amount AS totalAmount,
      status,
      created_at AS createdAt
    FROM orders
    WHERE customer_email = ?
    ORDER BY created_at DESC
    LIMIT ?
    OFFSET ?
    `,
    [email, limit, offset]
  );

  return rows;
}

async function getOrdersCount(connection, email) {
  const [[result]] = await connection.query(
    `
    SELECT COUNT(*) AS total
    FROM orders
    WHERE customer_email = ?
    `,
    [email]
  );

  return result.total;
}
async function getOrderDetails(connection, orderId) {
  const [orderRows] = await connection.query(
    `SELECT
      id,
      order_number AS orderNumber,
      customer_name AS customerName,
      customer_email AS customerEmail,
      customer_phone AS customerPhone,
      delivery_address AS deliveryAddress,
      delivery_pincode AS deliveryPincode,
      payment_method AS paymentMethod,
      subtotal_amount AS subtotalAmount,
      tax_amount AS taxAmount,
      delivery_fee AS deliveryFee,
      total_amount AS totalAmount,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM orders
     WHERE id = ?
     LIMIT 1`,
    [orderId]
  );

  const order = orderRows[0];
  if (!order) {
    return null;
  }

  const [itemRows] = await connection.query(
    `SELECT
      menu_item_id AS menuItemId,
      item_name AS itemName,
      unit_price AS unitPrice,
      quantity,
      line_total AS lineTotal
     FROM order_items
     WHERE order_id = ?
     ORDER BY id ASC`,
    [orderId]
  );

  return { ...order, items: itemRows };
}

module.exports = {
  findMenuItemsByIds,
  createOrder,
  findOrderByIdempotencyKey,
  createOrderItems,
  createPayment,
  createTimelineEvent,
  findOrderTimeline,
  findOrderById,
  updatePaymentByOrderId,
  updateOrderStatus,
  findOrdersByEmail,
  getOrdersCount,
  getOrderDetails
};
