import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";

import { useAuth } from "../../context/AuthContext";
import { successPayment } from "../../redux/CartPage/action";
import { placeOrder } from "../../services/ordersApi";
import appStore from "../../utils/appStore";
import { persistCart } from "../../utils/cartStorage";

const PAYMENT_OPTIONS = [
  { id: "card", label: "Credit / Debit Card", icon: "💳", desc: "Visa, Mastercard, RuPay" },
  { id: "cod", label: "Cash on delivery", icon: "💵", desc: "Pay when order arrives" },
  { id: "paytm", label: "Paytm Wallet", icon: "📱", desc: "Instant wallet payment" },
];

const PaymentPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const [method, setMethod] = useState("card");
  const [isProcessing, setIsProcessing] = useState(false);

  const { itemCount, totalCartPrice, deliveryAddress, data } = useSelector(
    (state) => state.cart
  );

  const goToLogin = () => {
    persistCart(appStore.getState().cart);
    navigate("/login", { state: { returnTo: "/payment" } });
  };

  const handlePayment = async () => {
    if (itemCount === 0) {
      toast.error("Cart is empty");
      return;
    }

    if (
      !deliveryAddress?.name ||
      !deliveryAddress?.email ||
      !deliveryAddress?.number ||
      !deliveryAddress?.address ||
      !deliveryAddress?.pincode
    ) {
      toast.error("Please add delivery address first");
      navigate("/checkout");
      return;
    }

    if (isAuthLoading) {
      toast.error("Checking login status, please try again");
      return;
    }

    if (!isAuthenticated) {
      toast.error("Please login to complete payment");
      goToLogin();
      return;
    }

    try {
      setIsProcessing(true);

      const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { order } = await placeOrder(
        {
          items: data.map((item) => ({
            menuItemId: Number(item.id),
            quantity: Number(item.productQuantity || 1),
          })),
          deliveryAddress: {
            ...deliveryAddress,
            email: user?.email || deliveryAddress.email,
          },
          paymentMethod: method,
        },
        idempotencyKey
      );

      dispatch(successPayment());
      toast.success("Payment successful!");

      navigate(`/payment/confirm?orderId=${order.orderId}`, {
        state: {
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
        },
      });
    } catch (error) {
      if (error?.needsReauth || error?.response?.status === 401) {
        toast.error("Please log in again to complete payment.");
        goToLogin();
        return;
      }

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Payment failed. Please try again.";
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (itemCount === 0) {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="card-surface max-w-md p-8 text-center">
          <p className="text-4xl">🛒</p>
          <h2 className="mt-4 font-display text-xl font-bold text-ink-900">
            Your cart is empty
          </h2>
          <p className="mt-2 text-ink-500">
            Add items from a restaurant, then checkout and return here to pay.
          </p>
          <Link to="/" className="btn-primary mt-6 inline-block">
            Browse restaurants
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-container py-10">
        <Link
          to="/checkout"
          className="mb-6 inline-flex text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          ← Edit address
        </Link>

        <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
          Step 3 of 3
        </p>
        <h1 className="section-title mt-1">Payment</h1>

        {!isAuthLoading && isAuthenticated && user && (
          <p className="mt-2 text-sm text-ink-500">
            Logged in as {user.email || user.name}
          </p>
        )}

        {!isAuthLoading && !isAuthenticated && (
          <p className="mt-2 text-sm text-amber-700">
            Sign in with your name and email to place your order.
          </p>
        )}

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            {PAYMENT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMethod(option.id)}
                className={`card-surface flex w-full items-center gap-4 p-5 text-left transition ${
                  method === option.id
                    ? "border-brand-500 ring-2 ring-brand-500/20"
                    : "hover:border-brand-200"
                }`}
              >
                <span className="text-3xl">{option.icon}</span>
                <div>
                  <p className="font-semibold text-ink-900">{option.label}</p>
                  <p className="text-sm text-ink-500">{option.desc}</p>
                </div>
                {method === option.id && (
                  <span className="ml-auto text-brand-500">✓</span>
                )}
              </button>
            ))}

            {!isAuthLoading && !isAuthenticated ? (
              <button
                type="button"
                onClick={goToLogin}
                className="btn-primary mt-4 w-full !py-4 text-base"
              >
                Login to pay ₹{totalCartPrice}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePayment}
                disabled={isProcessing || isAuthLoading}
                className="btn-primary mt-4 w-full !py-4 text-base"
              >
                {isAuthLoading
                  ? "Checking session..."
                  : isProcessing
                    ? "Processing payment..."
                    : `Pay ₹${totalCartPrice}`}
              </button>
            )}
          </div>

          <aside className="card-surface order-first h-fit p-6 lg:order-none lg:col-span-2">
            <h2 className="font-display text-lg font-bold text-ink-900">
              Order summary
            </h2>
            <p className="mt-1 text-sm text-ink-500">{itemCount} items</p>

            <ul className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-sm text-ink-600">
              {data.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span>
                    {item.name} × {item.productQuantity}
                  </span>
                  <span className="font-medium text-ink-800">
                    ₹{item.price * item.productQuantity}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 space-y-2 border-t border-ink-100 pt-4 text-sm">
              <p className="font-semibold text-ink-800">Deliver to</p>
              <p className="text-ink-600">{deliveryAddress?.name}</p>
              <p className="text-ink-600">{deliveryAddress?.address}</p>
              <p className="text-ink-600">
                {deliveryAddress?.pincode} · {deliveryAddress?.number}
              </p>
            </div>

            <div className="mt-6 flex justify-between border-t border-ink-100 pt-4 text-xl font-bold">
              <span>Total</span>
              <span className="text-brand-600">₹{totalCartPrice}</span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;
