// api/_analysis.js — everything behind the AI Analysis tab.
//
// Served through /api/idx-quotes (the Vercel Hobby plan allows 12 routes and
// the app already uses all 12):
//   GET /api/idx-quotes?view=analysis&symbol=BBCA  -> data bundle (public market data)
//   GET /api/idx-quotes?view=ai&symbol=BBCA        -> AI short/long-term view (signed-in users only)
//
// Every figure is fetched or calculated here in code. The AI only writes the
// view and the reasons, from figures it is handed already worked out, so it
// never has to do arithmetic or judge the size of a raw number.

import { fetchYahooQuotes, fetchYahooJson } from "./_yahoo.js";
import { getUserId } from "./_auth.js";

const MODEL = "claude-haiku-4-5-20251001"; // same model as the daily summaries
export const VIEWS = ["Buy", "Hold", "Sell", "Neutral"];
export const CONFIDENCE = ["Low", "Medium", "High"];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
// Yahoo wraps most numbers as { raw, fmt }.
export const raw = (v) => (isNum(v) ? v : isNum(v?.raw) ? v.raw : null);

// YYYY-MM-DD in Asia/Jakarta (UTC+7)
export const jakartaDate = (unixSeconds) => new Date((unixSeconds + 7 * 3600) * 1000).toISOString().slice(0, 10);

export function normaliseCode(input) {
  const code = String(input || "").trim().toUpperCase().replace(/\.JK$/, "");
  return /^[A-Z0-9]{2,6}$/.test(code) ? code : null;
}

// ---------------------------------------------------------------------------
// Parsers (pure, unit-tested)
// ---------------------------------------------------------------------------

// quoteSummary modules -> flat fundamentals + profile + analyst consensus
export function parseSummary(json) {
  const r = json?.quoteSummary?.result?.[0] || {};
  const fd = r.financialData || {};
  const ks = r.defaultKeyStatistics || {};
  const sd = r.summaryDetail || {};
  const ap = r.assetProfile || {};
  const ce = r.calendarEvents || {};
  const trend = (r.recommendationTrend?.trend || []).find((t) => t.period === "0m") || null;

  return {
    profile: {
      sector: ap.sector || null,
      industry: ap.industry || null,
      summary: ap.longBusinessSummary || null,
      website: ap.website || null,
      employees: raw(ap.fullTimeEmployees),
    },
    fundamentals: {
      financialCurrency: fd.financialCurrency || null,
      pe: raw(sd.trailingPE),
      forwardPe: raw(ks.forwardPE) ?? raw(sd.forwardPE),
      pbv: raw(ks.priceToBook),
      bvps: raw(ks.bookValue),
      eps: raw(ks.trailingEps),
      forwardEps: raw(ks.forwardEps),
      roe: raw(fd.returnOnEquity), // fraction
      roa: raw(fd.returnOnAssets),
      grossMargin: raw(fd.grossMargins),
      operatingMargin: raw(fd.operatingMargins),
      profitMargin: raw(fd.profitMargins),
      revenueGrowth: raw(fd.revenueGrowth),
      earningsGrowth: raw(fd.earningsGrowth),
      debtToEquity: raw(fd.debtToEquity), // Yahoo gives this as a percentage
      currentRatio: raw(fd.currentRatio),
      totalCash: raw(fd.totalCash),
      totalDebt: raw(fd.totalDebt),
      totalRevenue: raw(fd.totalRevenue),
      operatingCashflow: raw(fd.operatingCashflow),
      freeCashflow: raw(fd.freeCashflow),
      evToEbitda: raw(ks.enterpriseToEbitda),
      beta: raw(ks.beta) ?? raw(sd.beta),
      payoutRatio: raw(sd.payoutRatio), // fraction
      fiveYearAvgYield: raw(sd.fiveYearAvgDividendYield), // already in %
      sharesOutstanding: raw(ks.sharesOutstanding),
      heldByInsiders: raw(ks.heldPercentInsiders),
      heldByInstitutions: raw(ks.heldPercentInstitutions),
    },
    events: {
      earningsDates: (ce.earnings?.earningsDate || []).map(raw).filter(isNum).map(jakartaDate),
      exDividendDate: isNum(raw(ce.exDividendDate)) ? jakartaDate(raw(ce.exDividendDate)) : null,
      dividendPayDate: isNum(raw(ce.dividendDate)) ? jakartaDate(raw(ce.dividendDate)) : null,
      lastSplitFactor: ks.lastSplitFactor || null,
    },
    analysts: {
      count: raw(fd.numberOfAnalystOpinions),
      recommendationKey: fd.recommendationKey && fd.recommendationKey !== "none" ? fd.recommendationKey : null,
      recommendationMean: raw(fd.recommendationMean), // 1 = strong buy … 5 = sell
      targetMean: raw(fd.targetMeanPrice),
      targetHigh: raw(fd.targetHighPrice),
      targetLow: raw(fd.targetLowPrice),
      trend: trend
        ? { strongBuy: trend.strongBuy ?? 0, buy: trend.buy ?? 0, hold: trend.hold ?? 0, sell: trend.sell ?? 0, strongSell: trend.strongSell ?? 0 }
        : null,
    },
  };
}

const TIMESERIES = {
  annualTotalRevenue: "revenue",
  annualNetIncome: "netIncome",
  annualDilutedEPS: "eps",
  annualStockholdersEquity: "equity",
  annualOperatingCashFlow: "operatingCashFlow",
  annualFreeCashFlow: "freeCashFlow",
  annualTotalDebt: "totalDebt",
};
export const TIMESERIES_TYPES = Object.keys(TIMESERIES);

// fundamentals-timeseries -> [{ year, revenue, netIncome, ... , currency }], newest first
export function parseTimeseries(json) {
  const byYear = {};
  for (const series of json?.timeseries?.result || []) {
    const type = series?.meta?.type?.[0];
    const key = TIMESERIES[type];
    if (!key) continue;
    for (const item of series[type] || []) {
      if (!item || !item.asOfDate) continue;
      const value = raw(item.reportedValue);
      if (!isNum(value)) continue;
      const year = item.asOfDate.slice(0, 4);
      byYear[year] ||= { year, currency: item.currencyCode || null };
      byYear[year][key] = value;
      if (!byYear[year].currency && item.currencyCode) byYear[year].currency = item.currencyCode;
    }
  }
  return Object.values(byYear).sort((a, b) => b.year.localeCompare(a.year)).slice(0, 5);
}

// chart result -> { closes, volumes, dates } with gaps removed
export function parseChart(json) {
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const dates = [];
  const closes = [];
  const volumes = [];
  ts.forEach((t, i) => {
    const c = q.close?.[i];
    if (!isNum(c)) return;
    dates.push(jakartaDate(t));
    closes.push(c);
    volumes.push(isNum(q.volume?.[i]) ? q.volume[i] : null);
  });
  return { meta: result.meta || {}, dates, closes, volumes, events: result.events || {} };
}

const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

// Wilder's 14-day RSI
export function rsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

// Daily closes (oldest first) -> technical snapshot
export function computeTechnicals(closes, volumes = []) {
  const n = closes.length;
  if (n < 20) return null;
  const price = closes[n - 1];
  const sma = (k) => (n >= k ? mean(closes.slice(n - k)) : null);
  const ret = (k) => (n > k ? (price / closes[n - 1 - k] - 1) * 100 : null);
  const window = closes.slice(-252);
  const hi = Math.max(...window);
  const lo = Math.min(...window);
  const vols = volumes.filter(isNum);
  const vol20 = vols.length >= 20 ? mean(vols.slice(-20)) : null;
  const vol63 = vols.length >= 63 ? mean(vols.slice(-63)) : null;
  const ma20 = sma(20);
  const ma50 = sma(50);
  const ma200 = sma(200);
  const vs = (ma) => (ma ? (price / ma - 1) * 100 : null);

  return {
    price,
    ma20, ma50, ma200,
    vsMa20: vs(ma20), vsMa50: vs(ma50), vsMa200: vs(ma200),
    rsi14: rsi(closes),
    ret1m: ret(21), ret3m: ret(63), ret6m: ret(126), ret1y: n > 1 ? (price / closes[0] - 1) * 100 : null,
    high52: hi, low52: lo,
    pos52: hi > lo ? (price - lo) / (hi - lo) : null,
    volumeRatio: vol20 && vol63 ? vol20 / vol63 : null,
  };
}

// Monthly chart with dividend events -> per-payment list, per-year totals, trailing yield
export function dividendHistory(chart, price, today = new Date().toISOString().slice(0, 10)) {
  const divs = chart?.events?.dividends || {};
  const payments = Object.values(divs)
    .filter((d) => isNum(d?.amount) && isNum(d?.date))
    .map((d) => ({ date: jakartaDate(d.date), amount: d.amount }))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Year-end price per year, from the monthly closes
  const yearEnd = {};
  (chart?.dates || []).forEach((date, i) => { yearEnd[date.slice(0, 4)] = chart.closes[i]; });
  const thisYear = today.slice(0, 4);

  const byYearMap = {};
  for (const p of payments) {
    const y = p.date.slice(0, 4);
    byYearMap[y] ||= { year: y, total: 0, count: 0 };
    byYearMap[y].total += p.amount;
    byYearMap[y].count += 1;
  }
  const byYear = Object.values(byYearMap)
    .sort((a, b) => b.year.localeCompare(a.year))
    .map((y) => {
      const refPrice = y.year === thisYear && isNum(price) ? price : yearEnd[y.year];
      return { ...y, refPrice: refPrice ?? null, yield: isNum(refPrice) && refPrice > 0 ? (y.total / refPrice) * 100 : null, partial: y.year === thisYear };
    });

  const yearAgo = new Date(Date.parse(today) - 365 * 86400000).toISOString().slice(0, 10);
  const trailing = payments.filter((p) => p.date > yearAgo).reduce((s, p) => s + p.amount, 0);
  return {
    payments,
    byYear,
    trailing12m: payments.length ? trailing : null,
    trailingYield: payments.length && isNum(price) && price > 0 ? (trailing / price) * 100 : null,
  };
}

export function parseSplits(chart) {
  return Object.values(chart?.events?.splits || {})
    .filter((s) => isNum(s?.date))
    .map((s) => ({
      date: jakartaDate(s.date),
      ratio: s.splitRatio || (isNum(s.numerator) && isNum(s.denominator) ? `${s.numerator}:${s.denominator}` : null),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

const ENTITIES = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };
const decode = (s) =>
  String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(amp|quot|#39|apos|lt|gt|nbsp);/g, (m) => ENTITIES[m])
    .replace(/<[^>]+>/g, "")
    .trim();

// Google News RSS -> [{ title, source, url, date }]
export function parseGoogleNewsRss(xml) {
  return String(xml || "")
    .split(/<item>/i)
    .slice(1)
    .map((chunk) => {
      const tag = (name) => chunk.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1];
      const source = decode(tag("source"));
      let title = decode(tag("title"));
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      const pub = Date.parse(decode(tag("pubDate")));
      return { title, source: source || null, url: decode(tag("link")), date: Number.isFinite(pub) ? new Date(pub).toISOString() : null, origin: "Google News" };
    })
    .filter((n) => n.title && n.url);
}

// Yahoo search -> [{ title, source, url, date }]
export function parseYahooNews(json) {
  return (json?.news || [])
    .filter((n) => n?.title && n?.link)
    .map((n) => ({
      title: n.title,
      source: n.publisher || null,
      url: n.link,
      date: isNum(n.providerPublishTime) ? new Date(n.providerPublishTime * 1000).toISOString() : null,
      origin: "Yahoo Finance",
    }));
}

export function mergeNews(lists, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const n of lists.flat()) {
    const key = n.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, limit);
}

// "PT Bank Central Asia Tbk." -> "Bank Central Asia"
export function cleanCompanyName(name) {
  return String(name || "")
    .replace(/\(Persero\)/gi, "")
    .replace(/^PT\.?\s+/i, "")
    .replace(/\s*Tbk\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// The data bundle
// ---------------------------------------------------------------------------
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AIStockSearch/1.0)" } });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.text();
}

const settled = (p) => p.then((value) => ({ ok: true, value }), (err) => ({ ok: false, error: String(err?.message || err) }));
const status = (r) => (r.ok ? "ok" : `failed: ${r.error}`);

const bundleCache = new Map(); // code -> { at, bundle } (lives while the server instance is warm)
const BUNDLE_TTL = 10 * 60 * 1000;

export async function buildAnalysis(code, { now = new Date() } = {}) {
  const cached = bundleCache.get(code);
  if (cached && now.getTime() - cached.at < BUNDLE_TTL) return cached.bundle;

  const sym = `${code}.JK`;
  const enc = encodeURIComponent(sym);
  const period2 = Math.floor(now.getTime() / 1000);
  const period1 = period2 - 6 * 366 * 86400;

  const [quoteR, summaryR, seriesR, monthlyR, dailyR, yahooNewsR] = await Promise.all([
    settled(fetchYahooQuotes([sym, "IDR=X"])),
    settled(fetchYahooJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${enc}?modules=financialData,defaultKeyStatistics,summaryDetail,calendarEvents,recommendationTrend,assetProfile`)),
    settled(fetchYahooJson(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${enc}?type=${TIMESERIES_TYPES.join(",")}&period1=${period1}&period2=${period2}`)),
    settled(fetchYahooJson(`https://query1.finance.yahoo.com/v8/finance/chart/${enc}?range=10y&interval=1mo&events=div%2Csplit`)),
    settled(fetchYahooJson(`https://query1.finance.yahoo.com/v8/finance/chart/${enc}?range=1y&interval=1d`)),
    settled(fetchYahooJson(`https://query1.finance.yahoo.com/v1/finance/search?q=${enc}&newsCount=10&quotesCount=0`)),
  ]);

  const quotes = quoteR.ok ? quoteR.value : [];
  const q = quotes.find((x) => x.symbol === sym);
  if (!q || !isNum(q.regularMarketPrice)) return null; // unknown ticker or no price
  const usdIdr = quotes.find((x) => x.symbol === "IDR=X")?.regularMarketPrice ?? null;

  const name = q.longName || q.shortName || code;
  // Google News in Indonesian, last 30 days: company name or "saham CODE"
  const gQuery = `"${cleanCompanyName(name)}" OR "saham ${code}" when:30d`;
  const googleR = await settled(
    fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(gQuery)}&hl=id&gl=ID&ceid=ID:id`)
  );

  const summary = summaryR.ok ? parseSummary(summaryR.value) : parseSummary(null);
  const monthly = monthlyR.ok ? parseChart(monthlyR.value) : null;
  const daily = dailyR.ok ? parseChart(dailyR.value) : null;
  const price = q.regularMarketPrice;
  const f = summary.fundamentals;

  // Companies reporting in US dollars: Yahoo's book value per share is in
  // dollars while the price is in rupiah (see the Fundamentals tab).
  const usd = f.financialCurrency === "USD";
  const bvpsIdr = isNum(f.bvps) ? (usd ? (isNum(usdIdr) ? f.bvps * usdIdr : null) : f.bvps) : null;
  const pbv = isNum(bvpsIdr) && bvpsIdr > 0 ? price / bvpsIdr : null;

  const dividends = dividendHistory(monthly, price, now.toISOString().slice(0, 10));

  const bundle = {
    code,
    symbol: sym,
    name,
    generatedAt: now.toISOString(),
    price: {
      price,
      change: q.regularMarketChange ?? null,
      changePct: q.regularMarketChangePercent ?? null,
      currency: q.currency || "IDR",
      marketCap: q.marketCap ?? null,
      volume: q.regularMarketVolume ?? null,
      high52: q.fiftyTwoWeekHigh ?? null,
      low52: q.fiftyTwoWeekLow ?? null,
      exchangeTime: isNum(q.regularMarketTime) ? new Date(q.regularMarketTime * 1000).toISOString() : null,
    },
    profile: summary.profile,
    fundamentals: {
      ...f,
      pe: f.pe ?? (isNum(q.trailingPE) ? q.trailingPE : null),
      eps: f.eps ?? (isNum(q.epsTrailingTwelveMonths) ? q.epsTrailingTwelveMonths : null),
      pbv: pbv != null && pbv >= 0.02 && pbv <= 100 ? pbv : null,
      bvpsIdr,
      dividendYield: dividends.trailingYield, // from actual payments, last 12 months
      usdIdr: usd ? usdIdr : null,
    },
    annual: seriesR.ok ? parseTimeseries(seriesR.value) : [],
    dividends,
    splits: parseSplits(monthly),
    events: summary.events,
    technicals: daily ? computeTechnicals(daily.closes, daily.volumes) : null,
    analysts: summary.analysts,
    news: mergeNews([googleR.ok ? parseGoogleNewsRss(googleR.value) : [], yahooNewsR.ok ? parseYahooNews(yahooNewsR.value) : []]),
    sources: {
      quote: status(quoteR),
      fundamentals: status(summaryR),
      annualFinancials: status(seriesR),
      dividendsAndSplits: status(monthlyR),
      dailyPrices: status(dailyR),
      googleNews: status(googleR),
      yahooNews: status(yahooNewsR),
    },
  };

  bundleCache.set(code, { at: now.getTime(), bundle });
  return bundle;
}

// ---------------------------------------------------------------------------
// The AI view
// ---------------------------------------------------------------------------
function words(v, currency = "IDR") {
  if (!isNum(v)) return null;
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const units = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"]];
  for (const [size, word] of units) {
    if (a >= size * 0.995) return `${sign}${currency} ${(a / size).toFixed(2)} ${word}`;
  }
  return `${sign}${currency} ${Math.round(a).toLocaleString("en-US")}`;
}
const pct = (v, digits = 1) => (isNum(v) ? `${v > 0 ? "+" : ""}${v.toFixed(digits)}%` : null);
const plain = (v, digits = 1) => (isNum(v) ? v.toFixed(digits) : null);
const frac = (v, digits = 1) => (isNum(v) ? `${(v * 100).toFixed(digits)}%` : null);

// Figures for the prompt, already calculated and worded.
export function buildAiFacts(b) {
  const f = b.fundamentals || {};
  const t = b.technicals || {};
  const cur = f.financialCurrency || "IDR";
  const drop = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));

  return {
    company: drop({ code: b.code, name: b.name, sector: b.profile?.sector, industry: b.profile?.industry, reportsIn: cur }),
    price: drop({
      price: words(b.price?.price),
      changeToday: pct(b.price?.changePct, 2),
      marketCap: words(b.price?.marketCap),
    }),
    valuation: drop({
      peTrailing: plain(f.pe),
      peForward: plain(f.forwardPe),
      priceToBook: plain(f.pbv, 2),
      evToEbitda: plain(f.evToEbitda),
      dividendYieldLast12Months: pct(f.dividendYield, 2),
      fiveYearAverageYield: isNum(f.fiveYearAvgYield) ? `${f.fiveYearAvgYield.toFixed(2)}%` : null,
      payoutRatio: frac(f.payoutRatio, 0),
    }),
    quality: drop({
      returnOnEquity: frac(f.roe),
      returnOnAssets: frac(f.roa),
      profitMargin: frac(f.profitMargin),
      operatingMargin: frac(f.operatingMargin),
      revenueGrowthYoY: frac(f.revenueGrowth),
      earningsGrowthYoY: frac(f.earningsGrowth),
      debtToEquity: isNum(f.debtToEquity) ? `${f.debtToEquity.toFixed(0)}%` : null,
      currentRatio: plain(f.currentRatio, 2),
      freeCashFlow: words(f.freeCashflow, cur),
    }),
    annualResults: (b.annual || []).slice(0, 4).map((y) =>
      drop({ year: y.year, revenue: words(y.revenue, y.currency || cur), netIncome: words(y.netIncome, y.currency || cur), eps: plain(y.eps, 2) })
    ),
    dividendsByYear: (b.dividends?.byYear || []).slice(0, 5).map((y) =>
      drop({ year: y.partial ? `${y.year} (to date)` : y.year, perShare: words(y.total), yieldAtYearEndPrice: pct(y.yield, 2) })
    ),
    technical: drop({
      vs20DayAverage: pct(t.vsMa20),
      vs50DayAverage: pct(t.vsMa50),
      vs200DayAverage: pct(t.vsMa200),
      rsi14: plain(t.rsi14, 0),
      return1Month: pct(t.ret1m),
      return3Months: pct(t.ret3m),
      return6Months: pct(t.ret6m),
      return1Year: pct(t.ret1y),
      positionIn52WeekRange: isNum(t.pos52) ? `${Math.round(t.pos52 * 100)}% (0% = 52-week low, 100% = high)` : null,
      volumeVs3MonthAverage: isNum(t.volumeRatio) ? `${t.volumeRatio.toFixed(2)}x` : null,
    }),
    analysts: b.analysts?.count
      ? drop({
          numberOfAnalysts: b.analysts.count,
          consensus: b.analysts.recommendationKey,
          averageTarget: words(b.analysts.targetMean),
          targetVsPrice: isNum(b.analysts.targetMean) && isNum(b.price?.price) ? pct((b.analysts.targetMean / b.price.price - 1) * 100) : null,
        })
      : null,
    upcoming: drop({
      nextEarningsDate: b.events?.earningsDates?.[0],
      exDividendDate: b.events?.exDividendDate,
    }),
    recentHeadlines: (b.news || []).slice(0, 10).map((n) => drop({ date: n.date?.slice(0, 10), source: n.source, title: n.title })),
  };
}

const LANGUAGE_RULE = {
  en: "Write the reasons, newsSummary and risks in plain English.",
  id: "Write the reasons, newsSummary and risks in Bahasa Indonesia, in the natural style of an Indonesian equity research note. Keep the figures exactly as given, but write the unit words in Indonesian (trillion = triliun, billion = miliar, million = juta) and use Indonesian number style (a comma for decimals). Keep the values of \"view\" and \"confidence\" in English exactly as listed, because the app translates them.",
};

export function buildAiPrompt(facts, lang = "en") {
  return `You are an equity analyst writing a short, balanced view on an Indonesia Stock Exchange (IDX) stock for an experienced private investor.

Here are the facts (JSON). Every number has already been calculated; copy figures exactly as written and do not compute new ones. Headlines are titles only and may be rumours or opinion; treat them as unconfirmed and never state them as fact.

${JSON.stringify(facts, null, 2)}

Give two separate views:
- shortTerm: the next 1 to 3 months. Weigh mainly price trend, momentum, RSI, volume and near-term events (earnings date, ex-dividend date, headlines).
- longTerm: the next 1 to 3 years. Weigh mainly valuation, profitability, growth, balance sheet and dividend record.

For each, choose exactly one view:
- "Buy": the evidence clearly favours adding to or opening a position.
- "Hold": worth keeping for an existing holder, but no strong case to add.
- "Sell": the evidence clearly favours reducing or exiting.
- "Neutral": the evidence is mixed or too thin to lean either way. Use this when key data is missing.
Also give a confidence: "Low", "Medium" or "High". Use "Low" when important figures are missing.

Reply with JSON only, no other text, in exactly this shape:
{
  "shortTerm": { "view": "Buy|Hold|Sell|Neutral", "confidence": "Low|Medium|High", "reasons": ["3 short reasons, each citing figures from the facts"] },
  "longTerm": { "view": "Buy|Hold|Sell|Neutral", "confidence": "Low|Medium|High", "reasons": ["3 short reasons, each citing figures from the facts"] },
  "newsSummary": "2 or 3 sentences on what recent headlines are about, saying clearly that they are unconfirmed; or say there were no relevant headlines",
  "risks": ["2 or 3 key risks"]
}
No price targets. No markdown.
${LANGUAGE_RULE[lang] || LANGUAGE_RULE.en}`;
}

// Validates and tidies the model's reply. Returns null if it is unusable.
export function parseAiReply(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(s.slice(start, end + 1)); } catch { return null; }

  const clean = (str, max) => String(str || "").replace(/\*\*/g, "").trim().slice(0, max);
  const side = (x) => {
    if (!x || !VIEWS.includes(x.view)) return null;
    return {
      view: x.view,
      confidence: CONFIDENCE.includes(x.confidence) ? x.confidence : "Low",
      reasons: (Array.isArray(x.reasons) ? x.reasons : []).map((r) => clean(r, 300)).filter(Boolean).slice(0, 5),
    };
  };
  const shortTerm = side(obj.shortTerm);
  const longTerm = side(obj.longTerm);
  if (!shortTerm || !longTerm) return null;
  return {
    shortTerm,
    longTerm,
    newsSummary: clean(obj.newsSummary, 800) || null,
    risks: (Array.isArray(obj.risks) ? obj.risks : []).map((r) => clean(r, 300)).filter(Boolean).slice(0, 4),
  };
}

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}

const aiCache = new Map(); // "CODE|lang" -> { at, view }
const AI_TTL = 6 * 60 * 60 * 1000;

export async function generateAiView(bundle, lang = "en") {
  const key = `${bundle.code}|${lang}`;
  const cached = aiCache.get(key);
  if (cached && Date.now() - cached.at < AI_TTL) return cached.view;

  const prompt = buildAiPrompt(buildAiFacts(bundle), lang);
  let parsed = parseAiReply(await callClaude(prompt));
  if (!parsed) parsed = parseAiReply(await callClaude(prompt)); // one retry
  if (!parsed) throw new Error("The AI reply could not be read");

  const view = { ...parsed, lang, generatedAt: new Date().toISOString(), model: MODEL };
  aiCache.set(key, { at: Date.now(), view });
  return view;
}

// ---------------------------------------------------------------------------
// Request handler, called from /api/idx-quotes
// ---------------------------------------------------------------------------
export async function handleAnalysis(req, res) {
  const code = normaliseCode(req.query.symbol);
  if (!code) return res.status(400).json({ error: "Enter an IDX ticker such as BBCA" });

  try {
    if (req.query.view === "ai") {
      // Uses the Claude API, so only for signed-in users.
      const userId = await getUserId(req);
      if (!userId) return res.status(401).json({ error: "Sign in to see the AI view" });
      res.setHeader("Cache-Control", "private, no-store");
      const bundle = await buildAnalysis(code);
      if (!bundle) return res.status(404).json({ error: `No price found for ${code}` });
      const lang = req.query.lang === "id" ? "id" : "en";
      return res.status(200).json({ code, view: await generateAiView(bundle, lang) });
    }

    const bundle = await buildAnalysis(code);
    if (!bundle) return res.status(404).json({ error: `No price found for ${code}` });
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate");
    return res.status(200).json(bundle);
  } catch (err) {
    return res.status(500).json({ error: "Failed to build the analysis", detail: String(err) });
  }
}
