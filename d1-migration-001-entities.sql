-- Migration 001: Create first-class entity tables (contacts, properties, openings, quote_line_items)
-- Run: wrangler d1 execute rollashield_quotes --remote --file=d1-migration-001-entities.sql
-- See: docs/architecture/properties-and-openings.md for design rationale

-- ═══ CONTACTS ═══
-- Customer/person records. Syncs bi-directionally with Airtable Contacts.
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  -- Contact/mailing address
  street_address TEXT,
  apt_suite TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  -- Airtable sync
  airtable_contact_id TEXT,
  -- Timestamps
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_contacts_airtable ON contacts(airtable_contact_id);

-- ═══ PROPERTIES ═══
-- Physical locations where work happens. Multiple per contact.
-- Replaces inline address fields on quotes/opportunities.
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  name TEXT,                          -- "Main House", "Pool House", "Building A"
  street_address TEXT NOT NULL,
  apt_suite TEXT,
  nearest_intersection TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  is_commercial INTEGER DEFAULT 0,    -- 0 = residential, 1 = commercial
  gate_code TEXT,
  hoa_info TEXT,
  access_notes TEXT,                   -- "Enter from alley", "Dogs in yard"
  loading_dock INTEGER DEFAULT 0,      -- For commercial sites
  -- Timestamps
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_properties_contact ON properties(contact_id);
CREATE INDEX IF NOT EXISTS idx_properties_address ON properties(street_address);

-- ═══ OPENINGS ═══
-- Physical holes in walls at a property. Phase 1 data.
-- Persists across quotes — same opening can be quoted multiple times.
CREATE TABLE IF NOT EXISTS openings (
  id TEXT PRIMARY KEY,
  property_id TEXT REFERENCES properties(id),
  quote_id TEXT REFERENCES quotes(id),   -- Which quote first documented this opening
  name TEXT,                              -- "Master Bedroom", "Kitchen East"
  -- Dimensions (inches, with fractional precision)
  width_inches REAL,
  width_fraction TEXT,                    -- "1/2", "3/8", etc. for display
  height_inches REAL,
  height_fraction TEXT,
  -- Rounded dimensions for pricing lookup (feet)
  width_feet INTEGER,
  height_feet INTEGER,
  -- Display strings (e.g., "18' 0.5\"")
  width_display TEXT,
  height_display TEXT,
  -- Site details (Phase 1 data)
  frame_color TEXT,
  frame_color_name TEXT,
  include_installation INTEGER DEFAULT 1,
  wiring_distance INTEGER DEFAULT 0,
  location_notes TEXT,
  -- Status tracks lifecycle across quotes
  status TEXT DEFAULT 'documented',       -- documented, quoted, ordered, installed
  -- R2 photo keys stored as JSON array: [{"key":"...","filename":"...","size":123,"contentType":"image/jpeg"}]
  photos_json TEXT DEFAULT '[]',
  -- Sort order within the quote
  sort_order INTEGER DEFAULT 0,
  -- Timestamps
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_openings_property ON openings(property_id);
CREATE INDEX IF NOT EXISTS idx_openings_quote ON openings(quote_id);
CREATE INDEX IF NOT EXISTS idx_openings_status ON openings(status);

-- ═══ QUOTE LINE ITEMS ═══
-- Product configuration + pricing for an opening within a quote.
-- Phase 2 data. Enables per-opening history and exclude/include toggle.
CREATE TABLE IF NOT EXISTS quote_line_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT REFERENCES quotes(id),
  opening_id TEXT REFERENCES openings(id),
  -- Product type (extensible for future rolling shutters, etc.)
  product_type TEXT DEFAULT 'screen',
  -- Configuration (Phase 2 data)
  track_type TEXT,
  track_type_name TEXT,
  operator_type TEXT,
  operator_type_name TEXT,
  fabric_color TEXT,
  fabric_color_name TEXT,
  frame_color TEXT,
  frame_color_name TEXT,
  no_tracks INTEGER DEFAULT 0,
  -- Accessories stored as JSON array
  accessories_json TEXT DEFAULT '[]',
  -- Pricing
  customer_price REAL DEFAULT 0,
  installation_price REAL DEFAULT 0,
  wiring_price REAL DEFAULT 0,
  cost_total REAL DEFAULT 0,
  screen_cost_only REAL DEFAULT 0,
  motor_cost REAL DEFAULT 0,
  accessories_cost REAL DEFAULT 0,
  installation_cost REAL DEFAULT 0,
  guarantee_discount REAL DEFAULT 0,
  -- Comparison pricing (if alternate motor/track was calculated)
  comparison_price REAL,
  comparison_material_price REAL,
  -- Exclude toggle: opening stays documented but removed from quote totals
  excluded INTEGER DEFAULT 0,
  -- Sort order within the quote
  sort_order INTEGER DEFAULT 0,
  -- Phase tracking
  phase TEXT DEFAULT 'configured',        -- 'opening' (Phase 1 only) or 'configured' (full pricing)
  -- Timestamps
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_line_items_quote ON quote_line_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_line_items_opening ON quote_line_items(opening_id);
CREATE INDEX IF NOT EXISTS idx_line_items_product ON quote_line_items(product_type);

-- ═══ ALTER EXISTING QUOTES TABLE ═══
-- Add entity references and email storage to existing quotes table.
-- These use ALTER TABLE which is safe in SQLite (additive only).

-- Link quotes to contacts and properties
ALTER TABLE quotes ADD COLUMN contact_id TEXT REFERENCES contacts(id);
ALTER TABLE quotes ADD COLUMN property_id TEXT REFERENCES properties(id);

-- Store sent email HTML for viewing later
ALTER TABLE quotes ADD COLUMN sent_emails_json TEXT DEFAULT '[]';

-- Store the Airtable opportunity name for display
ALTER TABLE quotes ADD COLUMN airtable_opportunity_name TEXT;

-- Track whether entity migration has been done for this quote
ALTER TABLE quotes ADD COLUMN entities_migrated INTEGER DEFAULT 0;
