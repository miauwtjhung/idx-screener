import React, { useState, useEffect, useMemo } from "react";
import StockDetailModal from "./StockDetailModal";
import {
  RANKINGS,
  RANKING_GROUPS,
  SIZE_OPTIONS,
  enrichRows,
  rankRows,
  dataCoverage,
} from "./fundamentalRankings";

const CHUNK_SIZE = 75; // tickers per Yahoo request while preloading
const CACHE_MS = 5 * 60 * 1000; // reuse loaded figures for 5 minutes
const LIMIT_OPTIONS = [25, 50, 100];

// Kept outside the component so switching to another tab and back doesn't
// reload ~960 quotes every time.
let cache = { at: 0, quotes: {} };

function fmtCap(v) {
  if (v == null) return "—";
  return `Rp ${v.toFixed(1)}T`;
}

function fmtIdr(v) {
  if (v == null) return "—";
  if (v >= 1e12) return `Rp ${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `Rp ${(v / 1e9).toFixed(1)}B`;
  return `Rp ${(v / 1e6).toFixed(1)}M`;
}

// toFixed can print "-0.0" for tiny negatives; show those as plain zero.
const fixed = (v, digits) => {
  const text = v.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
};
const signedPct = (v, digits) => `${Number(fixed(v, digits)) > 0 ? "+" : ""}${fixed(v, digits)}%`;

// Every figure a ranking can show. `price` and `cap` are always present;
// the four valuation columns follow, then any extras the ranking asks for.
const COLUMN_DEFS = {
  price: { label: "Price (Rp)", fmt: (v) => v.toLocaleString("id-ID") },
  cap: { label: "Mkt cap", fmt: fmtCap },
  pe: { label: "P/E", fmt: (v) => v.toFixed(1) },
  pbv: { label: "PBV", fmt: (v) => v.toFixed(2) },
  roe: { label: "ROE", fmt: (v) => `${fixed(v, 1)}%` },
  div: { label: "Yield", fmt: (v) => `${v.toFixed(2)}%` },
  payout: { label: "Payout", fmt: (v) => `${v.toFixed(0)}%` },
  sectorPe: { label: "Sector P/E", fmt: (v) => v.toFixed(1) },
  vsSector: { label: "vs sector", fmt: (v) => signedPct(v, 0) },
  chg: { label: "Chg %", fmt: (v) => signedPct(v, 2), tone: true },
  valueTraded: { label: "Value traded", fmt: fmtIdr },
  pos52: { label: "52w position", fmt: (v) => `${Math.round(v * 100)}%` },
};

const BASE_COLUMNS = ["price", "cap", "pe", "pbv", "roe", "div"];

function getSectorOptions(companies) {
  return Array.from(new Set(companies.map((c) => c.sector).filter(Boolean))).sort();
}

export default function Fundamentals({ companies = [] }) {
  const [quotes, setQuotes] = useState(cache.quotes);
  const [loadedCount, setLoadedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [rankingId, setRankingId] = useState(RANKINGS[0].id);
  const [sizeId, setSizeId] = useState(SIZE_OPTIONS[0].id);
  const [sector, setSector] = useState("");
  const [limit, setLimit] = useState(LIMIT_OPTIONS[0]);
  const [selectedRow, setSelectedRow] = useState(null);

  // Preload the figures for every listed company, in modest chunks, the same
  // way the Screener preloads prices.
  useEffect(() => {
    if (companies.length === 0) return;

    const fresh = Date.now() - cache.at < CACHE_MS && Object.keys(cache.quotes).length > 0;
    if (fresh) return; // state was already initialised from the cache

    // One flag per run of this effect, so a cancelled run can never be
    // revived by a later one.
    let cancelled = false;

    async function preloadAll() {
      setLoading(true);
      setLoadError("");
      setLoadedCount(0);

      const collected = {};
      let failed = false;
      for (let i = 0; i < companies.length; i += CHUNK_SIZE) {
        if (cancelled) return;
        const chunk = companies.slice(i, i + CHUNK_SIZE);
        const symbols = chunk.map((c) => `${c.code}.JK`).join(",");

        try {
          const res = await fetch(`/api/idx-quotes?view=fundamentals&symbols=${encodeURIComponent(symbols)}`);
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          (data.quotes || []).forEach((q) => { collected[q.ticker] = q; });
          if (!cancelled) setQuotes({ ...collected });
        } catch (e) {
          failed = true;
          if (!cancelled) setLoadError("Some figures failed to load: " + e.message);
        }
        if (!cancelled) setLoadedCount((c) => c + chunk.length);
      }
      if (cancelled) return;
      // Only keep a complete load, so a partial one is retried next time.
      if (!failed && Object.keys(collected).length > 0) cache = { at: Date.now(), quotes: collected };
      setLoading(false);
    }

    preloadAll();
    return () => { cancelled = true; };
  }, [companies]);

  const rows = useMemo(() => enrichRows(companies, quotes), [companies, quotes]);
  const sectorOptions = useMemo(() => getSectorOptions(companies), [companies]);
  const coverage = useMemo(() => dataCoverage(rows), [rows]);

  const sizeN = SIZE_OPTIONS.find((s) => s.id === sizeId)?.n ?? null;
  const result = useMemo(
    () => rankRows(rows, rankingId, { sector: sector || null, sizeN, limit }),
    [rows, rankingId, sector, sizeN, limit]
  );
  const { ranking } = result;

  const columns = useMemo(
    () => [...BASE_COLUMNS, ...ranking.extra.filter((key) => !BASE_COLUMNS.includes(key))],
    [ranking]
  );

  const progressPct = companies.length ? Math.round((loadedCount / companies.length) * 100) : 0;
  const hasCautions = result.rows.some((r) => r.caution);

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="mb-6 border-b border-stone-300 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fundamentals</h1>
          <p className="text-sm text-slate-500 mt-1">
            Ready-made rankings from valuation, profitability and dividend figures. Pick a list, then narrow it by company size or sector.
          </p>
        </header>

        {loadError && <p className="text-sm text-amber-700 mb-2">{loadError}</p>}

        {loading && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Loading figures… {Math.min(loadedCount, companies.length)} of {companies.length}. Rankings settle once this finishes.</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-stone-200 rounded overflow-hidden">
              <div className="h-full bg-slate-700 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {/* Ranking picker */}
        <div className="bg-white border border-stone-300 rounded p-4 mb-4 space-y-3">
          {RANKING_GROUPS.map((group) => (
            <div key={group} className="flex flex-wrap items-center gap-2">
              <span className="w-full sm:w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">{group}</span>
              {RANKINGS.filter((r) => r.group === group).map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRankingId(r.id)}
                  aria-pressed={r.id === rankingId}
                  className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                    r.id === rankingId
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-stone-300 hover:border-slate-500"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <select
            value={sizeId}
            onChange={(e) => setSizeId(e.target.value)}
            aria-label="Company size"
            className="bg-white border border-stone-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-slate-500"
          >
            {SIZE_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            aria-label="Sector"
            className="bg-white border border-stone-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-slate-500"
          >
            <option value="">All sectors</option>
            {sectorOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {!ranking.perSector && (
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              aria-label="Rows to show"
              className="bg-white border border-stone-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-slate-500"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>Top {n}</option>
              ))}
            </select>
          )}
        </div>

        {/* What this list is */}
        <div className="mb-3">
          <h2 className="text-base font-semibold text-slate-900">{ranking.label}</h2>
          <p className="text-sm text-slate-600 mt-0.5">{ranking.rule}</p>
          <p className="text-xs text-slate-400 mt-1">
            {ranking.perSector
              ? `${result.rows.length} companies shown, from ${result.universe}`
              : `${result.total} of ${result.universe} companies qualify`}
            {sizeId === "all" && " · small, thinly traded stocks are included, so read this list with care"}
          </p>
        </div>

        <div className="bg-white border border-stone-300 rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-300">
                <th className="px-3 py-2 font-medium text-slate-500 text-right w-10">#</th>
                <th className="px-3 py-2 font-medium text-slate-500 text-left">Ticker</th>
                <th className="px-3 py-2 font-medium text-slate-500 text-left">Company</th>
                <th className="px-3 py-2 font-medium text-slate-500 text-left">Sector</th>
                {columns.map((key) => (
                  <th
                    key={key}
                    className={`px-3 py-2 font-medium text-right whitespace-nowrap ${
                      key === ranking.metric ? "text-slate-900 bg-stone-100" : "text-slate-500"
                    }`}
                  >
                    {COLUMN_DEFS[key].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr
                  key={row.code}
                  onClick={() => setSelectedRow(row)}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50 cursor-pointer"
                >
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">{row.position}</td>
                  <td className="px-3 py-2 font-medium tabular-nums whitespace-nowrap">
                    {row.code}
                    {row.caution && (
                      <span className="ml-1 text-amber-600 cursor-help" title={row.caution} aria-label={row.caution}>⚠</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.name}</td>
                  <td className="px-3 py-2 text-slate-500">{row.sector || "—"}</td>
                  {columns.map((key) => {
                    const def = COLUMN_DEFS[key];
                    const v = row[key];
                    const tone = def.tone && v != null ? (v > 0 ? "text-emerald-700" : v < 0 ? "text-rose-700" : "text-slate-500") : "";
                    return (
                      <td
                        key={key}
                        className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${tone} ${
                          key === ranking.metric ? "font-semibold bg-stone-50" : ""
                        }`}
                      >
                        {v != null ? def.fmt(v) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {result.rows.length === 0 && (
                <tr>
                  <td colSpan={4 + columns.length} className="px-3 py-8 text-center text-slate-400">
                    {loading ? "Loading figures…" : "No companies qualify for this list with the current filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {hasCautions && (
          <p className="text-xs text-amber-700 mt-3">
            ⚠ marks a figure that often looks better than it is. Hover over the mark to see why, and check the company's reports before relying on it.
          </p>
        )}

        <p className="text-xs text-slate-400 mt-4 leading-relaxed">
          {!loading && coverage.priced > 0 && (
            <>
              Data coverage: of {coverage.priced} companies with a price, {coverage.pe} have a P/E, {coverage.pbv} a PBV, {coverage.roe} an ROE and {coverage.div} pay a dividend. Companies without a figure can't appear in a list that ranks by it.{" "}
            </>
          )}
          Figures via Yahoo Finance (unofficial, delayed) and can be incomplete or out of date, especially for smaller companies. ROE is approximated from per-share figures. These lists are simple rankings of public numbers, not recommendations and not financial advice. Click a row for the chart and key stats.
        </p>
      </div>

      <StockDetailModal row={selectedRow} companies={rows} onClose={() => setSelectedRow(null)} />
    </div>
  );
}
