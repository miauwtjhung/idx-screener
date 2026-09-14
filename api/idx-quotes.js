// Vercel serverless function: /api/idx-quotes
// Fetches live quotes for a list of IDX tickers (e.g. BBCA.JK) from Yahoo Finance
// and returns them in a clean shape for the frontend.
//
// Yahoo Finance now requires a session cookie + "crumb" token on quote
// requests (added as an anti-scraping measure), so we fetch those first
// and reuse them for a short window instead of hitting Yahoo on every call.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

let cachedCrumb = null;
let cachedCookie = null;
let cacheExpiry = 0;

async function getCrumbAndCookie() {
  const now = Date.now();
  if (cachedCrumb && cachedCookie && now < cacheExpiry) {
    return { crumb: cachedCrumb, cookie: cachedCookie };
  }

  // Step 1: hit Yahoo's homepage to receive a session cookie
  const homeRes = await fetch("https://fc.yahoo.com", {
    headers: HEADERS,
    redirect: "manual",
  });
  let cookies = (homeRes.headers.get("set-cookie") || "")
    .split(",")
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

  if (!cookies) {
    const financeRes = await fetch("https://finance.yahoo.com", { headers: HEADERS });
    cookies = (financeRes.headers.get("set-cookie") || "")
      .split(",")
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
  }

  if (!cookies) throw new Error("Could not obtain a Yahoo session cookie");

  // Step 2: use that cookie to request a crumb token
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...HEADERS, Cookie: cookies },
  });
  const crumb = await crumbRes.text();

  if (!crumb || crumb.includes("<html")) throw new Error("Could not obtain a Yahoo crumb");

  cachedCrumb = crumb;
  cachedCookie = cookies;
  cacheExpiry = now + 10 * 60 * 1000; // reuse for 10 minutes
  return { crumb, cookie: cookies };
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
    const { crumb, cookie } = await getCrumbAndCookie();

    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
      symbols.join(",")
    )}&crumb=${encodeURIComponent(crumb)}`;

    const yahooRes = await fetch(url, {
      headers: { ...HEADERS, Cookie: cookie },
    });

    if (!yahooRes.ok) {
      throw new Error(`Yahoo responded with status ${yahooRes.status}`);
    }

    const data = await yahooRes.json();
    const results = data?.quoteResponse?.result || [];

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
