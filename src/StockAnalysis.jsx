import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, SignInButton } from "@clerk/react";
import TradingViewChart from "./TradingViewChart";
import { LANGS, TEXT, initialLang, makeFormat, saveLang } from "./analysisText";

// AI Analysis tab: search one IDX stock and see its fundamentals, dividend
// record, corporate actions, technical picture, analyst view and news, plus an
// AI short-term and long-term view written from those figures. English and
// Bahasa Indonesia.

const QUICK_PICKS = ["BBCA", "BBRI", "BMRI", "TLKM", "ASII", "ADRO"];

const VIEW_STYLES = {
  Buy: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Hold: "bg-amber-100 text-amber-800 border-amber-300",
  Sell: "bg-rose-100 text-rose-800 border-rose-300",
  Neutral: "bg-slate-100 text-slate-700 border-slate-300",
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const tone = (v) => (!isNum(v) || Math.abs(v) < 0.05 ? "text-slate-600" : v > 0 ? "text-emerald-700" : "text-rose-700");

// Current language: its text (t), formats (fmt) and code (lang).
const LangContext = createContext({ lang: "en", t: TEXT.en, fmt: makeFormat("en") });
const useLang = () => useContext(LangContext);

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

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-stone-100 last:border-0 pb-2 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{value}</span>
    </div>
  );
}

// --- AI view -----------------------------------------------------------------
function AiSide({ title, horizon, side }) {
  const { t } = useLang();
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-400">{horizon}</div>
        </div>
        <div className="text-right shrink-0">
          <span className={`inline-block border rounded px-3 py-1 text-base font-semibold ${VIEW_STYLES[side.view]}`}>{t.views[side.view]}</span>
          <div className="text-xs text-slate-400 mt-1">{t.confidence[side.confidence]}</div>
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

function AiView({ code }) {
  const { lang, t, fmt } = useLang();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const key = `${code}|${lang}`;
  const currentKey = useRef(key);
  useEffect(() => { currentKey.current = key; }, [key]);
  // status: loading | ready | none | generating | limit | error
  const [state, setState] = useState({ key: null, status: "loading", view: null, usage: null, error: "" });

  async function request(generate) {
    const headers = {};
    if (generate) headers.Authorization = `Bearer ${await getToken()}`;
    const r = await fetch(
      `/api/idx-quotes?view=ai&symbol=${encodeURIComponent(code)}&lang=${lang}${generate ? "&generate=1" : ""}`,
      { headers }
    );
    const d = await r.json().catch(() => ({}));
    return { r, d };
  }

  // Look up today's saved view: free, and works without signing in.
  useEffect(() => {
    let cancelled = false;
    async function lookUp() {
      setState({ key, status: "loading", view: null, usage: null, error: "" });
      try {
        const { r, d } = await request(false);
        if (!r.ok || d.error) throw new Error(d.error || `status ${r.status}`);
        if (!cancelled) setState({ key, status: d.view ? "ready" : "none", view: d.view, usage: d.usage, error: "" });
      } catch (e) {
        if (!cancelled) setState({ key, status: "error", view: null, usage: null, error: String(e.message || e) });
      }
    }
    lookUp();
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Write a new view: signed-in users, counts toward today's limit.
  async function generate() {
    const thisKey = key;
    setState((s) => ({ ...s, status: "generating", error: "" }));
    try {
      const { r, d } = await request(true);
      if (currentKey.current !== thisKey) return;
      if (r.status === 429) {
        setState((s) => ({ ...s, status: "limit", usage: d.usage || s.usage }));
        return;
      }
      if (!r.ok || d.error) throw new Error(d.error || `status ${r.status}`);
      setState({ key: thisKey, status: "ready", view: d.view, usage: d.usage, error: "" });
    } catch (e) {
      if (currentKey.current === thisKey) setState((s) => ({ ...s, status: "error", error: String(e.message || e) }));
    }
  }

  const usage = state.usage;
  const limitHit = state.status === "limit" || (usage && usage.used >= usage.limit);
  const ready = state.key === key && state.status === "ready" && state.view;

  let body;
  if (state.key !== key || state.status === "loading") {
    body = <p className="text-sm text-slate-400">{t.lookingUp}</p>;
  } else if (state.status === "generating") {
    body = <p className="text-sm text-slate-400">{t.writing}</p>;
  } else if (ready) {
    const v = state.view;
    body = (
      <>
        <div className="flex flex-col md:flex-row gap-6">
          <AiSide title={t.shortTerm} horizon={t.shortHorizon} side={v.shortTerm} />
          <div className="hidden md:block w-px bg-stone-200" />
          <AiSide title={t.longTerm} horizon={t.longHorizon} side={v.longTerm} />
        </div>
        {(v.newsSummary || v.risks.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4 mt-5 pt-4 border-t border-stone-200">
            {v.newsSummary && (
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">{t.newsAbout}</div>
                <p className="text-sm text-slate-700">{v.newsSummary}</p>
              </div>
            )}
            {v.risks.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">{t.keyRisks}</div>
                <ul className="text-sm text-slate-700 list-disc pl-4 space-y-0.5">
                  {v.risks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-4">{t.writtenAt(fmt.dateTime(v.generatedAt))}</p>
      </>
    );
  } else {
    // No view yet today (or the last attempt failed)
    let action;
    if (limitHit) {
      action = <p className="text-sm text-amber-700">{t.limitReached(usage?.limit ?? 50)}</p>;
    } else if (!isLoaded) {
      action = <p className="text-sm text-slate-400">{t.checkingSignIn}</p>;
    } else if (isSignedIn) {
      action = (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={generate} className="bg-slate-900 text-white px-3 py-1.5 rounded text-sm font-medium">{t.generate}</button>
          {usage && <span className="text-xs text-slate-400">{t.remaining(Math.max(0, usage.limit - usage.used), usage.limit)}</span>}
        </div>
      );
    } else {
      action = (
        <div className="flex flex-wrap items-center gap-3">
          <SignInButton mode="modal">
            <button className="bg-slate-900 text-white px-3 py-1.5 rounded text-sm font-medium">{t.signIn}</button>
          </SignInButton>
          <span className="text-sm text-slate-600">{t.signInToGenerate}</span>
        </div>
      );
    }
    body = (
      <div className="space-y-3">
        {state.status === "error" && <p className="text-sm text-rose-700">{t.aiError(state.error)}</p>}
        <p className="text-sm text-slate-600">{t.noViewYet(code)}</p>
        {action}
      </div>
    );
  }

  return (
    <Card title={t.aiView}>
      {body}
      {usage && <p className="text-xs text-slate-400 mt-3">{t.usage(Math.min(usage.used, usage.limit), usage.limit)}</p>}
      <p className="text-xs text-slate-400 mt-2 leading-relaxed">{t.aiLegend}</p>
    </Card>
  );
}

// --- sections ------------------------------------------------------------------
function Fundamentals({ f }) {
  const { t, fmt } = useLang();
  const cur = f.financialCurrency || "IDR";
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card title={t.valuation}>
        <StatGrid>
          <Stat label={t.peTrailing} value={fmt.num(f.pe)} />
          <Stat label={t.peForward} value={fmt.num(f.forwardPe)} />
          <Stat label={t.pbv} value={fmt.num(f.pbv, 2)} hint={f.usdIdr ? t.pbvConverted : undefined} />
          <Stat label={t.evEbitda} value={fmt.num(f.evToEbitda)} />
          <Stat label={t.eps12m} value={isNum(f.eps) ? fmt.price(f.eps) : "—"} />
          <Stat label={t.bvps} value={isNum(f.bvpsIdr) ? fmt.price(Math.round(f.bvpsIdr)) : "—"} />
        </StatGrid>
      </Card>
      <Card title={t.profitGrowth}>
        <StatGrid>
          <Stat label={t.roe} value={fmt.frac(f.roe)} />
          <Stat label={t.roa} value={fmt.frac(f.roa)} />
          <Stat label={t.netMargin} value={fmt.frac(f.profitMargin)} />
          <Stat label={t.opMargin} value={fmt.frac(f.operatingMargin)} />
          <Stat label={t.revGrowth} value={isNum(f.revenueGrowth) ? fmt.signed(f.revenueGrowth * 100) : "—"} valueClass={tone(f.revenueGrowth)} hint={t.yoyHint} />
          <Stat label={t.earnGrowth} value={isNum(f.earningsGrowth) ? fmt.signed(f.earningsGrowth * 100) : "—"} valueClass={tone(f.earningsGrowth)} hint={t.yoyHint} />
        </StatGrid>
      </Card>
      <Card title={t.balance} note={cur !== "IDR" ? t.reportedIn(cur) : undefined}>
        <StatGrid>
          <Stat label={t.debtEquity} value={isNum(f.debtToEquity) ? `${fmt.num(f.debtToEquity, 0)}%` : "—"} />
          <Stat label={t.currentRatio} value={fmt.num(f.currentRatio, 2)} />
          <Stat label={t.totalCash} value={fmt.money(f.totalCash, cur)} />
          <Stat label={t.totalDebt} value={fmt.money(f.totalDebt, cur)} />
          <Stat label={t.opCashFlow} value={fmt.money(f.operatingCashflow, cur)} />
          <Stat label={t.freeCashFlow} value={fmt.money(f.freeCashflow, cur)} valueClass={tone(f.freeCashflow)} />
        </StatGrid>
      </Card>
    </div>
  );
}

function AnnualResults({ annual, fallbackCurrency }) {
  const { t, fmt } = useLang();
  if (!annual.length) return null;
  const years = [...annual].reverse(); // oldest first, left to right
  const rows = [
    [t.revenue, "revenue", true],
    [t.netIncome, "netIncome", true],
    [t.epsDiluted, "eps", false],
    [t.equity, "equity", true],
    [t.opCashFlow, "operatingCashFlow", true],
    [t.freeCashFlow, "freeCashFlow", true],
    [t.totalDebtRow, "totalDebt", true],
  ].filter(([, key]) => years.some((y) => isNum(y[key])));
  return (
    <Card title={t.annual} note={t.annualNote}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-stone-200 text-slate-500">
              <th className="py-1.5 pr-4 text-left font-medium">{t.year}</th>
              {years.map((y) => <th key={y.year} className="py-1.5 px-3 text-right font-medium">{y.year}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, key, money]) => (
              <tr key={key} className="border-b border-stone-100 last:border-0">
                <td className="py-1.5 pr-4 text-slate-600">{label}</td>
                {years.map((y) => (
                  <td key={y.year} className="py-1.5 px-3 text-right tabular-nums">
                    {money ? fmt.money(y[key], y.currency || fallbackCurrency) : fmt.num(y[key], 2)}
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
  const { t, fmt } = useLang();
  const [showPayments, setShowPayments] = useState(false);
  const max = Math.max(...d.byYear.map((y) => y.total), 0);
  return (
    <Card title={t.dividends} note={t.dividendsNote}>
      <div className="flex flex-wrap gap-x-8 gap-y-3 mb-4">
        <Stat label={t.paid12m} value={isNum(d.trailing12m) ? fmt.price(d.trailing12m) : "—"} />
        <Stat label={t.yield12m} value={fmt.pct(d.trailingYield, 2)} />
        <Stat label={t.avgYield5y} value={fmt.pct(f.fiveYearAvgYield, 2)} />
        <Stat label={t.payoutRatio} value={fmt.frac(f.payoutRatio, 0)} hint={t.payoutHint} />
      </div>
      {d.byYear.length === 0 ? (
        <p className="text-sm text-slate-500">{t.noDividends}</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {d.byYear.map((y) => (
              <div key={y.year} className="flex items-center gap-3 text-sm">
                <span className="w-20 sm:w-24 shrink-0 text-slate-600">
                  {y.year}{y.partial && <span className="text-xs text-slate-400"> {t.toDate}</span>}
                </span>
                <div className="flex-1 min-w-0 h-3 bg-stone-100 rounded overflow-hidden">
                  <div className="h-full bg-emerald-600/70 rounded" style={{ width: `${max ? (y.total / max) * 100 : 0}%` }} />
                </div>
                <span className="w-20 sm:w-24 shrink-0 text-right tabular-nums">{fmt.price(y.total)}</span>
                <span className="w-14 sm:w-16 shrink-0 text-right tabular-nums text-slate-500">{fmt.pct(y.yield, 2)}</span>
                <span className="hidden sm:inline w-20 shrink-0 text-right text-xs text-slate-400">{t.payments(y.count)}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setShowPayments((v) => !v)} className="text-xs text-slate-500 hover:text-slate-700 mt-3">
            {showPayments ? t.hidePayments : t.showPayments(d.payments.length)}
          </button>
          {showPayments && (
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="border-b border-stone-200 text-slate-500">
                  <th className="py-1 text-left font-medium">{t.exDate}</th>
                  <th className="py-1 text-right font-medium">{t.amountPerShare}</th>
                </tr>
              </thead>
              <tbody>
                {d.payments.map((p) => (
                  <tr key={p.date} className="border-b border-stone-100 last:border-0">
                    <td className="py-1">{fmt.date(p.date)}</td>
                    <td className="py-1 text-right tabular-nums">{fmt.price(p.amount)}</td>
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
  const { t, fmt } = useLang();
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (events.earningsDates || []).filter((d) => d >= today);
  const lastDiv = dividends.payments[0];
  return (
    <Card title={t.corporate} note={t.corporateNote}>
      <div className="space-y-2 text-sm">
        <Row label={t.nextEarnings} value={upcoming.length ? upcoming.map(fmt.date).join(t.or) : t.notAnnounced} />
        <Row label={t.lastExDate} value={events.exDividendDate ? fmt.date(events.exDividendDate) : lastDiv ? fmt.date(lastDiv.date) : "—"} />
        <Row label={t.payDate} value={fmt.date(events.dividendPayDate)} />
        <Row label={t.lastDividend} value={lastDiv ? t.lastDividendValue(fmt.price(lastDiv.amount), fmt.date(lastDiv.date)) : "—"} />
        <Row label={t.splits} value={splits.length ? splits.map((s) => t.splitOn(s.ratio || "—", fmt.date(s.date))).join("; ") : t.noSplits} />
      </div>
    </Card>
  );
}

function Technicals({ tech }) {
  const { t, fmt } = useLang();
  if (!tech) return <Card title={t.trend}><p className="text-sm text-slate-500">{t.noTrend}</p></Card>;
  const zone = !isNum(tech.rsi14) ? "" : tech.rsi14 >= 70 ? t.rsiZone.over : tech.rsi14 <= 30 ? t.rsiZone.under : t.rsiZone.neutral;
  return (
    <Card title={t.trend} note={t.trendNote}>
      <StatGrid>
        <Stat label={t.vsMa(20)} value={fmt.signed(tech.vsMa20)} valueClass={tone(tech.vsMa20)} hint={t.maHint(20, fmt.price(tech.ma20))} />
        <Stat label={t.vsMa(50)} value={fmt.signed(tech.vsMa50)} valueClass={tone(tech.vsMa50)} hint={t.maHint(50, fmt.price(tech.ma50))} />
        <Stat label={t.vsMa(200)} value={fmt.signed(tech.vsMa200)} valueClass={tone(tech.vsMa200)} hint={t.maHint(200, fmt.price(tech.ma200))} />
        <Stat label={t.rsi} value={isNum(tech.rsi14) ? `${fmt.num(tech.rsi14, 0)} · ${zone}` : "—"} />
        <Stat label={t.m1} value={fmt.signed(tech.ret1m)} valueClass={tone(tech.ret1m)} />
        <Stat label={t.m3} value={fmt.signed(tech.ret3m)} valueClass={tone(tech.ret3m)} />
        <Stat label={t.m6} value={fmt.signed(tech.ret6m)} valueClass={tone(tech.ret6m)} />
        <Stat label={t.y1} value={fmt.signed(tech.ret1y)} valueClass={tone(tech.ret1y)} />
        <Stat label={t.volRatio} value={isNum(tech.volumeRatio) ? `${fmt.num(tech.volumeRatio, 2)}x` : "—"} />
      </StatGrid>
      {isNum(tech.pos52) && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>{t.low52(fmt.price(tech.low52))}</span>
            <span>{t.high52(fmt.price(tech.high52))}</span>
          </div>
          <div className="relative h-2 bg-stone-200 rounded">
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-slate-800 border-2 border-white" style={{ left: `calc(${tech.pos52 * 100}% - 6px)` }} />
          </div>
        </div>
      )}
    </Card>
  );
}

function Analysts({ a, price }) {
  const { t, fmt } = useLang();
  if (!a.count) {
    return <Card title={t.analysts}><p className="text-sm text-slate-500">{t.noAnalysts}</p></Card>;
  }
  const trend = a.trend;
  const parts = trend
    ? [
        ["strongBuy", trend.strongBuy, "bg-emerald-700"],
        ["buy", trend.buy, "bg-emerald-500"],
        ["hold", trend.hold, "bg-amber-400"],
        ["sell", trend.sell, "bg-rose-400"],
        ["strongSell", trend.strongSell, "bg-rose-700"],
      ].filter(([, n]) => n > 0)
    : [];
  const total = parts.reduce((s, [, n]) => s + n, 0);
  const upside = isNum(a.targetMean) && isNum(price) ? (a.targetMean / price - 1) * 100 : null;
  return (
    <Card title={t.analysts} note={t.analystsNote}>
      <StatGrid>
        <Stat label={t.consensus} value={t.consensusKey[a.recommendationKey] || "—"} />
        <Stat label={t.analystCount} value={a.count} />
        <Stat label={t.avgTarget} value={fmt.price(a.targetMean)} />
        <Stat label={t.targetVsPrice} value={fmt.signed(upside)} valueClass={tone(upside)} />
        <Stat label={t.targetRange} value={isNum(a.targetLow) ? `${fmt.price(a.targetLow)} – ${fmt.price(a.targetHigh)}` : "—"} />
      </StatGrid>
      {total > 0 && (
        <div className="mt-4">
          <div className="flex h-2.5 rounded overflow-hidden">
            {parts.map(([k, n, color]) => (
              <div key={k} className={color} style={{ width: `${(n / total) * 100}%` }} title={`${t.ratings[k]}: ${n}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-slate-500 mt-1.5">
            {parts.map(([k, n]) => <span key={k}>{t.ratings[k]} {n}</span>)}
          </div>
        </div>
      )}
    </Card>
  );
}

function News({ news }) {
  const { t, fmt } = useLang();
  return (
    <Card title={t.news} note={t.newsNote}>
      {news.length === 0 ? (
        <p className="text-sm text-slate-500">{t.noNews}</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {news.map((n) => (
            <li key={n.url} className="py-2">
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-900 hover:underline">{n.title}</a>
              <div className="text-xs text-slate-400 mt-0.5">{[n.source, n.date && fmt.date(n.date)].filter(Boolean).join(" · ")}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Profile({ p }) {
  const { t, fmt } = useLang();
  const [open, setOpen] = useState(false);
  if (!p.summary && !p.website) return null;
  const long = (p.summary || "").length > 320;
  return (
    <Card title={t.about}>
      {p.summary && (
        <p className="text-sm text-slate-700 leading-relaxed">
          {open || !long ? p.summary : `${p.summary.slice(0, 320)}…`}
          {long && (
            <button onClick={() => setOpen((v) => !v)} className="ml-1 text-xs text-slate-500 hover:text-slate-700">
              {open ? t.showLess : t.readMore}
            </button>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 mt-3">
        {p.industry && <span>{p.industry}</span>}
        {isNum(p.employees) && <span>{t.employees(fmt.int(p.employees))}</span>}
        {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="hover:text-slate-700">{p.website.replace(/^https?:\/\//, "")} ↗</a>}
      </div>
    </Card>
  );
}

// --- the page ----------------------------------------------------------------
export default function StockAnalysis({ companies = [] }) {
  const [lang, setLang] = useState(initialLang);
  const ctx = useMemo(() => ({ lang, t: TEXT[lang], fmt: makeFormat(lang) }), [lang]);
  const { t, fmt } = ctx;

  const [input, setInput] = useState("");
  const [code, setCode] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const byCode = useMemo(() => Object.fromEntries(companies.map((c) => [c.code, c])), [companies]);
  const company = code ? byCode[code] : null;

  function chooseLang(l) {
    setLang(l);
    saveLang(l);
  }

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
      setError(t.badInput);
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
  const failedSources = data ? Object.keys(data.sources).filter((k) => data.sources[k] !== "ok") : [];

  return (
    <LangContext.Provider value={ctx}>
      <div className="min-h-screen bg-stone-100 text-slate-900 font-sans" lang={lang}>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <header className="mb-6 border-b border-stone-300 pb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t.title}</h1>
              <p className="text-sm text-slate-500 mt-1">{t.intro}</p>
            </div>
            <div className="inline-flex border border-stone-300 rounded-full overflow-hidden shrink-0" role="group" aria-label={t.language}>
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => chooseLang(l.id)}
                  aria-pressed={lang === l.id}
                  className={`px-3 py-1 text-sm ${lang === l.id ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:text-slate-700"}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </header>

          <form onSubmit={(e) => { e.preventDefault(); submit(input); }} className="flex flex-wrap gap-2 mb-3">
            <input
              list="analysis-tickers"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.tickerLabel}
              className="flex-1 min-w-[220px] bg-white border border-stone-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-slate-500"
            />
            <datalist id="analysis-tickers">
              {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </datalist>
            <button type="submit" className="bg-slate-900 text-white px-4 py-2 rounded text-sm font-medium">{t.analyse}</button>
          </form>
          <div className="flex flex-wrap gap-2 mb-6">
            {QUICK_PICKS.map((c) => (
              <button key={c} onClick={() => submit(c)} className="text-xs px-2.5 py-1 rounded border border-stone-300 bg-white text-slate-600 hover:border-slate-500">{c}</button>
            ))}
          </div>

          {error && <p className="text-sm text-rose-700 mb-4">{error}</p>}
          {loading && <p className="text-sm text-slate-500 mb-4">{t.gathering(code)}</p>}

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
                      {[company?.sector || data.profile.sector, company?.board && t.board(company.board)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold tabular-nums">{fmt.price(p.price)}</div>
                    <div className={`text-sm tabular-nums ${tone(p.changePct)}`}>
                      {isNum(p.change) ? `${p.change > 0 ? "+" : ""}${p.change.toLocaleString("id-ID")}` : ""} ({fmt.signed(p.changePct, 2)})
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {t.marketCap} {fmt.money(p.marketCap)}{p.exchangeTime && ` · ${fmt.dateTime(p.exchangeTime)}`}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <TradingViewChart code={data.code} height={200} />
                </div>
              </section>

              <AiView code={data.code} />

              <Fundamentals f={data.fundamentals} />
              {data.fundamentals.usdIdr && (
                <p className="text-xs text-slate-400 -mt-2">{t.usdNote(data.code, fmt.int(data.fundamentals.usdIdr))}</p>
              )}
              <AnnualResults annual={data.annual} fallbackCurrency={data.fundamentals.financialCurrency || "IDR"} />

              <div className="grid md:grid-cols-2 gap-4">
                <DividendHistory d={data.dividends} f={data.fundamentals} />
                <CorporateActions events={data.events} splits={data.splits} dividends={data.dividends} />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Technicals tech={data.technicals} />
                <Analysts a={data.analysts} price={p.price} />
              </div>

              <News news={data.news} />
              <Profile p={data.profile} />

              <p className="text-xs text-slate-400 leading-relaxed">
                {t.footer(fmt.dateTime(data.generatedAt))}
                {failedSources.length > 0 && t.unavailable(failedSources.map((k) => t.sources[k] || k).join(", "))}
                {t.notAdvice}
              </p>
            </div>
          )}
        </div>
      </div>
    </LangContext.Provider>
  );
}
