// api/transactions.js
//
// POST   /api/transactions      -> add a transaction { portfolioId, ticker, type, price, qty, date, assetType?, currency?, faceValue?, couponRate?, couponFrequency?, issueDate?, maturityDate? }
// DELETE /api/transactions?id=X -> remove a transaction

import { sql } from "./_db.js";
import { getUserId } from "./_auth.js";

const VALID_ASSET_TYPES = ["stock", "crypto", "commodity", "bond", "cash", "deposit"];
const VALID_COUPON_FREQUENCIES = ["monthly", "quarterly", "semi-annual", "annual"];

async function ownsPortfolio(portfolioId, userId) {
  const [row] = await sql`SELECT id FROM portfolios WHERE id = ${portfolioId} AND user_id = ${userId}`;
  return !!row;
}

export default async function handler(req, res) {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not signed in" });

  try {
    if (req.method === "POST") {
      const {
        portfolioId,
        ticker,
        type,
        price,
        qty,
        date,
        assetType,
        currency,
        faceValue,
        couponRate,
        couponFrequency,
        issueDate,
        maturityDate,
      } = req.body || {};

      if (!portfolioId || !ticker || !type || !price || !qty || !date) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (type !== "buy" && type !== "sell") {
        return res.status(400).json({ error: "Type must be 'buy' or 'sell'" });
      }

      const resolvedAssetType = assetType || "stock";
      if (!VALID_ASSET_TYPES.includes(resolvedAssetType)) {
        return res.status(400).json({ error: "Invalid asset type" });
      }

      const resolvedCurrency = currency || "IDR";

      if (resolvedAssetType === "bond") {
        if (!faceValue || !couponRate || !couponFrequency || !issueDate || !maturityDate) {
          return res.status(400).json({
            error: "Bonds require faceValue, couponRate, couponFrequency, issueDate, and maturityDate",
          });
        }
        if (!VALID_COUPON_FREQUENCIES.includes(couponFrequency)) {
          return res.status(400).json({ error: "Invalid coupon frequency" });
        }
      }

      if (!(await ownsPortfolio(portfolioId, userId))) {
        return res.status(404).json({ error: "Portfolio not found" });
      }

      const [txn] = await sql`
        INSERT INTO transactions (
          portfolio_id, ticker, type, price, qty, date,
          asset_type, currency, face_value, coupon_rate, coupon_frequency, issue_date, maturity_date
        )
        VALUES (
          ${portfolioId}, ${ticker.toUpperCase()}, ${type}, ${price}, ${qty}, ${date},
          ${resolvedAssetType}, ${resolvedCurrency},
          ${resolvedAssetType === "bond" ? faceValue : null},
          ${resolvedAssetType === "bond" ? couponRate : null},
          ${resolvedAssetType === "bond" ? couponFrequency : null},
          ${resolvedAssetType === "bond" ? issueDate : null},
          ${resolvedAssetType === "bond" ? maturityDate : null}
        )
        RETURNING
          id, ticker, type, price::float AS price, qty::float AS qty, date::text AS date,
          asset_type AS "assetType", currency,
          face_value::float AS "faceValue", coupon_rate::float AS "couponRate",
          coupon_frequency AS "couponFrequency",
          issue_date::text AS "issueDate", maturity_date::text AS "maturityDate"
      `;
      return res.status(201).json({ transaction: txn });
    }

    if (req.method === "DELETE") {
      const id = parseInt(req.query.id, 10);
      if (!id) return res.status(400).json({ error: "Id is required" });

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