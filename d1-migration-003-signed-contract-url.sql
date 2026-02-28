-- Migration 003: Add signed_contract_url column to quotes table
-- Run: wrangler d1 execute rollashield_quotes --file=d1-migration-003-signed-contract-url.sql
ALTER TABLE quotes ADD COLUMN signed_contract_url TEXT;
