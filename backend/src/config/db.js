/**
 * Shared database connection pool (MySQL or PostgreSQL).
 *
 * Why this file exists:
 * - Every layer (repositories, init-db, migrate, server startup) needs one pool instance.
 * - Production deploys (e.g. Render) use Postgres via `DATABASE_URL`; local dev uses MySQL
 *   via `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
 *
 * Design:
 * - Exports a single pool object with a consistent API: `query`, `getConnection`, `end`.
 * - Postgres path wraps `pg` and translates MySQL-style `?` placeholders to `$1, $2, ...`
 *   so repositories can write one SQL dialect.
 * - `pool.isPostgres` lets callers branch when engine-specific syntax is required
 *   (see `migrate.js`, `init-db.js`).
 *
 * Env vars:
 * - `DATABASE_URL` — if it starts with `postgres`, uses PostgreSQL (SSL enabled).
 * - Otherwise MySQL from `DATABASE_URL` or individual `DB_*` variables.
 */

const mysql = require("mysql2/promise");

const databaseUrl = process.env.DATABASE_URL || "";
const isPostgres = databaseUrl.startsWith("postgres");

let pool;

if (isPostgres) {
  const { Pool } = require("pg");

  const pgPool = new Pool({
    connectionString: databaseUrl,
    // Required for managed Postgres hosts (Render, Heroku, etc.)
    ssl: { rejectUnauthorized: false },
  });

  /**
   * Rewrites MySQL-style `?` placeholders to Postgres `$1`, `$2`, …
   * Lets repositories use `?` everywhere without duplicating queries.
   */
  function toPgSql(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  }

  // Adapter that mirrors mysql2's pool API ([rows, fields] from query)
  pool = {
    isPostgres: true,
    async query(sql, params = []) {
      const result = await pgPool.query(toPgSql(sql), params);
      return [result.rows, result.fields];
    },
    async getConnection() {
      const client = await pgPool.connect();
      return {
        async query(sql, params = []) {
          const result = await client.query(toPgSql(sql), params);
          return [result.rows, result.fields];
        },
        async beginTransaction() {
          await client.query("BEGIN");
        },
        async commit() {
          await client.query("COMMIT");
        },
        async rollback() {
          await client.query("ROLLBACK");
        },
        release() {
          client.release();
        },
      };
    },
    async end() {
      await pgPool.end();
    },
  };
} else {
  // Local dev: either a MySQL connection string or discrete DB_* env vars
  const mysqlPool = databaseUrl
    ? mysql.createPool(databaseUrl)
    : mysql.createPool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });

  pool = {
    isPostgres: false,
    query: (...args) => mysqlPool.query(...args),
    getConnection: () => mysqlPool.getConnection(),
    end: () => mysqlPool.end(),
  };
}

module.exports = pool;
