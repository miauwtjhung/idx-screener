import React, { useEffect, useRef, useState } from "react";

// Full-page TradingView Advanced Chart: indicators, drawing tools,
// timeframes, compare, and symbol search built in.

const QUICK = [
  { label: "IHSG", symbol: "IDX:COMPOSITE" },
  { label: "LQ45", symbol: "IDX:LQ45" },
  { label: "BBCA", symbol: "IDX:BBCA" },
  { label: "BBRI", symbol: "IDX:BBRI" },
  { label: "TLKM", symbol: "IDX:TLKM" },
  { label: "Gold", symbol: "TVC:GOLD" },
  { label: "BTC/IDR", symbol: "BINANCE:BTCIDR" },
  { label: "USD/IDR", symbol: "FX_IDC:USDIDR" },
];

// Work out the TradingView symbol for what the user typed:
//  "BINANCE:ETHIDR" -> as typed; "BBCA" (an IDX company) -> "IDX:BBCA";
//  crypto pairs like "ETHIDR" / "SOLUSDT" -> Binance; anything else -> let TradingView resolve it.
function resolveSymbol(code, companies) {
  if (code.includes(":")) return code;
  if (companies.some((c) => c.code === code)) return `IDX:${code}`;
  if (/^[A-Z0-9]{2,10}(IDR|USDT|USDC|BTC)$/.test(code)) return `BINANCE:${code}`;
  return code;
}

export default function Charting({ companies = [] }) {
  const containerRef = useRef(null);
  const [symbol, setSymbol] = useState("IDX:COMPOSITE");
  const [input, setInput] = useState("");
  const [height, setHeight] = useState(600);

  // Size the chart to fill the rest of the window below it.
  useEffect(() => {
    let timer;
    function measure() {
      const el = containerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(400, Math.floor(window.innerHeight - top - 12)));
    }
    function onResize() {
      clearTimeout(timer);
      timer = setTimeout(measure, 250);
    }
    measure();
    window.addEventListener("resize", onResize);
    return () => { clearTimeout(timer); window.removeEventListener("resize", onResize); };
  }, []);

  // Load TradingView's chart page directly in an iframe so we control its size.
  const params = new URLSearchParams({
    symbol,
    interval: "D",
    timezone: "Asia/Jakarta",
    theme: "light",
    style: "1",
    locale: "en",
    withdateranges: "1",
    symboledit: "1",
    saveimage: "1",
    hidesidetoolbar: "0",
    details: "1",
    toolbarbg: "f1f3f6",
  });
  const src = `https://s.tradingview.com/widgetembed/?${params.toString()}`;

  function go(e) {
    e.preventDefault();
    const code = input.trim().toUpperCase();
    if (!code) return;
    setSymbol(resolveSymbol(code, companies));
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <form onSubmit={go} className="flex gap-2">
          <input
            list="charting-tickers"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ticker, e.g. BBCA"
            className="w-48 bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-slate-500"
          />
          <datalist id="charting-tickers">
            {companies.slice(0, 1000).map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </datalist>
          <button type="submit" className="text-sm bg-slate-900 text-white px-3 py-1.5 rounded font-medium">Open</button>
        </form>
        <div className="flex flex-wrap gap-1">
          {QUICK.map((q) => (
            <button
              key={q.symbol}
              onClick={() => setSymbol(q.symbol)}
              className={`text-xs px-2.5 py-1 rounded border ${
                symbol === q.symbol ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-stone-300 hover:bg-stone-100"
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>
        <a
          href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-xs text-slate-400 hover:text-slate-600"
        >
          Open in TradingView ↗
        </a>
      </div>
      <div ref={containerRef} className="w-full rounded border border-stone-300 overflow-hidden bg-white" style={{ height }}>
        <iframe
          key={symbol}
          title={`TradingView chart ${symbol}`}
          src={src}
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
          allowFullScreen
        />
      </div>
    </div>
  );
}
