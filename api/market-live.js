// api/market-live.js
//
// GET /api/market-live -> live market data (Yahoo, fetched right now).
// Numbers only, no narrative - this is the on-demand "Market Snapshot"
// view, refreshed every time the user opens it.

import { fetchYahooQuotes } from "./_yahoo.js";

const SYMBOLS = [
  { symbol: "^JKSE", name: "IDX Composite (IHSG)", category: "indices" },
  { symbol: "^GSPC", name: "S&P 500", category: "indices" },
  { symbol: "^DJI", name: "Dow Jones", category: "indices" },
  { symbol: "^IXIC", name: "Nasdaq", category: "indices" },
  { symbol: "^N225", name: "Nikkei 225", category: "indices" },
  { symbol: "^HSI", name: "Hang Seng", category: "indices" },
  { symbol: "^FTSE", name: "FTSE 100", category: "indices" },
  { symbol: "^GDAXI", name: "DAX", category: "indices" },
  { symbol: "^STI", name: "Straits Times", category: "indices" },
  { symbol: "IDR=X", name: "USD/IDR", category: "currencies" },
  { symbol: "EURUSD=X", name: "EUR/USD", category: "currencies" },
  { symbol: "JPY=X", name: "USD/JPY", category: "currencies" },
  { symbol: "GBPUSD=X", name: "GBP/USD", category: "currencies" },
  { symbol: "DX-Y.NYB", name: "US Dollar Index", category: "currencies" },
  { symbol: "GC=F", name: "Gold", category: "commodities" },
  { symbol: "SI=F", name: "Silver", category: "commodities" },
  { symbol: "CL=F", name: "Crude Oil (WTI)", category: "commodities" },
  { symbol: "BTC-USD", name: "Bitcoin", category: "crypto" },
  { symbol: "ETH-USD", name: "Ethereum", category: "crypto" },
];

export default async function handler(req, res) {
  try {
    const symbols = SYMBOLS.map((s) => s.symbol);
    const results = await fetchYahooQuotes(symbols);

    const bySymbol = {};
    results.forEach((q) => { bySymbol[q.symbol] = q; });

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

    return res.status(200).json({ data: grouped, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load live market data", detail: String(err) });
  }
}
