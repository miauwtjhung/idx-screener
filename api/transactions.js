// api/transactions.js
//
// POST   /api/transactions          -> add a transaction { portfolioId, ticker, type, price, qty, date }
// DELETE /api/transactions?id=X     -> remove a transaction

import { sql } from "./_db.js";
import { getUserId } from "./_auth.js";

// Confirms the given portfolio actually belongs to this user, so nobody
// can add/remove transactions on a portfolio that isn't theirs just by
// guessing an ID.
async function ownsPortfolio(portfolioId, userId) {
  const [row] = await sql`
    SELECT id FROM portfolios WHERE id = ${portfolioId} AND user_id = ${userId}
  `;
  return !!row;
}

export default async function handler(req, res) {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not signed in" });

  try {
    if (req.method === "POST") {
      const { portfolioId, ticker, type, price, qty, date } = req.body || {};

      if (!portfolioId || !ticker || !type || !price || !qty || !date) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (type !== "buy" && type !== "sell") {
        return res.status(400).json({ error: "Type must be 'buy' or 'sell'" });
      }
      if (!(await ownsPortfolio(portfolioId, userId))) {
        return res.status(404).json({ error: "Portfolio not found" });
      }

      const [txn] = await sql`
        INSERT INTO transactions (portfolio_id, ticker, type, price, qty, date)
        VALUES (${portfolioId}, ${ticker.toUpperCase()}, ${type}, ${price}, ${qty}, ${date})
        RETURNING id, ticker, type, price::float AS price, qty, date::text AS date
      `;
      return res.status(201).json({ transaction: txn });
    }

    if (req.method === "DELETE") {
      const id = parseInt(req.query.id, 10);
      if (!id) return res.status(400).json({ error: "Id is required" });

      // Delete only if the transaction's portfolio belongs to this user.
      const [deleted] = await sql`
        DELETE FROM transactions t
        USING portfolios p
        WHERE t.id = ${id} AND t.portfolio_id = p.id AND p.user_id = ${userId}
        RETURNING t.id
      `;
      if (!deleted) return res.status(404).json({ error: "Transaction not found" });
      return res.status(200).json({ deleted: true });
    }

    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err) });
  }
}
