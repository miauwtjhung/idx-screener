import React, { useState, useEffect, useCallback } from "react";

const CATEGORY_LABELS = {
  indices: "Indices",
  currencies: "Currencies",
  commodities: "Commodities",
  crypto: "Crypto",
};

const CATEGORY_ORDER = ["indices", "currencies", "commodities", "crypto"];

const VIEW_TITLES = {
  live: "Market Snapshot",
  preopen: "Earlier Today Brief",
  close: "Today Closing",
};

function fmtPrice(v) {
  if (v == null) return "-";
  return v >= 100 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v.toFixed(4);
}

function fmtChg(v) {
  if (v == null) return "-";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function IhsgSparkline({ points }) {
  if (!points || points.length < 2) return null;

  const width = 640;
  const height = 160;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.price - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const isUp = points[points.length - 1].price >= points[0].price;
  const lineColor = isUp ? "#0f6e56" : "#993c1d";
  const fillColor = isUp ? "rgba(15,110,86,0.08)" : "rgba(153,60,29,0.08)";

  const areaPath = `M0,${height} L${coords.join(" L")} L${width},${height} Z`;
  const linePath = `M${coords.join(" L")}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40" preserveAspectRatio="none">
      <path d={areaPath} fill={fillColor} />
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" />
    </svg>
  );
}

function IhsgCard() {
  const [chart, setChart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/ihsg-chart")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setChart(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white border border-stone-300 rounded p-4 mb-6 text-sm text-slate-400">
        Loading IHSG...
      </div>
    );
  }
  if (error || !chart) {
    return (
      <div className="bg-white border border-stone-300 rounded p-4 mb-6 text-sm text-rose-700">
        Couldn't load IHSG chart. {error}
      </div>
    );
  }

  const isUp = chart.chg != null && chart.chg >= 0;
  const chgColor = isUp ? "text-emerald-700" : "text-rose-700";

  return (
    <div className="bg-white border border-stone-300 rounded p-4 mb-6">
      <div className="flex items-center justify-between mb-1">
        <span className="inline-block bg-slate-900 text-white text-xs font-medium px-2 py-1 rounded">IHSG</span>
        <span className="text-xs text-slate-400">
          {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
        </span>
      </div>
      <div className="mb-3">
        <span className="text-2xl font-semibold tabular-nums">{fmtPrice(chart.price)}</span>{" "}
        <span className={`text-sm font-medium tabular-nums ${chgColor}`}>
          {chart.chgAbs != null ? `${chart.chgAbs > 0 ? "+" : ""}${chart.chgAbs.toFixed(2)}` : ""} ({fmtChg(chart.chg)})
        </span>
      </div>

      <IhsgSparkline points={chart.points} />

      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="bg-stone-50 border border-stone-200 rounded p-2">
          <div className="text-xs text-slate-400 mb-1">Open</div>
          <div className="text-sm font-medium tabular-nums">{fmtPrice(chart.open)}</div>
        </div>
        <div className="bg-stone-50 border border-stone-200 rounded p-2">
          <div className="text-xs text-slate-400 mb-1">High</div>
          <div className="text-sm font-medium tabular-nums text-emerald-700">{fmtPrice(chart.high)}</div>
        </div>
        <div className="bg-stone-50 border border-stone-200 rounded p-2">
          <div className="text-xs text-slate-400 mb-1">Low</div>
          <div className="text-sm font-medium tabular-nums text-rose-700">{fmtPrice(chart.low)}</div>
        </div>
      </div>
    </div>
  );
}

function CategoryGrid({ grouped }) {
  if (!grouped) return <p className="text-sm text-slate-500 mb-6">No market data available yet for this view.</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {CATEGORY_ORDER.map((cat) => (
        <div key={cat} className="bg-white border border-stone-300 rounded overflow-hidden">
          <div className="bg-stone-50 px-4 py-2 border-b border-stone-200">
            <h2 className="text-sm font-semibold text-slate-700">{CATEGORY_LABELS[cat]}</h2>
          </div>
          <div>
            {(grouped[cat] || []).filter((item) => !(cat === "indices" && item.symbol === "^JKSE")).map((item) => (
              <div key={item.symbol} className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100 last:border-0">
                <span className="text-sm text-slate-700">{item.name}</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium tabular-nums">{fmtPrice(item.price)}</span>
                  <span className={`text-xs font-medium tabular-nums ${item.chg > 0 ? "text-emerald-700" : item.chg < 0 ? "text-rose-700" : "text-slate-400"}`}>
                    {fmtChg(item.chg)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MarketSnapshot() {
  const [snapshot, setSnapshot] = useState(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [snapshotError, setSnapshotError] = useState("");

  const [liveData, setLiveData] = useState(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveFetchedFor, setLiveFetchedFor] = useState(null);

  const [lang, setLang] = useState("en");
  const [view, setView] = useState("live");

  useEffect(() => {
    fetch("/api/market-snapshot")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSnapshot(data.snapshot);
      })
      .catch((e) => setSnapshotError("Couldn't load today's market snapshot. " + e.message))
      .finally(() => setLoadingSnapshot(false));
  }, []);

  const loadLive = useCallback(() => {
    setLoadingLive(true);
    setLiveError("");
    fetch("/api/market-live")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setLiveData(data);
        setLiveFetchedFor(true);
      })
      .catch((e) => setLiveError("Couldn't load live market data. " + e.message))
      .finally(() => setLoadingLive(false));
  }, []);

  useEffect(() => {
    if (view === "live" && liveFetchedFor === null) {
      loadLive();
    }
  }, [view, lang, liveFetchedFor, loadLive]);

  if (loadingSnapshot) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center text-slate-400 text-sm">
        Loading today's market snapshot...
      </div>
    );
  }

  if (snapshotError) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center text-rose-700 text-sm">
        {snapshotError}
      </div>
    );
  }

  const hasPreopen = snapshot && snapshot.data;
  const hasClose = snapshot && snapshot.close_data;

  let grouped = null;
  let summary = null;
  let subtitle = "";

  if (view === "live") {
    grouped = liveData?.data || null;
    summary = null;
    subtitle = liveData?.fetchedAt ? `Live - fetched ${new Date(liveData.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Live";
  } else if (view === "preopen") {
    grouped = snapshot?.data || null;
    summary = lang === "id" ? snapshot?.summary_id : snapshot?.summary_en;
    subtitle = `Pre-market opening - ${fmtDate(snapshot?.snapshot_date)}`;
  } else if (view === "close") {
    grouped = snapshot?.close_data || null;
    summary = lang === "id" ? snapshot?.close_summary_id : snapshot?.close_summary_en;
    subtitle = `Market close - ${fmtDate(snapshot?.snapshot_date)}`;
  }

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900 font-sans">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{VIEW_TITLES[view]}</h1>
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex border border-stone-300 rounded overflow-hidden">
              <button
                onClick={() => setView("live")}
                className={`px-3 py-1.5 text-sm font-medium ${view === "live" ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-stone-50"}`}
              >
                Market Snapshot
              </button>
              <button
                onClick={() => setView("preopen")}
                disabled={!hasPreopen}
                className={`px-3 py-1.5 text-sm font-medium border-l border-stone-300 ${
                  view === "preopen" ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-stone-50"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Earlier Today
              </button>
              <button
                onClick={() => setView("close")}
                disabled={!hasClose}
                className={`px-3 py-1.5 text-sm font-medium border-l border-stone-300 ${
                  view === "close" ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-stone-50"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Today Closing
              </button>
            </div>
            <div className="flex border border-stone-300 rounded overflow-hidden">
              <button
                onClick={() => setLang("en")}
                className={`px-3 py-1.5 text-sm font-medium ${lang === "en" ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-stone-50"}`}
              >
                English
              </button>
              <button
                onClick={() => setLang("id")}
                className={`px-3 py-1.5 text-sm font-medium border-l border-stone-300 ${lang === "id" ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-stone-50"}`}
              >
                Bahasa
              </button>
            </div>
          </div>
        </header>

        {view === "live" && <IhsgCard />}

        {view !== "live" && (
        <div className="bg-white border border-stone-300 rounded p-5">
          {summary ? (
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{summary}</p>
          ) : (
            <p className="text-sm text-slate-500">No narrative available yet for this view.</p>
          )}
        </div>
      )}

        {view === "live" && loadingLive ? (
          <p className="text-sm text-slate-400 mb-6">Fetching live data...</p>
        ) : view === "live" && liveError ? (
          <p className="text-sm text-rose-700 mb-6">{liveError}</p>
        ) : (
          <CategoryGrid grouped={grouped} />
        )}
      </div>
    </div>
  );
}
