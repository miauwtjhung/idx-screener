-- Add this to your existing schema.sql, or run it once directly against
-- the Neon DB (e.g. via the Neon SQL Editor in the dashboard).

CREATE TABLE IF NOT EXISTS market_snapshot (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL UNIQUE,
  data JSONB NOT NULL,          -- { indices: [...], currencies: [...], commodities: [...], crypto: [...] }
  summary_en TEXT,
  summary_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_snapshot_date ON market_snapshot (snapshot_date DESC);

-- Added for the 17:00 WIB market-close recap (Today Closing tab)
ALTER TABLE market_snapshot ADD COLUMN IF NOT EXISTS close_data JSONB;
ALTER TABLE market_snapshot ADD COLUMN IF NOT EXISTS close_summary_en TEXT;
ALTER TABLE market_snapshot ADD COLUMN IF NOT EXISTS close_summary_id TEXT;
