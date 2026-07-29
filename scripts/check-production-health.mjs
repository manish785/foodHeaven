#!/usr/bin/env node
/**
 * Ping production API health endpoint.
 * Run: npm run verify:health
 */

const API_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  "https://foodheaven-api.onrender.com/api/v1";

const HEALTH_URL = API_BASE.replace(/\/api\/v1\/?$/, "") + "/health";
const TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_MS || 90000);

async function fetchHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(HEALTH_URL, { signal: controller.signal });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(`Health check failed: HTTP ${response.status}`);
      console.error(JSON.stringify(body, null, 2));
      process.exit(1);
    }

    if (body.db !== "up") {
      console.error(`API reachable but database is down: ${HEALTH_URL}`);
      console.error(JSON.stringify(body, null, 2));
      process.exit(1);
    }

    console.log(`OK  ${HEALTH_URL}`);
    console.log(JSON.stringify(body, null, 2));
  } catch (error) {
    const hint =
      error.name === "AbortError"
        ? `timed out after ${TIMEOUT_MS}ms (Render free tier may be waking up — retry)`
        : error.message;
    console.error(`Cannot reach ${HEALTH_URL}: ${hint}`);
    console.error("\nSee docs/NEON_PRODUCTION_SETUP.md to fix DATABASE_URL on Render.");
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

fetchHealth();
