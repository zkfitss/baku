CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Women',
  description TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  sale_price REAL,
  image TEXT DEFAULT '',
  images TEXT DEFAULT '[]',
  sizes TEXT DEFAULT '[]',
  colors TEXT DEFAULT '[]',
  stock INTEGER NOT NULL DEFAULT 0,
  featured INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  items TEXT NOT NULL,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL,
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
INSERT OR IGNORE INTO settings(key,value) VALUES
('store_name','ZK FITS'),
('announcement','New season arrivals are here'),
('hero_title','Dress beautifully. Feel confident.'),
('hero_subtitle','Everyday elegance for women and girls.'),
('hero_image',''),
('logo',''),
('footer_text','ZK FITS — Style made for you.'),
('instagram',''),
('whatsapp',''),
('facebook',''),
('tiktok',''),
('shipping_fee','250'),
('free_shipping_threshold','5000'),
('currency','PKR');
