-- Compact older first-party analytics into monthly summaries and retain lightweight attribution.
CREATE TABLE IF NOT EXISTS analytics_monthly_summary (
  month TEXT PRIMARY KEY,
  page_views INTEGER NOT NULL DEFAULT 0,
  product_views INTEGER NOT NULL DEFAULT 0,
  add_to_cart_events INTEGER NOT NULL DEFAULT 0,
  checkout_start_events INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS analytics_monthly_sessions (
  month TEXT NOT NULL,
  session_id TEXT NOT NULL,
  PRIMARY KEY (month, session_id)
);
CREATE INDEX IF NOT EXISTS idx_analytics_monthly_sessions_month ON analytics_monthly_sessions(month);
CREATE TABLE IF NOT EXISTS analytics_monthly_source_orders (
  month TEXT NOT NULL,
  order_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'direct',
  medium TEXT NOT NULL DEFAULT 'none',
  session_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (month, order_id)
);
CREATE INDEX IF NOT EXISTS idx_analytics_monthly_source_month ON analytics_monthly_source_orders(month, source, medium);
CREATE TABLE IF NOT EXISTS analytics_maintenance (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
