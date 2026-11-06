// api/_antam.js — shared helper: the Antam gold price per gram, in IDR.
// Used by /api/commodity-quotes and the portfolio summary cron.
//
// Uses the BUYBACK price (what a holder would get selling the bar back),
// which is the fairer value for gold already held.
//
// Sources, tried in order (all via the community logam-mulia-api):
//   1. logammulia  — the official Logam Mulia site, 1 g "Emas Batangan" bar
//   2. anekalogam  — Aneka Logam (Antam dealer), 1 g "LM Antam" bar
// The API answers HTTP 200 even when a source fails, with success:false, so
// that flag is checked too.

const BASE = "https://logam-mulia-api.iamutaki.workers.dev/api/prices";

const SOURCES = [
  {
    name: "logammulia",
    pick: (rows) =>
      rows.find((r) => r.material === "gold" && r.materialType === "Emas Batangan" && r.weight === 1),
  },
  {
    name: "anekalogam",
    // The standard bar ("LM Antam produksi tahun ..."), not the Certicard rows.
    pick: (rows) =>
      rows.find((r) => r.material === "gold" && r.weight === 1 && /^LM Antam/i.test(r.materialType || "")),
  },
];

const valid = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

// Returns { price, source } or throws if no source gave a buyback price.
export async function fetchAntamBuybackPrice() {
  const errors = [];
  for (const source of SOURCES) {
    try {
      const r = await fetch(`${BASE}/${source.name}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (data.success === false) throw new Error(String(data.error || "source failed").slice(0, 120));
      const row = source.pick(data.data || []);
      const price = valid(row?.buybackPrice);
      if (price == null) throw new Error("no 1 g buyback price");
      return { price, source: source.name };
    } catch (err) {
      errors.push(`${source.name}: ${err.message}`);
    }
  }
  throw new Error(`No Antam price available (${errors.join("; ")})`);
}
