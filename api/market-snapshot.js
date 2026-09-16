// api/market-snapshot.js
// Public endpoint — returns the most recent market snapshot (grouped price
// data + English/Indonesian narrative summaries) for the frontend to render.
// No auth required: this is market-wide public data, same as the screener.

import { sql } from "./_db.js";

export default async function handler(req, res) {
  try {
    const rows = await sql`
      SELECT snapshot_date, data, summary_en, summary_id, created_at
      FROM market_snapshot
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      return res.status(200).json({ snapshot: null });
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    return res.status(200).json({ snapshot: rows[0] });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load market snapshot", detail: String(err) });
  }
}
