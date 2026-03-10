-- Migration 002: Add quote_data_history table for versioning
-- Run: wrangler d1 execute rollashield_quotes --file=d1-migration-002-quote-history.sql
-- Also run against remote: wrangler d1 execute rollashield_quotes --remote --file=d1-migration-002-quote-history.sql

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
