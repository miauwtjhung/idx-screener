// Vercel serverless function: /api/idx-quotes
// Fetches live quotes for a list of IDX tickers (e.g. BBCA.JK) from Yahoo Finance
// and returns them in a clean shape for the frontend.
//
// The Yahoo cookie/crumb handling now lives in ./_yahoo.js, shared with the
// market snapshot cron job — this file just maps the raw results to the
// shape the IDX screener/portfolio pages expect.

import { fetchYahooQuotes } from "./_yahoo.js";

export default async function handler(req, res) {
  const symbols = (req.query.symbols || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return res.status(400).json({ error: "No symbols provided" });
  }

  try {
    const results = await fetchYahooQuotes(symbols);

    const quotes = results.map((q) => ({
      ticker: q.symbol.replace(".JK", ""),
      name: q.longName || q.shortName || q.symbol,
      price: q.regularMarketPrice ?? null,
      chg: q.regularMarketChangePercent ?? null,
      cap: q.marketCap ? q.marketCap / 1_000_000_000_000 : null, // in trillions IDR
      pe: q.trailingPE ?? null,
      div: q.trailingAnnualDividendYield ? q.trailingAnnualDividendYield * 100 : null,
      vol: q.regularMarketVolume ? q.regularMarketVolume / 1_000_000 : null, // millions
      low52: q.fiftyTwoWeekLow ?? null,
      high52: q.fiftyTwoWeekHigh ?? null,
    }));

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    return res.status(200).json({ quotes });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch quotes", detail: String(err) });
  }
}
