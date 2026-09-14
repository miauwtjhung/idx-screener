import React, { useState, useEffect, useMemo } from "react";
import { computeSignal, buildSectorAvgPeMap } from "./signal";

const STORAGE_KEY = "idx-portfolios";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to default
  }
  const defaultPortfolio = { id: "default", name: "My Portfolio", transactions: [] };
  return { portfolios: [defaultPortfolio], activeId: "default" };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private browsing, etc.) — fail silently
  }
}

// Average-cost method: buys move the weighted average cost; sells reduce
// quantity but leave the average cost of remaining shares unchanged.
function computeHoldings(transactions) {
  const byTicker = {};
  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const t of sorted) {
    if (!byTicker[t.ticker]) byTicker[t.ticker] = { qty: 0, avgPrice: 0, invested: 0 };
    const h = byTicker[t.ticker];

    if (t.type === "buy") {
      const newInvested = h.invested + t.price * t.qty;
      const newQty = h.qty + t.qty;
      h.avgPrice = newQty > 0 ? newInvested / newQty : 0;
      h.qty = newQty;
      h.invested = newInvested;
    } else {
      h.invested -= h.avgPrice * t.qty;
      h.qty -= t.qty;
      if (h.qty <= 0) {
        h.qty = 0;
        h.invested = 0;
        h.avgPrice = 0;
      }
    }
  }

  return Object.entries(byTicker)
    .filter(([, h]) => h.qty > 0)
    .map(([ticker, h]) => ({ ticker, ...h }));
}

export default function Portfolio({ companies }) {
  const [state, setState] = useState({ portfolios: [], activeId: null });
  const [quotes, setQuotes] = useState({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [sectorAvgMap, setSectorAvgMap] = useState({});
  const [showPortfolioMenu, setShowPortfolioMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const [form, setForm] = useState({
    ticker: "",
    type: "buy",
    price: "",
    qty: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setState(loadState());
  }, []);

  function persist(next) {
    setState(next);
    saveState(next);
  }

  const activePortfolio = state.portfolios.find((p) => p.id === state.activeId) || state.portfolios[0];
  const transactions = activePortfolio ? activePortfolio.transactions : [];

  const holdings = useMemo(() => computeHoldings(transactions), [transactions]);

  // Fetch live prices for whatever's currently held in the active portfolio.
  useEffect(() => {
    if (holdings.length === 0) return;
    setLoadingQuotes(true);
    const symbols = holdings.map((h) => `${h.ticker}.JK`).join(",");
    fetch(`/api/idx-quotes?symbols=${encodeURIComponent(symbols)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const byTicker = {};
        (data.quotes || []).forEach((q) => { byTicker[q.ticker] = q; });
        setQuotes(byTicker);
      })
      .catch(() => {})
      .finally(() => setLoadingQuotes(false));
  }, [transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  // For the Buy/Hold/Sell signal we need each held stock's sector-average
  // P/E. Rather than loading all 962 IDX tickers, only fetch peers from
  // whatever sectors your current holdings actually belong to.
  useEffect(() => {
    if (holdings.length === 0 || companies.length === 0) return;

    const heldSectors = new Set(
      holdings
        .map((h) => companies.find((c) => c.code === h.ticker)?.sector)
        .filter(Boolean)
    );
    if (heldSectors.size === 0) return;

    const peers = companies.filter((c) => heldSectors.has(c.sector));
    const CHUNK = 75;

    async function loadPeerPe() {
      const peerRows = [];
      for (let i = 0; i < peers.length; i += CHUNK) {
        const chunk = peers.slice(i, i + CHUNK);
        const symbols = chunk.map((c) => `${c.code}.JK`).join(",");
        try {
          const res = await fetch(`/api/idx-quotes?symbols=${encodeURIComponent(symbols)}`);
          const data = await res.json();
          if (data.error) continue;
          (data.quotes || []).forEach((q) => {
            const company = chunk.find((c) => c.code === q.ticker);
            if (company) peerRows.push({ sector: company.sector, pe: q.pe });
          });
        } catch {
          // skip this chunk on failure, partial data is fine for an average
        }
      }
      setSectorAvgMap(buildSectorAvgPeMap(peerRows));
    }

    loadPeerPe();
  }, [holdings.length, companies]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchPortfolio(id) {
    persist({ ...state, activeId: id });
    setShowPortfolioMenu(false);
  }

  function createPortfolio() {
    const name = prompt("Name for the new portfolio:", "New Portfolio");
    if (!name || !name.trim()) return;
    const id = `p_${Date.now()}`;
    const next = {
      portfolios: [...state.portfolios, { id, name: name.trim(), transactions: [] }],
      activeId: id,
    };
    persist(next);
    setShowPortfolioMenu(false);
  }

  function deletePortfolio(id) {
    if (state.portfolios.length <= 1) {
      alert("You need at least one portfolio.");
      return;
    }
    const portfolio = state.portfolios.find((p) => p.id === id);
    if (!confirm(`Delete "${portfolio.name}"? This removes all its transactions and can't be undone.`)) return;

    const remaining = state.portfolios.filter((p) => p.id !== id);
    const next = {
      portfolios: remaining,
      activeId: state.activeId === id ? remaining[0].id : state.activeId,
    };
    persist(next);
  }

  function startRename() {
    setNameInput(activePortfolio.name);
    setEditingName(true);
    setShowPortfolioMenu(false);
  }

  function saveRename() {
    if (!nameInput.trim()) return setEditingName(false);
    const next = {
      ...state,
      portfolios: state.portfolios.map((p) =>
        p.id === activePortfolio.id ? { ...p, name: nameInput.trim() } : p
      ),
    };
    persist(next);
    setEditingName(false);
  }

  function updateActiveTransactions(newTransactions) {
    const next = {
      ...state,
      portfolios: state.portfolios.map((p) =>
        p.id === activePortfolio.id ? { ...p, transactions: newTransactions } : p
      ),
    };
    persist(next);
  }

  function addTransaction(e) {
    e.preventDefault();
    setFormError("");

    const ticker = form.ticker.trim().toUpperCase();
    const price = parseFloat(form.price);
    const qty = parseInt(form.qty, 10);

    if (!ticker) return setFormError("Enter a ticker.");
    if (companies.length > 0 && !companies.some((c) => c.code === ticker)) {
      return setFormError(`"${ticker}" isn't a recognized IDX ticker.`);
    }
    if (!price || price <= 0) return setFormError("Enter a valid price.");
    if (!qty || qty <= 0) return setFormError("Enter a valid quantity.");

    if (form.type === "sell") {
      const current = computeHoldings(transactions).find((h) => h.ticker === ticker);
      const heldQty = current ? current.qty : 0;
      if (qty > heldQty) {
        return setFormError(`You only hold ${heldQty} shares of ${ticker} in this portfolio.`);
      }
    }

    const next = [...transactions, { id: Date.now(), ticker, type: form.type, price, qty, date: form.date }];
    updateActiveTransactions(next);
    setForm((f) => ({ ...f, ticker: "", price: "", qty: "" }));
  }

  function removeTransaction(id) {
    updateActiveTransactions(transactions.filter((t) => t.id !== id));
  }

  const rows = holdings.map((h) => {
    const q = quotes[h.ticker] || {};
    const sector = companies.find((c) => c.code === h.ticker)?.sector || null;
    const currentPrice = q.price ?? null;
    const marketValue = currentPrice != null ? currentPrice * h.qty : null;
    const pnl = marketValue != null ? marketValue - h.invested : null;
    const pnlPct = h.invested > 0 && pnl != null ? (pnl / h.invested) * 100 : null;
    return { ...h, sector, price: currentPrice, currentPrice, chg: q.chg ?? null, pe: q.pe ?? null, div: q.div ?? null, low52: q.low52 ?? null, high52: q.high52 ?? null, marketValue, pnl, pnlPct };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      invested: acc.invested + r.invested,
      marketValue: acc.marketValue + (r.marketValue ?? 0),
    }),
    { invested: 0, marketValue: 0 }
  );
  const totalPnl = totals.marketValue - totals.invested;
  const totalPnlPct = totals.invested > 0 ? (totalPnl / totals.invested) * 100 : 0;

  if (!activePortfolio) return null;

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900 font-sans">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <header className="mb-6 border-b border-stone-300 pb-4">
          <div className="flex items-center justify-between">
            <div className="relative">
              {editingName ? (
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={saveRename}
                  onKeyDown={(e) => e.key === "Enter" && saveRename()}
                  className="text-2xl font-semibold tracking-tight bg-white border border-slate-400 rounded px-2 py-0.5"
                />
              ) : (
                <button
                  onClick={() => setShowPortfolioMenu((v) => !v)}
                  className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900"
                >
                  {activePortfolio.name}
                  <span className="text-base text-slate-400">▾</span>
                </button>
              )}

              {showPortfolioMenu && (
                <div className="absolute left-0 top-full mt-2 bg-white border border-stone-300 rounded shadow-lg w-64 z-10 py-1">
                  {state.portfolios.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between px-3 py-2 text-sm hover:bg-stone-50 cursor-pointer ${p.id === activePortfolio.id ? "font-medium" : ""}`}
                    >
                      <button onClick={() => switchPortfolio(p.id)} className="flex-1 text-left">
                        {p.name}
                      </button>
                      {state.portfolios.length > 1 && (
                        <button
                          onClick={() => deletePortfolio(p.id)}
                          className="text-xs text-slate-300 hover:text-rose-600 ml-2"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="border-t border-stone-200 mt-1 pt-1">
                    <button onClick={startRename} className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-stone-50">
                      Rename current portfolio
                    </button>
                    <button onClick={createPortfolio} className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-stone-50">
                      + New portfolio
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {holdings.length === 0
              ? "No holdings yet — log a buy below to get started."
              : `${holdings.length} holding${holdings.length === 1 ? "" : "s"} · saved in this browser only`}
          </p>
        </header>

        {holdings.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <SummaryCard label="Invested" value={`Rp ${Math.round(totals.invested).toLocaleString("id-ID")}`} />
            <SummaryCard label="Market value" value={`Rp ${Math.round(totals.marketValue).toLocaleString("id-ID")}`} />
            <SummaryCard
              label="P&L"
              value={`${totalPnl >= 0 ? "+" : ""}Rp ${Math.round(totalPnl).toLocaleString("id-ID")} (${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%)`}
              accent={totalPnl >= 0 ? "up" : "down"}
            />
          </div>
        )}

        <form onSubmit={addTransaction} className="bg-white border border-stone-300 rounded p-4 mb-6">
          <h2 className="text-sm font-medium text-slate-700 mb-3">Log a transaction</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ticker</label>
              <input
                type="text"
                value={form.ticker}
                onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                placeholder="BBCA"
                className="w-28 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Price (Rp)</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="6350"
                className="w-28 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Volume</label>
              <input
                type="number"
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                placeholder="100"
                className="w-24 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500"
              />
            </div>
            <button type="submit" className="bg-slate-900 text-white px-4 py-1.5 rounded text-sm font-medium">
              Add
            </button>
          </div>
          {formError && <p className="text-sm text-rose-700 mt-2">{formError}</p>}
        </form>

        {rows.length > 0 && (
          <div className="bg-white border border-stone-300 rounded overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-slate-500">
                  <th className="px-3 py-2 text-left font-medium">Symbol</th>
                  <th className="px-3 py-2 text-left font-medium">Signal</th>
                  <th className="px-3 py-2 text-right font-medium">Current Price</th>
                  <th className="px-3 py-2 text-right font-medium">Avg Price</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Market Value</th>
                  <th className="px-3 py-2 text-right font-medium">Invested</th>
                  <th className="px-3 py-2 text-right font-medium">P&L</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ticker} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                    <td className="px-3 py-2 font-medium">{r.ticker}</td>
                    <td className="px-3 py-2">
                      <SignalBadge row={r} sectorAvgPe={sectorAvgMap[r.sector]} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.currentPrice != null ? (
                        <>
                          {r.currentPrice.toLocaleString("id-ID")}{" "}
                          <span className={r.chg > 0 ? "text-emerald-700" : r.chg < 0 ? "text-rose-700" : "text-slate-400"}>
                            ({r.chg != null ? `${r.chg > 0 ? "+" : ""}${r.chg.toFixed(2)}%` : "—"})
                          </span>
                        </>
                      ) : loadingQuotes ? "…" : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.avgPrice.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.qty.toLocaleString("id-ID")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.marketValue != null ? Math.round(r.marketValue).toLocaleString("id-ID") : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(r.invested).toLocaleString("id-ID")}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.pnl > 0 ? "text-emerald-700" : r.pnl < 0 ? "text-rose-700" : "text-slate-500"}`}>
                      {r.pnl != null ? `${r.pnl > 0 ? "+" : ""}${Math.round(r.pnl).toLocaleString("id-ID")}` : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.pnlPct > 0 ? "text-emerald-700" : r.pnlPct < 0 ? "text-rose-700" : "text-slate-500"}`}>
                      {r.pnlPct != null ? `${r.pnlPct > 0 ? "+" : ""}${r.pnlPct.toFixed(2)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {transactions.length > 0 && (
          <div>
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">Transaction history</h2>
            <div className="bg-white border border-stone-300 rounded overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-slate-500">
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Ticker</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...transactions].reverse().map((t) => (
                    <tr key={t.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-3 py-2 text-slate-500">{t.date}</td>
                      <td className="px-3 py-2 font-medium">{t.ticker}</td>
                      <td className={`px-3 py-2 ${t.type === "buy" ? "text-emerald-700" : "text-rose-700"}`}>{t.type === "buy" ? "Buy" : "Sell"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.price.toLocaleString("id-ID")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.qty.toLocaleString("id-ID")}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeTransaction(t.id)} className="text-xs text-slate-400 hover:text-rose-600">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400 mt-6">
          Stored in this browser's local storage only — it won't sync across devices and will be lost if you clear browser data. Average cost is computed using the weighted-average method. The Signal column is an automated heuristic based on valuation, dividend, momentum, and 52-week range — not financial advice.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }) {
  const color = accent === "up" ? "text-emerald-700" : accent === "down" ? "text-rose-700" : "text-slate-900";
  return (
    <div className="bg-white border border-stone-300 rounded p-4">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

const SIGNAL_STYLES = {
  Buy: "bg-emerald-100 text-emerald-800",
  Hold: "bg-amber-100 text-amber-800",
  Sell: "bg-rose-100 text-rose-800",
};

function SignalBadge({ row, sectorAvgPe }) {
  if (row.price == null) {
    return <span className="text-xs text-slate-300">—</span>;
  }
  const { label } = computeSignal(row, sectorAvgPe);
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SIGNAL_STYLES[label]}`}>
      {label}
    </span>
  );
}
