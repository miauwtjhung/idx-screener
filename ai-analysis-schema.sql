-- Tables for the AI Analysis tab. The app creates them automatically on
-- first use; this file is here for reference, or to run once in the Neon
-- SQL Editor if you prefer to create them yourself.

-- One saved AI view per stock, language and day (Jakarta time), shared by
-- every visitor, so the same stock is never written twice in a day.
CREATE TABLE IF NOT EXISTS ai_analysis_views (
  code TEXT NOT NULL,             -- e.g. BBCA
  lang TEXT NOT NULL,             -- 'en' or 'id'
  view_date DATE NOT NULL,        -- Jakarta date
  view JSONB NOT NULL,            -- { shortTerm, longTerm, newsSummary, risks, generatedAt, model }
  created_by TEXT,                -- Clerk user ID that triggered it
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (code, lang, view_date)
);

-- How many new AI views were written each day, for the app-wide daily limit
-- (AI_DAILY_LIMIT, default 50).
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  usage_date DATE PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

-- Useful checks:
--   SELECT * FROM ai_usage_daily ORDER BY usage_date DESC LIMIT 14;
--   SELECT code, lang, view_date, created_at FROM ai_analysis_views ORDER BY created_at DESC LIMIT 50;
