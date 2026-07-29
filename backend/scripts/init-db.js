/**
 * First-time database bootstrap (schema + demo seed).
 *
 * Why this file exists:
 * - New developers and fresh deploys need tables and sample restaurants/menu data without
 *   running MySQL commands by hand.
 * - `backend/db/schema.sql` defines the full schema (restaurants, menu_items, orders, etc.).
 * - `backend/db/seed.sql` inserts demo rows so the app is usable immediately.
 *
 * When it runs:
 * - Automatically on server start (`server.js` → `initializeDatabaseIfEmpty`) after the DB
 *   connection check and before `runMigrations` from `config/migrate.js`.
 * - Manually: `node scripts/init-db.js` from the `backend/` folder (loads `backend/.env`).
 *
 * Safety: initialization runs only if the `restaurants` table is missing or empty.
 * Existing databases with data are left unchanged (returns `false`). Schema changes on
 * live DBs are handled by `config/migrate.js`, not by re-running these SQL files.
 *
 * Requires `DB_NAME` (MySQL) or `DATABASE_URL` (Postgres) to match the database you intend
 * to use; `schema.sql` also contains `CREATE DATABASE` / `USE` statements for local setup.
 */

const fs = require("fs"); // Read schema.sql and seed.sql from disk
const path = require("path"); // Resolve paths relative to this script's directory

/**
 * True when DATABASE_URL points at PostgreSQL (e.g. Render/Heroku deploys).
 * Switches schema file and seed SQL conversion logic below.
 */
const isPostgres = Boolean(
  process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres")
);

/**
 * Returns true if the `restaurants` table already exists in the configured database.
 * Used as a simple signal that schema.sql has been applied at least once.
 *
 * @param {object} connection - Shared pool from `src/config/db.js`
 */
async function tableExists(connection) {
  // Postgres uses a fixed `public` schema; MySQL scopes by DB_NAME
  const [rows] = isPostgres
    ? await connection.query(
        `SELECT COUNT(1) AS count
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'restaurants'`
      )
    : await connection.query(
        `SELECT COUNT(1) AS count
         FROM information_schema.tables
         WHERE table_schema = ? AND table_name = 'restaurants'`,
        [process.env.DB_NAME]
      );
  return Number(rows[0]?.count || 0) > 0;
}

/**
 * Reads a `.sql` file, splits it into statements, and executes each in order.
 * Splits on semicolon + newline (`;\n`) so multi-line statements stay intact.
 * Skips empty chunks and lines that are only SQL comments (`--`).
 *
 * @param {object} connection - Shared pool from `src/config/db.js`
 * @param {string} filePath - Absolute path to a `.sql` file
 */
async function runSqlFile(connection, filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    await connection.query(statement);
  }
}

/**
 * Removes block comments (`/* ... *\/`) and line comments (`-- ...`) from SQL text.
 * Used before converting MySQL seed syntax to Postgres-compatible syntax.
 *
 * @param {string} sql - Raw SQL string
 * @returns {string} SQL with comments stripped
 */
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

/**
 * Converts MySQL-flavoured seed.sql so it can run on PostgreSQL.
 * Keeps a single seed file for both engines; transformations happen at runtime.
 *
 * Transformations:
 * - Strip MySQL `USE foodheaven_db;` (Postgres selects DB via connection URL)
 * - `JSON_ARRAY('a','b')` → `'["a","b"]'::jsonb`
 * - MySQL truthy `1` for is_open → Postgres `TRUE`
 * - `ON DUPLICATE KEY UPDATE` → `ON CONFLICT (id) DO UPDATE SET ...`
 *
 * @param {string} sql - Contents of `backend/db/seed.sql`
 * @returns {string} Postgres-compatible seed SQL
 */
function convertMysqlSeedToPostgres(sql) {
  return stripSqlComments(sql)
    .replace(/USE foodheaven_db;\s*/g, "")
    .replace(/JSON_ARRAY\(([^)]+)\)/g, (_match, inner) => {
      const items = inner
        .split(",")
        .map((part) => part.trim().replace(/^'|'$/g, ""));
      return `'${JSON.stringify(items)}'::jsonb`;
    })
    .replace(/('₹[^']*',\n)\s*1,\n\s*(\d+,)/g, "$1    TRUE,\n    $2")
    .replace(
      /INSERT INTO restaurants[\s\S]*?ON DUPLICATE KEY UPDATE[\s\S]*?;/,
      (statement) =>
        statement.replace(
          /ON DUPLICATE KEY UPDATE[\s\S]*$/,
          `ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  avg_rating = EXCLUDED.avg_rating,
  cost_for_two_message = EXCLUDED.cost_for_two_message,
  is_open = EXCLUDED.is_open,
  delivery_time_minutes = EXCLUDED.delivery_time_minutes,
  cuisines = EXCLUDED.cuisines,
  is_active = TRUE;`
        )
    );
}

/**
 * Applies `db/schema.sql` then `db/seed.sql` when the database looks empty.
 *
 * Flow:
 * 1. Require DB_NAME on MySQL (Postgres uses DATABASE_URL only)
 * 2. Skip if `restaurants` exists AND has rows (already initialized)
 * 3. Run schema file only when the table is missing
 * 4. Always run seed when table is missing or empty
 *
 * @param {object} pool - Shared pool from `src/config/db.js`
 * @returns {Promise<boolean>} `true` if schema and/or seed ran; `false` if skipped
 */
async function initializeDatabaseIfEmpty(pool) {
  if (!isPostgres && !process.env.DB_NAME) {
    throw new Error("DB_NAME is required to initialize the database");
  }

  const hasRestaurants = await tableExists(pool);
  const [countRows] = await pool.query(
    hasRestaurants
      ? "SELECT COUNT(1) AS count FROM restaurants"
      : "SELECT 0 AS count"
  );
  const restaurantCount = Number(countRows[0]?.count || 0);

  // Database already has demo data — do not re-run schema or seed
  if (hasRestaurants && restaurantCount > 0) {
    return false;
  }

  const schemaPath = path.resolve(
    __dirname,
    isPostgres ? "../db/schema.postgres.sql" : "../db/schema.sql"
  );
  const seedPath = path.resolve(__dirname, "../db/seed.sql");

  // eslint-disable-next-line no-console
  console.log("Initializing database (schema + seed)...");
  if (!hasRestaurants) {
    await runSqlFile(pool, schemaPath);
  }

  const seedSql = fs.readFileSync(seedPath, "utf8");
  const seedToRun = isPostgres ? convertMysqlSeedToPostgres(seedSql) : seedSql;
  const seedStatements = seedToRun
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of seedStatements) {
    await pool.query(statement);
  }
  // eslint-disable-next-line no-console
  console.log("Database initialized successfully");
  return true;
}

module.exports = {
  initializeDatabaseIfEmpty,
};

// Standalone CLI: `node scripts/init-db.js` (from `backend/` directory)
if (require.main === module) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
  const pool = require("../src/config/db");

  initializeDatabaseIfEmpty(pool)
    .then(() => pool.end())
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Database init failed:", error.message);
      process.exit(1);
    });
}
