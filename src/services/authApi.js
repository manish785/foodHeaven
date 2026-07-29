import axios from "axios";

import { getDevTokenUrl, getLoginUrl } from "../utils/constants";

/** Sign in with name and email; returns { token, user }. */
export async function login({ email, name }) {
  const response = await axios.post(getLoginUrl(), {
    email: email.trim(),
    name: name.trim(),
  });

  return response.data?.data;
}

/**
 * Mint a dev JWT with optional role (non-production only).
 * Used for local staff/admin testing.
 */
export async function requestDevToken({ devKey, userId, email, role }) {
  const response = await axios.post(getDevTokenUrl(), {
    devKey,
    userId,
    email,
    role,
  });

  return response.data?.data;
}
