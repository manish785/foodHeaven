import axios from "axios";

import {
  getCancelOrderUrl,
  getConfirmPaymentUrl,
  getCreateOrderUrl,
  getOrderDetailsUrl,
  getOrdersHistoryUrl,
  getOrderTimelineUrl,
  getUpdateOrderStatusUrl,
} from "../utils/constants";
import { getApiAccessToken } from "../utils/sessionAuth";

function authHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

/** Create an order from cart items and delivery address. */
export async function createOrder(payload, idempotencyKey) {
  const token = await getApiAccessToken();
  const response = await axios.post(getCreateOrderUrl(), payload, {
    headers: authHeaders(token, { "Idempotency-Key": idempotencyKey }),
  });

  return response.data?.data;
}

/** Confirm mock payment for a pending order. */
export async function confirmPayment(orderId, payload = {}) {
  const token = await getApiAccessToken();
  const response = await axios.post(getConfirmPaymentUrl(orderId), payload, {
    headers: authHeaders(token),
  });

  return response.data?.data;
}

const PAYMENT_PROVIDERS = {
  card: "TWIGGY_MOCK_GATEWAY",
  paytm: "PAYTM_MOCK",
  cod: "COD",
};

/** Place order and confirm payment in one step (checkout flow). */
export async function placeOrder(payload, idempotencyKey) {
  const order = await createOrder(payload, idempotencyKey);
  const provider =
    PAYMENT_PROVIDERS[payload?.paymentMethod] || PAYMENT_PROVIDERS.card;
  const payment = await confirmPayment(order.orderId, {
    status: "SUCCESS",
    provider,
  });

  return { order, payment };
}

/** Fetch the signed-in customer's paginated order history. */
export async function getOrdersHistory({ page = 1, limit = 10 } = {}) {
  const token = await getApiAccessToken();
  const response = await axios.get(getOrdersHistoryUrl({ page, limit }), {
    headers: authHeaders(token),
  });

  return response.data;
}

/** Fetch full details for a single order. */
export async function getOrderDetails(orderId) {
  const token = await getApiAccessToken();
  const response = await axios.get(getOrderDetailsUrl(orderId), {
    headers: authHeaders(token),
  });

  return response.data?.data;
}

/** Advance order status (staff only). */
export async function updateOrderStatus(orderId, status) {
  const token = await getApiAccessToken();
  const response = await axios.patch(
    getUpdateOrderStatusUrl(orderId),
    { status },
    { headers: authHeaders(token) }
  );

  return response.data?.data;
}

/** Fetch one order and its chronological status timeline in parallel. */
export async function getOrderWithTimeline(orderId) {
  const token = await getApiAccessToken();
  const config = { headers: authHeaders(token) };
  const [detailsResponse, timelineResponse] = await Promise.all([
    axios.get(getOrderDetailsUrl(orderId), config),
    axios.get(getOrderTimelineUrl(orderId), config),
  ]);

  return {
    order: detailsResponse.data?.data,
    timeline: timelineResponse.data?.data,
  };
}

/** Cancel an order that has not yet left for delivery. */
export async function cancelOrder(orderId) {
  const token = await getApiAccessToken();
  const response = await axios.patch(getCancelOrderUrl(orderId), null, {
    headers: authHeaders(token),
  });

  return response.data?.data;
}
