import "dotenv/config";
import { generateMarketSummary } from "./api/_claude.js";

const dummyData = {
  indices: [{ name: "S&P 500", price: 5800, change: -0.8 }],
  currencies: [{ name: "USD/IDR", price: 17700, change: 0.1 }],
  commodities: [{ name: "Gold", price: 2600, change: -1.4 }],
  crypto: [{ name: "Bitcoin", price: 65000, change: 0.7 }]
};

const result = await generateMarketSummary(dummyData, "en");
console.log(result);
