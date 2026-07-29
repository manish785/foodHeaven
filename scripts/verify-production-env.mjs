#!/usr/bin/env node
/**
 * Verifies Auth0 + API env configuration before production deploy.
 * Run: npm run verify:env
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  readFileSync(filePath, "utf8")
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
}

loadEnvFile(resolve(rootDir, ".env"));
loadEnvFile(resolve(rootDir, "backend/.env"));

const checks = [];

function pass(msg) {
  checks.push({ ok: true, msg });
}

function fail(msg) {
  checks.push({ ok: false, msg });
}

function readEnv(name) {
  return process.env[name] || "";
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function main() {
  const auth0Domain =
    readEnv("AUTH0_DOMAIN") || readEnv("REACT_APP_AUTH0_DOMAIN");
  const auth0Audience =
    readEnv("AUTH0_AUDIENCE") || readEnv("REACT_APP_AUTH0_AUDIENCE");
  const apiBase =
    readEnv("REACT_APP_API_BASE_URL") || "http://localhost:5000/api/v1";
  const corsOrigin = readEnv("CORS_ORIGIN") || "http://localhost:3000";
  const jwtSecret = readEnv("JWT_SECRET");
  const clientId = readEnv("REACT_APP_AUTH0_CLIENT_ID");

  if (auth0Domain) pass(`Auth0 domain set: ${auth0Domain}`);
  else pass("Auth0 not configured (optional  app uses JWT login)");

  if (auth0Audience) pass(`Auth0 audience set: ${auth0Audience}`);
  else if (auth0Domain) fail("Missing AUTH0_AUDIENCE / REACT_APP_AUTH0_AUDIENCE");

  if (clientId) pass("Auth0 client ID set");
  else if (auth0Domain) fail("Missing REACT_APP_AUTH0_CLIENT_ID");

  if (jwtSecret && jwtSecret.length >= 16) pass("JWT_SECRET looks configured");
  else if (jwtSecret) fail("JWT_SECRET too short");
  else pass("JWT_SECRET not checked locally (set on Render)");

  if (apiBase.startsWith("https://") || apiBase.includes("localhost")) {
    pass(`API base URL: ${apiBase}`);
  } else fail(`Check REACT_APP_API_BASE_URL: ${apiBase}`);

  pass(`CORS origin: ${corsOrigin}`);

  if (auth0Domain) {
    try {
      const jwks = await fetchJson(
        `https://${auth0Domain.replace(/\/$/, "")}/.well-known/jwks.json`
      );
      if (jwks.keys?.length) {
        pass(`Auth0 JWKS reachable (${jwks.keys.length} keys)`);
      } else {
        fail("Auth0 JWKS returned no keys");
      }
    } catch (error) {
      fail(`Cannot reach Auth0 JWKS: ${error.message}`);
    }
  }

  const healthUrl = apiBase.replace(/\/api\/v1\/?$/, "") + "/health";
  try {
    const health = await fetchJson(healthUrl);
    if (health.db === "up") pass(`Backend healthy (DB up): ${healthUrl}`);
    else fail(`Backend unhealthy at ${healthUrl}: ${JSON.stringify(health)}`);
  } catch (error) {
    fail(
      `Backend not reachable at ${healthUrl}  start with: cd backend && npm run dev (${error.message})`
    );
  }

  console.log("\nFoodHeaven production env check\n");
  checks.forEach(({ ok, msg }) => {
    console.log(`${ok ? "?" : "?"} ${msg}`);
  });

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.log(
      "\nProduction database setup:\n" +
        "  See docs/NEON_PRODUCTION_SETUP.md — set DATABASE_URL on Render to Neon Postgres.\n"
    );
    process.exit(1);
  }

  console.log("\nAll checks passed.\n");
}

main();
