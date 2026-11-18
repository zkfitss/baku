-- Fresh-install schema. Existing databases should use the additive migration
-- files in /migrations instead of dropping/recreating tables.
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT 'Women',
  collection TEXT DEFAULT '',
  description TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  sale_price REAL,
  image TEXT DEFAULT '',
  images TEXT DEFAULT '[]',
  sizes TEXT DEFAULT '[]',
  colors TEXT DEFAULT '[]',
  variants TEXT NOT NULL DEFAULT '[]',
  stock INTEGER NOT NULL DEFAULT 0,
  featured INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  items TEXT NOT NULL,
  total REAL NOT NULL,
  payment TEXT NOT NULL,
  customer_email TEXT DEFAULT '',
  status TEXT DEFAULT 'Pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  discount_percent REAL NOT NULL,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS product_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_status ON product_reviews(status);
INSERT OR IGNORE INTO settings(key,value) VALUES
('store_name','ZK FITS'),
('announcement','New season arrivals are here'),
('hero_title','Dress beautifully. Feel confident.'),
('hero_subtitle','Everyday elegance for women and girls.'),
('hero_image',''),
('hero_slides','[]'),
('logo',''),
('footer_text','ZK FITS — Style made for you.'),
('instagram',''),
('whatsapp',''),
('facebook',''),
('tiktok',''),
('shipping_fee','250'),
('free_shipping_threshold','5000'),
('currency','PKR');
