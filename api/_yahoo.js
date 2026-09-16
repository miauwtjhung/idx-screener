// api/_yahoo.js — shared helper: Yahoo Finance session cookie + crumb
// handling, extracted from idx-quotes.js so any route that needs live
// quotes (the IDX screener, the market snapshot cron) can reuse the same
// auth dance instead of duplicating it.

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

// Fetches raw Yahoo quote results for a list of symbols (e.g. ["BBCA.JK", "^JKSE", "BTC-USD"]).
// Returns the raw quoteResponse.result array — callers map it to their own shape.
export async function fetchYahooQuotes(symbols) {
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
  return data?.quoteResponse?.result || [];
}
