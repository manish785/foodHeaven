import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import PageLoader from "../../components/ui/PageLoader";
import { useAuth } from "../../context/AuthContext";
import { cancelOrder, getOrderWithTimeline, updateOrderStatus } from "../../services/ordersApi";

const STATUS_STYLES = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-sky-50 text-sky-700",
  ACCEPTED: "bg-sky-50 text-sky-700",
  PREPARING: "bg-violet-50 text-violet-700",
  READY: "bg-violet-50 text-violet-700",
  PICKED_UP: "bg-blue-50 text-blue-700",
  OUT_FOR_DELIVERY: "bg-blue-50 text-blue-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
  FAILED: "bg-red-50 text-red-700",
};

const CANCELLABLE_STATUSES = new Set([
  "PENDING",
  "PAID",
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
]);

const STAFF_NEXT_STATUSES = {
  PAID: ["ACCEPTED"],
  ACCEPTED: ["PREPARING"],
  PREPARING: ["READY"],
  READY: ["PICKED_UP"],
  PICKED_UP: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
};

const TERMINAL_STATUSES = new Set(["DELIVERED", "CANCELLED", "FAILED"]);

const amount = (value) => `₹${Number(value || 0).toFixed(2)}`;
const dateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
};
const field = (object, camel, snake) => object?.[camel] ?? object?.[snake];

const OrderDetailsPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, isStaff } = useAuth();
  const [order, setOrder] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [error, setError] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const loadOrder = useCallback(async () => {
    setIsFetching(true);
    setError("");
    try {
      const result = await getOrderWithTimeline(orderId);
      setOrder(result.order);
      setTimeline(result.timeline);
    } catch (requestError) {
      if (requestError?.needsReauth || requestError?.response?.status === 401) {
        toast.error("Please log in to view this order.");
        navigate("/login", { state: { returnTo: `/orders/${orderId}` }, replace: true });
        return;
      }
      setError(requestError?.response?.data?.message || "Unable to load this order.");
    } finally {
      setIsFetching(false);
    }
  }, [navigate, orderId]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login", { state: { returnTo: location.pathname }, replace: true });
      return;
    }
    if (isAuthenticated) loadOrder();
  }, [isAuthenticated, isLoading, loadOrder, location.pathname, navigate]);

  useEffect(() => {
    if (!isAuthenticated || !orderId) return undefined;

    const status = timeline?.currentStatus || field(order, "status", "status");
    if (TERMINAL_STATUSES.has(status)) return undefined;

    const intervalId = window.setInterval(() => {
      loadOrder();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [isAuthenticated, loadOrder, order, orderId, timeline?.currentStatus]);

  const handleStatusUpdate = async (nextStatus) => {
    setIsUpdatingStatus(true);
    try {
      await updateOrderStatus(orderId, nextStatus);
      toast.success(`Order marked as ${nextStatus.replaceAll("_", " ").toLowerCase()}.`);
      await loadOrder();
    } catch (requestError) {
      toast.error(requestError?.response?.data?.message || "Unable to update order status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("Cancel this order?")) return;

    setIsCancelling(true);
    try {
      await cancelOrder(orderId);
      toast.success("Order cancelled.");
      await loadOrder();
    } catch (requestError) {
      toast.error(requestError?.response?.data?.message || "Unable to cancel this order.");
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading || (!isAuthenticated && !error) || isFetching) {
    return <PageLoader label="Loading order..." />;
  }

  if (error) {
    return (
      <div className="page-shell">
        <div className="page-container max-w-2xl py-10">
          <Link to="/orders" className="text-sm font-medium text-brand-600">
            ← All orders
          </Link>
          <div className="card-surface mt-6 p-8 text-center">
            <p className="font-semibold text-red-600">{error}</p>
            <button type="button" className="btn-primary mt-5" onClick={loadOrder}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const status = timeline?.currentStatus || field(order, "status", "status") || "PENDING";
  const address = field(order, "deliveryAddress", "delivery_address");
  const pincode = field(order, "deliveryPincode", "delivery_pincode");
  const orderNumber = field(order, "orderNumber", "order_number") || orderId;
  const total = field(order, "totalAmount", "total_amount");
  const events = timeline?.timeline || [];
  const items = order?.items || [];
  const canCancel = CANCELLABLE_STATUSES.has(status);
  const staffNextStatuses = STAFF_NEXT_STATUSES[status] || [];

  return (
    <div className="page-shell">
      <div className="page-container max-w-4xl py-10">
        <Link to="/orders" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          ← All orders
        </Link>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              Order details
            </p>
            <h1 className="section-title mt-1">Order #{orderNumber}</h1>
            <p className="mt-1 text-sm text-ink-500">
              Placed {dateTime(field(order, "createdAt", "created_at"))}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                STATUS_STYLES[status] || "bg-ink-100 text-ink-700"
              }`}
            >
              {status.replaceAll("_", " ")}
            </span>
            {canCancel && (
              <button
                type="button"
                className="btn-secondary text-red-600 hover:border-red-200 hover:bg-red-50"
                disabled={isCancelling}
                onClick={handleCancel}
              >
                {isCancelling ? "Cancelling..." : "Cancel order"}
              </button>
            )}
            {isStaff && staffNextStatuses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {staffNextStatuses.map((nextStatus) => (
                  <button
                    key={nextStatus}
                    type="button"
                    className="btn-primary !py-2 text-xs"
                    disabled={isUpdatingStatus}
                    onClick={() => handleStatusUpdate(nextStatus)}
                  >
                    Mark {nextStatus.replaceAll("_", " ").toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <section className="card-surface p-6 lg:col-span-3">
            <h2 className="font-display text-xl font-bold text-ink-900">Items ordered</h2>
            {items.length === 0 ? (
              <p className="mt-4 text-sm text-ink-500">No line items found.</p>
            ) : (
              <ul className="mt-5 divide-y divide-ink-100">
                {items.map((item) => (
                  <li
                    key={`${item.menuItemId}-${item.itemName}`}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-ink-900">
                        {field(item, "itemName", "item_name")}
                      </p>
                      <p className="text-ink-500">
                        {amount(field(item, "unitPrice", "unit_price"))} × {item.quantity}
                      </p>
                    </div>
                    <p className="font-bold text-ink-900">
                      {amount(field(item, "lineTotal", "line_total"))}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="mt-8 font-display text-xl font-bold text-ink-900">Delivery details</h2>
            <div className="mt-5 space-y-2 text-sm text-ink-600">
              <p className="font-semibold text-ink-900">
                {field(order, "customerName", "customer_name")}
              </p>
              <p>{address}</p>
              <p>{pincode}</p>
              <p>{field(order, "customerPhone", "customer_phone")}</p>
            </div>

            <div className="mt-6 border-t border-ink-100 pt-5">
              <div className="flex justify-between text-sm text-ink-600">
                <span>Subtotal</span>
                <span>{amount(field(order, "subtotalAmount", "subtotal_amount"))}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm text-ink-600">
                <span>Tax</span>
                <span>{amount(field(order, "taxAmount", "tax_amount"))}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm text-ink-600">
                <span>Delivery fee</span>
                <span>{amount(field(order, "deliveryFee", "delivery_fee"))}</span>
              </div>
              <div className="mt-4 flex justify-between text-lg font-bold text-ink-900">
                <span>Total paid</span>
                <span className="text-brand-600">{amount(total)}</span>
              </div>
            </div>
          </section>

          <section className="card-surface p-6 lg:col-span-2">
            <h2 className="font-display text-xl font-bold text-ink-900">Order timeline</h2>
            {events.length === 0 ? (
              <p className="mt-4 text-sm text-ink-500">No status events yet.</p>
            ) : (
              <ol className="mt-5 space-y-5 border-l-2 border-brand-100 pl-5">
                {events.map((event, index) => (
                  <li key={`${event.status}-${event.occurredAt}-${index}`} className="relative">
                    <span className="absolute -left-[1.9rem] top-1 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                    <p className="text-sm font-semibold text-ink-900">
                      {event.status.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      {dateTime(event.occurredAt || event.occurred_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailsPage;
