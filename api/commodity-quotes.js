// api/commodity-quotes.js
//
// GET /api/commodity-quotes?symbols=XAU,XAG,ANTAM
// XAU/XAG: live spot price in IDR per gram via goldprice.dev
// ANTAM: Antam 1 g bar buyback price per gram via logam-mulia-api (see _antam.js)

import { fetchAntamBuybackPrice } from "./_antam.js";

async function fetchSpotPrice(symbol) {
  const url = `https://api.goldprice.dev/v1/convert?from=${symbol}&to=IDR&amount=1&unit=gram`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`goldprice.dev returned ${r.status} for ${symbol}`);
  const data = await r.json();
  return { ticker: symbol, price: data.result != null ? parseFloat(data.result) : null, chg: null };
}

async function fetchAntamPrice() {
  // Buyback price per gram; falls back across sources (see _antam.js).
  // A failure gives price null so XAU/XAG still load.
  try {
    const { price, source } = await fetchAntamBuybackPrice();
    return { ticker: "ANTAM", price, chg: null, source };
  } catch (err) {
    return { ticker: "ANTAM", price: null, chg: null, error: String(err.message || err) };
  }
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