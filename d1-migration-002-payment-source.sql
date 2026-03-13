-- Migration 002: Payment source tracking for webhook-confirmed payments
-- Run: wrangler d1 execute rollashield_quotes --file=d1-migration-002-payment-source.sql
-- Also run with --local for local dev

-- Track how payment was confirmed: 'manual', 'stripe-webhook', 'clover-webhook'
ALTER TABLE quotes ADD COLUMN payment_source TEXT;

-- Timestamp when webhook confirmed payment (distinct from payment_date)
ALTER TABLE quotes ADD COLUMN payment_confirmed_at TEXT;

-- Stripe Checkout Session ID for correlating webhook events
ALTER TABLE quotes ADD COLUMN stripe_checkout_session_id TEXT;
