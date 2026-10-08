// api/portfolio-summary-cron.js
// Runs once a day via Vercel Cron (see vercel.json â€” 10:00 UTC = 17:00 WIB,
// right after IDX market close).
// For every portfolio: computes net worth by asset class using live prices,
// compares to yesterday's snapshot, asks Claude to narrate the change, and
// saves the result to portfolio_snapshots.
// Protected via CRON_SECRET so only Vercel's scheduler (or someone who has
// the secret) can trigger it â€” same pattern as market-snapshot-cron.

import { sql } from "./_db.js";
import { fetchYahooQuotes } from "./_yahoo.js";
import { generatePortfolioSummary, generateMarketCloseSummary } from "./_claude.js";

// Average-cost holdings calc â€” mirrors the frontend's computeHoldings so
// the cron's numbers match what the user sees in the app.
function computeHoldings(transactions) {
  const byTicker = {};
  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const t of sorted) {
    if (!byTicker[t.ticker]) byTicker[t.ticker] = { qty: 0, avgPrice: 0, invested: 0 };
    const h = byTicker[t.ticker];
    if (t.type === "buy") {
      const newInvested = h.invested + t.price * t.qty;
      const newQty = h.qty + t.qty;
      h.avgPrice = newQty > 0 ? newInvested / newQty : 0;
      h.qty = newQty;
      h.invested = newInvested;
    } else {
      h.invested -= h.avgPrice * t.qty;
      h.qty -= t.qty;
      if (h.qty <= 0) { h.qty = 0; h.invested = 0; h.avgPrice = 0; }
    }
  }
  return Object.entries(byTicker).filter(([, h]) => h.qty > 0).map(([ticker, h]) => ({ ticker, ...h }));
}

async function getStockValue(holdings) {
  if (holdings.length === 0) return 0;
  const symbols = holdings.map((h) => `${h.ticker}.JK`);
  try {
    const results = await fetchYahooQuotes(symbols);
    const byTicker = {};
    results.forEach((q) => { byTicker[q.symbol.replace(".JK", "")] = q; });
    return holdings.reduce((sum, h) => {
      const price = byTicker[h.ticker]?.regularMarketPrice;
      return sum + (price != null ? price * h.qty : h.invested);
    }, 0);
  } catch {
    return holdings.reduce((sum, h) => sum + h.invested, 0);
  }
}

async function getCryptoValue(holdings) {
  if (holdings.length === 0) return 0;
  try {
    const ids = holdings.map((h) => h.ticker.toLowerCase()).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=idr`;
    const r = await fetch(url);
    const data = await r.json();
    return holdings.reduce((sum, h) => {
      const price = data[h.ticker.toLowerCase()]?.idr;
      return sum + (price != null ? price * h.qty : h.invested);
    }, 0);
  } catch {
    return holdings.reduce((sum, h) => sum + h.invested, 0);
  }
}

async function getCommodityValue(holdings) {
  if (holdings.length === 0) return 0;
  let total = 0;
  for (const h of holdings) {
    try {
      let price = null;
      if (h.ticker === "ANTAM") {
        const r = await fetch("https://logam-mulia-api.iamutaki.workers.dev/api/prices/logammulia");
        const data = await r.json();
        const oneGram = (data.data || []).find(
          (row) => row.material === "gold" && row.materialType === "Emas Batangan" && row.weight === 1
        );
        price = oneGram ? oneGram.sellPrice : null;
      } else {
        const r = await fetch(`https://api.goldprice.dev/v1/convert?from=${h.ticker}&to=IDR&amount=1&unit=gram`);
        const data = await r.json();
        price = data.result != null ? parseFloat(data.result) : null;
      }
      total += price != null ? price * h.qty : h.invested;
    } catch {
      total += h.invested;
    }
  }
  return total;
}

// Market close recap (folded in here to stay within the Hobby plan's
// 2-cron-job limit). Written before the portfolios, so it is never lost
// if the portfolio part runs out of time. A fixed 2 AI calls a day.
async function writeMarketCloseRecap(today) {
  try {
    const MARKET_SYMBOLS = [
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

    const marketResults = await fetchYahooQuotes(MARKET_SYMBOLS.map((s) => s.symbol));
    const byMarketSymbol = {};
    marketResults.forEach((q) => { byMarketSymbol[q.symbol] = q; });

    const marketGrouped = { indices: [], currencies: [], commodities: [], crypto: [] };
    for (const s of MARKET_SYMBOLS) {
      const q = byMarketSymbol[s.symbol];
      marketGrouped[s.category].push({
        symbol: s.symbol,
        name: s.name,
        price: q?.regularMarketPrice ?? null,
        chg: q?.regularMarketChangePercent ?? null,
        chgAbs: q?.regularMarketChange ?? null,
      });
    }

    const [closeSummaryEn, closeSummaryId] = await Promise.all([
      generateMarketCloseSummary(marketGrouped, "en"),
      generateMarketCloseSummary(marketGrouped, "id"),
    ]);

    await sql`
      INSERT INTO market_snapshot (snapshot_date, close_data, close_summary_en, close_summary_id)
      VALUES (${today}, ${JSON.stringify(marketGrouped)}::jsonb, ${closeSummaryEn}, ${closeSummaryId})
      ON CONFLICT (snapshot_date)
      DO UPDATE SET
        close_data = EXCLUDED.close_data,
        close_summary_en = EXCLUDED.close_summary_en,
        close_summary_id = EXCLUDED.close_summary_id,
        created_at = now()
    `;
  } catch (err) {
    console.error("Market close recap failed:", err);
  }
}

// AI portfolio summaries are capped per day for the whole app (this is a
// showcase app). Every portfolio still gets its daily value snapshot;
// portfolios past the limit just get no AI text that day. Oldest
// portfolios first. Set PORTFOLIO_AI_DAILY_LIMIT in Vercel to change it
// (0 turns the summaries off).
const limitFromEnv = Number(process.env.PORTFOLIO_AI_DAILY_LIMIT);
export const PORTFOLIO_AI_DAILY_LIMIT =
  process.env.PORTFOLIO_AI_DAILY_LIMIT != null && process.env.PORTFOLIO_AI_DAILY_LIMIT !== "" && Number.isFinite(limitFromEnv) && limitFromEnv >= 0
    ? Math.floor(limitFromEnv)
    : 10;

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    // 1. Market close recap first.
    await writeMarketCloseRecap(today);

    // 2. Portfolios. Summaries already written today (e.g. if this job is
    // run twice) count toward the limit and are kept, not rewritten.
    const portfolios = await sql`SELECT id, name FROM portfolios ORDER BY id ASC`;
    const results = [];
    const written = await sql`
      SELECT portfolio_id FROM portfolio_snapshots
      WHERE snapshot_date = ${today} AND summary_text IS NOT NULL
    `;
    const hasSummary = new Set(written.map((r) => Number(r.portfolio_id)));
    let aiLeft = Math.max(0, PORTFOLIO_AI_DAILY_LIMIT - hasSummary.size);
    const ai = { limit: PORTFOLIO_AI_DAILY_LIMIT, alreadyWritten: hasSummary.size, written: 0, overLimit: 0, empty: 0 };

    for (const portfolio of portfolios) {
      const transactions = await sql`
        SELECT ticker, type, price::float AS price, qty::float AS qty, date::text AS date,
               asset_type AS "assetType", face_value::float AS "faceValue"
        FROM transactions WHERE portfolio_id = ${portfolio.id}
      `;

      const stockTxns = transactions.filter((t) => !t.assetType || t.assetType === "stock");
      const cryptoTxns = transactions.filter((t) => t.assetType === "crypto");
      const commodityTxns = transactions.filter((t) => t.assetType === "commodity");
      const bondTxns = transactions.filter((t) => t.assetType === "bond" && t.type === "buy");
      const cashTxns = transactions.filter((t) => t.assetType === "cash" || t.assetType === "deposit");

      const stockHoldings = computeHoldings(stockTxns);
      const cryptoHoldings = computeHoldings(cryptoTxns);
      const commodityHoldings = computeHoldings(commodityTxns);
      const cashHoldings = computeHoldings(cashTxns);

      const stockValue = await getStockValue(stockHoldings);
      const cryptoValue = await getCryptoValue(cryptoHoldings);
      const commodityValue = await getCommodityValue(commodityHoldings);
      const bondValue = bondTxns.reduce((sum, t) => sum + (t.faceValue || 0), 0);
      const cashValue = cashHoldings.reduce((sum, h) => sum + h.invested, 0);
      const netWorth = stockValue + cryptoValue + commodityValue + bondValue + cashValue;

      const [yesterday] = await sql`
        SELECT net_worth AS "netWorth", stock_value AS "stockValue", crypto_value AS "cryptoValue",
               commodity_value AS "commodityValue", bond_value AS "bondValue", cash_value AS "cashValue"
        FROM portfolio_snapshots
        WHERE portfolio_id = ${portfolio.id} AND snapshot_date < ${today}
        ORDER BY snapshot_date DESC LIMIT 1
      `;

      let summaryText = null;
      const isEmpty = transactions.length === 0 || netWorth === 0;
      const needsSummary = !isEmpty && !hasSummary.has(Number(portfolio.id));
      if (isEmpty) ai.empty += 1;
      else if (needsSummary && aiLeft <= 0) ai.overLimit += 1;
      if (needsSummary && aiLeft > 0) {
        aiLeft -= 1;
        try {
          summaryText = await generatePortfolioSummary(
            {
              portfolioName: portfolio.name,
              today: { netWorth, stockValue, cryptoValue, commodityValue, bondValue, cashValue },
              yesterday: yesterday || null,
            },
            "en"
          );
          ai.written += 1;
        } catch (err) {
          summaryText = null; // don't block saving the snapshot if Claude call fails
          aiLeft += 1; // a failed call doesn't use up a slot
        }
      }

      await sql`
        INSERT INTO portfolio_snapshots
          (portfolio_id, snapshot_date, net_worth, stock_value, crypto_value, commodity_value, bond_value, cash_value, summary_text)
        VALUES
          (${portfolio.id}, ${today}, ${netWorth}, ${stockValue}, ${cryptoValue}, ${commodityValue}, ${bondValue}, ${cashValue}, ${summaryText})
        ON CONFLICT (portfolio_id, snapshot_date) DO UPDATE SET
          net_worth = EXCLUDED.net_worth,
          stock_value = EXCLUDED.stock_value,
          crypto_value = EXCLUDED.crypto_value,
          commodity_value = EXCLUDED.commodity_value,
          bond_value = EXCLUDED.bond_value,
          cash_value = EXCLUDED.cash_value,
          summary_text = COALESCE(EXCLUDED.summary_text, portfolio_snapshots.summary_text)
      `;

      results.push({ portfolioId: portfolio.id, netWorth });
    }

    return res.status(200).json({ ok: true, date: today, portfolios: results, ai });
  } catch (err) {
    return res.status(500).json({ error: "Failed to build portfolio summary", detail: String(err) });
  }
}
