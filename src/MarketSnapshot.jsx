import React, { useState, useEffect } from "react";

const CATEGORY_LABELS = {
  indices: "Indices",
  currencies: "Currencies",
  commodities: "Commodities",
  crypto: "Crypto",
};

const CATEGORY_ORDER = ["indices", "currencies", "commodities", "crypto"];

function fmtPrice(v) {
  if (v == null) return "—";
  // Large index/price values get thousands separators; small FX pairs keep decimals.
  return v >= 100 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v.toFixed(4);
}

function fmtChg(v) {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export default function MarketSnapshot() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lang, setLang] = useState("en"); // "en" default, user can switch to "id"

  useEffect(() => {
    fetch("/api/market-snapshot")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSnapshot(data.snapshot);
      })
      .catch((e) => setError("Couldn't load today's market snapshot. " + e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center text-slate-400 text-sm">
        Loading today's market snapshot…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center text-rose-700 text-sm">
        {error}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center text-slate-400 text-sm">
        No snapshot yet — check back after 06:00 WIB.
      </div>
    );
  }

  const summary = lang === "id" ? snapshot.summary_id : snapshot.summary_en;
  const data = snapshot.data || {};

  const dateLabel = new Date(snapshot.snapshot_date).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="mb-6 flex items-start justify-between border-b border-stone-300 pb-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Today's Market Snapshot</h1>
            <p className="text-sm text-slate-500 mt-1">{dateLabel}</p>
          </div>
          <div className="flex gap-1 bg-white border border-stone-300 rounded p-0.5">
            <button
              onClick={() => setLang("en")}
              className={`px-3 py-1 text-xs font-medium rounded ${
                lang === "en" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              English
            </button>
            <button
              onClick={() => setLang("id")}
              className={`px-3 py-1 text-xs font-medium rounded ${
                lang === "id" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Bahasa
            </button>
          </div>
        </header>

        {summary && (
          <div className="bg-white border border-stone-300 rounded p-5 mb-6">
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">
              {lang === "id" ? "Ringkasan pasar" : "Market summary"}
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{summary}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat} className="bg-white border border-stone-300 rounded overflow-hidden">
              <div className="px-4 py-2.5 border-b border-stone-200 bg-stone-50">
                <h3 className="text-sm font-medium text-slate-700">{CATEGORY_LABELS[cat]}</h3>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {(data[cat] || []).map((row) => (
                    <tr key={row.symbol} className="border-b border-stone-100 last:border-0">
                      <td className="px-4 py-2 text-slate-700">{row.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtPrice(row.price)}</td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums font-medium w-20 ${
                          row.chg > 0 ? "text-emerald-700" : row.chg < 0 ? "text-rose-700" : "text-slate-400"
                        }`}
                      >
                        {fmtChg(row.chg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400 mt-6">
          {lang === "id"
            ? "Diperbarui setiap pagi pukul 06.00 WIB. Ringkasan dibuat otomatis berdasarkan data harga — bukan nasihat keuangan."
            : "Updated every morning at 06:00 WIB. The summary is auto-generated from price data only — not financial advice."}
        </p>
      </div>
    </div>
  );
}
