-- Migration: Add Airtable integration columns to quotes table
-- Run with: wrangler d1 execute rollashield_quotes --file=migration-airtable.sql
-- For local dev: wrangler d1 execute rollashield_quotes --local --file=migration-airtable.sql

ALTER TABLE quotes ADD COLUMN airtable_opportunity_id TEXT;
ALTER TABLE quotes ADD COLUMN airtable_contact_id TEXT;
ALTER TABLE quotes ADD COLUMN airtable_quote_id TEXT;
ALTER TABLE quotes ADD COLUMN quote_number TEXT;
ALTER TABLE quotes ADD COLUMN internal_comments TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_quote_number ON quotes(quote_number);
