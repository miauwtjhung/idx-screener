// analysisText.js — English and Bahasa Indonesia text and number formats for
// the AI Analysis tab.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const LANGS = [
  { id: "en", label: "EN" },
  { id: "id", label: "ID" },
];

// Remembered per browser; falls back to the browser's language.
export function initialLang() {
  try {
    const saved = localStorage.getItem("analysisLang");
    if (saved === "en" || saved === "id") return saved;
  } catch {
    // storage unavailable (private window); fall through
  }
  return (navigator.language || "").toLowerCase().startsWith("id") ? "id" : "en";
}

export function saveLang(lang) {
  try {
    localStorage.setItem("analysisLang", lang);
  } catch {
    // not saved; the switch still works for this visit
  }
}

// Number and date formats for the chosen language. Share prices always use
// the rupiah style (Rp 6.075) in both languages, as elsewhere in the app.
export function makeFormat(lang) {
  const loc = lang === "id" ? "id-ID" : "en-GB";
  const units = lang === "id"
    ? [[1e12, " T"], [1e9, " M"], [1e6, " jt"]] // triliun, miliar, juta
    : [[1e12, "T"], [1e9, "B"], [1e6, "M"]];
  const num = (v, d = 1) =>
    isNum(v) ? v.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

  return {
    num,
    int: (v) => (isNum(v) ? Math.round(v).toLocaleString(loc) : "—"),
    money(v, currency = "IDR") {
      if (!isNum(v)) return "—";
      const prefix = currency === "IDR" ? "Rp" : currency === "USD" ? "US$" : currency;
      const a = Math.abs(v);
      const sign = v < 0 ? "-" : "";
      for (const [size, unit] of units) {
        if (a >= size) return `${sign}${prefix} ${num(a / size, 1)}${unit}`;
      }
      return `${sign}${prefix} ${a.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
    },
    price: (v) => (isNum(v) ? `Rp ${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })}` : "—"),
    frac: (v, d = 1) => (isNum(v) ? `${num(v * 100, d)}%` : "—"), // ratios such as 0.213
    pct: (v, d = 1) => (isNum(v) ? `${num(v, d)}%` : "—"), // values already in %
    signed(v, d = 1) {
      if (!isNum(v)) return "—";
      if (Number(v.toFixed(d)) === 0) return `${num(0, d)}%`;
      return `${v > 0 ? "+" : ""}${num(v, d)}%`;
    },
    date: (d) =>
      d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" }) : "—",
    dateTime: (d) =>
      d ? new Date(d).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—",
  };
}

export const TEXT = {
  en: {
    title: "AI Analysis",
    intro: "Search one stock to see its fundamentals, dividend record, corporate actions, price trend, analyst view and news, with an AI short-term and long-term view.",
    searchPlaceholder: "Ticker or company, e.g. BBCA",
    tickerLabel: "Ticker",
    analyse: "Analyse",
    language: "Language",
    badInput: "Enter an IDX ticker such as BBCA, or part of a company name",
    gathering: (code) => `Gathering data for ${code}… this takes a few seconds.`,
    board: (b) => `${b} board`,
    marketCap: "Market cap",

    // AI view
    aiView: "AI view",
    views: { Buy: "Buy", Hold: "Hold", Sell: "Sell", Neutral: "Neutral" },
    confidence: { Low: "Low confidence", Medium: "Medium confidence", High: "High confidence" },
    shortTerm: "Short term",
    shortHorizon: "Next 1 to 3 months",
    longTerm: "Long term",
    longHorizon: "Next 1 to 3 years",
    newsAbout: "What the news is about",
    keyRisks: "Key risks",
    checkingSignIn: "Checking sign-in…",
    signInPrompt: (code) => `Sign in to see the AI short-term and long-term view for ${code}.`,
    signIn: "Sign in",
    writing: "Writing the AI view from the figures below…",
    aiError: (e) => `Couldn't get the AI view: ${e}`,
    writtenAt: (t) => `Written by AI on ${t} from the figures and headlines on this page.`,
    aiLegend: "Buy: evidence clearly favours adding. Hold: worth keeping if you own it, no strong case to add. Sell: evidence favours reducing. Neutral: mixed or too little data. This is an automated opinion from public data, can be wrong, and is not financial advice.",

    // Fundamentals
    valuation: "Valuation",
    peTrailing: "P/E (trailing)",
    peForward: "P/E (forward)",
    pbv: "Price to book",
    pbvConverted: "Book value converted from US dollars",
    evEbitda: "EV / EBITDA",
    eps12m: "EPS (12 months)",
    bvps: "Book value / share",
    profitGrowth: "Profitability and growth",
    roe: "Return on equity",
    roa: "Return on assets",
    netMargin: "Net margin",
    opMargin: "Operating margin",
    revGrowth: "Revenue growth",
    earnGrowth: "Earnings growth",
    yoyHint: "Latest quarter vs a year earlier",
    balance: "Balance sheet and cash",
    reportedIn: (c) => `Reported in ${c}.`,
    debtEquity: "Debt to equity",
    currentRatio: "Current ratio",
    totalCash: "Total cash",
    totalDebt: "Total debt",
    opCashFlow: "Operating cash flow",
    freeCashFlow: "Free cash flow",
    usdNote: (code, rate) => `${code} reports in US dollars. Book value is converted at Rp ${rate} per USD; cash and debt figures are shown in US dollars.`,

    // Annual results
    annual: "Annual results",
    annualNote: "From the yearly financial statements. Banks report revenue differently from other companies.",
    year: "Year",
    revenue: "Revenue",
    netIncome: "Net income",
    epsDiluted: "EPS (diluted)",
    equity: "Shareholders' equity",
    totalDebtRow: "Total debt",

    // Dividends
    dividends: "Dividend history",
    dividendsNote: "Per share, by the year the stock went ex-dividend. Yield uses the year-end price (today's price for the current year).",
    paid12m: "Paid in the last 12 months",
    yield12m: "Yield, last 12 months",
    avgYield5y: "5-year average yield",
    payoutRatio: "Payout ratio",
    payoutHint: "Share of profit paid out as dividends",
    noDividends: "No dividend payments found in the last 10 years.",
    toDate: "to date",
    payments: (n) => `${n} payment${n === 1 ? "" : "s"}`,
    showPayments: (n) => `Show all ${n} payments`,
    hidePayments: "Hide individual payments",
    exDate: "Ex-dividend date",
    amountPerShare: "Amount per share",

    // Corporate actions
    corporate: "Corporate actions and events",
    corporateNote: "Covers earnings dates, dividends and stock splits. Rights issues, buybacks and shareholder meetings are not in this data source; check IDX announcements for those.",
    nextEarnings: "Next earnings report",
    notAnnounced: "Not announced",
    or: " or ",
    lastExDate: "Latest ex-dividend date",
    payDate: "Dividend payment date",
    lastDividend: "Latest dividend",
    lastDividendValue: (amount, date) => `${amount} per share (ex ${date})`,
    splits: "Stock splits",
    splitOn: (ratio, date) => `${ratio} on ${date}`,
    noSplits: "None in the last 10 years",

    // Price trend
    trend: "Price trend",
    trendNote: "Moving averages and RSI from the last year of daily closes. RSI above 70 is often read as overbought, below 30 as oversold.",
    noTrend: "Not enough daily price history.",
    vsMa: (n) => `vs ${n}-day average`,
    maHint: (n, v) => `${n}-day average ${v}`,
    rsi: "RSI (14 days)",
    rsiZone: { over: "overbought zone", under: "oversold zone", neutral: "neutral zone" },
    m1: "1 month",
    m3: "3 months",
    m6: "6 months",
    y1: "1 year",
    volRatio: "Volume vs 3-month average",
    low52: (v) => `52-week low ${v}`,
    high52: (v) => `high ${v}`,

    // Analysts
    analysts: "Analyst view",
    analystsNote: "Brokers' published ratings and 12-month targets, as collected by Yahoo Finance.",
    noAnalysts: "No analyst coverage in this data source.",
    consensus: "Consensus",
    analystCount: "Analysts",
    avgTarget: "Average target",
    targetVsPrice: "Target vs price",
    targetRange: "Target range",
    ratings: { strongBuy: "Strong buy", buy: "Buy", hold: "Hold", sell: "Sell", strongSell: "Strong sell" },
    consensusKey: { strong_buy: "Strong buy", buy: "Buy", hold: "Hold", underperform: "Underperform", sell: "Sell" },

    // News, profile, footer
    news: "News and talk",
    newsNote: "Headlines from Google News (Indonesian sources, last 30 days) and Yahoo Finance. Headlines can include rumours and opinion; they are not verified.",
    noNews: "No recent headlines found.",
    about: "About the company",
    readMore: "Read more",
    showLess: "Show less",
    employees: (n) => `${n} employees`,
    footer: (t) => `Data via Yahoo Finance (unofficial, delayed) and Google News, gathered ${t}.`,
    unavailable: (list) => ` Not available this time: ${list}.`,
    notAdvice: " Nothing on this page is financial advice.",
    sources: { quote: "price", fundamentals: "fundamentals", annualFinancials: "annual results", dividendsAndSplits: "dividends and splits", dailyPrices: "daily prices", googleNews: "Google News", yahooNews: "Yahoo news" },
  },

  id: {
    title: "Analisis AI",
    intro: "Cari satu saham untuk melihat fundamental, riwayat dividen, aksi korporasi, tren harga, pandangan analis dan berita, beserta pandangan AI jangka pendek dan jangka panjang.",
    searchPlaceholder: "Kode atau nama emiten, mis. BBCA",
    tickerLabel: "Kode saham",
    analyse: "Analisis",
    language: "Bahasa",
    badInput: "Masukkan kode saham BEI seperti BBCA, atau sebagian nama perusahaan",
    gathering: (code) => `Mengumpulkan data ${code}… perlu beberapa detik.`,
    board: (b) => `Papan ${b}`,
    marketCap: "Kapitalisasi pasar",

    aiView: "Pandangan AI",
    views: { Buy: "Beli", Hold: "Tahan", Sell: "Jual", Neutral: "Netral" },
    confidence: { Low: "Keyakinan rendah", Medium: "Keyakinan sedang", High: "Keyakinan tinggi" },
    shortTerm: "Jangka pendek",
    shortHorizon: "1 sampai 3 bulan ke depan",
    longTerm: "Jangka panjang",
    longHorizon: "1 sampai 3 tahun ke depan",
    newsAbout: "Isi berita terkini",
    keyRisks: "Risiko utama",
    checkingSignIn: "Memeriksa status masuk…",
    signInPrompt: (code) => `Masuk untuk melihat pandangan AI jangka pendek dan jangka panjang untuk ${code}.`,
    signIn: "Masuk",
    writing: "AI sedang menyusun pandangan dari angka-angka di bawah…",
    aiError: (e) => `Pandangan AI tidak dapat dimuat: ${e}`,
    writtenAt: (t) => `Ditulis oleh AI pada ${t} berdasarkan angka dan judul berita di halaman ini.`,
    aiLegend: "Beli: data jelas mendukung penambahan posisi. Tahan: layak dipertahankan jika sudah memiliki, tetapi belum ada alasan kuat untuk menambah. Jual: data mendukung pengurangan posisi. Netral: data beragam atau kurang lengkap. Ini adalah opini otomatis dari data publik, bisa keliru, dan bukan saran investasi.",

    valuation: "Valuasi",
    peTrailing: "PER (12 bulan terakhir)",
    peForward: "PER (perkiraan)",
    pbv: "PBV",
    pbvConverted: "Nilai buku dikonversi dari dolar AS",
    evEbitda: "EV / EBITDA",
    eps12m: "EPS (12 bulan)",
    bvps: "Nilai buku per saham",
    profitGrowth: "Profitabilitas dan pertumbuhan",
    roe: "ROE (imbal hasil ekuitas)",
    roa: "ROA (imbal hasil aset)",
    netMargin: "Margin laba bersih",
    opMargin: "Margin operasi",
    revGrowth: "Pertumbuhan pendapatan",
    earnGrowth: "Pertumbuhan laba",
    yoyHint: "Kuartal terakhir dibanding setahun sebelumnya",
    balance: "Neraca dan kas",
    reportedIn: (c) => `Dilaporkan dalam ${c}.`,
    debtEquity: "Rasio utang terhadap ekuitas",
    currentRatio: "Rasio lancar",
    totalCash: "Total kas",
    totalDebt: "Total utang",
    opCashFlow: "Arus kas operasi",
    freeCashFlow: "Arus kas bebas",
    usdNote: (code, rate) => `${code} melaporkan keuangan dalam dolar AS. Nilai buku dikonversi dengan kurs Rp ${rate} per USD; angka kas dan utang ditampilkan dalam dolar AS.`,

    annual: "Kinerja tahunan",
    annualNote: "Dari laporan keuangan tahunan. Bank melaporkan pendapatan dengan cara berbeda dari perusahaan lain.",
    year: "Tahun",
    revenue: "Pendapatan",
    netIncome: "Laba bersih",
    epsDiluted: "EPS (dilusian)",
    equity: "Ekuitas pemegang saham",
    totalDebtRow: "Total utang",

    dividends: "Riwayat dividen",
    dividendsNote: "Per saham, menurut tahun tanggal ex-dividen. Imbal hasil memakai harga akhir tahun (harga hari ini untuk tahun berjalan).",
    paid12m: "Dibagikan 12 bulan terakhir",
    yield12m: "Imbal hasil 12 bulan terakhir",
    avgYield5y: "Rata-rata imbal hasil 5 tahun",
    payoutRatio: "Rasio pembayaran dividen",
    payoutHint: "Porsi laba yang dibagikan sebagai dividen",
    noDividends: "Tidak ada pembagian dividen dalam 10 tahun terakhir.",
    toDate: "sejauh ini",
    payments: (n) => `${n} kali`,
    showPayments: (n) => `Lihat semua ${n} pembagian`,
    hidePayments: "Sembunyikan rincian pembagian",
    exDate: "Tanggal ex-dividen",
    amountPerShare: "Jumlah per saham",

    corporate: "Aksi korporasi dan agenda",
    corporateNote: "Mencakup tanggal laporan keuangan, dividen dan pemecahan saham. Rights issue, buyback dan RUPS tidak tersedia di sumber data ini; periksa keterbukaan informasi BEI.",
    nextEarnings: "Laporan keuangan berikutnya",
    notAnnounced: "Belum diumumkan",
    or: " atau ",
    lastExDate: "Tanggal ex-dividen terakhir",
    payDate: "Tanggal pembayaran dividen",
    lastDividend: "Dividen terakhir",
    lastDividendValue: (amount, date) => `${amount} per saham (ex ${date})`,
    splits: "Pemecahan saham",
    splitOn: (ratio, date) => `${ratio} pada ${date}`,
    noSplits: "Tidak ada dalam 10 tahun terakhir",

    trend: "Tren harga",
    trendNote: "Rata-rata bergerak dan RSI dari harga penutupan harian setahun terakhir. RSI di atas 70 sering dianggap jenuh beli, di bawah 30 jenuh jual.",
    noTrend: "Riwayat harga harian belum cukup.",
    vsMa: (n) => `vs rata-rata ${n} hari`,
    maHint: (n, v) => `Rata-rata ${n} hari ${v}`,
    rsi: "RSI (14 hari)",
    rsiZone: { over: "zona jenuh beli", under: "zona jenuh jual", neutral: "zona netral" },
    m1: "1 bulan",
    m3: "3 bulan",
    m6: "6 bulan",
    y1: "1 tahun",
    volRatio: "Volume vs rata-rata 3 bulan",
    low52: (v) => `Terendah 52 minggu ${v}`,
    high52: (v) => `tertinggi ${v}`,

    analysts: "Pandangan analis",
    analystsNote: "Rekomendasi dan target harga 12 bulan dari sekuritas, dihimpun oleh Yahoo Finance.",
    noAnalysts: "Tidak ada liputan analis di sumber data ini.",
    consensus: "Konsensus",
    analystCount: "Jumlah analis",
    avgTarget: "Rata-rata target",
    targetVsPrice: "Target vs harga",
    targetRange: "Rentang target",
    ratings: { strongBuy: "Beli kuat", buy: "Beli", hold: "Tahan", sell: "Jual", strongSell: "Jual kuat" },
    consensusKey: { strong_buy: "Beli kuat", buy: "Beli", hold: "Tahan", underperform: "Di bawah pasar", sell: "Jual" },

    news: "Berita dan rumor",
    newsNote: "Judul berita dari Google News (sumber Indonesia, 30 hari terakhir) dan Yahoo Finance. Judul bisa berisi rumor dan opini; belum terverifikasi.",
    noNews: "Tidak ada berita terkini.",
    about: "Tentang perusahaan",
    readMore: "Selengkapnya",
    showLess: "Ringkas",
    employees: (n) => `${n} karyawan`,
    footer: (t) => `Data dari Yahoo Finance (tidak resmi, tertunda) dan Google News, diambil ${t}.`,
    unavailable: (list) => ` Tidak tersedia kali ini: ${list}.`,
    notAdvice: " Tidak ada isi halaman ini yang merupakan saran investasi.",
    sources: { quote: "harga", fundamentals: "fundamental", annualFinancials: "kinerja tahunan", dividendsAndSplits: "dividen dan pemecahan saham", dailyPrices: "harga harian", googleNews: "Google News", yahooNews: "berita Yahoo" },
  },
};
