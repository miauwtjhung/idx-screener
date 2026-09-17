// api/portfolio-summary.js
//
// GET /api/portfolio-summary?portfolioId=X -> latest saved daily summary for that portfolio

import { sql } from "./_db.js";
import { getUserId } from "./_auth.js";

export default async function handler(req, res) {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not signed in" });

  const portfolioId = parseInt(req.query.portfolioId, 10);
  if (!portfolioId) return res.status(400).json({ error: "portfolioId is required" });

  try {
    // Confirm this portfolio belongs to the requesting user before returning anything.
    const [owns] = await sql`
      SELECT id FROM portfolios WHERE id = ${portfolioId} AND user_id = ${userId}
    `;
    if (!owns) return res.status(404).json({ error: "Portfolio not found" });

    const [snapshot] = await sql`
      SELECT snapshot_date AS "snapshotDate", net_worth::float AS "netWorth",
             stock_value::float AS "stockValue", crypto_value::float AS "cryptoValue",
             commodity_value::float AS "commodityValue", bond_value::float AS "bondValue",
             cash_value::float AS "cashValue", summary_text AS "summaryText"
      FROM portfolio_snapshots
      WHERE portfolio_id = ${portfolioId}
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;

    return res.status(200).json({ snapshot: snapshot || null });
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err) });
  }
}