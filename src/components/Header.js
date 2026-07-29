/*
|--------------------------------------------------------------------------
| Header Component
|--------------------------------------------------------------------------
|
| Purpose
| -------
| The Header is the application's global navigation bar.
|
| Responsibilities
| ----------------
| • Display the application logo.
| • Render navigation links.
| • Show current cart item count.
| • Display user's authentication state.
| • Handle Login / Logout.
| • Show Online / Offline status.
| • Render responsive mobile navigation.
| • Display toast notifications.
| • Prevent background scrolling while mobile menu is open.
|
| Architecture
|
|                Header
|                   │
|        ┌──────────┼───────────┐
|        ▼          ▼           ▼
|      Logo      Navigation   User Actions
|                                 │
|                     ┌───────────┼────────────┐
|                     ▼           ▼            ▼
|                  Cart       Authentication  Mobile Menu
|
|--------------------------------------------------------------------------
*/

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";

import { useAuth } from "../context/AuthContext";
import BrandLogo from "./BrandLogo";
import useOnlineStatus from "../utils/useOnlineStatus";

/* --------------------------------------------------------------------------
   Utility function used by desktop navigation links.

   NavLink automatically provides `isActive`.
   When active, an additional CSS class is applied to highlight
   the current page.
---------------------------------------------------------------------------*/
const navClass = ({ isActive }) =>
  `nav-link ${isActive ? "nav-link-active" : ""}`;

/* --------------------------------------------------------------------------
   Navigation configuration.

   Keeping routes in a single array allows the navigation
   to be rendered dynamically instead of duplicating JSX.
---------------------------------------------------------------------------*/
const NAV_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/grocery", label: "Grocery" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

const Header = () => {
  /* ----------------------------------------------------------------------
     React Router
  ---------------------------------------------------------------------- */

  // Navigate programmatically.
  const navigate = useNavigate();

  // Current URL information.
  const location = useLocation();

  /* ----------------------------------------------------------------------
     Authentication Context
  ---------------------------------------------------------------------- */

  /*
   * Provides:
   * - Current authenticated user
   * - Authentication state
   * - Logout method
   * - Loading state
   */
  const { logout, isAuthenticated, isLoading, user } = useAuth();

  /* ----------------------------------------------------------------------
     Redux
  ---------------------------------------------------------------------- */

  // Current number of items inside the shopping cart.
  const { itemCount } = useSelector((state) => state.cart);

  /* ----------------------------------------------------------------------
     Custom Hooks
  ---------------------------------------------------------------------- */

  // Detect browser online/offline status.
  const onlineStatus = useOnlineStatus();

  /* ----------------------------------------------------------------------
     Local Component State
  ---------------------------------------------------------------------- */

  // Controls visibility of the mobile navigation drawer.
  const [menuOpen, setMenuOpen] = useState(false);

  // Stores previous authentication state to avoid duplicate welcome toasts.
  const wasAuthenticatedRef = useRef(false);

  /* ----------------------------------------------------------------------
     Show a welcome toast only when authentication changes from
     logged out → logged in.
  ---------------------------------------------------------------------- */
  useEffect(() => {
    if (isAuthenticated && !wasAuthenticatedRef.current) {
      toast.success("Welcome back!");
    }

    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  /* ----------------------------------------------------------------------
     Helper Functions
  ---------------------------------------------------------------------- */

  // Close mobile navigation.
  const closeMenu = () => setMenuOpen(false);

  /*
   * Redirect user to Login page while remembering
   * the page they originally intended to visit.
   */
  const handleLogin = () => {
    closeMenu();

    const returnTo = location.pathname + location.search || "/";

    navigate("/login", {
      state: {
        returnTo,
      },
    });
  };

  /*
   * Logout the user.
   *
   * If logout occurs during payment flow,
   * redirect back to the home page.
   */
  const handleLogout = () => {
    closeMenu();

    logout();

    toast.success("Logged out");

    if (location.pathname.startsWith("/payment")) {
      navigate("/");
    }
  };

  /* ----------------------------------------------------------------------
     Prevent body scrolling while mobile navigation is open.
  ---------------------------------------------------------------------- */
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-100 bg-white/90 backdrop-blur-md">
      <div className="page-container flex items-center justify-between gap-3 py-3 sm:gap-4">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 sm:gap-3"
          onClick={closeMenu}
        >
          <BrandLogo size="md" />
          <div className="hidden min-[400px]:block">
            <p className="font-display text-lg font-bold tracking-tight text-ink-900 sm:text-xl">
              FoodHeaven
            </p>
            <p className="hidden text-xs text-ink-500 sm:block">Food delivered fast</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={navClass}
            >
              {link.label}
            </NavLink>
          ))}
          {isAuthenticated && (
            <NavLink to="/orders" className={navClass}>
              Orders
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className={`hidden rounded-full px-2.5 py-1 text-xs font-medium md:inline-flex ${
              onlineStatus
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {onlineStatus ? "● Online" : "● Offline"}
          </span>

          <Link
            to="/cart"
            className="relative flex items-center gap-1.5 rounded-xl border border-ink-200 bg-ink-50 px-2.5 py-2 text-sm font-semibold text-ink-800 transition hover:border-brand-300 hover:bg-brand-50 sm:gap-2 sm:px-3"
            onClick={closeMenu}
          >
            <span aria-hidden>🛒</span>
            <span className="hidden sm:inline">Cart</span>
            {itemCount > 0 && (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-bold text-white">
                {itemCount}
              </span>
            )}
          </Link>

          {isAuthenticated ? (
            <button
              type="button"
              className="btn-secondary inline-flex !px-3 !py-2 text-sm text-red-600 hover:border-red-200 hover:bg-red-50 md:!px-4"
              onClick={handleLogout}
            >
              Logout
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary inline-flex !px-3 !py-2 text-sm md:!px-4"
              onClick={handleLogin}
              disabled={isLoading}
            >
              Login
            </button>
          )}

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ink-200 bg-white text-xl lg:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-ink-900/50 lg:hidden"
            aria-label="Close menu overlay"
            onClick={closeMenu}
          />
          <nav
            className="fixed inset-x-0 top-[65px] z-50 max-h-[calc(100vh-65px)] overflow-y-auto border-b border-ink-100 bg-white p-4 shadow-lg lg:hidden"
            aria-label="Mobile navigation"
          >
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `rounded-xl px-4 py-3 text-base font-medium ${
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-ink-700 hover:bg-ink-50"
                    }`
                  }
                  onClick={closeMenu}
                >
                  {link.label}
                </NavLink>
              ))}
              {isAuthenticated && (
                <NavLink
                  to="/orders"
                  className={({ isActive }) =>
                    `rounded-xl px-4 py-3 text-base font-medium ${
                      isActive ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-ink-50"
                    }`
                  }
                  onClick={closeMenu}
                >
                  Orders
                </NavLink>
              )}
            </div>

            <div className="mt-4 border-t border-ink-100 pt-4">
              {isAuthenticated ? (
                <>
                  <p className="mb-3 px-4 text-sm font-medium text-ink-600">
                    Hi, {user?.name || user?.email}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary w-full text-red-600"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-primary w-full"
                  onClick={handleLogin}
                >
                  Login
                </button>
              )}
            </div>
          </nav>
        </>
      )}
    </header>
  );
};

export default Header;
