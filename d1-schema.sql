-- D1 Database Schema for Roll-A-Shield Quote Tool
-- Create this table using: wrangler d1 execute rollashield_quotes --local --file=d1-schema.sql

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  company_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  street_address TEXT,
  apt_suite TEXT,
  nearest_intersection TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  total_price REAL,
  screen_count INTEGER,
  quote_data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_quotes_customer_email ON quotes(customer_email);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_name ON quotes(customer_name);
