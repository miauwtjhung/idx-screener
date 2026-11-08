# Maxtrade

Maxtrade (repo: `idx-screener`) is a web app for following the Indonesia Stock Exchange (IDX) and tracking a personal portfolio. It covers live market data, a stock screener, fundamentals rankings, AI-written stock analysis, TradingView charts, and a multi-asset portfolio tracker with daily AI summaries.

Built with React 19 + Vite + Tailwind CSS 4 on the frontend and Vercel serverless functions on the backend. Data lives in Neon Postgres, sign-in is handled by Clerk, and AI text comes from Claude (Haiku 4.5).

> Nothing in this app is financial advice. Signals, rankings and AI views are rule-based or automated summaries of public data.

---

## Tabs

| Tab | What it does | Sign-in |
|---|---|---|
| **Market Snapshot** | One page: an IHSG intraday chart, live prices for global indices, currencies, commodities and crypto, and below them the 06:00 WIB pre-opening AI commentary in English or Bahasa Indonesia. | No |
| **Screener** | Every IDX-listed company (`public/idx-companies.json`) with live price, change, market cap, P/E, dividend yield and volume. Search, filter by board and sector, sort, and page through results. Each row has a transparent rule-based **signal** (`src/signal.js`), and clicking a row opens a detail modal with a TradingView mini chart. | No |
| **Fundamentals** | Ready-made rankings: high dividend, low P/E, P/E below sector, low P/BV, high ROE, ROE at a low price, biggest caps, value traded, near 52-week low, and more. You can limit them to the top 100 or 300 companies or include all of them. Each ranking shows its rule in plain words (`src/fundamentalRankings.js`). | No |
| **AI Analysis** | Search one stock to see its profile, valuation, annual financials, dividend history, splits, technicals (RSI and moving averages), analyst consensus and recent news (Google News + Yahoo). An optional AI view gives a short-term and long-term Buy/Hold/Sell/Neutral call with confidence, reasons and risks, in English or Bahasa Indonesia. Anyone can read a saved view; only signed-in users can generate a new one, within an app-wide daily cap. | Generating only |
| **Charting** | A full-page TradingView Advanced Chart for any IDX ticker. | No |
| **Portfolio** | Multiple portfolios per user. Each one records transactions across **stocks, crypto, commodities (Antam gold, spot gold and silver), bonds and cash/deposits**, valued at live prices. The **Summary** sub-tab shows net worth by asset class, the latest daily AI summary, a time-weighted performance chart against a benchmark (IHSG, BTC or gold), a stacked asset-value history, and a monthly/yearly return table. | Yes |
| **About** | What Maxtrade is, what each tab does, contact (mt.lim@terasbaru.com) and the disclaimer. Also opens when you click the logo. | No |

---

## API routes

All routes live in `api/`. Files whose names start with `_` are shared helpers and are not routes. The Vercel Hobby plan allows **12 functions**, and the app uses all 12. New features therefore add a `?view=` mode to an existing route instead of a new file.

### Public

| Route | Description |
|---|---|
| `GET /api/idx-quotes?symbols=BBCA.JK,BBRI.JK` | Live Yahoo quotes in the shape the Screener uses. Cached for 60 s. |
| `GET /api/idx-quotes?view=fundamentals&symbols=…` | Same quotes plus forward P/E, P/BV, EPS, BVPS, dividend per share and reporting currency. Cached for 300 s. |
| `GET /api/idx-quotes?view=analysis&symbol=BBCA` | The full AI Analysis data bundle (no AI call). |
| `GET /api/idx-quotes?view=ai&symbol=BBCA&lang=en\|id` | Today's saved AI view for that stock and language, if one exists. |
| `GET /api/idx-quotes?view=ai&symbol=BBCA&lang=en&generate=1` | Generates a new AI view. Requires sign-in and is limited by `AI_DAILY_LIMIT`. Returns `429` when the limit is reached. |
| `GET /api/market-live` | Live prices for the curated global market list. |
| `GET /api/market-snapshot` | The latest saved pre-opening snapshot with its AI summaries. (It also returns the old `close_*` columns, which are no longer written.) |
| `GET /api/ihsg-chart` | Today's IHSG 5-minute intraday chart with open/high/low/change. |
| `GET /api/crypto-quotes?ids=bitcoin,ethereum` | Crypto prices in IDR from CoinGecko. |
| `GET /api/commodity-quotes?symbols=XAU,XAG,ANTAM` | Gold and silver spot prices in IDR per gram (goldprice.dev) and the Antam 1 g bar price (logam-mulia-api). |

### Authenticated (Clerk session token in `Authorization: Bearer …`)

| Route | Description |
|---|---|
| `GET / POST / PATCH / DELETE /api/portfolios` | List (with transactions), create `{name}`, rename `?id=` `{name}`, delete `?id=`. |
| `POST / DELETE /api/transactions` | Add a transaction, or delete one with `?id=`. Bonds require `faceValue`, `couponRate`, `couponFrequency`, `issueDate` and `maturityDate`. |
| `GET /api/portfolio-summary?portfolioId=` | The latest daily snapshot and AI summary. |
| `GET /api/portfolio-history?portfolioId=&days=180&benchmark=^JKSE` | Daily snapshots, cash flows between snapshots, and benchmark closes. `days` ranges from 7 to 3660. `benchmark` is one of `^JKSE`, `BTC-IDR` or `GC=F`. |

### Cron (protected by `Authorization: Bearer $CRON_SECRET`)

| Route | Schedule (UTC) | What it does |
|---|---|---|
| `/api/market-snapshot-cron` | `0 23 * * *` (06:00 WIB) | Fetches the global market list and writes the EN and ID pre-opening summaries to `market_snapshot`. |
| `/api/portfolio-summary-cron` | `0 10 * * *` (17:00 WIB, after IDX close) | Values every portfolio at live prices and saves a row to `portfolio_snapshots`. AI summaries are written for at most `PORTFOLIO_AI_DAILY_LIMIT` portfolios a day, oldest first. |

Crons are defined in `vercel.json`. The Hobby plan allows only 2 cron jobs.

---

## Environment variables

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend (build time) | Yes | Clerk publishable key. Without it the app fails to start. |
| `CLERK_SECRET_KEY` | API | Yes | Verifies Clerk session tokens (`api/_auth.js`). |
| `DATABASE_URL` | API | Yes | Neon Postgres connection string (the pooled one). |
| `ANTHROPIC_API_KEY` | API | Yes, for AI features | Claude API key for all summaries and AI views. |
| `CRON_SECRET` | API | Yes, for crons | Shared secret for the two cron routes. Vercel sends it automatically. |
| `AI_DAILY_LIMIT` | API | No (default `50`) | App-wide cap on new AI Analysis views per Jakarta day. |
| `PORTFOLIO_AI_DAILY_LIMIT` | API | No (default `10`) | Cap on portfolio AI summaries per cron run/day. `0` turns them off. |

Set them in the Vercel project settings. For local work, put them in `.env.local`, which is gitignored (e.g. via `vercel env pull .env.local`).

---

## Database

Neon Postgres. The SQL files in the repo root are run by hand in the Neon SQL editor:

- `schema.sql`: `portfolios`, `transactions`
- `market-snapshot-schema.sql`: `market_snapshot` (the `close_*` columns are left over from the removed closing recap)
- `ai-analysis-schema.sql`: `ai_analysis_views`, `ai_usage_daily`. The app also creates these automatically on first use.

**Not yet in the SQL files:** the code also uses the tables and columns below. The definition here is inferred from the queries; match it to your existing database before running it.

```sql
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS asset_type TEXT DEFAULT 'stock',   -- stock|crypto|commodity|bond|cash|deposit
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS face_value NUMERIC,
  ADD COLUMN IF NOT EXISTS coupon_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS coupon_frequency TEXT,              -- monthly|quarterly|semi-annual|annual
  ADD COLUMN IF NOT EXISTS issue_date DATE,
  ADD COLUMN IF NOT EXISTS maturity_date DATE;
-- qty must hold fractions for crypto/gold:
ALTER TABLE transactions ALTER COLUMN qty TYPE NUMERIC;

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  net_worth NUMERIC, stock_value NUMERIC, crypto_value NUMERIC,
  commodity_value NUMERIC, bond_value NUMERIC, cash_value NUMERIC,
  summary_text TEXT,
  PRIMARY KEY (portfolio_id, snapshot_date)
);
```

---

## Development

```bash
npm install
npm run dev       # Vite frontend only, at http://localhost:5173
vercel dev        # frontend + /api functions (needs the Vercel CLI and env vars)
npm run build     # production build to dist/
npm run lint      # oxlint
```

`npm run dev` does not serve `/api/*`. Use `vercel dev` to exercise the backend locally. To trigger a cron by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/market-snapshot-cron
```

`test-snapshot.mjs` is a quick manual check of the Claude market summary prompt (`node test-snapshot.mjs`). It needs `ANTHROPIC_API_KEY` and `dotenv`.

## Data sources

- **Yahoo Finance**: quotes, charts, quoteSummary, fundamentals timeseries and news, through an unofficial cookie + crumb session (`api/_yahoo.js`)
- **CoinGecko**: crypto prices in IDR
- **goldprice.dev**: gold and silver spot prices in IDR per gram
- **logam-mulia-api**: Antam gold bar prices
- **Google News RSS**: Indonesian news for AI Analysis
- **TradingView widgets**: charts
- **Claude API** (`claude-haiku-4-5-20251001`): market, portfolio and stock narratives
