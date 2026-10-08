// historyPeriods.js — groups the daily portfolio snapshots into months or
// years for the history table.
//
// Inputs are the same arrays the performance chart uses:
//   points    — daily snapshots, oldest first, each with `date` (YYYY-MM-DD),
//               `value`, `flow` (money added since the previous snapshot) and
//               the value per asset class
//   portfolio — cumulative flow-adjusted return in %, one per point
//   bench     — cumulative benchmark return in %, one per point (may contain nulls)
//
// A period's return runs from the last snapshot of the previous period to the
// last snapshot of this one, so consecutive months chain together exactly
// and nothing between them is lost. The very first period can only start at
// the first snapshot there is.

export const PERIODS = [
  { key: "daily", label: "Daily", unit: "Day", plural: "days" },
  { key: "monthly", label: "Monthly", unit: "Month", plural: "months" },
  { key: "yearly", label: "Yearly", unit: "Year", plural: "years" },
];

export function periodKey(date, period) {
  return period === "yearly" ? date.slice(0, 4) : date.slice(0, 7);
}

function periodStart(key, period) {
  return period === "yearly" ? `${key}-01-01` : `${key}-01`;
}

function periodEnd(key, period) {
  if (period === "yearly") return `${key}-12-31`;
  const [y, m] = key.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month
  return `${key}-${String(lastDay).padStart(2, "0")}`;
}

// Return between two points of a cumulative % series, or null if either is missing.
export function stepReturn(series, from, to) {
  const a = series[from];
  const b = series[to];
  if (a == null || b == null) return null;
  return ((1 + b / 100) / (1 + a / 100) - 1) * 100;
}

// One row per day — the original daily table, unchanged in its figures.
export function dailyRows(points, portfolio, bench) {
  return points.map((p, i) => ({
    key: p.date,
    period: "daily",
    first: p.date,
    last: p.date,
    point: p,
    value: p.value,
    change: i > 0 ? p.value - points[i - 1].value : null,
    pct: i > 0 ? stepReturn(portfolio, i - 1, i) : null,
    benchPct: i > 0 ? stepReturn(bench, i - 1, i) : null,
    flow: p.flow || 0,
    partialStart: false,
    partialEnd: false,
  }));
}

// One row per month or year, oldest first.
export function periodRows(points, portfolio, bench, period) {
  if (period === "daily") return dailyRows(points, portfolio, bench);

  const groups = [];
  points.forEach((p, i) => {
    const key = periodKey(p.date, period);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.end = i;
    else groups.push({ key, start: i, end: i });
  });

  return groups.map((g, gi) => {
    // Where this period's return is measured from.
    const anchor = gi > 0 ? groups[gi - 1].end : g.start;
    const end = points[g.end];
    const hasSpan = g.end > anchor;

    let flow = 0;
    for (let i = anchor + 1; i <= g.end; i++) flow += points[i].flow || 0;

    return {
      key: g.key,
      period,
      first: points[g.start].date,
      last: end.date,
      point: end, // values at the end of the period
      value: end.value,
      change: hasSpan ? end.value - points[anchor].value : null,
      pct: hasSpan ? stepReturn(portfolio, anchor, g.end) : null,
      benchPct: hasSpan ? stepReturn(bench, anchor, g.end) : null,
      flow,
      // Partial = the data doesn't cover the whole month or year: either
      // snapshots started after it began, or it isn't over yet.
      partialStart: gi === 0 && points[g.start].date > periodStart(g.key, period),
      partialEnd: gi === groups.length - 1 && end.date < periodEnd(g.key, period),
    };
  });
}
