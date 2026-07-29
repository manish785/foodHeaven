/*
|--------------------------------------------------------------------------
| Authentication Context
|--------------------------------------------------------------------------
|
| Purpose
| -------
| Provides a global authentication system for the application.
|
| Responsibilities
| ----------------
| • Manage authenticated user state.
| • Persist login session using Session Storage.
| • Restore authentication after page refresh.
| • Expose login and logout methods.
| • Expose authentication status to all components.
| • Prevent prop drilling by using React Context.
|
| Architecture
|
|                AuthProvider
|                     │
|        ┌────────────┴─────────────┐
|        ▼                          ▼
|   Session Storage          React State
|        │                          │
|        └────────────┬─────────────┘
|                     ▼
|              AuthContext Provider
|                     │
|      ┌──────────────┼───────────────┐
|      ▼              ▼               ▼
|   Header         Checkout       Restaurant
|      ▼
|   useAuth()
|
|--------------------------------------------------------------------------
*/

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { login as loginApi } from "../services/authApi";
import {
  clearSessionToken,
  decodeJwtPayload,
  getStoredSessionToken,
  getStoredUserRole,
  isStaffRole,
  persistSessionToken,
} from "../utils/sessionAuth";

/* --------------------------------------------------------------------------
   Session Storage Key

   Stores authenticated user information for the duration
   of the browser session.
---------------------------------------------------------------------------*/
const USER_STORAGE_KEY = "foodheaven_user";

/* --------------------------------------------------------------------------
   Authentication Context

   Initially null.
   AuthProvider supplies the actual authentication value.
---------------------------------------------------------------------------*/
const AuthContext = createContext(null);

/* --------------------------------------------------------------------------
   Session Storage Helpers
---------------------------------------------------------------------------*/

/**
 * Loads the authenticated user from Session Storage.
 *
 * Returns:
 *  - User object if available.
 *  - null if no user exists or parsing fails.
 */
function loadStoredUser() {
  try {
    const raw = sessionStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persists the authenticated user in Session Storage.
 */
function saveUser(user) {
  sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

/**
 * Removes the authenticated user from Session Storage.
 */
function clearUser() {
  sessionStorage.removeItem(USER_STORAGE_KEY);
}

/* --------------------------------------------------------------------------
   AuthProvider

   Wraps the application and provides authentication
   state and actions to all descendant components.
---------------------------------------------------------------------------*/
export function AuthProvider({ children }) {
  /* ----------------------------------------------------------------------
     Local Authentication State
  ---------------------------------------------------------------------- */

  // Current authenticated user.
  const [user, setUser] = useState(null);

  // Indicates whether the initial session restoration is in progress.
  const [isLoading, setIsLoading] = useState(true);

  /* ----------------------------------------------------------------------
     Restore Authentication

     Runs once when the application starts.

     If both user information and token exist,
     restore the authenticated session.

     Otherwise clear any stale session data.
  ---------------------------------------------------------------------- */
  useEffect(() => {
    const storedUser = loadStoredUser();
    const token = getStoredSessionToken();

    if (storedUser && token) {
      const role = storedUser.role || getStoredUserRole();
      setUser({ ...storedUser, role });
    } else {
      clearSessionToken();
      clearUser();
    }

    setIsLoading(false);
  }, []);

  /* ----------------------------------------------------------------------
     Login

     1. Calls login API.
     2. Receives JWT token and user details.
     3. Persists session.
     4. Updates React state.
  ---------------------------------------------------------------------- */
  const login = useCallback(async ({ email, name }) => {
    const { token, user: loggedInUser } = await loginApi({ email, name });

    if (!token || !loggedInUser) {
      throw new Error("Login failed. Please try again.");
    }

    const role = decodeJwtPayload(token)?.role || "customer";
    const userWithRole = { ...loggedInUser, role };

    persistSessionToken(token);
    saveUser(userWithRole);
    setUser(userWithRole);

    return userWithRole;
  }, []);

  /* ----------------------------------------------------------------------
     Logout

     Clears authentication token,
     removes stored user information,
     and resets React authentication state.
  ---------------------------------------------------------------------- */
  const logout = useCallback(() => {
    clearSessionToken();
    clearUser();
    setUser(null);
  }, []);

  /* ----------------------------------------------------------------------
     Context Value

     Memoized to prevent unnecessary re-renders
     of all components consuming the context.
  ---------------------------------------------------------------------- */
  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user && getStoredSessionToken()),
      isStaff: isStaffRole(user?.role || getStoredUserRole()),
      isLoading,
      login,
      logout,
    }),
    [user, isLoading, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/* --------------------------------------------------------------------------
   useAuth()

   Custom hook for consuming authentication context.

   Must only be used inside <AuthProvider>.
---------------------------------------------------------------------------*/
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}