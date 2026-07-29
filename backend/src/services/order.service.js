/**
 * Order service — core order business logic.
 *
 * Responsibilities:
 * - Validate checkout payloads (items, delivery address)
 * - Compute pricing server-side (never trust client prices)
 * - Orchestrate DB transactions via order.repository
 * - Support idempotent order creation via Idempotency-Key
 * - Confirm mock payment and update order/payment status
 *
 * Does NOT know about HTTP (req/res). Throws errors with `statusCode`
 * so the global errorHandler can map them to JSON responses.
 */

const pool = require("../config/db");
const orderRepository = require("../repositories/order.repository");


/**
 * Build an Error with an HTTP status code attached.
 * The global errorHandler reads `error.statusCode` to pick the response code.
 *
 * @param {string} message
 * @param {number} statusCode
 */
function buildHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/** Safe numeric coercion; non-finite values become 0. */
function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Map API payment method strings to DB enum values.
 * Unknown methods default to CARD.
 *
 * @param {string} method - e.g. "card", "cod", "paytm"
 */
function mapPaymentMethod(method) {
  if (method === "card") return "CARD";
  if (method === "cod") return "COD";
  if (method === "paytm") return "PAYTM";
  return "CARD";
}

// Order Status
const VALID_STATUS = [
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED"
]

// A customer may cancel until the order has left for delivery.
const CANCELLABLE_ORDER_STATUSES = new Set([
  "PENDING",
  "PAID",
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
]);

const ORDER_STATUS_TRANSITIONS = {
  PAID: new Set(["ACCEPTED", "CANCELLED"]),
  ACCEPTED: new Set(["PREPARING", "CANCELLED"]),
  PREPARING: new Set(["READY", "CANCELLED"]),
  READY: new Set(["PICKED_UP", "CANCELLED"]),
  PICKED_UP: new Set(["OUT_FOR_DELIVERY"]),
  OUT_FOR_DELIVERY: new Set(["DELIVERED"]),
};

function isStaff(user) {
  return user?.role === "admin" || user?.role === "system";
}

function assertCanAccessOrder(order, user) {
  if (isStaff(user)) return;
  if (!user?.email || order.customerEmail !== user.email) {
    throw buildHttpError("You are not authorized to access this order", 403);
  }
}

function assertStaff(user) {
  if (!isStaff(user)) {
    throw buildHttpError("Only staff can update order status", 403);
  }
}

/**
 * Create an order from checkout payload.
 *
 * Flow:
 * 1. Validate items and delivery address
 * 2. Begin transaction
 * 3. If Idempotency-Key matches an existing order → return it (no duplicate)
 * 4. Load menu item prices from DB
 * 5. Calculate subtotal, 5% tax, delivery fee (₹40 unless subtotal ≥ ₹300)
 * 6. Insert order, line items, and initial payment row
 * 7. Commit transaction
 *
 * @param {object} payload - Checkout body plus optional idempotencyKey
 * @returns {Promise<object>} Created or replayed order summary
 */
async function createOrder(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const deliveryAddress = payload?.deliveryAddress || {};
  const paymentMethod = mapPaymentMethod(payload?.paymentMethod);
  const idempotencyKey = payload?.idempotencyKey || null;

  if (!items.length) {
    throw buildHttpError("Order must contain at least one item", 400);
  }

  // Require all delivery fields before touching the database
  if (
    !deliveryAddress.name ||
    !deliveryAddress.email ||
    !deliveryAddress.number ||
    !deliveryAddress.address ||
    !deliveryAddress.pincode
  ) {
    throw buildHttpError("Delivery address is incomplete", 400);
  }

  // Normalize cart lines: positive menuItemId, quantity at least 1
  const normalizedItems = items
    .map((item) => ({
      menuItemId: Number(item.menuItemId),
      quantity: Math.max(1, Number(item.quantity || 1)),
    }))
    .filter((item) => Number.isInteger(item.menuItemId) && item.menuItemId > 0);

  if (!normalizedItems.length) {
    throw buildHttpError("No valid menu items found in order", 400);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Same Idempotency-Key → return existing order without duplicating rows
    if (idempotencyKey) {
      const existingOrder = await orderRepository.findOrderByIdempotencyKey(
        connection,
        idempotencyKey
      );
      if (existingOrder) {
        if (existingOrder.customerEmail !== deliveryAddress.email) {
          throw buildHttpError("Idempotency-Key is already in use", 409);
        }
        await connection.commit();
        return {
          orderId: existingOrder.id,
          orderNumber: existingOrder.orderNumber,
          totalAmount: Number(existingOrder.totalAmount),
          subtotalAmount: Number(existingOrder.subtotalAmount),
          taxAmount: Number(existingOrder.taxAmount),
          deliveryFee: Number(existingOrder.deliveryFee),
          status: existingOrder.status,
          isIdempotentReplay: true,
        };
      }
    }

    const menuItemIds = normalizedItems.map((item) => item.menuItemId);
    const menuItems = await orderRepository.findMenuItemsByIds(
      connection,
      menuItemIds
    );

    if (menuItems.length !== menuItemIds.length) {
      throw buildHttpError("Some menu items are invalid or unavailable", 400);
    }

    const menuMap = new Map(menuItems.map((item) => [Number(item.id), item]));

    // Build line items with server-side pricing (client prices are not trusted)
    const orderItems = normalizedItems.map((item) => {
      const dbItem = menuMap.get(item.menuItemId);
      const unitPrice = toNumber(dbItem.pricePaise || dbItem.defaultPricePaise) / 100;
      const lineTotal = unitPrice * item.quantity;

      return {
        menuItemId: item.menuItemId,
        itemName: dbItem.name,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
      };
    });

    // Pricing rules: 5% tax, ₹40 delivery fee unless subtotal ≥ ₹300
    const subtotalAmount = Number(
      orderItems.reduce((acc, item) => acc + item.lineTotal, 0).toFixed(2)
    );
    const taxAmount = Number((subtotalAmount * 0.05).toFixed(2));
    const deliveryFee = subtotalAmount >= 300 ? 0 : 40;
    const totalAmount = Number((subtotalAmount + taxAmount + deliveryFee).toFixed(2));

    const orderNumber = `TWG-${Date.now()}`;

    const orderId = await orderRepository.createOrder(connection, {
      orderNumber,
      idempotencyKey,
      customerName: deliveryAddress.name,
      customerEmail: deliveryAddress.email,
      customerPhone: deliveryAddress.number,
      deliveryAddress: deliveryAddress.address,
      deliveryPincode: deliveryAddress.pincode,
      paymentMethod,
      subtotalAmount,
      taxAmount,
      deliveryFee,
      totalAmount,
      status: "PENDING",
    });

    await orderRepository.createOrderItems(
      connection,
      orderItems.map((item) => ({
        ...item,
        orderId,
      }))
    );

    // Initial payment row — status INITIATED until confirmOrderPayment runs
    await orderRepository.createPayment(connection, {
      orderId,
      provider: "TWIGGY_MOCK_GATEWAY",
      paymentMethod,
      amount: totalAmount,
      status: "INITIATED",
    });
    await orderRepository.createTimelineEvent(connection, {
      orderId,
      status: "PENDING",
    });

    await connection.commit();

    return {
      orderId,
      orderNumber,
      totalAmount,
      subtotalAmount,
      taxAmount,
      deliveryFee,
      status: "PENDING",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Confirm mock payment for an existing order.
 *
 * Updates the payments row and sets order status to PAID or FAILED.
 * Defaults to SUCCESS unless payload.status is explicitly "FAILED".
 *
 * @param {number} orderId
 * @param {object} payload - Payment confirmation body (status, paymentRef, provider)
 * @returns {Promise<object>} Updated order and payment summary
 */
async function confirmOrderPayment(orderId, payload, user) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const order = await orderRepository.findOrderById(connection, orderId, { forUpdate: true });
    if (!order) {
      throw buildHttpError("Order not found", 404);
    }
    assertCanAccessOrder(order, user);

    if (order.status !== "PENDING") {
      throw buildHttpError(`Payment cannot be confirmed while order status is ${order.status}`, 409);
    }

    const paymentStatus = payload?.status === "FAILED" ? "FAILED" : "SUCCESS";
    const orderStatus = paymentStatus === "SUCCESS" ? "PAID" : "FAILED";
    const paymentRef =
      payload?.paymentRef || `PAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const provider = payload?.provider || "TWIGGY_MOCK_GATEWAY";

    await orderRepository.updatePaymentByOrderId(connection, {
      orderId,
      paymentRef,
      provider,
      status: paymentStatus,
    });
    await orderRepository.updateOrderStatus(connection, orderId, orderStatus);
    await orderRepository.createTimelineEvent(connection, {
      orderId,
      status: orderStatus,
    });

    await connection.commit();

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: Number(order.totalAmount),
      paymentRef,
      paymentStatus,
      orderStatus,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


async function getOrdersHistory({ email, page, limit }) {
  const connection = await pool.getConnection();
  try {
    const offset = (page - 1) * limit;
    const orders = await orderRepository.findOrdersByEmail(connection, email, limit, offset);
    const total = await orderRepository.getOrdersCount(connection, email);
    return { orders, total };
  } finally {
    connection.release();
  }
}

async function updateOrderStatus(orderId, status, user) {
  assertStaff(user);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const order = await orderRepository.findOrderById(connection, orderId, { forUpdate: true });
    if (!order) throw buildHttpError("Order not found", 404);
    if (!VALID_STATUS.includes(status) || !ORDER_STATUS_TRANSITIONS[order.status]?.has(status)) {
      throw buildHttpError(`Cannot change order status from ${order.status} to ${status}`, 409);
    }
    await orderRepository.updateOrderStatus(connection, orderId, status);
    await orderRepository.createTimelineEvent(connection, { orderId, status });
    await connection.commit();
    return { ...order, status };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Cancel an order and append a single CANCELLED event to its timeline.
 * Repeating the request is safe and does not duplicate timeline entries.
 */
async function cancelOrder(orderId, user) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const order = await orderRepository.findOrderById(connection, orderId, { forUpdate: true });
    if (!order) {
      throw buildHttpError("Order not found", 404);
    }
    assertCanAccessOrder(order, user);

    if (order.status === "CANCELLED") {
      await connection.commit();
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: "CANCELLED",
        alreadyCancelled: true,
      };
    }

    if (!CANCELLABLE_ORDER_STATUSES.has(order.status)) {
      throw buildHttpError(
        `Order cannot be cancelled while its status is ${order.status}`,
        409
      );
    }

    await orderRepository.updateOrderStatus(connection, orderId, "CANCELLED");
    await orderRepository.createTimelineEvent(connection, {
      orderId,
      status: "CANCELLED",
    });
    await connection.commit();

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: "CANCELLED",
      alreadyCancelled: false,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getOrderTimeline(orderId, user) {
  const connection = await pool.getConnection();
  try {
    const orderTimeline = await orderRepository.findOrderTimeline(connection, orderId);
    if (!orderTimeline) {
      throw buildHttpError("Order not found", 404);
    }
    assertCanAccessOrder(orderTimeline, user);
    return orderTimeline;
  } finally {
    connection.release();
  }
}

async function getOrderDetails(orderId, user) {
  const connection = await pool.getConnection();
  try {
    const order = await orderRepository.findOrderById(connection, orderId);
    if (!order) throw buildHttpError("Order not found", 404);
    assertCanAccessOrder(order, user);
    return await orderRepository.getOrderDetails(connection, orderId);
  } finally {
    connection.release();
  }
}

module.exports = {
  createOrder,
  confirmOrderPayment,
  getOrdersHistory,
  updateOrderStatus,
  cancelOrder,
  getOrderTimeline,
  getOrderDetails
};
