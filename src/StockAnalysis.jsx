import React, { useEffect, useMemo, useState } from "react";
import { useAuth, SignInButton } from "@clerk/react";
import TradingViewChart from "./TradingViewChart";

// AI Analysis tab: search one IDX stock and see its fundamentals, dividend
// record, corporate actions, technical picture, analyst view and news, plus an
// AI short-term and long-term view written from those figures.

const QUICK_PICKS = ["BBCA", "BBRI", "BMRI", "TLKM", "ASII", "ADRO"];

const VIEW_STYLES = {
  Buy: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Hold: "bg-amber-100 text-amber-800 border-amber-300",
  Sell: "bg-rose-100 text-rose-800 border-rose-300",
  Neutral: "bg-slate-100 text-slate-700 border-slate-300",
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// --- formatting -------------------------------------------------------------
function fmtMoney(v, currency = "IDR") {
  if (!isNum(v)) return "—";
  const prefix = currency === "IDR" ? "Rp" : currency === "USD" ? "US$" : currency;
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e12) return `${sign}${prefix} ${(a / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `${sign}${prefix} ${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}${prefix} ${(a / 1e6).toFixed(1)}M`;
  return `${sign}${prefix} ${a.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
}
const fmtPrice = (v) => (isNum(v) ? `Rp ${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })}` : "—");
const fmtNum = (v, d = 1) => (isNum(v) ? v.toFixed(d) : "—");
const fmtFrac = (v, d = 1) => (isNum(v) ? `${(v * 100).toFixed(d)}%` : "—"); // Yahoo ratios like 0.213
const fmtPctPoint = (v, d = 1) => (isNum(v) ? `${v.toFixed(d)}%` : "—"); // values already in %
const fmtSigned = (v, d = 1) => {
  if (!isNum(v)) return "—";
  const t = v.toFixed(d);
  return Number(t) === 0 ? `${(0).toFixed(d)}%` : `${v > 0 ? "+" : ""}${t}%`;
};
const fmtDate = (d) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const tone = (v) => (!isNum(v) || Math.abs(v) < 0.05 ? "text-slate-600" : v > 0 ? "text-emerald-700" : "text-rose-700");

// --- small building blocks ---------------------------------------------------
function Card({ title, children, note, className = "" }) {
  return (
    <section className={`bg-white border border-stone-300 rounded p-4 min-w-0 ${className}`}>
      {title && <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-3">{title}</h2>}
      {children}
      {note && <p className="text-xs text-slate-400 mt-3 leading-relaxed">{note}</p>}
    </section>
  );
}

function Stat({ label, value, hint, valueClass = "text-slate-900" }) {
  return (
    <div>
      <div className="text-xs text-slate-400" title={hint}>{label}</div>
      <div className={`text-sm font-medium tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

function StatGrid({ children }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>;
}

// --- AI view -----------------------------------------------------------------
function AiSide({ title, horizon, side }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-400">{horizon}</div>
        </div>
        <div className="text-right shrink-0">
          <span className={`inline-block border rounded px-3 py-1 text-base font-semibold ${VIEW_STYLES[side.view]}`}>{side.view}</span>
          <div className="text-xs text-slate-400 mt-1">{side.confidence} confidence</div>
        </div>
      </div>
      <ul className="space-y-1.5">
        {side.reasons.map((r, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-700">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiView({ code, dataReady }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [state, setState] = useState({ code: null, view: null, error: "", loading: false });

  useEffect(() => {
    if (!dataReady || !isLoaded || !isSignedIn) return;
    let cancelled = false;
    async function load() {
      setState({ code, view: null, error: "", loading: true });
      try {
        const token = await getToken();
        const r = await fetch(`/api/idx-quotes?view=ai&symbol=${encodeURIComponent(code)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || `status ${r.status}`);
        if (!cancelled) setState({ code, view: d.view, error: "", loading: false });
      } catch (e) {
        if (!cancelled) setState({ code, view: null, error: String(e.message || e), loading: false });
      }
    }
    load();
    return () => { cancelled = true; };
  }, [code, dataReady, isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  let body;
  if (!isLoaded) {
    body = <p className="text-sm text-slate-400">Checking sign-in…</p>;
  } else if (!isSignedIn) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Sign in to see the AI short-term and long-term view for {code}.</p>
        <SignInButton mode="modal">
          <button className="bg-slate-900 text-white px-3 py-1.5 rounded text-sm font-medium">Sign in</button>
        </SignInButton>
      </div>
    );
  } else if (state.loading || state.code !== code || (!state.view && !state.error)) {
    body = <p className="text-sm text-slate-400">Writing the AI view from the figures below…</p>;
  } else if (state.error) {
    body = <p className="text-sm text-rose-700">Couldn't get the AI view: {state.error}</p>;
  } else {
    const v = state.view;
    body = (
      <>
        <div className="flex flex-col md:flex-row gap-6">
          <AiSide title="Short term" horizon="Next 1 to 3 months" side={v.shortTerm} />
          <div className="hidden md:block w-px bg-stone-200" />
          <AiSide title="Long term" horizon="Next 1 to 3 years" side={v.longTerm} />
        </div>
        {(v.newsSummary || v.risks.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4 mt-5 pt-4 border-t border-stone-200">
            {v.newsSummary && (
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">What the news is about</div>
                <p className="text-sm text-slate-700">{v.newsSummary}</p>
              </div>
            )}
            {v.risks.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">Key risks</div>
                <ul className="text-sm text-slate-700 list-disc pl-4 space-y-0.5">
                  {v.risks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-4">
          Written by AI on {new Date(v.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} from the figures and headlines on this page.
        </p>
      </>
    );
  }

  return (
    <Card title="AI view">
      {body}
      <p className="text-xs text-slate-400 mt-3 leading-relaxed">
        Buy: evidence clearly favours adding. Hold: worth keeping if you own it, no strong case to add. Sell: evidence favours reducing. Neutral: mixed or too little data.
        This is an automated opinion from public data, can be wrong, and is not financial advice.
      </p>
    </Card>
  );
}

// --- sections ------------------------------------------------------------------
function Fundamentals({ f }) {
  const cur = f.financialCurrency || "IDR";
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card title="Valuation">
        <StatGrid>
          <Stat label="P/E (trailing)" value={fmtNum(f.pe)} />
          <Stat label="P/E (forward)" value={fmtNum(f.forwardPe)} />
          <Stat label="Price to book" value={fmtNum(f.pbv, 2)} hint={f.usdIdr ? "Book value converted from US dollars" : undefined} />
          <Stat label="EV / EBITDA" value={fmtNum(f.evToEbitda)} />
          <Stat label="EPS (12 months)" value={isNum(f.eps) ? `Rp ${f.eps.toLocaleString("id-ID", { maximumFractionDigits: 2 })}` : "—"} />
          <Stat label="Book value / share" value={isNum(f.bvpsIdr) ? `Rp ${f.bvpsIdr.toLocaleString("id-ID", { maximumFractionDigits: 0 })}` : "—"} />
        </StatGrid>
      </Card>
      <Card title="Profitability and growth">
        <StatGrid>
          <Stat label="Return on equity" value={fmtFrac(f.roe)} />
          <Stat label="Return on assets" value={fmtFrac(f.roa)} />
          <Stat label="Net margin" value={fmtFrac(f.profitMargin)} />
          <Stat label="Operating margin" value={fmtFrac(f.operatingMargin)} />
          <Stat label="Revenue growth" value={isNum(f.revenueGrowth) ? fmtSigned(f.revenueGrowth * 100) : "—"} valueClass={tone(f.revenueGrowth)} hint="Latest quarter vs a year earlier" />
          <Stat label="Earnings growth" value={isNum(f.earningsGrowth) ? fmtSigned(f.earningsGrowth * 100) : "—"} valueClass={tone(f.earningsGrowth)} hint="Latest quarter vs a year earlier" />
        </StatGrid>
      </Card>
      <Card title="Balance sheet and cash" note={cur !== "IDR" ? `Reported in ${cur}.` : undefined}>
        <StatGrid>
          <Stat label="Debt to equity" value={isNum(f.debtToEquity) ? `${f.debtToEquity.toFixed(0)}%` : "—"} />
          <Stat label="Current ratio" value={fmtNum(f.currentRatio, 2)} />
          <Stat label="Total cash" value={fmtMoney(f.totalCash, cur)} />
          <Stat label="Total debt" value={fmtMoney(f.totalDebt, cur)} />
          <Stat label="Operating cash flow" value={fmtMoney(f.operatingCashflow, cur)} />
          <Stat label="Free cash flow" value={fmtMoney(f.freeCashflow, cur)} valueClass={tone(f.freeCashflow)} />
        </StatGrid>
      </Card>
    </div>
  );
}

function AnnualResults({ annual, fallbackCurrency }) {
  if (!annual.length) return null;
  const years = [...annual].reverse(); // oldest first, left to right
  const rows = [
    ["Revenue", "revenue", true],
    ["Net income", "netIncome", true],
    ["EPS (diluted)", "eps", false],
    ["Shareholders' equity", "equity", true],
    ["Operating cash flow", "operatingCashFlow", true],
    ["Free cash flow", "freeCashFlow", true],
    ["Total debt", "totalDebt", true],
  ].filter(([, key]) => years.some((y) => isNum(y[key])));
  return (
    <Card title="Annual results" note="From the yearly financial statements. Banks report revenue differently from other companies.">
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-stone-200 text-slate-500">
              <th className="py-1.5 pr-4 text-left font-medium">Year</th>
              {years.map((y) => <th key={y.year} className="py-1.5 px-3 text-right font-medium">{y.year}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, key, money]) => (
              <tr key={key} className="border-b border-stone-100 last:border-0">
                <td className="py-1.5 pr-4 text-slate-600">{label}</td>
                {years.map((y) => (
                  <td key={y.year} className="py-1.5 px-3 text-right tabular-nums">
                    {money ? fmtMoney(y[key], y.currency || fallbackCurrency) : isNum(y[key]) ? y[key].toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DividendHistory({ d, f }) {
  const [showPayments, setShowPayments] = useState(false);
  const max = Math.max(...d.byYear.map((y) => y.total), 0);
  return (
    <Card
      title="Dividend history"
      note="Per share, by the year the stock went ex-dividend. Yield uses the year-end price (today's price for the current year)."
    >
      <div className="flex flex-wrap gap-x-8 gap-y-3 mb-4">
        <Stat label="Paid in the last 12 months" value={isNum(d.trailing12m) ? fmtPrice(d.trailing12m) : "—"} />
        <Stat label="Yield, last 12 months" value={fmtPctPoint(d.trailingYield, 2)} />
        <Stat label="5-year average yield" value={fmtPctPoint(f.fiveYearAvgYield, 2)} />
        <Stat label="Payout ratio" value={fmtFrac(f.payoutRatio, 0)} hint="Share of profit paid out as dividends" />
      </div>
      {d.byYear.length === 0 ? (
        <p className="text-sm text-slate-500">No dividend payments found in the last 10 years.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {d.byYear.map((y) => (
              <div key={y.year} className="flex items-center gap-3 text-sm">
                <span className="w-20 sm:w-24 shrink-0 text-slate-600">{y.year}{y.partial && <span className="text-xs text-slate-400"> to date</span>}</span>
                <div className="flex-1 min-w-0 h-3 bg-stone-100 rounded overflow-hidden">
                  <div className="h-full bg-emerald-600/70 rounded" style={{ width: `${max ? (y.total / max) * 100 : 0}%` }} />
                </div>
                <span className="w-20 sm:w-24 shrink-0 text-right tabular-nums">{fmtPrice(y.total)}</span>
                <span className="w-14 sm:w-16 shrink-0 text-right tabular-nums text-slate-500">{fmtPctPoint(y.yield, 2)}</span>
                <span className="hidden sm:inline w-20 shrink-0 text-right text-xs text-slate-400">{y.count} payment{y.count > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setShowPayments((v) => !v)} className="text-xs text-slate-500 hover:text-slate-700 mt-3">
            {showPayments ? "Hide individual payments" : `Show all ${d.payments.length} payments`}
          </button>
          {showPayments && (
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="border-b border-stone-200 text-slate-500">
                  <th className="py-1 text-left font-medium">Ex-dividend date</th>
                  <th className="py-1 text-right font-medium">Amount per share</th>
                </tr>
              </thead>
              <tbody>
                {d.payments.map((p) => (
                  <tr key={p.date} className="border-b border-stone-100 last:border-0">
                    <td className="py-1">{fmtDate(p.date)}</td>
                    <td className="py-1 text-right tabular-nums">{fmtPrice(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Card>
  );
}

function CorporateActions({ events, splits, dividends }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (events.earningsDates || []).filter((d) => d >= today);
  const lastDiv = dividends.payments[0];
  return (
    <Card
      title="Corporate actions and events"
      note="Covers earnings dates, dividends and stock splits. Rights issues, buybacks and shareholder meetings are not in this data source; check IDX announcements for those."
    >
      <div className="space-y-2 text-sm">
        <Row label="Next earnings report" value={upcoming.length ? upcoming.map(fmtDate).join(" or ") : "Not announced"} />
        <Row label="Latest ex-dividend date" value={events.exDividendDate ? fmtDate(events.exDividendDate) : lastDiv ? fmtDate(lastDiv.date) : "—"} />
        <Row label="Dividend payment date" value={fmtDate(events.dividendPayDate)} />
        <Row label="Latest dividend" value={lastDiv ? `${fmtPrice(lastDiv.amount)} per share (ex ${fmtDate(lastDiv.date)})` : "—"} />
        <Row
          label="Stock splits"
          value={splits.length ? splits.map((s) => `${s.ratio || "split"} on ${fmtDate(s.date)}`).join("; ") : "None in the last 10 years"}
        />
      </div>
    </Card>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-stone-100 last:border-0 pb-2 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{value}</span>
    </div>
  );
}

function Technicals({ t }) {
  if (!t) return <Card title="Price trend"><p className="text-sm text-slate-500">Not enough daily price history.</p></Card>;
  const rsiNote = !isNum(t.rsi14) ? "" : t.rsi14 >= 70 ? "overbought zone" : t.rsi14 <= 30 ? "oversold zone" : "neutral zone";
  return (
    <Card title="Price trend" note="Moving averages and RSI from the last year of daily closes. RSI above 70 is often read as overbought, below 30 as oversold.">
      <StatGrid>
        <Stat label="vs 20-day average" value={fmtSigned(t.vsMa20)} valueClass={tone(t.vsMa20)} hint={`20-day average ${fmtPrice(t.ma20)}`} />
        <Stat label="vs 50-day average" value={fmtSigned(t.vsMa50)} valueClass={tone(t.vsMa50)} hint={`50-day average ${fmtPrice(t.ma50)}`} />
        <Stat label="vs 200-day average" value={fmtSigned(t.vsMa200)} valueClass={tone(t.vsMa200)} hint={`200-day average ${fmtPrice(t.ma200)}`} />
        <Stat label="RSI (14 days)" value={isNum(t.rsi14) ? `${t.rsi14.toFixed(0)} · ${rsiNote}` : "—"} />
        <Stat label="1 month" value={fmtSigned(t.ret1m)} valueClass={tone(t.ret1m)} />
        <Stat label="3 months" value={fmtSigned(t.ret3m)} valueClass={tone(t.ret3m)} />
        <Stat label="6 months" value={fmtSigned(t.ret6m)} valueClass={tone(t.ret6m)} />
        <Stat label="1 year" value={fmtSigned(t.ret1y)} valueClass={tone(t.ret1y)} />
        <Stat label="Volume vs 3-month average" value={isNum(t.volumeRatio) ? `${t.volumeRatio.toFixed(2)}x` : "—"} />
      </StatGrid>
      {isNum(t.pos52) && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>52-week low {fmtPrice(t.low52)}</span>
            <span>high {fmtPrice(t.high52)}</span>
          </div>
          <div className="relative h-2 bg-stone-200 rounded">
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-slate-800 border-2 border-white" style={{ left: `calc(${t.pos52 * 100}% - 6px)` }} />
          </div>
        </div>
      )}
    </Card>
  );
}

const CONSENSUS_LABEL = { strong_buy: "Strong buy", buy: "Buy", hold: "Hold", underperform: "Underperform", sell: "Sell" };

function Analysts({ a, price }) {
  if (!a.count) {
    return <Card title="Analyst view"><p className="text-sm text-slate-500">No analyst coverage in this data source.</p></Card>;
  }
  const trend = a.trend;
  const parts = trend
    ? [
        ["Strong buy", trend.strongBuy, "bg-emerald-700"],
        ["Buy", trend.buy, "bg-emerald-500"],
        ["Hold", trend.hold, "bg-amber-400"],
        ["Sell", trend.sell, "bg-rose-400"],
        ["Strong sell", trend.strongSell, "bg-rose-700"],
      ]
    : [];
  const total = parts.reduce((s, [, n]) => s + n, 0);
  const upside = isNum(a.targetMean) && isNum(price) ? (a.targetMean / price - 1) * 100 : null;
  return (
    <Card title="Analyst view" note="Brokers' published ratings and 12-month targets, as collected by Yahoo Finance.">
      <StatGrid>
        <Stat label="Consensus" value={CONSENSUS_LABEL[a.recommendationKey] || "—"} />
        <Stat label="Analysts" value={a.count} />
        <Stat label="Average target" value={fmtPrice(a.targetMean)} />
        <Stat label="Target vs price" value={fmtSigned(upside)} valueClass={tone(upside)} />
        <Stat label="Target range" value={isNum(a.targetLow) ? `${fmtPrice(a.targetLow)} – ${fmtPrice(a.targetHigh)}` : "—"} />
      </StatGrid>
      {total > 0 && (
        <div className="mt-4">
          <div className="flex h-2.5 rounded overflow-hidden">
            {parts.filter(([, n]) => n > 0).map(([label, n, color]) => (
              <div key={label} className={color} style={{ width: `${(n / total) * 100}%` }} title={`${label}: ${n}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-slate-500 mt-1.5">
            {parts.filter(([, n]) => n > 0).map(([label, n]) => <span key={label}>{label} {n}</span>)}
          </div>
        </div>
      )}
    </Card>
  );
}

function News({ news }) {
  return (
    <Card title="News and talk" note="Headlines from Google News (Indonesian sources, last 30 days) and Yahoo Finance. Headlines can include rumours and opinion; they are not verified.">
      {news.length === 0 ? (
        <p className="text-sm text-slate-500">No recent headlines found.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {news.map((n) => (
            <li key={n.url} className="py-2">
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-900 hover:underline">{n.title}</a>
              <div className="text-xs text-slate-400 mt-0.5">{[n.source, n.date && fmtDate(n.date)].filter(Boolean).join(" · ")}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Profile({ p }) {
  const [open, setOpen] = useState(false);
  if (!p.summary && !p.website) return null;
  const long = (p.summary || "").length > 320;
  return (
    <Card title="About the company">
      {p.summary && (
        <p className="text-sm text-slate-700 leading-relaxed">
          {open || !long ? p.summary : `${p.summary.slice(0, 320)}…`}
          {long && (
            <button onClick={() => setOpen((v) => !v)} className="ml-1 text-xs text-slate-500 hover:text-slate-700">
              {open ? "Show less" : "Read more"}
            </button>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 mt-3">
        {p.industry && <span>{p.industry}</span>}
        {isNum(p.employees) && <span>{p.employees.toLocaleString("en-US")} employees</span>}
        {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="hover:text-slate-700">{p.website.replace(/^https?:\/\//, "")} ↗</a>}
      </div>
    </Card>
  );
}

// --- the page ----------------------------------------------------------------
export default function StockAnalysis({ companies = [] }) {
  const [input, setInput] = useState("");
  const [code, setCode] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const byCode = useMemo(() => Object.fromEntries(companies.map((c) => [c.code, c])), [companies]);
  const company = code ? byCode[code] : null;

  function submit(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw) return;
    // Accept "BBCA", "BBCA.JK", or part of a company name ("central asia").
    let candidate = raw.split(/\s+/)[0].replace(/\.JK$/, "");
    if (!byCode[candidate]) {
      const match = companies.find((c) => c.name.toUpperCase().includes(raw));
      if (match) candidate = match.code;
    }
    if (!/^[A-Z0-9]{2,6}$/.test(candidate)) {
      setError("Enter an IDX ticker such as BBCA, or part of a company name");
      return;
    }
    setInput(candidate);
    setCode(candidate);
  }

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      setData(null);
      try {
        const r = await fetch(`/api/idx-quotes?view=analysis&symbol=${encodeURIComponent(code)}`);
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || `status ${r.status}`);
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [code]);

  const p = data?.price;
  const failedSources = data ? Object.entries(data.sources).filter(([, s]) => s !== "ok") : [];
  const SOURCE_LABEL = { quote: "price", fundamentals: "fundamentals", annualFinancials: "annual results", dividendsAndSplits: "dividends and splits", dailyPrices: "daily prices", googleNews: "Google News", yahooNews: "Yahoo news" };

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="mb-6 border-b border-stone-300 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AI Analysis</h1>
          <p className="text-sm text-slate-500 mt-1">
            Search one stock to see its fundamentals, dividend record, corporate actions, price trend, analyst view and news, with an AI short-term and long-term view.
          </p>
        </header>

        <form
          onSubmit={(e) => { e.preventDefault(); submit(input); }}
          className="flex flex-wrap gap-2 mb-3"
        >
          <input
            list="analysis-tickers"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ticker or company, e.g. BBCA"
            aria-label="Ticker"
            className="flex-1 min-w-[220px] bg-white border border-stone-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-slate-500"
          />
          <datalist id="analysis-tickers">
            {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </datalist>
          <button type="submit" className="bg-slate-900 text-white px-4 py-2 rounded text-sm font-medium">Analyse</button>
        </form>
        <div className="flex flex-wrap gap-2 mb-6">
          {QUICK_PICKS.map((c) => (
            <button key={c} onClick={() => submit(c)} className="text-xs px-2.5 py-1 rounded border border-stone-300 bg-white text-slate-600 hover:border-slate-500">{c}</button>
          ))}
        </div>

        {error && <p className="text-sm text-rose-700 mb-4">{error}</p>}
        {loading && <p className="text-sm text-slate-500 mb-4">Gathering data for {code}… this takes a few seconds.</p>}

        {data && (
          <div className="space-y-4">
            <section className="bg-white border border-stone-300 rounded p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-xl font-semibold text-slate-900">{data.code}</h2>
                    <span className="text-sm text-slate-500">{company?.name || data.name}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {[company?.sector || data.profile.sector, company?.board && `${company.board} board`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums">{fmtPrice(p.price)}</div>
                  <div className={`text-sm tabular-nums ${tone(p.changePct)}`}>
                    {isNum(p.change) ? `${p.change > 0 ? "+" : ""}${p.change.toLocaleString("id-ID")}` : ""} ({fmtSigned(p.changePct, 2)})
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Market cap {fmtMoney(p.marketCap)}{p.exchangeTime && ` · ${new Date(p.exchangeTime).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <TradingViewChart code={data.code} height={200} />
              </div>
            </section>

            <AiView code={data.code} dataReady={!!data} />

            <Fundamentals f={data.fundamentals} />
            {data.fundamentals.usdIdr && (
              <p className="text-xs text-slate-400 -mt-2">
                {data.code} reports in US dollars. Book value is converted at Rp {Math.round(data.fundamentals.usdIdr).toLocaleString("id-ID")} per USD; cash and debt figures are shown in US dollars.
              </p>
            )}
            <AnnualResults annual={data.annual} fallbackCurrency={data.fundamentals.financialCurrency || "IDR"} />

            <div className="grid md:grid-cols-2 gap-4">
              <DividendHistory d={data.dividends} f={data.fundamentals} />
              <CorporateActions events={data.events} splits={data.splits} dividends={data.dividends} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Technicals t={data.technicals} />
              <Analysts a={data.analysts} price={p.price} />
            </div>

            <News news={data.news} />
            <Profile p={data.profile} />

            <p className="text-xs text-slate-400 leading-relaxed">
              Data via Yahoo Finance (unofficial, delayed) and Google News, gathered {new Date(data.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.
              {failedSources.length > 0 && ` Not available this time: ${failedSources.map(([k]) => SOURCE_LABEL[k] || k).join(", ")}.`}
              {" "}Nothing on this page is financial advice.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
