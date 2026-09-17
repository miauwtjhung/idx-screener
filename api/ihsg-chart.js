// api/ihsg-chart.js
//
// GET /api/ihsg-chart -> today's IHSG intraday chart (5-min candles) plus
// current price, change, and open/high/low. Public, no auth required —
// same category of data as the screener.

import { fetchYahooChart } from "./_yahoo.js";

export default async function handler(req, res) {
  try {
    const { meta, timestamps, closes } = await fetchYahooChart("^JKSE", "5m", "1d");

    const points = timestamps
      .map((t, i) => ({ time: t, price: closes[i] }))
      .filter((p) => p.price != null);

    const price = meta.regularMarketPrice ?? null;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const chg = price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
    const chgAbs = price != null && prevClose ? price - prevClose : null;

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    return res.status(200).json({
      price,
      chg,
      chgAbs,
      open: meta.regularMarketDayHigh != null ? (points[0]?.price ?? null) : null,
      high: meta.regularMarketDayHigh ?? null,
      low: meta.regularMarketDayLow ?? null,
      points,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load IHSG chart", detail: String(err) });
  }
}