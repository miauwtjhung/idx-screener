import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth, Show, SignInButton } from "@clerk/react";
import { computeSignal, buildSectorAvgPeMap } from "./signal";
import StockDetailModal from "./StockDetailModal";

const ASSET_TABS = [
  { key: "summary", label: "Summary" },
  { key: "stock", label: "Stocks" },
  { key: "crypto", label: "Crypto" },
  { key: "commodity", label: "Commodities" },
  { key: "bond", label: "Bonds" },
  { key: "cash", label: "Cash & Deposits" },
];

const CRYPTO_OPTIONS = [
  { id: "bitcoin", label: "Bitcoin (BTC)" },
  { id: "ethereum", label: "Ethereum (ETH)" },
  { id: "solana", label: "Solana (SOL)" },
  { id: "binancecoin", label: "BNB" },
  { id: "ripple", label: "XRP" },
  { id: "dogecoin", label: "Dogecoin (DOGE)" },
  { id: "cardano", label: "Cardano (ADA)" },
  { id: "tron", label: "TRON (TRX)" },
  { id: "avalanche-2", label: "Avalanche (AVAX)" },
  { id: "polkadot", label: "Polkadot (DOT)" },
  { id: "chainlink", label: "Chainlink (LINK)" },
  { id: "litecoin", label: "Litecoin (LTC)" },
  { id: "shiba-inu", label: "Shiba Inu (SHIB)" },
  { id: "tether", label: "Tether (USDT)" },
  { id: "usd-coin", label: "USD Coin (USDC)" },
];

const COMMODITY_OPTIONS = [
  { id: "ANTAM", label: "Gold - Antam (per gram)" },
  { id: "XAU", label: "Gold - Spot (XAU)" },
  { id: "XAG", label: "Silver - Spot (XAG)" },
];

const COUPON_FREQUENCIES = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "semi-annual", label: "Semi-annual" },
  { key: "annual", label: "Annual" },
];

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
  return (
    <>
      <Show when="signed-out">
        <div className="min-h-screen bg-stone-100 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Sign in to view your portfolio</h1>
            <p className="text-sm text-slate-500 mb-4">Your holdings are saved to your account and sync across devices.</p>
            <SignInButton mode="modal">
              <button className="bg-slate-900 text-white px-4 py-2 rounded text-sm font-medium">Sign in</button>
            </SignInButton>
          </div>
        </div>
      </Show>
      <Show when="signed-in">
        <PortfolioContent companies={companies} />
      </Show>
    </>
  );
}

function PortfolioContent({ companies }) {
  const { getToken } = useAuth();

  const [portfolios, setPortfolios] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [quotes, setQuotes] = useState({});
  const [cryptoQuotes, setCryptoQuotes] = useState({});
  const [commodityQuotes, setCommodityQuotes] = useState({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [sectorAvgMap, setSectorAvgMap] = useState({});
  const [peerQuotes, setPeerQuotes] = useState({});
  const [selectedRow, setSelectedRow] = useState(null);
  const [showPortfolioMenu, setShowPortfolioMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [dailySummary, setDailySummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [activeTab, setActiveTab] = useState("summary");

  const [form, setForm] = useState({
    ticker: "",
    type: "buy",
    price: "",
    qty: "",
    date: new Date().toISOString().slice(0, 10),
    currency: "IDR",
    faceValue: "",
    couponRate: "",
    couponFrequency: "annual",
    issueDate: new Date().toISOString().slice(0, 10),
    maturityDate: "",
  });
  const [formError, setFormError] = useState("");

  const authedFetch = useCallback(
    async (url, options = {}) => {
      const token = await getToken();
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    },
    [getToken]
  );

  const loadPortfolios = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await authedFetch("/api/portfolios");
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      let list = data.portfolios || [];
      if (list.length === 0) {
        const createRes = await authedFetch("/api/portfolios", {
          method: "POST",
          body: JSON.stringify({ name: "My Portfolio" }),
        });
        const createData = await createRes.json();
        if (createData.error) throw new Error(createData.error);
        list = [createData.portfolio];
      }
      setPortfolios(list);
      setActiveId((prev) => prev ?? list[0].id);
    } catch (e) {
      setLoadError("Couldn't load your portfolios. " + e.message);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    loadPortfolios();
  }, [loadPortfolios]);

  const activePortfolio = portfolios.find((p) => p.id === activeId) || portfolios[0];
  const allTransactions = activePortfolio ? activePortfolio.transactions : [];

  const stockTransactions = useMemo(
    () => allTransactions.filter((t) => !t.assetType || t.assetType === "stock"),
    [allTransactions]
  );
  const cryptoTransactions = useMemo(() => allTransactions.filter((t) => t.assetType === "crypto"), [allTransactions]);
  const commodityTransactions = useMemo(() => allTransactions.filter((t) => t.assetType === "commodity"), [allTransactions]);
  const bondTransactions = useMemo(() => allTransactions.filter((t) => t.assetType === "bond"), [allTransactions]);
  const cashTransactions = useMemo(() => allTransactions.filter((t) => t.assetType === "cash" || t.assetType === "deposit"), [allTransactions]);

  const holdings = useMemo(() => computeHoldings(stockTransactions), [stockTransactions]);
  const cryptoHoldings = useMemo(() => computeHoldings(cryptoTransactions), [cryptoTransactions]);
  const commodityHoldings = useMemo(() => computeHoldings(commodityTransactions), [commodityTransactions]);
  const cashHoldings = useMemo(() => computeHoldings(cashTransactions), [cashTransactions]);
  const bondHoldings = useMemo(() => bondTransactions.filter((t) => t.type === "buy"), [bondTransactions]);

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
  }, [stockTransactions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cryptoHoldings.length === 0) return;
    const ids = cryptoHoldings.map((h) => h.ticker.toLowerCase()).join(",");
    fetch(`/api/crypto-quotes?ids=${encodeURIComponent(ids)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const byTicker = {};
        (data.quotes || []).forEach((q) => { byTicker[q.ticker] = q; });
        setCryptoQuotes(byTicker);
      })
      .catch(() => {});
  }, [cryptoTransactions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (commodityHoldings.length === 0) return;
    const symbols = commodityHoldings.map((h) => h.ticker).join(",");
    fetch(`/api/commodity-quotes?symbols=${encodeURIComponent(symbols)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const byTicker = {};
        (data.quotes || []).forEach((q) => { byTicker[q.ticker] = q; });
        setCommodityQuotes(byTicker);
      })
      .catch(() => {});
  }, [commodityTransactions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (holdings.length === 0 || companies.length === 0) return;
    const heldSectors = new Set(
      holdings.map((h) => companies.find((c) => c.code === h.ticker)?.sector).filter(Boolean)
    );
    if (heldSectors.size === 0) return;

    const peers = companies.filter((c) => heldSectors.has(c.sector));
    const CHUNK = 75;

    async function loadPeerPe() {
      const peerRows = [];
      const peerQuoteMap = {};
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
            peerQuoteMap[q.ticker] = q;
          });
        } catch {
          // partial data is fine for an average
        }
      }
      setSectorAvgMap(buildSectorAvgPeMap(peerRows));
      setPeerQuotes(peerQuoteMap);
    }
    loadPeerPe();
  }, [holdings.length, companies]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activePortfolio) return;
    setLoadingSummary(true);
    authedFetch(`/api/portfolio-summary?portfolioId=${activePortfolio.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDailySummary(data.snapshot || null);
      })
      .catch(() => setDailySummary(null))
      .finally(() => setLoadingSummary(false));
  }, [activePortfolio?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchPortfolio(id) {
    setActiveId(id);
    setShowPortfolioMenu(false);
  }

  async function createPortfolio() {
    const name = prompt("Name for the new portfolio:", "New Portfolio");
    if (!name || !name.trim()) return;
    try {
      const res = await authedFetch("/api/portfolios", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPortfolios((prev) => [...prev, data.portfolio]);
      setActiveId(data.portfolio.id);
    } catch (e) {
      alert("Couldn't create portfolio: " + e.message);
    }
    setShowPortfolioMenu(false);
  }

  async function deletePortfolio(id) {
    if (portfolios.length <= 1) return alert("You need at least one portfolio.");
    const portfolio = portfolios.find((p) => p.id === id);
    if (!confirm(`Delete "${portfolio.name}"? This removes all its transactions and can't be undone.`)) return;

    try {
      const res = await authedFetch(`/api/portfolios?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const remaining = portfolios.filter((p) => p.id !== id);
      setPortfolios(remaining);
      if (activeId === id) setActiveId(remaining[0].id);
    } catch (e) {
      alert("Couldn't delete portfolio: " + e.message);
    }
  }

  function startRename() {
    setNameInput(activePortfolio.name);
    setEditingName(true);
    setShowPortfolioMenu(false);
  }

  async function saveRename() {
    if (!nameInput.trim()) return setEditingName(false);
    try {
      const res = await authedFetch(`/api/portfolios?id=${activePortfolio.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPortfolios((prev) => prev.map((p) => (p.id === activePortfolio.id ? { ...p, name: data.portfolio.name } : p)));
    } catch (e) {
      alert("Couldn't rename portfolio: " + e.message);
    }
    setEditingName(false);
  }

  function resetFormForTab(tab) {
    setForm({
      ticker: "",
      type: "buy",
      price: "",
      qty: "",
      date: new Date().toISOString().slice(0, 10),
      currency: "IDR",
      faceValue: "",
      couponRate: "",
      couponFrequency: "annual",
      issueDate: new Date().toISOString().slice(0, 10),
      maturityDate: "",
    });
    setFormError("");
    setActiveTab(tab);
  }

  async function addTransaction(e) {
    e.preventDefault();
    setFormError("");

    const ticker = form.ticker.trim().toUpperCase();
    const price = parseFloat(form.price);
    const qty = activeTab === "stock" ? parseInt(form.qty, 10) : parseFloat(form.qty);

    if (!ticker) return setFormError(activeTab === "cash" ? "Enter a label (e.g. BCA Savings)." : "Select or enter a ticker.");

    if (activeTab === "stock") {
      if (companies.length > 0 && !companies.some((c) => c.code === ticker)) {
        return setFormError(`"${ticker}" isn't a recognized IDX ticker.`);
      }
      if (!price || price <= 0) return setFormError("Enter a valid price.");
      if (!qty || qty <= 0) return setFormError("Enter a valid quantity.");
      if (form.type === "sell") {
        const current = computeHoldings(stockTransactions).find((h) => h.ticker === ticker);
        const heldQty = current ? current.qty : 0;
        if (qty > heldQty) return setFormError(`You only hold ${heldQty} shares of ${ticker} in this portfolio.`);
      }
    } else if (activeTab === "bond") {
      const faceValue = parseFloat(form.faceValue);
      const couponRate = parseFloat(form.couponRate);
      if (!faceValue || faceValue <= 0) return setFormError("Enter a valid face value.");
      if (!couponRate || couponRate < 0) return setFormError("Enter a valid coupon rate.");
      if (!form.issueDate) return setFormError("Enter an issue date.");
      if (!form.maturityDate) return setFormError("Enter a maturity date.");
      if (!price || price <= 0) return setFormError("Enter a valid purchase price.");
    } else if (activeTab === "crypto" || activeTab === "commodity" || activeTab === "cash") {
      if (!price || price <= 0) return setFormError("Enter a valid price/amount.");
      if (!qty || qty <= 0) return setFormError("Enter a valid quantity.");
    } else {
      return;
    }

    const payload = {
      portfolioId: activePortfolio.id,
      ticker,
      type: form.type,
      date: form.date,
      assetType: activeTab,
      currency: form.currency || "IDR",
    };

    if (activeTab === "bond") {
      payload.price = parseFloat(form.price);
      payload.qty = 1;
      payload.faceValue = parseFloat(form.faceValue);
      payload.couponRate = parseFloat(form.couponRate);
      payload.couponFrequency = form.couponFrequency;
      payload.issueDate = form.issueDate;
      payload.maturityDate = form.maturityDate;
    } else {
      payload.price = price;
      payload.qty = qty;
    }

    try {
      const res = await authedFetch("/api/transactions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setPortfolios((prev) =>
        prev.map((p) => (p.id === activePortfolio.id ? { ...p, transactions: [...p.transactions, data.transaction] } : p))
      );
      resetFormForTab(activeTab);
    } catch (e) {
      setFormError("Couldn't save transaction: " + e.message);
    }
  }

  async function removeTransaction(id) {
    try {
      const res = await authedFetch(`/api/transactions?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPortfolios((prev) =>
        prev.map((p) => (p.id === activePortfolio.id ? { ...p, transactions: p.transactions.filter((t) => t.id !== id) } : p))
      );
    } catch (e) {
      alert("Couldn't remove transaction: " + e.message);
    }
  }

  const rows = holdings.map((h) => {
    const q = quotes[h.ticker] || {};
    const company = companies.find((c) => c.code === h.ticker);
    const sector = company?.sector || null;
    const currentPrice = q.price ?? null;
    const marketValue = currentPrice != null ? currentPrice * h.qty : null;
    const pnl = marketValue != null ? marketValue - h.invested : null;
    const pnlPct = h.invested > 0 && pnl != null ? (pnl / h.invested) * 100 : null;
    return {
      ...h,
      ...q,
      code: h.ticker,
      name: company?.name || h.ticker,
      sector,
      board: company?.board || null,
      price: currentPrice,
      currentPrice,
      chg: q.chg ?? null,
      pe: q.pe ?? null,
      div: q.div ?? null,
      low52: q.low52 ?? null,
      high52: q.high52 ?? null,
      marketValue,
      pnl,
      pnlPct,
    };
  });

  const companiesWithQuotes = useMemo(
    () => companies.map((c) => ({ ...c, ...(quotes[c.code] || peerQuotes[c.code] || {}) })),
    [companies, quotes, peerQuotes]
  );

  const stockTotals = rows.reduce(
    (acc, r) => ({ invested: acc.invested + r.invested, marketValue: acc.marketValue + (r.marketValue ?? r.invested) }),
    { invested: 0, marketValue: 0 }
  );
  const stockPnl = stockTotals.marketValue - stockTotals.invested;
  const stockPnlPct = stockTotals.invested > 0 ? (stockPnl / stockTotals.invested) * 100 : 0;

  const cryptoRows = cryptoHoldings.map((h) => {
    const q = cryptoQuotes[h.ticker] || {};
    const currentPrice = q.price ?? null;
    const marketValue = currentPrice != null ? currentPrice * h.qty : null;
    return { ...h, marketValue };
  });
  const cryptoTotals = cryptoRows.reduce(
    (acc, r) => ({ invested: acc.invested + r.invested, marketValue: acc.marketValue + (r.marketValue ?? r.invested) }),
    { invested: 0, marketValue: 0 }
  );
  const cryptoPnl = cryptoTotals.marketValue - cryptoTotals.invested;
  const cryptoPnlPct = cryptoTotals.invested > 0 ? (cryptoPnl / cryptoTotals.invested) * 100 : 0;

  const commodityRows = commodityHoldings.map((h) => {
    const q = commodityQuotes[h.ticker] || {};
    const currentPrice = q.price ?? null;
    const marketValue = currentPrice != null ? currentPrice * h.qty : null;
    return { ...h, marketValue };
  });
  const commodityTotals = commodityRows.reduce(
    (acc, r) => ({ invested: acc.invested + r.invested, marketValue: acc.marketValue + (r.marketValue ?? r.invested) }),
    { invested: 0, marketValue: 0 }
  );
  const commodityPnl = commodityTotals.marketValue - commodityTotals.invested;
  const commodityPnlPct = commodityTotals.invested > 0 ? (commodityPnl / commodityTotals.invested) * 100 : 0;

  const bondValue = bondHoldings.reduce((s, b) => s + (b.faceValue || 0), 0);
  const cashValue = cashHoldings.reduce((s, h) => s + h.invested, 0);
  const netWorth = stockTotals.marketValue + cryptoTotals.marketValue + commodityTotals.marketValue + bondValue + cashValue;
  const totalPnl = stockPnl + cryptoPnl + commodityPnl;

  const historyTransactions =
    activeTab === "summary"
      ? allTransactions
      : activeTab === "stock"
      ? stockTransactions
      : activeTab === "crypto"
      ? cryptoTransactions
      : activeTab === "commodity"
      ? commodityTransactions
      : activeTab === "bond"
      ? bondTransactions
      : cashTransactions;

  if (loading) {
    return <div className="min-h-screen bg-stone-100 flex items-center justify-center text-slate-400 text-sm">Loading your portfolios…</div>;
  }
  if (loadError) {
    return <div className="min-h-screen bg-stone-100 flex items-center justify-center text-rose-700 text-sm">{loadError}</div>;
  }
  if (!activePortfolio) return null;

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900 font-sans">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <header className="mb-6 border-b border-stone-300 pb-4">
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
              <button onClick={() => setShowPortfolioMenu((v) => !v)} className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
                {activePortfolio.name}
                <span className="text-base text-slate-400">▾</span>
              </button>
            )}

            {showPortfolioMenu && (
              <div className="absolute left-0 top-full mt-2 bg-white border border-stone-300 rounded shadow-lg w-64 z-10 py-1">
                {portfolios.map((p) => (
                  <div key={p.id} className={`flex items-center justify-between px-3 py-2 text-sm hover:bg-stone-50 ${p.id === activePortfolio.id ? "font-medium" : ""}`}>
                    <button onClick={() => switchPortfolio(p.id)} className="flex-1 text-left">{p.name}</button>
                    {portfolios.length > 1 && (
                      <button onClick={() => deletePortfolio(p.id)} className="text-xs text-slate-300 hover:text-rose-600 ml-2">Delete</button>
                    )}
                  </div>
                ))}
                <div className="border-t border-stone-200 mt-1 pt-1">
                  <button onClick={startRename} className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-stone-50">Rename current portfolio</button>
                  <button onClick={createPortfolio} className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-stone-50">+ New portfolio</button>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="flex gap-1 mb-6 border-b border-stone-300 overflow-x-auto">
          {ASSET_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => resetFormForTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                activeTab === t.key
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "summary" && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <SummaryCard label="Net worth" value={`Rp ${Math.round(netWorth).toLocaleString("id-ID")}`} />
              <SummaryCard label="Total P&L" value={`${totalPnl >= 0 ? "+" : ""}Rp ${Math.round(totalPnl).toLocaleString("id-ID")}`} accent={totalPnl >= 0 ? "up" : "down"} />
              <SummaryCard label="Portfolio" value={activePortfolio.name} />
            </div>

            <div className="bg-white border border-stone-300 rounded overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-slate-500">
                    <th className="px-3 py-2 text-left font-medium">Asset class</th>
                    <th className="px-3 py-2 text-right font-medium">Value (Rp)</th>
                    <th className="px-3 py-2 text-right font-medium">% of net worth</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Stocks", value: stockTotals.marketValue },
                    { label: "Crypto", value: cryptoTotals.marketValue },
                    { label: "Commodities", value: commodityTotals.marketValue },
                    { label: "Bonds (face value)", value: bondValue },
                    { label: "Cash & Deposits", value: cashValue },
                  ].map((row) => (
                    <tr key={row.label} className="border-b border-stone-100 last:border-0">
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Math.round(row.value).toLocaleString("id-ID")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{netWorth > 0 ? ((row.value / netWorth) * 100).toFixed(1) : "0.0"}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-6">
              <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">Daily summary</h2>
              <div className="bg-white border border-stone-300 rounded p-4">
                {loadingSummary ? (
                  <p className="text-sm text-slate-400">Loading…</p>
                ) : dailySummary && dailySummary.summaryText ? (
                  <>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{dailySummary.summaryText}</p>
                    <p className="text-xs text-slate-400 mt-3">As of {dailySummary.snapshotDate}, generated automatically at market close.</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">No daily summary yet — this generates automatically once a day shortly after market close (17:00 WIB).</p>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-6">
              Bonds are shown at face value, held to maturity.
            </p>
          </>
        )}

        {activeTab === "stock" && (
          <>
            <p className="text-sm text-slate-500 mb-4">
              {holdings.length === 0 ? "No stock holdings yet — log a buy below to get started." : `${holdings.length} stock holding${holdings.length === 1 ? "" : "s"}`}
            </p>
            {holdings.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <SummaryCard label="Invested" value={`Rp ${Math.round(stockTotals.invested).toLocaleString("id-ID")}`} />
                <SummaryCard label="Market value" value={`Rp ${Math.round(stockTotals.marketValue).toLocaleString("id-ID")}`} />
                <SummaryCard label="P&L" value={`${stockPnl >= 0 ? "+" : ""}Rp ${Math.round(stockPnl).toLocaleString("id-ID")} (${stockPnlPct >= 0 ? "+" : ""}${stockPnlPct.toFixed(2)}%)`} accent={stockPnl >= 0 ? "up" : "down"} />
              </div>
            )}
          </>
        )}

        {activeTab === "crypto" && cryptoHoldings.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <SummaryCard label="Invested" value={`Rp ${Math.round(cryptoTotals.invested).toLocaleString("id-ID")}`} />
            <SummaryCard label="Market value" value={`Rp ${Math.round(cryptoTotals.marketValue).toLocaleString("id-ID")}`} />
            <SummaryCard label="P&L" value={`${cryptoPnl >= 0 ? "+" : ""}Rp ${Math.round(cryptoPnl).toLocaleString("id-ID")} (${cryptoPnlPct >= 0 ? "+" : ""}${cryptoPnlPct.toFixed(2)}%)`} accent={cryptoPnl >= 0 ? "up" : "down"} />
          </div>
        )}

        {activeTab === "commodity" && commodityHoldings.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <SummaryCard label="Invested" value={`Rp ${Math.round(commodityTotals.invested).toLocaleString("id-ID")}`} />
            <SummaryCard label="Market value" value={`Rp ${Math.round(commodityTotals.marketValue).toLocaleString("id-ID")}`} />
            <SummaryCard label="P&L" value={`${commodityPnl >= 0 ? "+" : ""}Rp ${Math.round(commodityPnl).toLocaleString("id-ID")} (${commodityPnlPct >= 0 ? "+" : ""}${commodityPnlPct.toFixed(2)}%)`} accent={commodityPnl >= 0 ? "up" : "down"} />
          </div>
        )}

        {activeTab !== "summary" && (
          <form onSubmit={addTransaction} className="bg-white border border-stone-300 rounded p-4 mb-6">
            <h2 className="text-sm font-medium text-slate-700 mb-3">Log a {ASSET_TABS.find((t) => t.key === activeTab)?.label.replace(/s$/, "")} transaction</h2>

            {activeTab === "bond" ? (
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Bond name</label>
                  <input type="text" value={form.ticker} onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))} placeholder="ORI025" className="w-32 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Purchase price</label>
                  <input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="1000000" className="w-32 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Face value</label>
                  <input type="number" value={form.faceValue} onChange={(e) => setForm((f) => ({ ...f, faceValue: e.target.value }))} placeholder="1000000" className="w-32 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Coupon rate (%)</label>
                  <input type="number" step="0.01" value={form.couponRate} onChange={(e) => setForm((f) => ({ ...f, couponRate: e.target.value }))} placeholder="6.5" className="w-24 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Coupon frequency</label>
                  <select value={form.couponFrequency} onChange={(e) => setForm((f) => ({ ...f, couponFrequency: e.target.value }))} className="bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500">
                    {COUPON_FREQUENCIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Issue date</label>
                  <input type="date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} className="bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Maturity date</label>
                  <input type="date" value={form.maturityDate} onChange={(e) => setForm((f) => ({ ...f, maturityDate: e.target.value }))} className="bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500" />
                </div>
                <button type="submit" className="bg-slate-900 text-white px-4 py-1.5 rounded text-sm font-medium">Add</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{activeTab === "cash" ? "Label" : "Ticker"}</label>
                  {activeTab === "crypto" ? (
                    <select
                      value={form.ticker.toLowerCase()}
                      onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
                      className="w-40 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500"
                    >
                      <option value="">Select coin…</option>
                      {CRYPTO_OPTIONS.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  ) : activeTab === "commodity" ? (
                    <select
                      value={form.ticker}
                      onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
                      className="w-40 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500"
                    >
                      <option value="">Select metal…</option>
                      {COMMODITY_OPTIONS.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={form.ticker}
                      onChange={(e) => setForm((f) => ({ ...f, ticker: activeTab === "cash" ? e.target.value : e.target.value.toUpperCase() }))}
                      placeholder={activeTab === "stock" ? "BBCA" : "BCA Savings"}
                      className="w-32 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Type</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500">
                    <option value="buy">{activeTab === "cash" ? "Deposit" : "Buy"}</option>
                    <option value="sell">{activeTab === "cash" ? "Withdraw" : "Sell"}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{activeTab === "cash" ? "Amount per unit (Rp)" : activeTab === "commodity" ? "Price per gram (Rp)" : "Price (Rp)"}</label>
                  <input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder={activeTab === "cash" ? "1" : "6350"} className="w-28 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{activeTab === "cash" ? "Amount (Rp)" : activeTab === "commodity" ? "Grams" : "Volume"}</label>
                  <input type="number" step="any" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} placeholder={activeTab === "crypto" ? "0.01685" : "100"} className="w-24 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Date</label>
                  <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500" />
                </div>
                <button type="submit" className="bg-slate-900 text-white px-4 py-1.5 rounded text-sm font-medium">Add</button>
              </div>
            )}
            {formError && <p className="text-sm text-rose-700 mt-2">{formError}</p>}
          </form>
        )}

        {activeTab === "stock" && rows.length > 0 && (
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
                  <tr
                    key={r.ticker}
                    onClick={() => setSelectedRow(r)}
                    className="border-b border-stone-100 last:border-0 hover:bg-stone-50 cursor-pointer"
                  >
                    <td className="px-3 py-2 font-medium">{r.ticker}</td>
                    <td className="px-3 py-2"><SignalBadge row={r} sectorAvgPe={sectorAvgMap[r.sector]} /></td>
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
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.pnl > 0 ? "text-emerald-700" : r.pnl < 0 ? "text-rose-700" : "text-slate-500"}`}>{r.pnl != null ? `${r.pnl > 0 ? "+" : ""}${Math.round(r.pnl).toLocaleString("id-ID")}` : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.pnlPct > 0 ? "text-emerald-700" : r.pnlPct < 0 ? "text-rose-700" : "text-slate-500"}`}>{r.pnlPct != null ? `${r.pnlPct > 0 ? "+" : ""}${r.pnlPct.toFixed(2)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "crypto" && <LivePriceHoldingsTable title="Crypto holdings" holdings={cryptoHoldings} quotes={cryptoQuotes} />}
        {activeTab === "commodity" && <LivePriceHoldingsTable title="Commodity holdings" holdings={commodityHoldings} quotes={commodityQuotes} />}
        {activeTab === "bond" && <BondHoldingsTable bonds={bondHoldings} />}
        {activeTab === "cash" && <SimpleHoldingsTable title="Cash & Deposits" holdings={cashHoldings} />}

        {activeTab !== "summary" && historyTransactions.length > 0 && (
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
                  {[...historyTransactions].reverse().map((t) => (
                    <tr key={t.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-3 py-2 text-slate-500">{t.date}</td>
                      <td className="px-3 py-2 font-medium">{t.ticker}</td>
                      <td className={`px-3 py-2 ${t.type === "buy" ? "text-emerald-700" : "text-rose-700"}`}>{t.type === "buy" ? "Buy" : "Sell"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(t.price).toLocaleString("id-ID")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(t.qty).toLocaleString("id-ID", { maximumFractionDigits: 8 })}</td>
                      <td className="px-3 py-2 text-right"><button onClick={() => removeTransaction(t.id)} className="text-xs text-slate-400 hover:text-rose-600">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400 mt-6">
          Saved to your account — syncs across any device you sign in on. The Signal column is an automated heuristic based on valuation, dividend, momentum, and 52-week range — not financial advice.
        </p>
      </div>
      <StockDetailModal row={selectedRow} companies={companiesWithQuotes} onClose={() => setSelectedRow(null)} />
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

function LivePriceHoldingsTable({ title, holdings, quotes }) {
  if (holdings.length === 0) return <p className="text-sm text-slate-500 mb-4">No holdings yet — log a transaction below to get started.</p>;
  return (
    <div className="mb-6">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">{title}</h2>
      <div className="bg-white border border-stone-300 rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-slate-500">
              <th className="px-3 py-2 text-left font-medium">Symbol</th>
              <th className="px-3 py-2 text-right font-medium">Current Price</th>
              <th className="px-3 py-2 text-right font-medium">Avg Price</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Market Value</th>
              <th className="px-3 py-2 text-right font-medium">Invested</th>
              <th className="px-3 py-2 text-right font-medium">P&L</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const q = quotes[h.ticker] || {};
              const currentPrice = q.price ?? null;
              const marketValue = currentPrice != null ? currentPrice * h.qty : null;
              const pnl = marketValue != null ? marketValue - h.invested : null;
              return (
                <tr key={h.ticker} className="border-b border-stone-100 last:border-0">
                  <td className="px-3 py-2 font-medium">{h.ticker}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {currentPrice != null ? (
                      <>
                        {currentPrice.toLocaleString("id-ID")}{" "}
                        {q.chg != null && (
                          <span className={q.chg > 0 ? "text-emerald-700" : q.chg < 0 ? "text-rose-700" : "text-slate-400"}>
                            ({q.chg > 0 ? "+" : ""}{q.chg.toFixed(2)}%)
                          </span>
                        )}
                      </>
                    ) : "…"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{h.avgPrice.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{h.qty.toLocaleString("id-ID", { maximumFractionDigits: 8 })}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{marketValue != null ? Math.round(marketValue).toLocaleString("id-ID") : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">Rp {Math.round(h.invested).toLocaleString("id-ID")}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${pnl > 0 ? "text-emerald-700" : pnl < 0 ? "text-rose-700" : "text-slate-500"}`}>{pnl != null ? `${pnl > 0 ? "+" : ""}${Math.round(pnl).toLocaleString("id-ID")}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SimpleHoldingsTable({ title, holdings }) {
  if (holdings.length === 0) return <p className="text-sm text-slate-500 mb-4">No holdings yet — log a transaction below to get started.</p>;
  return (
    <div className="mb-6">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">{title}</h2>
      <div className="bg-white border border-stone-300 rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-slate-500">
              <th className="px-3 py-2 text-left font-medium">Symbol</th>
              <th className="px-3 py-2 text-right font-medium">Avg Price</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Invested</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.ticker} className="border-b border-stone-100 last:border-0">
                <td className="px-3 py-2 font-medium">{h.ticker}</td>
                <td className="px-3 py-2 text-right tabular-nums">{h.avgPrice.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right tabular-nums">{h.qty.toLocaleString("id-ID", { maximumFractionDigits: 8 })}</td>
                <td className="px-3 py-2 text-right tabular-nums">Rp {Math.round(h.invested).toLocaleString("id-ID")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BondHoldingsTable({ bonds }) {
  if (bonds.length === 0) return <p className="text-sm text-slate-500 mb-4">No bond holdings yet — log a transaction below to get started.</p>;
  return (
    <div className="mb-6">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">Bond holdings</h2>
      <div className="bg-white border border-stone-300 rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-slate-500">
              <th className="px-3 py-2 text-left font-medium">Bond</th>
              <th className="px-3 py-2 text-right font-medium">Face Value</th>
              <th className="px-3 py-2 text-right font-medium">Coupon</th>
              <th className="px-3 py-2 text-left font-medium">Frequency</th>
              <th className="px-3 py-2 text-left font-medium">Maturity</th>
            </tr>
          </thead>
          <tbody>
            {bonds.map((b) => (
              <tr key={b.id} className="border-b border-stone-100 last:border-0">
                <td className="px-3 py-2 font-medium">{b.ticker}</td>
                <td className="px-3 py-2 text-right tabular-nums">Rp {Math.round(b.faceValue || 0).toLocaleString("id-ID")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.couponRate}%</td>
                <td className="px-3 py-2 capitalize">{b.couponFrequency}</td>
                <td className="px-3 py-2">{b.maturityDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SIGNAL_STYLES = {
  Buy: "bg-emerald-100 text-emerald-800",
  Hold: "bg-amber-100 text-amber-800",
  Sell: "bg-rose-100 text-rose-800",
};

function SignalBadge({ row, sectorAvgPe }) {
  if (row.price == null) return <span className="text-xs text-slate-300">—</span>;
  const { label } = computeSignal(row, sectorAvgPe);
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SIGNAL_STYLES[label]}`}>{label}</span>;
}