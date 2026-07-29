export const CDN_URL =
  "https://media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_660/";

export const MENU_ITEM_URL =
  "https://res.cloudinary.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_208,h_208,c_fit/";

export const BG_URL =
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRdpaeAl1DBJ6LEXy8b2GMdt3fgTfY9NcQHbbgNCauOaA&s";

const LOCAL_API_BASE = "http://localhost:5000/api/v1";
const PRODUCTION_API_BASE = "https://foodheaven-api.onrender.com/api/v1";

function resolveApiBaseUrl() {
  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    const isLocal =
      hostname === "localhost" || hostname === "127.0.0.1";

    if (!isLocal) {
      return PRODUCTION_API_BASE;
    }
  }

  const fromEnv = process.env.REACT_APP_API_BASE_URL;
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_API_BASE;
  }

  return LOCAL_API_BASE;
}

export function getApiBaseUrl() {
  return resolveApiBaseUrl();
}

export const API_BASE_URL = resolveApiBaseUrl();

export function getRestaurantsUrl() {
  return `${getApiBaseUrl()}/restaurants`;
}

export function getRestaurantMenuUrl(restaurantId) {
  return `${getApiBaseUrl()}/restaurants/${restaurantId}/menu`;
}

export function getLoginUrl() {
  return `${getApiBaseUrl()}/auth/login`;
}

export function getCreateOrderUrl() {
  return `${getApiBaseUrl()}/orders`;
}

export function getConfirmPaymentUrl(orderId) {
  return `${getApiBaseUrl()}/orders/${orderId}/payments`;
}

export function getOrdersHistoryUrl({ page = 1, limit = 10 } = {}) {
  return `${getApiBaseUrl()}/orders/history?page=${page}&limit=${limit}`;
}

export function getOrderDetailsUrl(orderId) {
  return `${getApiBaseUrl()}/orders/${orderId}`;
}

export function getOrderTimelineUrl(orderId) {
  return `${getApiBaseUrl()}/orders/${orderId}/timeline`;
}

export function getCancelOrderUrl(orderId) {
  return `${getApiBaseUrl()}/orders/${orderId}/cancel`;
}

export function getUpdateOrderStatusUrl(orderId) {
  return `${getApiBaseUrl()}/orders/${orderId}/status`;
}

export function getDevTokenUrl() {
  return `${getApiBaseUrl()}/auth/dev-token`;
}

export const GROCERY_URL =
  "https://cdn.dribbble.com/users/90631/screenshots/16812389/media/7afe0c556ede3387b72f21fe5cc60a57.png";

export const FOOD_PLACEHOLDER =
  "https://via.placeholder.com/160?text=Food+Item";
