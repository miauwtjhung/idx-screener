// api/_claude.js â€” shared helper: calls the Claude API to turn today's
// market snapshot numbers into a short, plain-language narrative.
// Used only by the market-snapshot cron job (once a day), so a direct
// fetch call is simpler here than pulling in the full SDK.

const MODEL = "claude-haiku-4-5-20251001"; // fast + cost-effective, good fit for a daily narration task

async function callClaude(prompt, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Defensive cleanup in case the model still slips in markdown despite the
  // instruction above â€” strip header markers and bold asterisks.
  const cleaned = text
    .replace(/^#{1,6}\s*.*\n+/, "") // drop a leading "# Heading" line, if any
    .replace(/\*\*(.*?)\*\*/g, "$1") // unwrap any remaining bold markers
    .trim();

  return cleaned;
}

export async function generateMarketSummary(snapshotData, lang) {
  const langInstruction =
    lang === "id" ? "Write the summary in Bahasa Indonesia." : "Write the summary in English.";

  const prompt = `You are a market commentator writing a short morning briefing for an Indonesian retail investor audience who also tracks global markets.

Here is today's market snapshot data (JSON), grouped by category. Each entry has a name, the latest price, and the percentage change from the prior close:

${JSON.stringify(snapshotData, null, 2)}

Write a concise market summary (roughly 150â€“220 words) that:
- Begins with the exact line "MARKET PRE-OPENING: " followed by a short 4-8 word characterization of the session, then a blank line, then continues with the paragraphs below
- Opens with the overall risk sentiment (risk-on/risk-off) based on how the major indices moved
- Highlights the most notable movers across indices, currencies, commodities, and crypto, with a brief plain-language note on why each might matter to an Indonesia-based investor (e.g. oil and USD/IDR strength affecting import costs, US yields affecting risk appetite)
- Gives a short, specific note on the IDX Composite (IHSG) â€” how it moved and what it's tracking against, if that's inferable from the data
- Ends with one sentence noting this is automated commentary based on price data only, not financial advice

${langInstruction} Write in plain prose only â€” a few natural paragraphs. Do not use markdown formatting of any kind: no headers (no "#" or "##"), no bold ("**"), no bullet points or numbered lists. Just plain sentences and paragraphs, as if for a plain-text email.`;

  return callClaude(prompt, 700);
}

// Rupiah amounts are turned into words here, in code, so the model never has
// to judge the magnitude of a long raw number itself (it was reading
// 6,525,612,314 as "trillion" and 49,180,000 as "billion").
const IDR_UNITS = [
  [1e12, "trillion", "triliun"],
  [1e9, "billion", "miliar"],
  [1e6, "million", "juta"],
  [1e3, "thousand", "ribu"],
];

export function formatIdr(value, lang, withSign) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : withSign && n > 0 ? "+" : "";
  for (const [size, en, id] of IDR_UNITS) {
    const scaled = Math.round((abs / size) * 100) / 100;
    if (scaled >= 1) return `${sign}IDR ${scaled.toFixed(2)} ${lang === "id" ? id : en}`;
  }
  return `${sign}IDR ${Math.round(abs)}`;
}

// Does all the arithmetic (change, percentage, ranking of asset classes) in
// code and returns ready-to-quote figures for the prompt.
export function buildPortfolioFacts(portfolioData, lang) {
  const classes = [
    ["stocks", "stockValue"],
    ["crypto", "cryptoValue"],
    ["commodities", "commodityValue"],
    ["bonds", "bondValue"],
    ["cash and deposits", "cashValue"],
  ];
  const today = portfolioData.today || {};
  const yesterday = portfolioData.yesterday || null;
  const num = (v) => Number(v) || 0;

  const netToday = num(today.netWorth);
  const facts = {
    portfolioName: portfolioData.portfolioName,
    netWorthToday: formatIdr(netToday, lang),
  };

  if (!yesterday) {
    facts.hasPreviousSnapshot = false;
    facts.assetClasses = classes
      .map(([name, key]) => ({ name, valueToday: formatIdr(num(today[key]), lang), raw: num(today[key]) }))
      .sort((a, b) => b.raw - a.raw)
      .map(({ raw, ...rest }) => rest);
    return facts;
  }

  const netYesterday = num(yesterday.netWorth);
  const change = netToday - netYesterday;
  facts.hasPreviousSnapshot = true;
  facts.netWorthYesterday = formatIdr(netYesterday, lang);
  facts.netWorthChange = formatIdr(change, lang, true);
  facts.netWorthChangePercent =
    netYesterday !== 0 ? `${change > 0 ? "+" : ""}${((change / netYesterday) * 100).toFixed(2)}%` : "n/a";
  facts.direction = Math.round(change) > 0 ? "up" : Math.round(change) < 0 ? "down" : "unchanged";

  const rows = classes
    .map(([name, key]) => {
      const t = num(today[key]);
      const y = num(yesterday[key]);
      return {
        name,
        valueToday: formatIdr(t, lang),
        valueYesterday: formatIdr(y, lang),
        change: Math.round(t - y) === 0 ? "unchanged" : formatIdr(t - y, lang, true),
        raw: t - y,
      };
    })
    .sort((a, b) => Math.abs(b.raw) - Math.abs(a.raw));

  facts.biggestDriver = Math.round(rows[0].raw) === 0 ? "none" : rows[0].name;
  facts.assetClasses = rows.map(({ raw, ...rest }) => rest);
  return facts;
}

export async function generatePortfolioSummary(portfolioData, lang) {
  const langInstruction =
    lang === "id" ? "Write the summary in Bahasa Indonesia." : "Write the summary in English.";

  const facts = buildPortfolioFacts(portfolioData, lang);

  const prompt = `You are a portfolio analyst writing a short daily wrap-up for a retail investor in Indonesia, right after market close.

Here are today's portfolio figures (JSON). Every amount, change and percentage has already been calculated and written out in words (for example "IDR 6.53 billion" or "+IDR 49.18 million"). The assetClasses list is sorted from the largest change to the smallest, and biggestDriver names the asset class that moved the most.

${JSON.stringify(facts, null, 2)}

Write a concise summary (roughly 80-120 words) that:
- States clearly whether net worth went up or down today, by how much (amount and percentage) versus yesterday. If hasPreviousSnapshot is false, there is nothing to compare against: say so and just describe today's net worth and its breakdown
- Names which asset class(es) drove that change the most, following the order given in assetClasses
- Notes anything else worth flagging (e.g. one asset class down while another offsets it)
- Stays purely descriptive of the numbers given - no forward-looking advice or recommendations

Use the figures exactly as they are written above. Copy each amount with its unit word (thousand, million, billion, trillion) unchanged: do not convert between units, do not recalculate, and do not introduce any number that is not in the data.

${langInstruction} Write in plain prose only - one or two natural paragraphs. Do not use markdown formatting of any kind: no headers, no bold, no bullet points. Just plain sentences.`;

  return callClaude(prompt, 400);
}

export async function generateMarketCloseSummary(snapshotData, lang) {
  const langInstruction =
    lang === "id" ? "Write the summary in Bahasa Indonesia." : "Write the summary in English.";

  const prompt = `You are a market commentator writing a short end-of-day recap for an Indonesian retail investor audience who also tracks global markets, published shortly after the Indonesia Stock Exchange (IDX) closes at 17:00 WIB.

Here is today's closing market data (JSON), grouped by category. Each entry has a name, the latest price, and the percentage change from the prior close:

${JSON.stringify(snapshotData, null, 2)}

Write a concise market close recap (roughly 150-220 words) that:
- Begins with the exact line "MARKET CLOSING: " followed by a short 4-8 word characterization of how the session ended, then a blank line, then continues with the paragraphs below
- Opens with how the overall session played out (risk-on/risk-off) based on how the major indices closed
- Highlights the most notable movers across indices, currencies, commodities, and crypto, with a brief plain-language note on why each might matter to an Indonesia-based investor
- Gives a short, specific note on how the IDX Composite (IHSG) closed today and what drove it, if that's inferable from the data
- Ends with one sentence noting this is automated commentary based on price data only, not financial advice

${langInstruction} Write in plain prose only - a few natural paragraphs. Do not use markdown formatting of any kind: no headers (no "#" or "##"), no bold ("**"), no bullet points or numbered lists. Just plain sentences and paragraphs, as if for a plain-text email.`;

  return callClaude(prompt, 700);
}
