-- Add privacy-conscious first-party store analytics.
-- Uses approximate Cloudflare city/country metadata; does not store raw IP addresses.
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  page_path TEXT DEFAULT '',
  page_title TEXT DEFAULT '',
  referrer TEXT DEFAULT '',
  source TEXT DEFAULT 'direct',
  medium TEXT DEFAULT 'none',
  campaign TEXT DEFAULT '',
  landing_page TEXT DEFAULT '',
  product_id TEXT DEFAULT '',
  product_name TEXT DEFAULT '',
  order_id TEXT DEFAULT '',
  value REAL NOT NULL DEFAULT 0,
  city TEXT DEFAULT '',
  country TEXT DEFAULT '',
  device TEXT DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_event_created ON analytics_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_source ON analytics_events(source, created_at);
