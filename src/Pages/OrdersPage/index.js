import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { useAuth } from "../../context/AuthContext";
import PageLoader from "../../components/ui/PageLoader";
import { getOrdersHistory } from "../../services/ordersApi";

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

function formatAmount(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

const OrdersPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    setIsFetching(true);
    setError("");
    try {
      const result = await getOrdersHistory({ page, limit: 10 });
      setOrders(result.data || []);
      setPagination(result.pagination || null);
    } catch (requestError) {
      if (requestError?.needsReauth || requestError?.response?.status === 401) {
        toast.error("Please log in to view your orders.");
        navigate("/login", { state: { returnTo: "/orders" }, replace: true });
        return;
      }
      setError(requestError?.response?.data?.message || "Unable to load your orders.");
    } finally {
      setIsFetching(false);
    }
  }, [navigate, page]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login", {
        state: { returnTo: location.pathname },
        replace: true,
      });
      return;
    }

    if (isAuthenticated) loadOrders();
  }, [isAuthenticated, isLoading, loadOrders, location.pathname, navigate]);

  if (isLoading || (!isAuthenticated && !error)) {
    return <PageLoader label="Loading your orders..." />;
  }

  return (
    <div className="page-shell">
      <div className="page-container max-w-4xl py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Your account</p>
            <h1 className="section-title mt-1">Order history</h1>
            <p className="section-subtitle">Review the orders you have placed with FoodHeaven.</p>
          </div>
          <Link to="/" className="btn-secondary">Order again</Link>
        </div>

        {isFetching ? (
          <PageLoader label="Loading orders..." />
        ) : error ? (
          <div className="card-surface mt-8 p-8 text-center">
            <p className="font-semibold text-red-600">{error}</p>
            <button type="button" className="btn-primary mt-5" onClick={loadOrders}>Try again</button>
          </div>
        ) : orders.length === 0 ? (
          <div className="card-surface mt-8 p-10 text-center">
            <p className="text-5xl">🍽️</p>
            <h2 className="mt-4 font-display text-2xl font-bold text-ink-900">No orders yet</h2>
            <p className="mt-2 text-ink-500">Your completed orders will appear here.</p>
            <Link to="/" className="btn-primary mt-6 inline-flex">Browse restaurants</Link>
          </div>
        ) : (
          <>
            <ul className="mt-8 space-y-4">
              {orders.map((order) => {
                const status = order.status || "PENDING";
                return (
                  <li key={order.id} className="card-surface flex flex-col gap-4 p-5 transition hover:border-brand-200 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-display text-lg font-bold text-ink-900">
                        {order.orderNumber || `Order #${order.id}`}
                      </p>
                      <p className="mt-1 text-sm text-ink-500">Placed {formatDate(order.created_at || order.createdAt)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[status] || "bg-ink-100 text-ink-700"}`}>
                        {status.replaceAll("_", " ")}
                      </span>
                      <p className="text-lg font-bold text-brand-600">{formatAmount(order.total_amount || order.totalAmount)}</p>
                      <Link to={`/orders/${order.id}`} className="text-sm font-semibold text-brand-600 hover:text-brand-700">View →</Link>
                    </div>
                  </li>
                );
              })}
            </ul>

            {pagination && (
              <div className="mt-8 flex items-center justify-between">
                <button type="button" className="btn-secondary" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>← Previous</button>
                <p className="text-sm text-ink-500">Page {pagination.page} · {pagination.totalOrders} orders</p>
                <button type="button" className="btn-secondary" disabled={!pagination.hasNext} onClick={() => setPage((current) => current + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OrdersPage;
