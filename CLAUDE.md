# CLAUDE.md

Guidance for Claude Code when working in this repo. See `README.md` for the user-facing overview.

## What this is

Maxtrade: an IDX (Indonesia Stock Exchange) screener and portfolio tracker. The frontend is a React 19 + Vite + Tailwind 4 single page app in `src/`, and the backend is Vercel serverless functions in `api/`. Data is in Neon Postgres (`@neondatabase/serverless`), auth is Clerk (`@clerk/react` / `@clerk/backend`), and AI text comes from the Claude Messages API over plain `fetch` (no SDK). The code is plain JavaScript (ESM, `"type": "module"`), with no TypeScript and no test runner configured.

## Commands

- `npm run dev`: Vite only. `/api` routes are **not** served.
- `vercel dev`: frontend + API locally. Env vars come from `.env.local` (`vercel env pull`).
- `npm run build`: production build.
- `npm run lint`: oxlint (`.oxlintrc.json`; react + oxc plugins).

## Layout

```
src/
  App.jsx               Maxtrade logo + tab bar (order: Market Snapshot, AI Analysis, Screener, Fundamentals, Charting, Portfolio, About) + Clerk sign-in; tabs switch via state (no router)
  MarketSnapshot.jsx    "Market Snapshot" tab (state key "today"): IHSG chart, live prices, pre-open commentary, EN/ID toggle
  IDXScreener.jsx       "Screener" tab; signal.js = rule-based signal; StockDetailModal + TradingViewChart
  Fundamentals.jsx      "Fundamentals" tab; rules live in fundamentalRankings.js
  StockAnalysis.jsx     "AI Analysis" tab; strings/number formats in analysisText.js (EN/ID)
  Charting.jsx          "Charting" tab: TradingView Advanced Chart widget
  About.jsx             "About" tab (also opened by clicking the logo)
  Portfolio.jsx         "Portfolio" tab (sub-tabs: Summary, Stocks, Crypto, Commodities, Bonds, Cash & Deposits)
  PortfolioCharts.jsx   performance vs benchmark (time-weighted) + stacked asset history
  historyPeriods.js     monthly/yearly return table from daily snapshots
public/
  idx-companies.json    master list of IDX tickers {code,name,board,sector}. Loaded once in App.jsx and passed down
  idx-sectors.json      code -> {sector, industry}
api/
  _yahoo.js             Yahoo cookie+crumb session (cached 10 min); fetchYahooQuotes / fetchYahooChart / fetchYahooJson
  _auth.js              getUserId(req): verifies the Clerk Bearer token, returns the user id or null
  _db.js                shared `sql` tagged-template client
  _claude.js            market pre-open summary + portfolio summary prompts; formatIdr
  _fundamentals.js      maps a Yahoo quote to the Fundamentals shape
  _analysis.js          all of AI Analysis: data bundle, parsers, technicals, AI prompt, daily cap, persistence
  <route>.js            one Vercel function per file (12 total)
```

## API routes (12 functions, the Hobby plan maximum)

Public: `idx-quotes` (plus `?view=fundamentals|analysis|ai`), `market-live`, `market-snapshot`, `ihsg-chart`, `crypto-quotes`, `commodity-quotes`.
Clerk-authenticated: `portfolios` (GET/POST/PATCH/DELETE), `transactions` (POST/DELETE), `portfolio-summary`, `portfolio-history`.
Cron (`Authorization: Bearer $CRON_SECRET`): `market-snapshot-cron`, `portfolio-summary-cron`.

**Do not add a new file in `api/` without an underscore prefix.** It would be a 13th function and the deploy fails. Add a `?view=` branch to an existing route instead, and put the logic in a `_helper.js` loaded lazily with dynamic `import()`, the way `idx-quotes.js` loads `_analysis.js`.

## Crons (`vercel.json`, Hobby plan max of 2)

- `0 23 * * *` → `/api/market-snapshot-cron` (06:00 WIB): writes the pre-open data and EN+ID summaries to `market_snapshot`.
- `0 10 * * *` → `/api/portfolio-summary-cron` (17:00 WIB): values each portfolio and upserts `portfolio_snapshots`. (The market-close recap that used to run here was removed; `market_snapshot.close_*` columns are unused.) AI summaries are capped at `PORTFOLIO_AI_DAILY_LIMIT` (default 10, oldest portfolios first). Summaries already written today count toward the cap and are kept via `COALESCE`.

## Env vars

| Var | Used in |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | `src/main.jsx` (the app throws if missing) |
| `CLERK_SECRET_KEY` | `api/_auth.js` |
| `DATABASE_URL` | `api/_db.js` |
| `ANTHROPIC_API_KEY` | `api/_claude.js`, `api/_analysis.js` |
| `CRON_SECRET` | both cron routes |
| `AI_DAILY_LIMIT` (default 50) | `api/_analysis.js`: new AI views per Jakarta day, app-wide |
| `PORTFOLIO_AI_DAILY_LIMIT` (default 10, 0 = off) | `api/portfolio-summary-cron.js` |

## Database tables

`portfolios`, `transactions` (`schema.sql`); `market_snapshot` (`market-snapshot-schema.sql`); `ai_analysis_views`, `ai_usage_daily` (`ai-analysis-schema.sql`, also auto-created by `_analysis.js`); `portfolio_snapshots` (**no SQL file**, see the README). `transactions` also has columns that are missing from `schema.sql`: `asset_type`, `currency`, `face_value`, `coupon_rate`, `coupon_frequency`, `issue_date`, `maturity_date`. If you change the schema, update the SQL files too.

## Conventions and gotchas

- **Do arithmetic in code, never in the prompt.** Every AI prompt receives figures that are already computed and turned into words (`formatIdr`, `words()` in `_analysis.js`), because the model misjudged magnitudes of raw IDR numbers. Prompts ask for plain prose with no markdown, and the output is sanitised afterwards.
- Model: `claude-haiku-4-5-20251001`, defined in both `_claude.js` and `_analysis.js`.
- **Dates use Jakarta time (UTC+7)** for AI views and charts (`jakartaDate`, `jakartaToday`). The cron routes use the UTC date (`toISOString().slice(0,10)`).
- AI views are saved per `(code, lang, Jakarta date)` and shared by all visitors. A slot in `ai_usage_daily` is reserved atomically before calling Claude and released if the call fails.
- **Companies that report in USD** (`financialCurrency === "USD"`): Yahoo's BVPS, forward P/E and EV/EBITDA mix USD and IDR. Both `_analysis.js` and the Fundamentals tab convert using `IDR=X`. Keep that handling when touching valuation code.
- Holdings use average cost. `computeHoldings` in `portfolio-summary-cron.js` mirrors the frontend's version in `Portfolio.jsx`, so a change to one must be made in both. Bonds are valued at face value (held to maturity). Cash and deposits are valued at the amount invested.
- In portfolio history, buys and sells are recorded as flows, so performance is time-weighted and adding money does not count as a gain.
- Every authenticated route checks `portfolios.user_id = userId` before reading or writing.
- Yahoo is unofficial (cookie + crumb). On failure, routes return `500` with `{error, detail}`. The AI Analysis bundle uses `settled()` so one failing source does not break the rest, and reports per-source status in `sources`.
- Signals and rankings are informational and rule-based by design. Keep every rule visible to the user, and keep the "not financial advice" framing.
- User-facing AI Analysis text exists in both English and Bahasa Indonesia (`analysisText.js`). Add new strings in both languages.
- `.agents/skills/` holds vendored Clerk agent skills. They are not app code.
