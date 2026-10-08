// Vercel serverless function: /api/idx-fundamentals
// Used only by the Fundamentals tab. Fetches the same Yahoo Finance quote
// data as /api/idx-quotes, but also passes through the valuation fields that
// the Screener doesn't need: price-to-book, EPS, book value per share,
// forward P/E and the annual dividend per share.
//
// Kept as a separate route on purpose, so the Screener's own endpoint and
// its response shape stay exactly as they are.

import { fetchYahooQuotes } from "./_yahoo.js";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Maps one raw Yahoo quote to the shape the Fundamentals tab expects.
// The first block uses the same names and units as /api/idx-quotes, so a row
// can be handed to the existing stock detail view unchanged.
export function mapFundamentalQuote(q) {
  const yieldFraction = num(q.trailingAnnualDividendYield);
  const cap = num(q.marketCap);
  const volume = num(q.regularMarketVolume);

  return {
    ticker: String(q.symbol || "").replace(".JK", ""),
    name: q.longName || q.shortName || q.symbol,
    price: num(q.regularMarketPrice),
    chg: num(q.regularMarketChangePercent),
    cap: cap ? cap / 1_000_000_000_000 : null, // in trillions IDR
    pe: num(q.trailingPE),
    div: yieldFraction ? yieldFraction * 100 : null, // percent
    vol: volume ? volume / 1_000_000 : null, // millions of shares
    low52: num(q.fiftyTwoWeekLow),
    high52: num(q.fiftyTwoWeekHigh),

    // Fundamentals-only fields
    fpe: num(q.forwardPE),
    pbv: num(q.priceToBook),
    eps: num(q.epsTrailingTwelveMonths),
    bvps: num(q.bookValue),
    divRate: num(q.trailingAnnualDividendRate), // dividend per share, last 12 months
    fcur: q.financialCurrency || null, // currency the company reports in
  };
}

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
    const quotes = results.map(mapFundamentalQuote);

    // Valuation figures move slowly, so cache a little longer than live prices.
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    return res.status(200).json({ quotes });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch fundamentals", detail: String(err) });
  }
}
