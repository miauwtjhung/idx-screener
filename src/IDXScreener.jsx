import React, { useState, useEffect, useMemo, useRef } from "react";
import StockDetailModal from "./StockDetailModal";

const PAGE_SIZE = 50;
const CHUNK_SIZE = 75; // tickers per Yahoo request while preloading

function fmtCap(v) {
  if (v == null) return "—";
  return `Rp ${v.toFixed(1)}T`;
}

const COLUMNS = [
  { key: "code", label: "Ticker", align: "left" },
  { key: "name", label: "Company", align: "left" },
  { key: "sector", label: "Sector", align: "left" },
  { key: "price", label: "Price (Rp)", align: "right" },
  { key: "chg", label: "Chg %", align: "right" },
  { key: "cap", label: "Mkt cap", align: "right" },
  { key: "pe", label: "P/E", align: "right" },
  { key: "div", label: "Yield", align: "right" },
  { key: "vol", label: "Volume", align: "right" },
];

const BOARDS = ["All boards", "Utama", "Pengembangan", "Akselerasi", "Pemantauan Khusus", "Ekonomi Baru"];

function getSectorOptions(companies) {
  const found = new Set(companies.map((c) => c.sector).filter(Boolean));
  return ["All sectors", ...Array.from(found).sort()];
}

export default function IDXScreener() {
  const [companies, setCompanies] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [quotes, setQuotes] = useState({});
  const [loadedCount, setLoadedCount] = useState(0);
  const [preloading, setPreloading] = useState(false);
  const [quotesError, setQuotesError] = useState("");
  const cancelledRef = useRef(false);

  const [query, setQuery] = useState("");
  const [board, setBoard] = useState("All boards");
  const [sector, setSector] = useState("All sectors");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState("code");
  const [sortDir, setSortDir] = useState("asc");
  const [selectedRow, setSelectedRow] = useState(null);

  // Load the static, bundled company list — sector and board are already
  // included, straight from IDX's own data, no extra fetch needed.
  useEffect(() => {
    fetch("/idx-companies.json")
      .then((r) => r.json())
      .then((data) => setCompanies(data))
      .catch((e) => setListError("Couldn't load the IDX company list. " + e.message))
      .finally(() => setListLoading(false));
  }, []);

  // Once the company list is in, preload live quotes for all of them in the
  // background, in modest chunks, so the app stays responsive while it does.
  useEffect(() => {
    if (companies.length === 0) return;
    cancelledRef.current = false;
    setPreloading(true);
    setQuotesError("");

    async function preloadAll() {
      for (let i = 0; i < companies.length; i += CHUNK_SIZE) {
        if (cancelledRef.current) return;
        const chunk = companies.slice(i, i + CHUNK_SIZE);
        const symbols = chunk.map((c) => `${c.code}.JK`).join(",");

        try {
          const res = await fetch(`/api/idx-quotes?symbols=${encodeURIComponent(symbols)}`);
          const data = await res.json();
          if (data.error) throw new Error(data.error);

          setQuotes((prev) => {
            const next = { ...prev };
            (data.quotes || []).forEach((q) => { next[q.ticker] = q; });
            return next;
          });
          setLoadedCount((c) => c + chunk.length);
        } catch (e) {
          setQuotesError("Some prices failed to load: " + e.message);
          setLoadedCount((c) => c + chunk.length); // still advance so progress finishes
        }
      }
      if (!cancelledRef.current) setPreloading(false);
    }

    preloadAll();
    return () => { cancelledRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies]);

  const allRowsWithQuotes = useMemo(
    () => companies.map((c) => ({ ...c, ...(quotes[c.code] || {}) })),
    [companies, quotes]
  );

  const filtered = useMemo(() => {
    let r = companies.filter((c) => {
      const matchesQuery =
        query.trim() === "" ||
        c.code.toLowerCase().includes(query.toLowerCase()) ||
        c.name.toLowerCase().includes(query.toLowerCase());
      const matchesBoard = board === "All boards" || c.board === board;
      const matchesSector = sector === "All sectors" || c.sector === sector;
      return matchesQuery && matchesBoard && matchesSector;
    });
    r = r.map((c) => ({ ...c, ...(quotes[c.code] || {}) }));
    r.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return r;
  }, [companies, quotes, query, board, sector, sortKey, sortDir]);

  const sectorOptions = useMemo(() => getSectorOptions(companies), [companies]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "code" || key === "name" || key === "sector" ? "asc" : "desc");
    }
    setPage(0);
  }

  const progressPct = companies.length ? Math.round((loadedCount / companies.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="mb-6 border-b border-stone-300 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">IDX Screener</h1>
          <p className="text-sm text-slate-500 mt-1">
            {listLoading
              ? "Loading the IDX ticker list…"
              : `${companies.length} listed companies · showing ${filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          </p>
        </header>

        {listError && <p className="text-sm text-rose-700 mb-4">{listError}</p>}
        {quotesError && <p className="text-sm text-amber-700 mb-2">{quotesError}</p>}

        {preloading && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Loading live prices… {loadedCount} of {companies.length}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-stone-200 rounded overflow-hidden">
              <div className="h-full bg-slate-700 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-5">
          <input
            type="text"
            placeholder="Search ticker or company"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            className="flex-1 min-w-[220px] bg-white border border-stone-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-slate-500"
          />
          <select
            value={board}
            onChange={(e) => { setBoard(e.target.value); setPage(0); }}
            className="bg-white border border-stone-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-slate-500"
          >
            {BOARDS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            value={sector}
            onChange={(e) => { setSector(e.target.value); setPage(0); }}
            className="bg-white border border-stone-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-slate-500"
          >
            {sectorOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-stone-300 rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-300">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-2 font-medium text-slate-500 cursor-pointer select-none whitespace-nowrap ${col.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-1 text-slate-400">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={row.code}
                  onClick={() => setSelectedRow(row)}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50 cursor-pointer"
                >
                  <td className="px-3 py-2 font-medium tabular-nums">{row.code}</td>
                  <td className="px-3 py-2 text-slate-700">{row.name}</td>
                  <td className="px-3 py-2 text-slate-500">{row.sector || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.price != null ? row.price.toLocaleString("id-ID") : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${row.chg > 0 ? "text-emerald-700" : row.chg < 0 ? "text-rose-700" : "text-slate-500"}`}>
                    {row.chg != null ? `${row.chg > 0 ? "+" : ""}${row.chg.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCap(row.cap)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.pe != null ? row.pe.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.div != null ? `${row.div.toFixed(2)}%` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.vol != null ? `${row.vol.toFixed(1)}M` : "—"}</td>
                </tr>
              ))}
              {!listLoading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-400">No stocks match this search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded border border-stone-300 bg-white disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-slate-500">Page {page + 1} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 rounded border border-stone-300 bg-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}

        <p className="text-xs text-slate-400 mt-4">
          Ticker list from IDX (as of 12 Sep 2026). Live prices via Yahoo Finance (unofficial, delayed), preloaded in the background. Click any row for stats and an informational signal — not financial advice.
        </p>
      </div>

      <StockDetailModal row={selectedRow} companies={allRowsWithQuotes} onClose={() => setSelectedRow(null)} />
    </div>
  );
}
