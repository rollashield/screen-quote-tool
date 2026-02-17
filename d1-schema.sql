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
  updated_at TEXT NOT NULL,
  airtable_opportunity_id TEXT,
  airtable_contact_id TEXT,
  airtable_quote_id TEXT,
  quote_number TEXT,
  internal_comments TEXT,
  -- Signature fields
  quote_status TEXT DEFAULT 'draft',
  signing_token TEXT,
  signing_token_expires_at TEXT,
  signature_data TEXT,
  signed_at TEXT,
  signer_name TEXT,
  signer_ip TEXT,
  signing_method TEXT,
  signature_sent_at TEXT,
  -- Payment fields
  payment_status TEXT DEFAULT 'unpaid',
  payment_method TEXT,
  payment_amount REAL,
  payment_date TEXT,
  clover_payment_link TEXT,
  stripe_payment_intent_id TEXT,
  clover_checkout_id TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_quotes_customer_email ON quotes(customer_email);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_name ON quotes(customer_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_quote_number ON quotes(quote_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_signing_token ON quotes(signing_token);
CREATE INDEX IF NOT EXISTS idx_quotes_quote_status ON quotes(quote_status);
