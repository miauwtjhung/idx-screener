// api/commodity-quotes.js
//
// GET /api/commodity-quotes?symbols=XAU,XAG,ANTAM
// XAU/XAG: live spot price in IDR per gram via goldprice.dev
// ANTAM: official Logam Mulia (Antam) sell price per gram via logam-mulia-api

async function fetchSpotPrice(symbol) {
  const url = `https://api.goldprice.dev/v1/convert?from=${symbol}&to=IDR&amount=1&unit=gram`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`goldprice.dev returned ${r.status} for ${symbol}`);
  const data = await r.json();
  return { ticker: symbol, price: data.result != null ? parseFloat(data.result) : null, chg: null };
}

async function fetchAntamPrice() {
  const url = "https://logam-mulia-api.iamutaki.workers.dev/api/prices/logammulia";
  const r = await fetch(url);
  if (!r.ok) throw new Error(`logam-mulia-api returned ${r.status}`);
  const data = await r.json();
  // The standard 1-gram "Emas Batangan" bar is the reference Antam price.
  const oneGram = (data.data || []).find(
    (row) => row.material === "gold" && row.materialType === "Emas Batangan" && row.weight === 1
  );
  return { ticker: "ANTAM", price: oneGram ? oneGram.sellPrice : null, chg: null };
}

export default async function handler(req, res) {
  const symbolsParam = req.query.symbols;
  if (!symbolsParam) return res.status(400).json({ error: "symbols is required" });

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s === "XAU" || s === "XAG" || s === "ANTAM");

  if (symbols.length === 0) return res.status(400).json({ error: "No valid symbols provided (use XAU, XAG, or ANTAM)" });

  try {
    const quotes = await Promise.all(
      symbols.map((symbol) => (symbol === "ANTAM" ? fetchAntamPrice() : fetchSpotPrice(symbol)))
    );
    return res.status(200).json({ quotes });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch commodity prices", detail: String(err) });
  }
}