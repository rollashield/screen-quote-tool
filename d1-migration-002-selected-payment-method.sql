-- Migration 002: Add selected_payment_method column to quotes table
-- Stores the customer's payment method choice from the pay page (before mark-paid).
-- Run: wrangler d1 execute rollashield_quotes --file=d1-migration-002-selected-payment-method.sql
-- For local: wrangler d1 execute rollashield_quotes --local --file=d1-migration-002-selected-payment-method.sql

ALTER TABLE quotes ADD COLUMN selected_payment_method TEXT;
