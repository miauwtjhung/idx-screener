// api/market-close-cron.js
// Triggered once a day by Vercel Cron at 17:00 WIB (10:00 UTC), shortly after
// the Indonesia Stock Exchange closes. Fetches the same curated list of global
// indices, currencies, commodities, and crypto, asks Claude to write an
// end-of-day recap in English and Bahasa Indonesia, and saves the result to
// the close_data / close_summary_en / close_summary_id columns on the
// market_snapshot table (same row as the pre-opening snapshot, keyed by date).
//
// Protected via CRON_SECRET so only Vercel's scheduler (or someone who has
// the secret) can trigger it - see Vercel's Cron Jobs docs.

import { sql } from "./_db.js";
import { fetchYahooQuotes } from "./_yahoo.js";
import { generateMarketCloseSummary } from "./_claude.js";

const SYMBOLS = [
  // Indices
  { symbol: "^JKSE", name: "IDX Composite (IHSG)", category: "indices" },
  { symbol: "^GSPC", name: "S&P 500", category: "indices" },
  { symbol: "^DJI", name: "Dow Jones", category: "indices" },
  { symbol: "^IXIC", name: "Nasdaq", category: "indices" },
  { symbol: "^N225", name: "Nikkei 225", category: "indices" },
  { symbol: "^HSI", name: "Hang Seng", category: "indices" },
  { symbol: "^FTSE", name: "FTSE 100", category: "indices" },
  { symbol: "^GDAXI", name: "DAX", category: "indices" },
  { symbol: "^STI", name: "Straits Times", category: "indices" },
  // Currencies
  { symbol: "IDR=X", name: "USD/IDR", category: "currencies" },
  { symbol: "EURUSD=X", name: "EUR/USD", category: "currencies" },
  { symbol: "JPY=X", name: "USD/JPY", category: "currencies" },
  { symbol: "GBPUSD=X", name: "GBP/USD", category: "currencies" },
  { symbol: "DX-Y.NYB", name: "US Dollar Index", category: "currencies" },
  // Commodities
  { symbol: "GC=F", name: "Gold", category: "commodities" },
  { symbol: "SI=F", name: "Silver", category: "commodities" },
  { symbol: "CL=F", name: "Crude Oil (WTI)", category: "commodities" },
  // Crypto
  { symbol: "BTC-USD", name: "Bitcoin", category: "crypto" },
  { symbol: "ETH-USD", name: "Ethereum", category: "crypto" },
];

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const symbols = SYMBOLS.map((s) => s.symbol);
    const results = await fetchYahooQuotes(symbols);

    const bySymbol = {};
    results.forEach((q) => {
      bySymbol[q.symbol] = q;
    });

    const grouped = { indices: [], currencies: [], commodities: [], crypto: [] };
    for (const s of SYMBOLS) {
      const q = bySymbol[s.symbol];
      grouped[s.category].push({
        symbol: s.symbol,
        name: s.name,
        price: q?.regularMarketPrice ?? null,
        chg: q?.regularMarketChangePercent ?? null,
        chgAbs: q?.regularMarketChange ?? null,
      });
    }

    const [summaryEn, summaryId] = await Promise.all([
      generateMarketCloseSummary(grouped, "en"),
      generateMarketCloseSummary(grouped, "id"),
    ]);

    const today = new Date().toISOString().slice(0, 10);

    await sql`
      INSERT INTO market_snapshot (snapshot_date, close_data, close_summary_en, close_summary_id)
      VALUES (${today}, ${JSON.stringify(grouped)}::jsonb, ${summaryEn}, ${summaryId})
      ON CONFLICT (snapshot_date)
      DO UPDATE SET
        close_data = EXCLUDED.close_data,
        close_summary_en = EXCLUDED.close_summary_en,
        close_summary_id = EXCLUDED.close_summary_id,
        created_at = now()
    `;

    return res.status(200).json({ ok: true, date: today });
  } catch (err) {
    return res.status(500).json({ error: "Failed to build market close snapshot", detail: String(err) });
  }
}
