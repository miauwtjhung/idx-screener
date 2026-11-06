// About tab: what Maxtrade is, what each tab does, contact and disclaimer.
// Opened from the "About" tab or by clicking the logo.

const FEATURES = [
  ["Market Snapshot", "Live IHSG chart, global indices, currencies, commodities and crypto, plus a daily pre-opening commentary."],
  ["AI Analysis", "An AI-written view on a single stock, built from its price history, fundamentals and recent news."],
  ["Screener", "Browse and filter all companies listed on the IDX, with live prices."],
  ["Fundamentals", "Ready-made rankings by valuation, profitability and dividends, filtered by company size or sector."],
  ["Charting", "Interactive price charts for IDX stocks."],
  [
    "Portfolio",
    "Track your stocks, crypto, gold, bonds and cash, with a daily AI summary after market close (sign-in required).",
  ],
];

export default function About() {
  return (
    <div className="min-h-screen bg-stone-100 text-slate-900 font-sans">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">About Maxtrade</h1>
        <p className="text-sm text-slate-500 mb-6">Market data, screening and AI insights for the Indonesian capital market.</p>

        <section className="bg-white border border-stone-300 rounded p-5 mb-6">
          <p className="text-sm text-slate-700 leading-relaxed">
            Maxtrade brings together live market data, stock screening, fundamentals, charting and AI-assisted analysis
            for stocks listed on the Indonesia Stock Exchange (IDX), in one simple web app.
          </p>
        </section>

        <section className="bg-white border border-stone-300 rounded p-5 mb-6">
          <h2 className="text-base font-semibold text-slate-800 mb-3">What you can do here</h2>
          <ul className="divide-y divide-stone-100">
            {FEATURES.map(([title, text]) => (
              <li key={title} className="py-2.5">
                <div className="text-sm font-medium text-slate-800">{title}</div>
                <div className="text-sm text-slate-600 leading-relaxed">{text}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white border border-stone-300 rounded p-5 mb-6">
          <h2 className="text-base font-semibold text-slate-800 mb-2">Contact</h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            For information regarding this work, please contact{" "}
            <a href="mailto:info@uniqqon.com" className="text-red-600 font-medium hover:underline">
              info@uniqqon.com
            </a>
            .
          </p>
        </section>

        <section className="border border-stone-300 rounded p-5 bg-stone-50">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Disclaimer</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Information on Maxtrade is provided for general information only and is not financial advice. Market data and
            news come from third-party sources and may be delayed or inaccurate, and AI-written content can be wrong. Do
            your own research or consult a licensed financial advisor before making investment decisions. Maxtrade is not
            affiliated with the Indonesia Stock Exchange (IDX).
          </p>
        </section>
      </div>
    </div>
  );
}
