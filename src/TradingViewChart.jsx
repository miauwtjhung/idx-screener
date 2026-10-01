import React, { useEffect, useRef, memo } from "react";

// Simple TradingView mini chart (price line + period change) for an IDX stock.
// `code` is the IDX ticker without suffix, e.g. "BBCA" -> "IDX:BBCA".
function TradingViewChart({ code, height = 220 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !code) return;

    container.innerHTML = '<div class="tradingview-widget-container__widget"></div>';

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: `IDX:${code}`,
      width: "100%",
      height,
      locale: "en",
      dateRange: "12M",
      colorTheme: "light",
      isTransparent: true,
      autosize: false,
      chartOnly: false,
      noTimeScale: false,
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [code, height]);

  return (
    <div>
      <div ref={containerRef} className="tradingview-widget-container w-full" style={{ height }} />
      <div className="flex justify-end mt-1">
        <a
          href={`https://www.tradingview.com/symbols/IDX-${code}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Open {code} on TradingView ↗
        </a>
      </div>
    </div>
  );
}

export default memo(TradingViewChart);
