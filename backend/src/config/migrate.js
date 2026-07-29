/**
 * Startup schema migrations (lightweight, idempotent patches).
 *
 * Why this file exists:
 * - Fresh databases are created from `backend/db/schema.sql` via `scripts/init-db.js`,
 *   which already includes `orders.idempotency_key`.
 * - Older databases created before that column was added would miss the column and break
 *   idempotent order creation (`Idempotency-Key` header).
 * - Re-running the full schema on an existing DB is unsafe (drops/recreates data), so we
 *   apply small, targeted ALTERs here instead.
 *
 * When it runs: `server.js` calls `runMigrations` after DB connectivity check and
 * `initializeDatabaseIfEmpty`, before Express listens for traffic.
 *
 * This is not a migration framework (no version table). Each check is safe to run on
 * every boot; add new `ensure*` helpers and call them from `runMigrations`.
 */

/**
 * Adds `orders.idempotency_key` if missing (matches `backend/db/schema.sql`).
 *
 * Idempotency keys let clients safely retry POST /orders with the same
 * `Idempotency-Key` header without creating duplicate orders.
 *
 * Postgres: uses `ADD COLUMN IF NOT EXISTS` (single idempotent statement).
 * MySQL: checks information_schema first so ALTER runs only once per database.
 *
 * @param {object} pool - Shared pool from `config/db.js`
 * @param {{ info: (msg: string) => void }} logger - App logger from `utils/logger.js`
 */
async function ensureOrderIdempotencyColumn(pool, logger) {
  if (pool.isPostgres) {
    // Postgres supports conditional ADD COLUMN natively
    await pool.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(80) UNIQUE"
    );
    return;
  }

  // MySQL has no IF NOT EXISTS for columns — probe information_schema first
  const [rows] = await pool.query(
    `SELECT COUNT(1) AS columnCount
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'orders'
       AND column_name = 'idempotency_key'`,
    [process.env.DB_NAME]
  );

  const columnCount = Number(rows?.[0]?.columnCount || 0);
  if (columnCount > 0) {
    return; // Column already present — nothing to do
  }

  await pool.query(
    "ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(80) NULL UNIQUE AFTER order_number"
  );
  logger.info("Migration applied: added orders.idempotency_key");
}

/** Create the status-history table needed by GET /orders/:id/timeline. */
async function ensureOrderTimelineTable(pool, logger) {
  if (pool.isPostgres) {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS order_timeline (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_order_timeline_order_created ON order_timeline(order_id, created_at, id)"
    );
    return;
  }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS order_timeline (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      order_id BIGINT NOT NULL,
      status VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_order_timeline_order
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      INDEX idx_order_timeline_order_created (order_id, created_at, id)
    )`
  );
  logger.info("Migration ensured: order_timeline table");
}

// Map of restaurant id → reliable Unsplash image URL (see db/restaurant-images.js)
const RESTAURANT_IMAGE_IDS = require("../../db/restaurant-images");

/**
 * Overwrites `cloudinary_image_id` for known demo restaurants on every boot.
 *
 * Seed data may reference broken Swiggy CDN ids; this keeps homepage cards
 * showing valid images without re-running seed.sql.
 *
 * @param {object} pool - Shared pool from `config/db.js`
 */
async function ensureUniqueRestaurantImages(pool) {
  for (const [id, imageId] of Object.entries(RESTAURANT_IMAGE_IDS)) {
    await pool.query(
      "UPDATE restaurants SET cloudinary_image_id = ? WHERE id = ?",
      [imageId, id]
    );
  }
}

/**
 * Runs all startup migrations in order. Extend this when adding new schema patches.
 *
 * @param {object} pool - Shared pool from `config/db.js`
 * @param {{ info: (msg: string) => void }} logger - App logger from `utils/logger.js`
 */
async function runMigrations(pool, logger) {
  await ensureOrderIdempotencyColumn(pool, logger);
  await ensureOrderTimelineTable(pool, logger);
  await ensureUniqueRestaurantImages(pool);
}

module.exports = {
  runMigrations,
};
