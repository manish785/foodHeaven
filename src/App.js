/*
|--------------------------------------------------------------------------
| Application Entry Point
|--------------------------------------------------------------------------
|
| Responsibilities:
| 1. Bootstraps the React application.
| 2. Configures global providers (Authentication & Redux).
| 3. Defines application routing.
| 4. Enables lazy loading for large pages.
| 5. Provides a shared application layout.
| 6. Mounts the application into the DOM.
|
| Flow:
|
| Browser
|    ↓
| ReactDOM
|    ↓
| RouterProvider
|    ↓
| AuthProvider
|    ↓
| Redux Provider
|    ↓
| AppShell
|      ├── Header
|      ├── Main (Outlet)
|      └── Footer
|
|--------------------------------------------------------------------------
*/

import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import { Provider } from "react-redux";
import { Toaster } from "react-hot-toast";

/* ------------------------------
   Global Providers
   ------------------------------ */

/*
 * Provides authentication state and helper methods
 * (login, logout, current user, etc.) throughout the app.
 */
import { AuthProvider } from "./context/AuthContext";

/*
 * Redux store shared by the entire application.
 */
import appStore from "./utils/appStore";

/* ------------------------------
   Shared Layout Components
   ------------------------------ */

/*
 * Displayed on every page.
 */
import Header from "./components/Header";
import Footer from "./components/Footer";

/* ------------------------------
   Route Components
   ------------------------------ */

import Body from "./components/Body";
import Contact from "./components/Contact";
import Error from "./components/Error";
import Cart from "./components/Cart";
import Checkout from "./components/Checkout";
import RestaurantMenu from "./components/RestaurantMenu";
import Login from "./components/Login";
import PaymentPage from "./Pages/PaymentPage";
import PaymentConfirm from "./Pages/PaymentPage/components/PaymentConfirm";
import OrdersPage from "./Pages/OrdersPage";
import OrderDetailsPage from "./Pages/OrderDetailsPage";

/*
 * Loading indicator shown while lazy-loaded pages are downloading.
 */
import PageLoader from "./components/ui/PageLoader";

/* --------------------------------------------------------------------------
   Lazy Loaded Pages

   These pages are downloaded only when the user navigates to them,
   reducing the initial JavaScript bundle size.
-------------------------------------------------------------------------- */

const Grocery = lazy(() => import("./components/Grocery"));
const About = lazy(() => import("./components/About"));

/* --------------------------------------------------------------------------
   AppShell

   Shared application layout rendered for every route.

   Structure:

   Header
      ↓
   Main Content (Outlet)
      ↓
   Footer

   The <Outlet /> renders the matched child route while keeping
   Header and Footer persistent across navigation.
-------------------------------------------------------------------------- */

const AppShell = () => (
  <div className="flex min-h-screen flex-col bg-ink-50">

    {/* Global toast notification container */}
    <Toaster
      position="bottom-right"
      toastOptions={{
        className: "!rounded-xl !font-medium !shadow-card",
        success: {
          iconTheme: {
            primary: "#f97316",
            secondary: "#fff",
          },
        },
      }}
    />

    {/* Shared header */}
    <Header />

    {/* Dynamic page content */}
    <main className="flex-1">
      <Outlet />
    </main>

    {/* Shared footer */}
    <Footer />
  </div>
);

/* --------------------------------------------------------------------------
   Reusable fallback shown while lazy-loaded components are downloading.
-------------------------------------------------------------------------- */

const LazyFallback = () => <PageLoader />;

/* --------------------------------------------------------------------------
   Application Routing

   Root Route
   ├── Authentication Provider
   ├── Redux Provider
   └── Shared AppShell

   Child Routes are rendered inside <Outlet />.
-------------------------------------------------------------------------- */

const appRouter = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <Provider store={appStore}>
          <AppShell />
        </Provider>
      </AuthProvider>
    ),

    /*
     * Rendered whenever routing fails or a matching route
     * cannot be found.
     */
    errorElement: <Error />,

    children: [

      /* Home Page */
      {
        path: "/",
        element: <Body />,
      },

      /* About Page (Lazy Loaded) */
      {
        path: "/about",
        element: (
          <Suspense fallback={<LazyFallback />}>
            <About />
          </Suspense>
        ),
      },

      /* Contact Page */
      {
        path: "/contact",
        element: <Contact />,
      },

      /* Shopping Cart */
      {
        path: "/cart",
        element: <Cart />,
      },

      /* Checkout Page */
      {
        path: "/checkout",
        element: <Checkout />,
      },

      /* Payment Page */
      {
        path: "/payment",
        element: <PaymentPage />,
      },

      /* Payment Confirmation */
      {
        path: "/payment/confirm",
        element: <PaymentConfirm />,
      },

      /* Customer order history */
      {
        path: "/orders",
        element: <OrdersPage />,
      },
      {
        path: "/orders/:orderId",
        element: <OrderDetailsPage />,
      },

      /* Grocery Module (Lazy Loaded) */
      {
        path: "/grocery",
        element: (
          <Suspense fallback={<LazyFallback />}>
            <Grocery />
          </Suspense>
        ),
      },

      /*
       * Dynamic Restaurant Route
       * Example:
       * /restaurants/101
       * /restaurants/56
       */
      {
        path: "/restaurants/:resId",
        element: <RestaurantMenu />,
      },

      /* Login Page */
      {
        path: "/login",
        element: <Login />,
      },
    ],
  },
]);

/* --------------------------------------------------------------------------
   Bootstrap React Application

   Finds the HTML element with id="root",
   creates the React root,
   and renders the router.
-------------------------------------------------------------------------- */

ReactDOM.createRoot(document.getElementById("root")).render(
  <RouterProvider router={appRouter} />
);
