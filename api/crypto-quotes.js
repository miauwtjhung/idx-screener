// api/crypto-quotes.js
//
// GET /api/crypto-quotes?ids=bitcoin,ethereum -> live prices in IDR via CoinGecko

export default async function handler(req, res) {
  const idsParam = req.query.ids;
  if (!idsParam) return res.status(400).json({ error: "ids is required" });

  const ids = idsParam
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);

  if (ids.length === 0) return res.status(400).json({ error: "No valid ids provided" });

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
      ids.join(",")
    )}&vs_currencies=idr&include_24hr_change=true`;

    const cgRes = await fetch(url);
    if (!cgRes.ok) throw new Error(`CoinGecko returned ${cgRes.status}`);
    const data = await cgRes.json();

    const quotes = ids
      .filter((id) => data[id])
      .map((id) => ({
        ticker: id.toUpperCase(),
        price: data[id].idr ?? null,
        chg: data[id].idr_24h_change ?? null,
      }));

    return res.status(200).json({ quotes });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch crypto prices", detail: String(err) });
  }
}