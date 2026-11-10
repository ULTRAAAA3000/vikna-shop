-- Єдина схема бази даних Cloudflare D1 для Vikna Shop.
-- Застосування:
--   локально:   npm run db:local
--   у Cloudflare: npm run db:remote

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status        TEXT    NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'in_progress', 'done', 'cancelled')),

  -- контактні дані клієнта
  name          TEXT    NOT NULL,
  phone         TEXT    NOT NULL,
  email         TEXT,
  city          TEXT,
  contact       TEXT    NOT NULL DEFAULT 'call'
                CHECK (contact IN ('call', 'telegram', 'viber', 'email')),

  -- запит клієнта
  product       TEXT    NOT NULL DEFAULT 'other'
                CHECK (product IN ('window', 'balcony', 'entrance', 'sliding', 'other')),
  message       TEXT,

  -- конфігурація з 3D-конструктора (JSON) і розрахунок, перерахований на сервері
  config_json   TEXT,
  estimate_uah  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone   ON orders (phone, created_at DESC);
