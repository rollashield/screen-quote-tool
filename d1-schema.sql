-- D1 Database Schema for Roll-A-Shield Quote Tool
-- Fresh setup: wrangler d1 execute rollashield_quotes --local --file=d1-schema.sql
-- For existing DBs: use d1-migration-001-entities.sql

-- ═══ QUOTES ═══
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
  clover_checkout_id TEXT,
  selected_payment_method TEXT,
  payment_source TEXT,
  payment_confirmed_at TEXT,
  stripe_checkout_session_id TEXT,
  signed_contract_url TEXT,
  -- Entity references (added in migration 001)
  contact_id TEXT REFERENCES contacts(id),
  property_id TEXT REFERENCES properties(id),
  sent_emails_json TEXT DEFAULT '[]',
  airtable_opportunity_name TEXT,
  entities_migrated INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotes_customer_email ON quotes(customer_email);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_name ON quotes(customer_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_quote_number ON quotes(quote_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_signing_token ON quotes(signing_token);
CREATE INDEX IF NOT EXISTS idx_quotes_quote_status ON quotes(quote_status);

-- ═══ CONTACTS ═══
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  street_address TEXT,
  apt_suite TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  airtable_contact_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_contacts_airtable ON contacts(airtable_contact_id);

-- ═══ PROPERTIES ═══
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  name TEXT,
  street_address TEXT NOT NULL,
  apt_suite TEXT,
  nearest_intersection TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  is_commercial INTEGER DEFAULT 0,
  gate_code TEXT,
  hoa_info TEXT,
  access_notes TEXT,
  loading_dock INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_properties_contact ON properties(contact_id);
CREATE INDEX IF NOT EXISTS idx_properties_address ON properties(street_address);

-- ═══ OPENINGS ═══
CREATE TABLE IF NOT EXISTS openings (
  id TEXT PRIMARY KEY,
  property_id TEXT REFERENCES properties(id),
  quote_id TEXT REFERENCES quotes(id),
  name TEXT,
  width_inches REAL,
  width_fraction TEXT,
  height_inches REAL,
  height_fraction TEXT,
  width_feet INTEGER,
  height_feet INTEGER,
  width_display TEXT,
  height_display TEXT,
  frame_color TEXT,
  frame_color_name TEXT,
  include_installation INTEGER DEFAULT 1,
  wiring_distance INTEGER DEFAULT 0,
  location_notes TEXT,
  status TEXT DEFAULT 'documented',
  photos_json TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_openings_property ON openings(property_id);
CREATE INDEX IF NOT EXISTS idx_openings_quote ON openings(quote_id);
CREATE INDEX IF NOT EXISTS idx_openings_status ON openings(status);

-- ═══ QUOTE LINE ITEMS ═══
CREATE TABLE IF NOT EXISTS quote_line_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT REFERENCES quotes(id),
  opening_id TEXT REFERENCES openings(id),
  product_type TEXT DEFAULT 'screen',
  track_type TEXT,
  track_type_name TEXT,
  operator_type TEXT,
  operator_type_name TEXT,
  fabric_color TEXT,
  fabric_color_name TEXT,
  frame_color TEXT,
  frame_color_name TEXT,
  no_tracks INTEGER DEFAULT 0,
  accessories_json TEXT DEFAULT '[]',
  customer_price REAL DEFAULT 0,
  installation_price REAL DEFAULT 0,
  wiring_price REAL DEFAULT 0,
  cost_total REAL DEFAULT 0,
  screen_cost_only REAL DEFAULT 0,
  motor_cost REAL DEFAULT 0,
  accessories_cost REAL DEFAULT 0,
  installation_cost REAL DEFAULT 0,
  guarantee_discount REAL DEFAULT 0,
  comparison_price REAL,
  comparison_material_price REAL,
  excluded INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  phase TEXT DEFAULT 'configured',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_line_items_quote ON quote_line_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_line_items_opening ON quote_line_items(opening_id);
CREATE INDEX IF NOT EXISTS idx_line_items_product ON quote_line_items(product_type);

-- ═══ QUOTE DATA HISTORY (append-only versioning) ═══
CREATE TABLE IF NOT EXISTS quote_data_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id TEXT NOT NULL,
  quote_data TEXT NOT NULL,
  saved_at TEXT DEFAULT (datetime('now')),
  saved_by TEXT,
  FOREIGN KEY (quote_id) REFERENCES quotes(id)
);

CREATE INDEX IF NOT EXISTS idx_quote_history_quote ON quote_data_history(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_history_saved_at ON quote_data_history(saved_at DESC);
