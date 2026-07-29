// Core HTTP framework — creates the app and handles routing/middleware
const express = require("express");
// Allow browser requests from the React frontend origin (cross-origin)
const cors = require("cors");
// Sets security-related HTTP headers (XSS, clickjacking, etc.)
const helmet = require("helmet");
// Logs each incoming request with structured JSON via Pino
const pinoHttp = require("pino-http");
// Generates a unique id when the client does not send x-request-id
const { randomUUID } = require("crypto");
// Throttles repeated requests to prevent abuse under /api
const rateLimit = require("express-rate-limit");
// Shared Pino logger instance passed into pino-http
const logger = require("./utils/logger");

// Route modules — each file defines endpoints for one domain
const restaurantRoutes = require("./routes/v1/restaurant.routes");
const orderRoutes = require("./routes/v1/order.routes");
const authRoutes = require("./routes/v1/auth.routes");
// Central handlers for unknown routes and thrown errors
const { notFoundHandler, errorHandler } = require("./middlewares/errorHandler");
const pool = require("./config/db");

// Create the Express app; server.js calls listen() on this export
const app = express();

// Trust X-Forwarded-For when behind a reverse proxy (rate limiting, HTTPS)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Rate limiter applied to all /api routes
const apiLimiter = rateLimit({
  // Time window in ms (default 60 seconds)
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000),
  // Max requests per IP within the window (default 120)
  limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120),
  // Send RateLimit-* headers in the modern draft format
  standardHeaders: "draft-7",
  // Do not send deprecated X-RateLimit-* headers
  legacyHeaders: false,
});

// Restrict CORS to the frontend URL (comma-separated for multiple origins)
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  })
);
// Apply Helmet security headers to every response
app.use(helmet());

// Log every request and attach a traceable request id
app.use(
  pinoHttp({
    logger,
    // Reuse client-provided x-request-id or create a new UUID
    genReqId(req, res) {
      const existingId = req.headers["x-request-id"];
      const requestId = existingId || randomUUID();
      res.setHeader("x-request-id", requestId);
      return requestId;
    },
    // Map HTTP status to log severity (5xx/4xx → error/warn)
    customLogLevel(req, res, err) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  })
);

// Parse JSON request bodies and attach them to req.body
app.use(express.json());
// Apply rate limiting to all paths starting with /api
app.use("/api", apiLimiter);

// Readiness probe — verifies MySQL is reachable
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({
      success: true,
      status: "healthy",
      db: "up",
      uptime: process.uptime(),
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: "unhealthy",
      db: "down",
      uptime: process.uptime(),
    });
  }
});

// Minimal OpenAPI-style listing of endpoints (not a full Swagger UI)
app.get("/api/docs", (req, res) => {
  res.status(200).json({
    openapi: "3.0.0",
    info: {
      title: "FoodHeaven Backend API",
      version: "1.0.0",
    },
    paths: {
      "/health": { get: { summary: "Health check" } },
      "/api/v1/restaurants": { get: { summary: "List active restaurants" } },
      "/api/v1/restaurants/{restaurantId}/menu": {
        get: { summary: "Get restaurant menu" },
      },
      "/api/v1/orders": {
        post: {
          summary: "Create order",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "Idempotency-Key", in: "header", required: false }],
        },
      },
      "/api/v1/orders/{orderId}/payments": {
        post: { summary: "Confirm payment", security: [{ bearerAuth: [] }] },
      },
      "/api/v1/orders/{id}/timeline": {
        get: { summary: "Get chronological order status timeline", security: [{ bearerAuth: [] }] },
      },
      "/api/v1/orders/{id}/cancel": {
        patch: { summary: "Cancel an order before it is out for delivery", security: [{ bearerAuth: [] }] },
      },
    },
  });
});

// Mount versioned API routers under /api/v1
app.use("/api/v1", restaurantRoutes);
app.use("/api/v1", orderRoutes);
app.use("/api/v1", authRoutes);

// Catch-all for routes that did not match anything above
app.use(notFoundHandler);
// Final middleware — formats errors into consistent JSON responses
app.use(errorHandler);

// Export app without listening — used by server.js and Supertest
module.exports = app;
