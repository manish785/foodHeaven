import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import PageLoader from "../../../components/ui/PageLoader";
import { getOrderDetails } from "../../../services/ordersApi";

const field = (object, camel, snake) => object?.[camel] ?? object?.[snake];

const PaymentConfirm = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const orderId = location?.state?.orderId || searchParams.get("orderId");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(orderId));

  const orderNumber =
    location?.state?.orderNumber ||
    field(order, "orderNumber", "order_number");
  const totalAmount =
    location?.state?.totalAmount ??
    field(order, "totalAmount", "total_amount");

  useEffect(() => {
    if (!orderId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadOrder() {
      setIsLoading(true);
      setError("");
      try {
        const details = await getOrderDetails(orderId);
        if (!cancelled) setOrder(details);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError?.response?.data?.message ||
              "Unable to load order confirmation."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadOrder();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (isLoading) {
    return <PageLoader label="Loading confirmation..." />;
  }

  return (
    <div className="page-shell flex items-center justify-center py-16">
      <div className="card-surface max-w-md p-10 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">
          ✓
        </div>

        <h1 className="mt-6 font-display text-2xl font-bold text-ink-900">
          Order placed!
        </h1>
        <p className="mt-2 text-ink-500">
          Your food is on the way. Thanks for ordering with FoodHeaven.
        </p>

        {error && (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </p>
        )}

        {orderNumber && (
          <p className="mt-6 rounded-xl bg-ink-50 px-4 py-3 text-sm font-medium text-ink-700">
            Order ID: <span className="text-brand-600">{orderNumber}</span>
          </p>
        )}
        {totalAmount != null && (
          <p className="mt-2 text-lg font-bold text-ink-900">
            Paid ₹{Number(totalAmount).toFixed(2)}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {orderId && (
            <Link to={`/orders/${orderId}`} className="btn-primary inline-flex">
              Track order
            </Link>
          )}
          <Link to="/orders" className="btn-secondary inline-flex">
            View all orders
          </Link>
          <Link to="/" className="btn-secondary inline-flex">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PaymentConfirm;
