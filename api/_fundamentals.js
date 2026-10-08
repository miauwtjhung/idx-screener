// api/_fundamentals.js — shared helper for the Fundamentals tab.
// Maps a raw Yahoo quote to the shape the Fundamentals tab expects: the same
// fields the Screener gets, plus the valuation figures it doesn't need
// (price-to-book, EPS, book value per share, forward P/E, dividend per share).
//
// The underscore keeps this file from becoming its own route. The Vercel
// Hobby plan allows at most 12 routes per deployment, and the app already
// uses all 12, so /api/idx-quotes serves this shape when asked with
// ?view=fundamentals.

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
