const SESSION_JWT_KEY = "foodheaven_session_jwt";

export function clearSessionToken() {
  sessionStorage.removeItem(SESSION_JWT_KEY);
}

export function getStoredSessionToken() {
  return sessionStorage.getItem(SESSION_JWT_KEY);
}

export function persistSessionToken(token) {
  sessionStorage.setItem(SESSION_JWT_KEY, token);
}

export async function getApiAccessToken() {
  const token = getStoredSessionToken();

  if (!token) {
    const error = new Error("Please log in to continue.");
    error.needsReauth = true;
    throw error;
  }

  return token;
}

/** Decode JWT payload without verifying signature (client-side role display only). */
export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;

  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getStoredUserRole() {
  const payload = decodeJwtPayload(getStoredSessionToken());
  return payload?.role || "customer";
}

export function isStaffRole(role) {
  return role === "admin" || role === "system";
}
