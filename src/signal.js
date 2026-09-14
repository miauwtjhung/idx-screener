// signal.js — a transparent, rule-based informational signal.
//
// IMPORTANT: this is NOT financial advice. It's a simple heuristic built
// from publicly available numbers (valuation vs sector peers, dividend
// yield, today's price move, and position within the 52-week range).
// It has no knowledge of your goals, risk tolerance, or holding period.
// Every factor that contributes to the label is shown to the user
// alongside it, on purpose — the point is to be a readable checklist,
// not a black-box verdict.

export function computeSignal(row, sectorAvgPe) {
  const reasons = [];
  let score = 0;

  // Valuation vs sector peers
  if (row.pe != null && sectorAvgPe != null && sectorAvgPe > 0) {
    const ratio = row.pe / sectorAvgPe;
    if (ratio < 0.8) {
      score += 2;
      reasons.push({ dir: "up", text: `P/E of ${row.pe.toFixed(1)} is well below the ${row.sector} sector average (${sectorAvgPe.toFixed(1)})` });
    } else if (ratio < 1) {
      score += 1;
      reasons.push({ dir: "up", text: `P/E of ${row.pe.toFixed(1)} is slightly below the sector average (${sectorAvgPe.toFixed(1)})` });
    } else if (ratio > 1.2) {
      score -= 2;
      reasons.push({ dir: "down", text: `P/E of ${row.pe.toFixed(1)} is well above the sector average (${sectorAvgPe.toFixed(1)})` });
    } else {
      score -= 1;
      reasons.push({ dir: "down", text: `P/E of ${row.pe.toFixed(1)} is slightly above the sector average (${sectorAvgPe.toFixed(1)})` });
    }
  } else {
    reasons.push({ dir: "flat", text: "No P/E data available to compare against sector peers" });
  }

  // Dividend yield
  if (row.div != null && row.div > 0) {
    if (row.div >= 3) {
      score += 1;
      reasons.push({ dir: "up", text: `Dividend yield of ${row.div.toFixed(2)}% is relatively high` });
    } else {
      score += 0.5;
      reasons.push({ dir: "up", text: `Pays a dividend (${row.div.toFixed(2)}% yield)` });
    }
  } else {
    reasons.push({ dir: "flat", text: "No dividend currently paid" });
  }

  // Today's momentum
  if (row.chg != null) {
    if (row.chg > 2) {
      score += 0.5;
      reasons.push({ dir: "up", text: `Up ${row.chg.toFixed(2)}% today` });
    } else if (row.chg < -2) {
      score -= 0.5;
      reasons.push({ dir: "down", text: `Down ${Math.abs(row.chg).toFixed(2)}% today` });
    }
  }

  // Position within the 52-week range
  if (row.price != null && row.low52 != null && row.high52 != null && row.high52 > row.low52) {
    const pct = (row.price - row.low52) / (row.high52 - row.low52);
    if (pct < 0.25) {
      score += 1;
      reasons.push({ dir: "up", text: `Trading near its 52-week low (${Math.round(pct * 100)}% of the range)` });
    } else if (pct > 0.85) {
      score -= 1;
      reasons.push({ dir: "down", text: `Trading near its 52-week high (${Math.round(pct * 100)}% of the range)` });
    }
  }

  let label = "Hold";
  if (score >= 2) label = "Buy";
  else if (score <= -2) label = "Sell";

  return { label, score, reasons };
}

export function sectorAveragePe(companies, sector) {
  const peers = companies.filter((c) => c.sector === sector && c.pe != null && c.pe > 0);
  if (peers.length === 0) return null;
  return peers.reduce((sum, c) => sum + c.pe, 0) / peers.length;
}

// Precomputes sector -> average P/E for every sector present, in one pass,
// so rendering a signal for many rows (e.g. a table) doesn't refilter the
// whole dataset once per row.
export function buildSectorAvgPeMap(companies) {
  const sums = {};
  const counts = {};
  for (const c of companies) {
    if (!c.sector || c.pe == null || c.pe <= 0) continue;
    sums[c.sector] = (sums[c.sector] || 0) + c.pe;
    counts[c.sector] = (counts[c.sector] || 0) + 1;
  }
  const map = {};
  for (const sector in sums) {
    map[sector] = sums[sector] / counts[sector];
  }
  return map;
}
