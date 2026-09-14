import React from "react";
import { computeSignal, sectorAveragePe } from "./signal";

function fmtCap(v) {
  if (v == null) return "—";
  return `Rp ${v.toFixed(1)}T`;
}

const LABEL_STYLES = {
  Buy: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Hold: "bg-amber-100 text-amber-800 border-amber-300",
  Sell: "bg-rose-100 text-rose-800 border-rose-300",
};

const REASON_DOT = {
  up: "bg-emerald-500",
  down: "bg-rose-500",
  flat: "bg-slate-300",
};

export default function StockDetailModal({ row, companies, onClose }) {
  if (!row) return null;

  const sectorAvgPe = sectorAveragePe(companies, row.sector);
  const { label, reasons } = computeSignal(row, sectorAvgPe);

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg border border-stone-300 max-w-lg w-full mt-8 mb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-stone-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{row.code}</h2>
            <p className="text-sm text-slate-500">{row.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{row.sector} · {row.board}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Signal */}
          <div className={`border rounded-lg p-4 ${LABEL_STYLES[label]}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wide opacity-70">Informational signal</span>
              <span className="text-lg font-semibold">{label}</span>
            </div>
            <ul className="space-y-1.5">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${REASON_DOT[r.dir]}`} />
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            This is an automated heuristic based on public valuation and price data only — it does not account for your goals, risk tolerance, or anything company-specific beyond these numbers. It is not financial advice. Consider doing your own research or speaking with a licensed financial advisor before making investment decisions.
          </p>

          {/* Key stats */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">Key stats</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Price" value={row.price != null ? `Rp ${row.price.toLocaleString("id-ID")}` : "—"} />
              <Stat label="Today" value={row.chg != null ? `${row.chg > 0 ? "+" : ""}${row.chg.toFixed(2)}%` : "—"} accent={row.chg > 0 ? "up" : row.chg < 0 ? "down" : null} />
              <Stat label="Market cap" value={fmtCap(row.cap)} />
              <Stat label="P/E ratio" value={row.pe != null ? row.pe.toFixed(1) : "—"} />
              <Stat label="Sector avg P/E" value={sectorAvgPe != null ? sectorAvgPe.toFixed(1) : "—"} />
              <Stat label="Dividend yield" value={row.div != null ? `${row.div.toFixed(2)}%` : "—"} />
              <Stat label="52-week low" value={row.low52 != null ? `Rp ${row.low52.toLocaleString("id-ID")}` : "—"} />
              <Stat label="52-week high" value={row.high52 != null ? `Rp ${row.high52.toLocaleString("id-ID")}` : "—"} />
              <Stat label="Volume" value={row.vol != null ? `${row.vol.toFixed(1)}M` : "—"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  const color = accent === "up" ? "text-emerald-700" : accent === "down" ? "text-rose-700" : "text-slate-900";
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`font-medium tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
