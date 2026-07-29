/**
 * Order controller — thin HTTP adapter between Express and order.service.
 *
 * Responsibilities:
 * - Parse request input (body, params, headers)
 * - Delegate to order.service
 * - Shape JSON responses with consistent `{ success, message, data }` shape
 *
 * Does NOT contain business rules, pricing, or database access.
 * Validation of body shape runs in middleware (order.validator.js) before these handlers.
 *
 * Routes (see routes/v1/order.routes.js):
 * - POST /api/v1/orders              → createOrder
 * - POST /api/v1/orders/:orderId/payments → confirmPayment
 */

const orderService = require("../services/order.service");

/**
 * POST /api/v1/orders
 *
 * Creates an order from the checkout payload. Merges the optional
 * `Idempotency-Key` header into the service payload so duplicate
 * submissions return the same order instead of creating a new one.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function createOrder(req, res) {
  const order = await orderService.createOrder({
    ...req.body,
    // An order is always owned by the authenticated user, never a body-supplied email.
    deliveryAddress: { ...req.body.deliveryAddress, email: req.user.email },
    idempotencyKey: req.headers["idempotency-key"],
  });

  return res.status(201).json({
    success: true,
    message: "Order created successfully",
    data: order,
  });
}

/**
 * POST /api/v1/orders/:orderId/payments
 *
 * Confirms mock payment for an existing order. Validates that :orderId
 * is a positive integer before calling the service (route param is not
 * covered by Joi body validation).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function confirmPayment(req, res) {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "orderId must be a valid positive number",
    });
  }

  const paymentResult = await orderService.confirmOrderPayment(orderId, req.body, req.user);

  return res.status(200).json({
    success: true,
    message: "Payment status updated",
    data: paymentResult,
  });
}


// controllers/orderController.js

async function getOrdersHistory(req, res) {
  const email = req.user.email;

  if (!email) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const result = await orderService.getOrdersHistory({
    email,
    page,
    limit,
  });

  return res.status(200).json({
    success: true,
    message: "Order history fetched successfully",
    data: result.orders,
    pagination: {
      page,
      limit,
      totalOrders: result.total,
      hasNext: page * limit < result.total,
    },
  });
}

async function updateOrderStatus(req, res) {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ success: false, message: "orderId must be a valid positive number" });
  }

  const order = await orderService.updateOrderStatus(orderId, req.body.status, req.user);
  return res.status(200).json({
    success: true,
    message: "Order status updated successfully",
    data: order,
  });
}

async function orderDetails(req, res) {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ success: false, message: "orderId must be a valid positive number" });
  }

  const orderDetails = await orderService.getOrderDetails(orderId, req.user);
  return res.status(200).json({
    success: true,
    message: "Order details fetched successfully",
    data: orderDetails,
  });
}

async function getOrderTimeline(req, res) {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "id must be a valid positive number",
    });
  }

  const orderTimeline = await orderService.getOrderTimeline(orderId, req.user);
  return res.status(200).json({
    success: true,
    message: "Order timeline fetched successfully",
    data: orderTimeline,
  });
}

async function cancelOrder(req, res) {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "id must be a valid positive number",
    });
  }

  const order = await orderService.cancelOrder(orderId, req.user);
  return res.status(200).json({
    success: true,
    message: order.alreadyCancelled
      ? "Order is already cancelled"
      : "Order cancelled successfully",
    data: order,
  });
}

module.exports = {
  createOrder,
  confirmPayment,
  getOrdersHistory,
  updateOrderStatus,
  cancelOrder,
  getOrderTimeline,
  orderDetails
};
