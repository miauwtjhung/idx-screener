// api/_claude.js — shared helper: calls the Claude API to turn today's
// market snapshot numbers into a short, plain-language narrative.
// Used only by the market-snapshot cron job (once a day), so a direct
// fetch call is simpler here than pulling in the full SDK.

const MODEL = "claude-haiku-4-5-20251001"; // fast + cost-effective, good fit for a daily narration task

export async function generateMarketSummary(snapshotData, lang) {
  const langInstruction =
    lang === "id" ? "Write the summary in Bahasa Indonesia." : "Write the summary in English.";

  const prompt = `You are a market commentator writing a short morning briefing for an Indonesian retail investor audience who also tracks global markets.

Here is today's market snapshot data (JSON), grouped by category. Each entry has a name, the latest price, and the percentage change from the prior close:

${JSON.stringify(snapshotData, null, 2)}

Write a concise market summary (roughly 150–220 words) that:
- Opens with the overall risk sentiment (risk-on/risk-off) based on how the major indices moved
- Highlights the most notable movers across indices, currencies, commodities, and crypto, with a brief plain-language note on why each might matter to an Indonesia-based investor (e.g. oil and USD/IDR strength affecting import costs, US yields affecting risk appetite)
- Gives a short, specific note on the IDX Composite (IHSG) — how it moved and what it's tracking against, if that's inferable from the data
- Ends with one sentence noting this is automated commentary based on price data only, not financial advice

${langInstruction} Write in plain prose — a few natural paragraphs, no markdown headers, no bullet lists.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
// api/_claude.js — shared helper: calls the Claude API to turn today's
// market snapshot numbers into a short, plain-language narrative.
// Used only by the market-snapshot cron job (once a day), so a direct
// fetch call is simpler here than pulling in the full SDK.

const MODEL = "claude-haiku-4-5-20251001"; // fast + cost-effective, good fit for a daily narration task

export async function generateMarketSummary(snapshotData, lang) {
  const langInstruction =
    lang === "id" ? "Write the summary in Bahasa Indonesia." : "Write the summary in English.";

  const prompt = `You are a market commentator writing a short morning briefing for an Indonesian retail investor audience who also tracks global markets.

Here is today's market snapshot data (JSON), grouped by category. Each entry has a name, the latest price, and the percentage change from the prior close:

${JSON.stringify(snapshotData, null, 2)}

Write a concise market summary (roughly 150–220 words) that:
- Opens with the overall risk sentiment (risk-on/risk-off) based on how the major indices moved
- Highlights the most notable movers across indices, currencies, commodities, and crypto, with a brief plain-language note on why each might matter to an Indonesia-based investor (e.g. oil and USD/IDR strength affecting import costs, US yields affecting risk appetite)
- Gives a short, specific note on the IDX Composite (IHSG) — how it moved and what it's tracking against, if that's inferable from the data
- Ends with one sentence noting this is automated commentary based on price data only, not financial advice

${langInstruction} Write in plain prose only — a few natural paragraphs. Do not use markdown formatting of any kind: no headers (no "#" or "##"), no bold ("**"), no bullet points or numbered lists. Just plain sentences and paragraphs, as if for a plain-text email.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
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
  // instruction above — strip header markers and bold asterisks.
  const cleaned = text
    .replace(/^#{1,6}\s*.*\n+/, "") // drop a leading "# Heading" line, if any
    .replace(/\*\*(.*?)\*\*/g, "$1") // unwrap any remaining bold markers
    .trim();

  return cleaned;
}      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
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

  return text;
}
