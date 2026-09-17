// api/portfolios.js
//
// GET    /api/portfolios              -> list this user's portfolios, each with its transactions
// POST   /api/portfolios              -> create a new portfolio { name }
// PATCH  /api/portfolios?id=X         -> rename a portfolio { name }
// DELETE /api/portfolios?id=X         -> delete a portfolio (and its transactions, via cascade)

import { sql } from "./_db.js";
import { getUserId } from "./_auth.js";

export default async function handler(req, res) {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not signed in" });

  try {
    if (req.method === "GET") {
      const portfolios = await sql`
        SELECT id, name FROM portfolios WHERE user_id = ${userId} ORDER BY id ASC
      `;
            const withTransactions = await Promise.all(
        portfolios.map(async (p) => {
const transactions = await sql`
          SELECT
            id, ticker, type, price::float AS price, qty::float AS qty, date::text AS date,
            asset_type AS "assetType", currency,
            face_value::float AS "faceValue", coupon_rate::float AS "couponRate",
            coupon_frequency AS "couponFrequency",
            issue_date::text AS "issueDate", maturity_date::text AS "maturityDate"
          FROM transactions WHERE portfolio_id = ${p.id} ORDER BY date ASC, id ASC
        `;
          return { ...p, transactions };
        })
      );
      return res.status(200).json({ portfolios: withTransactions });
    }

    if (req.method === "POST") {
      const { name } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

      const [portfolio] = await sql`
        INSERT INTO portfolios (user_id, name) VALUES (${userId}, ${name.trim()})
        RETURNING id, name
      `;
      return res.status(201).json({ portfolio: { ...portfolio, transactions: [] } });
    }

    if (req.method === "PATCH") {
      const id = parseInt(req.query.id, 10);
      const { name } = req.body || {};
      if (!id || !name || !name.trim()) return res.status(400).json({ error: "Id and name are required" });

      const [portfolio] = await sql`
        UPDATE portfolios SET name = ${name.trim()}
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, name
      `;
      if (!portfolio) return res.status(404).json({ error: "Portfolio not found" });
      return res.status(200).json({ portfolio });
    }

    if (req.method === "DELETE") {
      const id = parseInt(req.query.id, 10);
      if (!id) return res.status(400).json({ error: "Id is required" });

      const [deleted] = await sql`
        DELETE FROM portfolios WHERE id = ${id} AND user_id = ${userId} RETURNING id
      `;
      if (!deleted) return res.status(404).json({ error: "Portfolio not found" });
      return res.status(200).json({ deleted: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err) });
  }
}
