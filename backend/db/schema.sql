/*
 * FoodHeaven MySQL schema (source of truth for table structure).
 *
 * Why this file exists:
 * - Defines the relational model the Node API expects (restaurants, menus, orders, payments).
 * - Gives new environments a reproducible bootstrap without hand-written DDL in docs or code.
 * - Loaded automatically by scripts/init-db.js on first server start (empty DB), and by
 *   docker-compose / manual `mysql < db/schema.sql` for local and CI setups.
 *
 * Not for altering live databases: init-db skips if `restaurants` already exists. Incremental
 * changes on existing DBs go in src/config/migrate.js (e.g. orders.idempotency_key for older DBs).
 *
 * Pair with db/seed.sql for demo restaurant/menu data after tables exist.
 *
 * Note: hard-codes database name foodheaven_db (CREATE DATABASE / USE). Set DB_NAME in .env to
 * match, or adjust these lines for your environment.
 */

CREATE DATABASE IF NOT EXISTS foodheaven_db;
USE foodheaven_db;

/* restaurants: catalog header (list/search); id matches Swiggy-style external ids in seed */
CREATE TABLE IF NOT EXISTS restaurants (
  id BIGINT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  cloudinary_image_id VARCHAR(255) NULL,
  locality VARCHAR(120) NULL,
  area_name VARCHAR(120) NULL,
  avg_rating DECIMAL(3, 2) DEFAULT 0.00,
  cost_for_two_message VARCHAR(60) NULL,
  is_open TINYINT(1) NOT NULL DEFAULT 1,
  delivery_time_minutes INT NOT NULL DEFAULT 30,
  cuisines JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

/* menu_items: dishes per restaurant; prices in paise; CASCADE delete when restaurant removed */
CREATE TABLE IF NOT EXISTS menu_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  restaurant_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  image_id VARCHAR(255) NULL,
  price_paise INT NULL,
  default_price_paise INT NULL,
  rating DECIMAL(3, 2) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_menu_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    ON DELETE CASCADE
);

/* Index on restaurant_id for menu lookups (idempotent: skip if index already exists) */
SET @idx_menu_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = 'foodheaven_db'
    AND table_name = 'menu_items'
    AND index_name = 'idx_menu_restaurant_id'
);
SET @idx_menu_sql := IF(
  @idx_menu_exists = 0,
  'CREATE INDEX idx_menu_restaurant_id ON menu_items(restaurant_id)',
  'SELECT 1'
);
PREPARE idx_stmt FROM @idx_menu_sql;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;

/* orders: checkout header; idempotency_key supports Idempotency-Key header on POST /orders */
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_number VARCHAR(30) NOT NULL UNIQUE,
  idempotency_key VARCHAR(80) NULL UNIQUE,
  customer_name VARCHAR(120) NOT NULL,
  customer_email VARCHAR(180) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  delivery_address VARCHAR(255) NOT NULL,
  delivery_pincode VARCHAR(12) NOT NULL,
  payment_method VARCHAR(30) NOT NULL,
  subtotal_amount DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) NOT NULL,
  delivery_fee DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

/* order_timeline: immutable status audit trail used by the order timeline API */
CREATE TABLE IF NOT EXISTS order_timeline (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_timeline_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_order_timeline_order_created
  ON order_timeline(order_id, created_at, id);

/* order_items: line items; snapshot item_name/price; RESTRICT delete on menu_item if referenced */
CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  menu_item_id BIGINT NOT NULL,
  item_name VARCHAR(150) NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  quantity INT NOT NULL,
  line_total DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_item_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_order_item_menu
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    ON DELETE RESTRICT
);

SET @idx_order_items_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = 'foodheaven_db'
    AND table_name = 'order_items'
    AND index_name = 'idx_order_items_order_id'
);
SET @idx_order_items_sql := IF(
  @idx_order_items_exists = 0,
  'CREATE INDEX idx_order_items_order_id ON order_items(order_id)',
  'SELECT 1'
);
PREPARE idx_stmt FROM @idx_order_items_sql;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;

/* payments: one row per order payment attempt; mock gateway provider for local dev */
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  payment_ref VARCHAR(60) NULL UNIQUE,
  provider VARCHAR(80) NOT NULL DEFAULT 'TWIGGY_MOCK_GATEWAY',
  payment_method VARCHAR(30) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'INITIATED',
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE
);

SET @idx_payments_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = 'foodheaven_db'
    AND table_name = 'payments'
    AND index_name = 'idx_payments_order_id'
);
SET @idx_payments_sql := IF(
  @idx_payments_exists = 0,
  'CREATE INDEX idx_payments_order_id ON payments(order_id)',
  'SELECT 1'
);
PREPARE idx_stmt FROM @idx_payments_sql;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;
