import React, { useEffect, useMemo, useRef, useState } from "react";
import { PERIODS, periodRows } from "./historyPeriods";

// Two charts for the Portfolio > Summary tab, built from daily snapshots:
//  1. Performance vs IHSG — cumulative % return. Buys/sells are excluded so
//     adding money doesn't look like a gain (time-weighted return).
//  2. Asset value history — stacked daily value per asset class.

const RANGES = [
  { key: "1M", days: 31 },
  { key: "3M", days: 92 },
  { key: "6M", days: 183 },
  { key: "1Y", days: 366 },
];

// Monthly and yearly history use every snapshot there is, not just the
// range picked for the charts. 3660 days is the server's upper limit.
const FULL_HISTORY_DAYS = 3660;

const CLASSES = [
  { key: "stock", label: "Stocks", color: "#4f46e5" },
  { key: "crypto", label: "Crypto", color: "#f59e0b" },
  { key: "commodity", label: "Commodities", color: "#ca8a04" },
  { key: "bond", label: "Bonds", color: "#0d9488" },
  { key: "cash", label: "Cash & Deposits", color: "#94a3b8" },
];

// Per-tab settings: which value to track and what to compare it against.
const VIEWS = {
  total: { benchmark: "^JKSE", benchLabel: "IHSG", label: "My portfolio", valueLabel: "Net worth" },
  stock: { benchmark: "^JKSE", benchLabel: "IHSG", label: "My stocks", valueLabel: "Stock value" },
  crypto: { benchmark: "BTC-IDR", benchLabel: "Bitcoin", label: "My crypto", valueLabel: "Crypto value" },
  commodity: { benchmark: "GC=F", benchLabel: "Gold (USD)", label: "My commodities", valueLabel: "Commodity value" },
};

const PORTFOLIO_COLOR = "#4f46e5";
const IHSG_COLOR = "#94a3b8";

const W = 800;
const H = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 64 };

function fmtPct(v) {
  if (v == null) return "—";
  if (Math.abs(v) < 0.005) return "0.00%"; // avoid showing "-0.00%"
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtRpShort(v) {
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}M`; // miliar
  if (a >= 1e6) return `${(v / 1e6).toFixed(0)}jt`;
  return Math.round(v).toLocaleString("id-ID");
}

function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => min + step * i);
}

// Shared chart frame: axes, gridlines, hover crosshair + tooltip.
function ChartFrame({ dates, yMin, yMax, yFormat, children, tooltip }) {
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (dates.length <= 1 ? innerW / 2 : (i / (dates.length - 1)) * innerW);
  const y = (v) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  function onMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / innerW) * (dates.length - 1));
    setHover(Math.max(0, Math.min(dates.length - 1, i)));
  }

  const ticks = niceTicks(yMin, yMax);
  const labelEvery = Math.max(1, Math.ceil(dates.length / 6));

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{yFormat(t)}</text>
          </g>
        ))}
        {dates.map((d, i) =>
          i % labelEvery === 0 || i === dates.length - 1 ? (
            <text key={d} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"} fontSize="11" fill="#94a3b8">{fmtDate(d)}</text>
          ) : null
        )}
        {children({ x, y })}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="#64748b" strokeWidth="1" strokeDasharray="3 3" />
        )}
      </svg>
      {hover != null && (
        <div
          className="absolute top-2 pointer-events-none bg-white border border-stone-300 rounded shadow-sm px-3 py-2 text-xs"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: x(hover) > W / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
          }}
        >
          <div className="font-medium text-slate-700 mb-1">{fmtDate(dates[hover])}</div>
          {tooltip(hover)}
        </div>
      )}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-500 mb-2">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: it.color, height: it.thick ? 3 : 2 }} />
          {it.label}
          {it.value != null && <span className={`font-medium tabular-nums ${it.value >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtPct(it.value)}</span>}
        </span>
      ))}
    </div>
  );
}

export default function PortfolioCharts({ portfolioId, authedFetch, assetClass = null }) {
  const view = VIEWS[assetClass || "total"];
  const [range, setRange] = useState("3M");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!portfolioId) return;
    const days = RANGES.find((r) => r.key === range).days;
    setLoading(true);
    setError("");
    authedFetch(`/api/portfolio-history?portfolioId=${portfolioId}&days=${days}&benchmark=${encodeURIComponent(view.benchmark)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => { setData(null); setError(String(e.message || e)); })
      .finally(() => setLoading(false));
  }, [portfolioId, range, assetClass]); // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => buildSeries(data, assetClass), [data, assetClass]);

  // Monthly / yearly history: loaded only when asked for, over the full
  // history rather than the chart's range.
  const [period, setPeriod] = useState("daily");
  const [fullHistory, setFullHistory] = useState(null); // { key, data }
  const [fullLoading, setFullLoading] = useState(false);
  const [fullError, setFullError] = useState("");
  const fullKey = `${portfolioId}|${view.benchmark}`;

  useEffect(() => {
    if (period === "daily" || !portfolioId || fullHistory?.key === fullKey) return;
    let cancelled = false;

    async function load() {
      setFullLoading(true);
      setFullError("");
      try {
        const r = await authedFetch(
          `/api/portfolio-history?portfolioId=${portfolioId}&days=${FULL_HISTORY_DAYS}&benchmark=${encodeURIComponent(view.benchmark)}`
        );
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        if (!cancelled) setFullHistory({ key: fullKey, data: d });
      } catch (e) {
        if (!cancelled) setFullError(String(e.message || e));
      } finally {
        if (!cancelled) setFullLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [period, fullKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fullSeries = useMemo(
    () => (fullHistory?.key === fullKey ? buildSeries(fullHistory.data, assetClass) : null),
    [fullHistory, fullKey, assetClass]
  );

  const header = (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Performance vs {view.benchLabel}</h2>
      <div className="flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`text-xs px-2 py-0.5 rounded ${range === r.key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-stone-200"}`}
          >
            {r.key}
          </button>
        ))}
      </div>
    </div>
  );

  if (loading && !series) {
    return (
      <div className="mb-6">
        {header}
        <div className="bg-white border border-stone-300 rounded p-4 text-sm text-slate-400">Loading…</div>
      </div>
    );
  }

  if (error || !series || series.dates.length < 2) {
    return (
      <div className="mb-6">
        {header}
        <div className="bg-white border border-stone-300 rounded p-4 text-sm text-slate-500">
          {error
            ? `Couldn't load history: ${error}`
            : "Not enough history yet — the charts fill in as a snapshot is saved each day at market close (17:00 WIB)."}
        </div>
      </div>
    );
  }

  const { dates, points, portfolio, ihsg } = series;
  const last = dates.length - 1;

  // Chart 1 scale
  const perfVals = [...portfolio, ...ihsg.filter((v) => v != null), 0];
  const pMin = Math.min(...perfVals);
  const pMax = Math.max(...perfVals);
  const pPad = (pMax - pMin) * 0.1 || 1;

  // Chart 2: stacked values, only classes that ever had value
  const activeClasses = assetClass
    ? CLASSES.filter((c) => c.key === assetClass)
    : CLASSES.filter((c) => points.some((p) => (p[c.key] || 0) > 0));
  const stackMax = Math.max(...points.map((p) => activeClasses.reduce((s, c) => s + (p[c.key] || 0), 0)), 1);

  const linePath = (vals, x, y) =>
    vals.reduce((acc, v, i) => (v == null ? acc : acc + `${acc ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`), "");

  return (
    <>
      <div className="mb-6">
        {header}
        <div className="bg-white border border-stone-300 rounded p-4">
          <Legend
            items={[
              { label: view.label, color: PORTFOLIO_COLOR, value: portfolio[last], thick: true },
              { label: view.benchLabel, color: IHSG_COLOR, value: ihsg[last] },
            ]}
          />
          <ChartFrame
            dates={dates}
            yMin={pMin - pPad}
            yMax={pMax + pPad}
            yFormat={(v) => `${v.toFixed(1)}%`}
            tooltip={(i) => (
              <>
                <div className="flex justify-between gap-4"><span style={{ color: PORTFOLIO_COLOR }}>{view.label}</span><span className="tabular-nums">{fmtPct(portfolio[i])}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-500">{view.benchLabel}</span><span className="tabular-nums">{fmtPct(ihsg[i])}</span></div>
              </>
            )}
          >
            {({ x, y }) => (
              <>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeWidth="1" />
                <path d={linePath(ihsg, x, y)} fill="none" stroke={IHSG_COLOR} strokeWidth="2" strokeDasharray="5 4" />
                <path d={linePath(portfolio, x, y)} fill="none" stroke={PORTFOLIO_COLOR} strokeWidth="2.5" />
              </>
            )}
          </ChartFrame>
          <p className="text-xs text-slate-400 mt-2">
            Return excludes money added or withdrawn (buys and sells), so it compares like-for-like with {view.benchLabel}.
          </p>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">{assetClass ? "Value history" : "Asset value history"}</h2>
        <div className="bg-white border border-stone-300 rounded p-4">
          <Legend items={activeClasses.map((c) => ({ label: c.label, color: c.color, thick: true }))} />
          <ChartFrame
            dates={dates}
            yMin={0}
            yMax={stackMax * 1.08}
            yFormat={fmtRpShort}
            tooltip={(i) => (
              <>
                {activeClasses.map((c) => (
                  <div key={c.key} className="flex justify-between gap-4">
                    <span style={{ color: c.color }}>{c.label}</span>
                    <span className="tabular-nums">Rp {Math.round(points[i][c.key] || 0).toLocaleString("id-ID")}</span>
                  </div>
                ))}
                {!assetClass && (
                  <div className="flex justify-between gap-4 border-t border-stone-200 mt-1 pt-1 font-medium">
                    <span>Net worth</span>
                    <span className="tabular-nums">Rp {Math.round(points[i].netWorth).toLocaleString("id-ID")}</span>
                  </div>
                )}
              </>
            )}
          >
            {({ x, y }) => {
              const lower = points.map(() => 0);
              return activeClasses.map((c) => {
                const upper = points.map((p, i) => lower[i] + (p[c.key] || 0));
                const top = upper.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
                const bottom = lower
                  .map((v, i) => [i, v])
                  .reverse()
                  .map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
                  .join("");
                upper.forEach((v, i) => { lower[i] = v; });
                return <path key={c.key} d={`${top}${bottom}Z`} fill={c.color} fillOpacity="0.75" stroke={c.color} strokeWidth="1" />;
              });
            }}
          </ChartFrame>
        </div>
      </div>

      <HistoryTable
        period={period}
        onPeriod={setPeriod}
        daily={series}
        full={fullSeries}
        fullLoading={fullLoading}
        fullError={fullError}
        activeClasses={assetClass ? [] : CLASSES}
        valueLabel={view.valueLabel}
        benchLabel={view.benchLabel}
      />
    </>
  );
}

function pctClass(v) {
  if (v == null || Math.abs(v) < 0.005) return "text-slate-500";
  return v > 0 ? "text-emerald-700" : "text-rose-700";
}

// Builds the chart series from the /api/portfolio-history response.
// `value` / `flow` are either the whole portfolio or one asset class.
function buildSeries(data, assetClass) {
  const points = (data?.points || []).map((p) => ({
    ...p,
    value: assetClass ? p[assetClass] || 0 : p.netWorth,
    flow: assetClass ? (p.flows || {})[assetClass] || 0 : p.flow || 0,
  }));
  if (points.length === 0) return null;

  // Portfolio: time-weighted cumulative return, ignoring money added/withdrawn.
  let growth = 1;
  const portfolio = points.map((p, i) => {
    if (i > 0) {
      const prev = points[i - 1].value;
      if (prev > 0) growth *= 1 + (p.value - prev - p.flow) / prev;
    }
    return (growth - 1) * 100;
  });

  // IHSG: close on or before each snapshot date, relative to the first.
  const ihsgList = data?.ihsg || [];
  let j = 0;
  let lastClose = null;
  const closes = points.map((p) => {
    while (j < ihsgList.length && ihsgList[j].date <= p.date) { lastClose = ihsgList[j].close; j++; }
    return lastClose;
  });
  const base = closes.find((c) => c != null);
  const ihsg = closes.map((c) => (c != null && base ? (c / base - 1) * 100 : null));

  return { dates: points.map((p) => p.date), points, portfolio, ihsg };
}

function fmtPeriodLabel(row) {
  if (row.period === "daily") return fmtDate(row.key);
  if (row.period === "yearly") return row.key;
  return new Date(row.key + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// Shown under a month or year the data doesn't fully cover.
function fmtCoverage(row) {
  if (row.partialStart && row.partialEnd) return `${fmtDate(row.first)} – ${fmtDate(row.last)}`;
  if (row.partialStart) return `from ${fmtDate(row.first)}`;
  if (row.partialEnd) return `to ${fmtDate(row.last)}`;
  return null;
}

// History table, newest first, by day, month or year. "%" is the
// flow-adjusted return (same basis as the performance chart); "Net flow" is
// money added (+) or withdrawn (−) in the period.
function HistoryTable({ period, onPeriod, daily, full, fullLoading, fullError, activeClasses, valueLabel, benchLabel }) {
  const [showAll, setShowAll] = useState(false);
  const meta = PERIODS.find((p) => p.key === period);

  const source = period === "daily" ? daily : full;
  const rows = source ? periodRows(source.points, source.portfolio, source.ihsg, period).reverse() : [];
  const visible = showAll ? rows : rows.slice(0, 10);
  const rp = (v) => Math.round(v || 0).toLocaleString("id-ID");

  const notice =
    period === "daily" ? null
      : fullError ? `Couldn't load the full history: ${fullError}`
      : !source || fullLoading ? "Loading…"
      : null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">{meta.label} history</h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => { onPeriod(p.key); setShowAll(false); }}
              aria-pressed={period === p.key}
              className={`text-xs px-2 py-0.5 rounded ${period === p.key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-stone-200"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white border border-stone-300 rounded overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-stone-300 text-slate-500">
              <th className="px-3 py-2 text-left font-medium">{period === "daily" ? "Date" : meta.unit}</th>
              <th className="px-3 py-2 text-right font-medium">{valueLabel} (Rp)</th>
              <th className="px-3 py-2 text-right font-medium">Change (Rp)</th>
              <th className="px-3 py-2 text-right font-medium">{meta.unit} %</th>
              <th className="px-3 py-2 text-right font-medium">{benchLabel} %</th>
              <th className="px-3 py-2 text-right font-medium">Net flow (Rp)</th>
              {activeClasses.map((c) => (
                <th key={c.key} className="px-3 py-2 text-right font-medium">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {notice ? (
              <tr>
                <td colSpan={6 + activeClasses.length} className="px-3 py-6 text-center text-slate-400">{notice}</td>
              </tr>
            ) : (
              visible.map((r) => {
                const coverage = fmtCoverage(r);
                return (
                  <tr key={r.key} className="border-b border-stone-100 last:border-0">
                    <td className="px-3 py-2 font-medium">
                      {fmtPeriodLabel(r)}
                      {coverage && <span className="ml-2 text-xs font-normal text-slate-400">{coverage}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{rp(r.value)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${pctClass(r.change)}`}>
                      {r.change == null ? "—" : `${r.change >= 0 ? "+" : ""}${rp(r.change)}`}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${pctClass(r.pct)}`}>{fmtPct(r.pct)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${pctClass(r.benchPct)}`}>{fmtPct(r.benchPct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {r.flow ? `${r.flow > 0 ? "+" : ""}${rp(r.flow)}` : "—"}
                    </td>
                    {activeClasses.map((c) => (
                      <td key={c.key} className="px-3 py-2 text-right tabular-nums">{rp(r.point[c.key])}</td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!notice && rows.length > 10 && (
        <button onClick={() => setShowAll((v) => !v)} className="text-xs text-slate-500 hover:text-slate-700 mt-2">
          {showAll ? "Show less" : `Show all ${rows.length} ${meta.plural}`}
        </button>
      )}
      <p className="text-xs text-slate-400 mt-2">
        {period === "daily"
          ? "Day % excludes money added or withdrawn; Net flow shows buys (+) and sells (−) since the previous day."
          : `Values are at the end of each ${meta.unit.toLowerCase()}, or the latest day for the current one. ${meta.unit} % excludes money added or withdrawn and covers your whole history, not just the chart's range; Net flow totals buys (+) and sells (−) in the ${meta.unit.toLowerCase()}.`}
      </p>
    </div>
  );
}
