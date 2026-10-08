// fundamentalRankings.js — the rules behind the Fundamentals tab.
//
// Everything here is plain calculation on numbers already published by Yahoo
// Finance: no predictions and no hidden weighting. Each ranking states its
// own rule in words (the `rule` text is shown to the user above the table),
// so a list can always be checked against what it claims to be.
//
// This is NOT financial advice. A ranking is a starting point for reading
// about a company, not a reason to buy or sell it.

// --- Thresholds used by the rules below -----------------------------------
export const MAX_YIELD = 25; // % — yields above this are almost always a one-off or bad data
export const MIN_SECTOR_PEERS = 5; // sector needs this many P/Es before we compare against it
export const HIGH_ROE = 15; // % — "quality" cut-off for the ROE-and-cheap list
export const PER_SECTOR = 3; // rows per sector in the sector leaders list

export const SIZE_OPTIONS = [
  { id: "300", label: "300 biggest companies", n: 300 },
  { id: "100", label: "100 biggest companies", n: 100 },
  { id: "all", label: "All companies", n: null },
];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Median trailing P/E per sector, using profitable companies only. Median
// rather than average, so one company on a P/E of 900 can't drag the whole
// sector's level up.
export function buildSectorMedianPe(rows) {
  const bySector = {};
  for (const r of rows) {
    if (!r.sector || !isNum(r.pe) || r.pe <= 0) continue;
    (bySector[r.sector] ||= []).push(r.pe);
  }
  const map = {};
  for (const sector in bySector) {
    if (bySector[sector].length >= MIN_SECTOR_PEERS) map[sector] = median(bySector[sector]);
  }
  return map;
}

// Joins the static company list with live quotes and adds the derived
// figures every ranking needs.
export function enrichRows(companies, quotes) {
  const rows = companies.map((c) => ({ ...c, ...(quotes[c.code] || {}) }));
  const sectorPeMap = buildSectorMedianPe(rows);

  // Rank by market cap (1 = biggest) so "the 100 biggest" means the same
  // thing in every list.
  const byCap = rows.filter((r) => isNum(r.cap) && r.cap > 0).sort((a, b) => b.cap - a.cap);
  const capRank = new Map(byCap.map((r, i) => [r.code, i + 1]));

  return rows.map((r) => {
    const profitable = isNum(r.pe) && r.pe > 0;
    const sectorPe = sectorPeMap[r.sector] ?? null;

    // ROE approximated from per-share figures: earnings per share over book
    // value per share. Both come from the same report, so the ratio holds
    // whatever currency the company reports in.
    const roe = isNum(r.eps) && isNum(r.bvps) && r.bvps > 0 ? (r.eps / r.bvps) * 100 : null;

    // Share of profit paid out as dividend. Skipped when the company reports
    // in another currency, because dividend and EPS would not be comparable.
    const sameCurrency = !r.fcur || r.fcur === "IDR";
    const payout =
      sameCurrency && isNum(r.divRate) && r.divRate > 0 && isNum(r.eps) && r.eps > 0
        ? (r.divRate / r.eps) * 100
        : null;

    const valueTraded = isNum(r.price) && isNum(r.vol) ? r.price * r.vol * 1_000_000 : null; // IDR

    const pos52 =
      isNum(r.price) && isNum(r.low52) && isNum(r.high52) && r.high52 > r.low52
        ? Math.min(1, Math.max(0, (r.price - r.low52) / (r.high52 - r.low52)))
        : null;

    return {
      ...r,
      profitable,
      roe,
      payout,
      valueTraded,
      pos52,
      sectorPe,
      vsSector: profitable && sectorPe ? (r.pe / sectorPe - 1) * 100 : null,
      capRank: capRank.get(r.code) ?? null,
    };
  });
}

// --- Cautions --------------------------------------------------------------
// A caution doesn't remove a stock from a list. It marks a figure that often
// turns out to be less good than it looks, so the user knows to check why.
const cautionLowPe = (r) =>
  r.pe < 3 ? "P/E under 3 often comes from a one-off gain, such as an asset sale." : null;
const cautionHighYield = (r) =>
  r.div > 12 ? "A yield above 12% may include a one-off special dividend." : null;
const cautionHighRoe = (r) =>
  r.roe > 50 ? "ROE above 50% can mean a very small equity base rather than a great business." : null;
const cautionLowPbv = (r) =>
  r.pbv < 0.3 ? "PBV under 0.3 can mean the market doubts the stated asset values." : null;

const firstCaution = (...fns) => (r) => {
  for (const fn of fns) {
    const text = fn(r);
    if (text) return text;
  }
  return null;
};

// --- The rankings ------------------------------------------------------------
// include(row) — may this stock appear in the list at all?
// value(row)   — the number it is ranked by
// dir          — "desc" = biggest first, "asc" = smallest first
// metric       — column to highlight; extra — additional columns to show
export const RANKINGS = [
  {
    id: "div-high",
    group: "Dividend",
    label: "Highest dividend yield",
    rule: `Dividends paid over the last 12 months as a share of today's price. Profitable companies only; yields above ${MAX_YIELD}% are left out as likely one-offs.`,
    metric: "div",
    extra: ["payout"],
    dir: "desc",
    include: (r) => r.profitable && isNum(r.div) && r.div > 0 && r.div <= MAX_YIELD,
    value: (r) => r.div,
    caution: cautionHighYield,
  },
  {
    id: "pe-low",
    group: "Cheap valuation",
    label: "Lowest P/E",
    rule: "Price divided by earnings per share over the last 12 months. Loss-making companies have no P/E and are left out.",
    metric: "pe",
    extra: [],
    dir: "asc",
    include: (r) => r.profitable,
    value: (r) => r.pe,
    caution: cautionLowPe,
  },
  {
    id: "pe-vs-sector",
    group: "Cheap valuation",
    label: "P/E furthest below its sector",
    rule: `P/E compared with the median P/E of the same sector. Sectors with fewer than ${MIN_SECTOR_PEERS} profitable companies are left out.`,
    metric: "vsSector",
    extra: ["sectorPe", "vsSector"],
    dir: "asc",
    include: (r) => r.profitable && isNum(r.vsSector) && r.vsSector < 0,
    value: (r) => r.vsSector,
    caution: cautionLowPe,
  },
  {
    id: "pbv-low",
    group: "Cheap valuation",
    label: "Lowest price to book",
    rule: "Price divided by book value per share. Below 1 means the shares cost less than the company's stated net assets. Profitable companies only, to keep out distressed ones.",
    metric: "pbv",
    extra: [],
    dir: "asc",
    include: (r) => r.profitable && isNum(r.pbv) && r.pbv > 0,
    value: (r) => r.pbv,
    caution: cautionLowPbv,
  },
  {
    id: "roe-high",
    group: "Quality",
    label: "Highest return on equity",
    rule: "Earnings per share divided by book value per share: how much profit the company earns on shareholders' money. An approximation from per-share figures.",
    metric: "roe",
    extra: [],
    dir: "desc",
    include: (r) => isNum(r.roe) && r.roe > 0,
    value: (r) => r.roe,
    caution: cautionHighRoe,
  },
  {
    id: "roe-cheap",
    group: "Quality",
    label: "High ROE and cheap",
    rule: `ROE of ${HIGH_ROE}% or more, with a P/E below the sector median. Ranked by ROE.`,
    metric: "roe",
    extra: ["sectorPe", "vsSector"],
    dir: "desc",
    include: (r) => isNum(r.roe) && r.roe >= HIGH_ROE && r.profitable && isNum(r.vsSector) && r.vsSector < 0,
    value: (r) => r.roe,
    caution: firstCaution(cautionHighRoe, cautionLowPe),
  },
  {
    id: "cap-big",
    group: "Size and activity",
    label: "Biggest market cap",
    rule: "Share price multiplied by the number of shares: the market's value for the whole company.",
    metric: "cap",
    extra: [],
    dir: "desc",
    include: (r) => isNum(r.cap) && r.cap > 0,
    value: (r) => r.cap,
  },
  {
    id: "cap-sector",
    group: "Size and activity",
    label: "Leaders in each sector",
    rule: `The ${PER_SECTOR} biggest companies by market cap in each sector.`,
    metric: "cap",
    extra: [],
    dir: "desc",
    perSector: PER_SECTOR,
    include: (r) => isNum(r.cap) && r.cap > 0 && !!r.sector,
    value: (r) => r.cap,
  },
  {
    id: "value-traded",
    group: "Size and activity",
    label: "Most traded today",
    rule: "Today's volume multiplied by the latest price: where the money is moving, not just the share count.",
    metric: "valueTraded",
    extra: ["chg", "valueTraded"],
    dir: "desc",
    include: (r) => isNum(r.valueTraded) && r.valueTraded > 0,
    value: (r) => r.valueTraded,
  },
  {
    id: "near-low",
    group: "Price position",
    label: "Closest to 52-week low",
    rule: "Where today's price sits between the lowest and highest price of the last 52 weeks (0% = at the low). Profitable companies only.",
    metric: "pos52",
    extra: ["pos52"],
    dir: "asc",
    include: (r) => r.profitable && isNum(r.pos52),
    value: (r) => r.pos52,
  },
];

export const RANKING_GROUPS = [...new Set(RANKINGS.map((r) => r.group))];

export function getRanking(id) {
  return RANKINGS.find((r) => r.id === id) || RANKINGS[0];
}

// Applies the size and sector filters, then the ranking's own rule, and
// returns the top `limit` rows plus how many stocks qualified in total.
export function rankRows(rows, rankingId, { sector = null, sizeN = null, limit = 25 } = {}) {
  const ranking = getRanking(rankingId);

  const universe = rows.filter((r) => {
    if (!isNum(r.price)) return false; // no quote loaded for this stock
    if (sizeN != null && !(isNum(r.capRank) && r.capRank <= sizeN)) return false;
    if (sector && r.sector !== sector) return false;
    return true;
  });

  const qualified = universe.filter(ranking.include);
  const sign = ranking.dir === "asc" ? 1 : -1;
  const compare = (a, b) => {
    const diff = (ranking.value(a) - ranking.value(b)) * sign;
    if (diff !== 0) return diff;
    return (b.cap ?? 0) - (a.cap ?? 0); // ties: bigger company first
  };

  const decorate = (r, position) => ({
    ...r,
    position,
    caution: ranking.caution ? ranking.caution(r) : null,
  });

  if (ranking.perSector) {
    const bySector = {};
    for (const r of qualified) (bySector[r.sector] ||= []).push(r);
    const out = [];
    for (const name of Object.keys(bySector).sort()) {
      bySector[name]
        .sort(compare)
        .slice(0, ranking.perSector)
        .forEach((r, i) => out.push(decorate(r, i + 1)));
    }
    return { ranking, rows: out, total: out.length, universe: universe.length };
  }

  const sorted = qualified.sort(compare);
  return {
    ranking,
    rows: sorted.slice(0, limit).map((r, i) => decorate(r, i + 1)),
    total: sorted.length,
    universe: universe.length,
  };
}

// How many stocks actually came back from Yahoo with each figure. Shown to
// the user so gaps in the data are visible rather than silent.
export function dataCoverage(rows) {
  const priced = rows.filter((r) => isNum(r.price));
  const count = (key) => priced.filter((r) => isNum(r[key])).length;
  return {
    priced: priced.length,
    pe: count("pe"),
    pbv: count("pbv"),
    roe: count("roe"),
    div: priced.filter((r) => isNum(r.div) && r.div > 0).length,
  };
}
