-- Migration: Add signature and payment tracking columns
-- Run with: wrangler d1 execute rollashield_quotes --file=migration-signature.sql
-- (Remove --local flag to run against production)

-- Signature columns
ALTER TABLE quotes ADD COLUMN quote_status TEXT DEFAULT 'draft';
ALTER TABLE quotes ADD COLUMN signing_token TEXT;
ALTER TABLE quotes ADD COLUMN signing_token_expires_at TEXT;
ALTER TABLE quotes ADD COLUMN signature_data TEXT;
ALTER TABLE quotes ADD COLUMN signed_at TEXT;
ALTER TABLE quotes ADD COLUMN signer_name TEXT;
ALTER TABLE quotes ADD COLUMN signer_ip TEXT;
ALTER TABLE quotes ADD COLUMN signing_method TEXT;
ALTER TABLE quotes ADD COLUMN signature_sent_at TEXT;

-- Payment columns
ALTER TABLE quotes ADD COLUMN payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE quotes ADD COLUMN payment_method TEXT;
ALTER TABLE quotes ADD COLUMN payment_amount REAL;
ALTER TABLE quotes ADD COLUMN payment_date TEXT;
ALTER TABLE quotes ADD COLUMN clover_payment_link TEXT;
ALTER TABLE quotes ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE quotes ADD COLUMN clover_checkout_id TEXT;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_signing_token ON quotes(signing_token);
CREATE INDEX IF NOT EXISTS idx_quotes_quote_status ON quotes(quote_status);
