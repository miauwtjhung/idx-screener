// api/portfolio-history.js
//
// GET /api/portfolio-history?portfolioId=X&days=180&benchmark=^JKSE   (days: 7 to 3660)
//   -> daily snapshots (net worth + value per asset class), money added/withdrawn
//      between snapshots (so buys/sells don't count as gains or losses),
//      and IHSG (^JKSE) daily closes for the same period.

import { sql } from "./_db.js";
import { getUserId } from "./_auth.js";
import { fetchYahooChart } from "./_yahoo.js";

function jakartaDate(unixSeconds) {
  // YYYY-MM-DD in Asia/Jakarta (UTC+7)
  return new Date((unixSeconds + 7 * 3600) * 1000).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not signed in" });

  const portfolioId = parseInt(req.query.portfolioId, 10);
  if (!portfolioId) return res.status(400).json({ error: "portfolioId is required" });
  // Up to 10 years, so the monthly and yearly history can cover everything.
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 180, 7), 3660);
  const BENCHMARKS = ["^JKSE", "BTC-IDR", "GC=F"];
  const benchmark = BENCHMARKS.includes(req.query.benchmark) ? req.query.benchmark : "^JKSE";

  try {
    const [owns] = await sql`
      SELECT id FROM portfolios WHERE id = ${portfolioId} AND user_id = ${userId}
    `;
    if (!owns) return res.status(404).json({ error: "Portfolio not found" });

    const snapshots = await sql`
      SELECT snapshot_date::text AS date, net_worth::float AS "netWorth",
             stock_value::float AS stock, crypto_value::float AS crypto,
             commodity_value::float AS commodity, bond_value::float AS bond,
             cash_value::float AS cash
      FROM portfolio_snapshots
      WHERE portfolio_id = ${portfolioId}
        AND snapshot_date >= (CURRENT_DATE - ${days}::int)
      ORDER BY snapshot_date ASC
    `;

    // Net money in (+) / out (-) per date: buys add money, sells take it out.
    const txns = await sql`
      SELECT date::text AS date, type, price::float AS price, qty::float AS qty,
             asset_type AS "assetType", face_value::float AS "faceValue"
      FROM transactions WHERE portfolio_id = ${portfolioId}
    `;
    const CLASS_OF = { stock: "stock", crypto: "crypto", commodity: "commodity", bond: "bond", cash: "cash", deposit: "cash" };
    const flowsByDate = {};
    const classFlowsByDate = {};
    for (const t of txns) {
      let amount;
      if (t.assetType === "bond") {
        if (t.type !== "buy") continue; // bonds are valued at face value, held to maturity
        amount = t.faceValue || 0;
      } else {
        amount = (t.price || 0) * (t.qty || 0) * (t.type === "buy" ? 1 : -1);
      }
      flowsByDate[t.date] = (flowsByDate[t.date] || 0) + amount;
      const cls = CLASS_OF[t.assetType || "stock"] || "stock";
      if (!classFlowsByDate[t.date]) classFlowsByDate[t.date] = {};
      classFlowsByDate[t.date][cls] = (classFlowsByDate[t.date][cls] || 0) + amount;
    }

    // Attach flows to each snapshot: everything dated after the previous snapshot, up to this one.
    const flowDates = Object.keys(flowsByDate).sort();
    const points = snapshots.map((s, i) => {
      const prevDate = i > 0 ? snapshots[i - 1].date : null;
      const inPeriod = prevDate ? flowDates.filter((d) => d > prevDate && d <= s.date) : [];
      const flow = inPeriod.reduce((sum, d) => sum + flowsByDate[d], 0);
      const flows = {};
      for (const d of inPeriod) {
        for (const [cls, amt] of Object.entries(classFlowsByDate[d] || {})) flows[cls] = (flows[cls] || 0) + amt;
      }
      return { ...s, flow, flows };
    });

    // Benchmark daily closes (IHSG by default)
    let ihsg = [];
    try {
      const range = days <= 90 ? "6mo" : days <= 365 ? "1y" : days <= 730 ? "2y" : days <= 1825 ? "5y" : "10y";
      const { timestamps, closes } = await fetchYahooChart(benchmark, "1d", range);
      ihsg = timestamps
        .map((t, i) => ({ date: jakartaDate(t), close: closes[i] }))
        .filter((p) => p.close != null);
    } catch {
      ihsg = [];
    }

    return res.status(200).json({ points, ihsg });
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err) });
  }
}
