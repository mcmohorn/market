import { pool, initDB } from "./db";
import type { StockBar } from "../shared/types";

const TIINGO_TOKEN = process.env.TIINGO_API_TOKEN || "";

const cryptoSymbols = [
  "btcusd", "ethusd", "bnbusd", "xrpusd", "adausd", "dogeusd",
  "solusd", "dotusd", "maticusd", "ltcusd", "linkusd", "avaxusd",
  "uniusd", "atomusd", "xlmusd", "nearusd", "algousd", "ftmusd",
];

async function main() {
  await initDB();
  const client = await pool.connect();
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = "2016-01-01";

  console.log("Extending crypto data from " + startDate + " to " + endDate);

  for (const sym of cryptoSymbols) {
    const displaySymbol = sym.replace("usd", "").toUpperCase();
    try {
      const url = `https://api.tiingo.com/tiingo/crypto/prices?tickers=${sym}&startDate=${startDate}&endDate=${endDate}&resampleFreq=1day&token=${TIINGO_TOKEN}`;
      const res = await fetch(url);
      if (!res.ok) { console.log(`${sym}: error ${res.status}`); continue; }
      const data = await res.json();
      if (!data?.length || !data[0].priceData) { console.log(`${sym}: no data`); continue; }

      const bars = data[0].priceData;

      await client.query(
        `INSERT INTO stocks (symbol, name, exchange, asset_type) VALUES ($1, $2, $3, $4)
         ON CONFLICT (symbol, asset_type) DO UPDATE SET name = $2, exchange = $3`,
        [displaySymbol, displaySymbol, "CRYPTO", "crypto"]
      );

      const batchSize = 500;
      for (let i = 0; i < bars.length; i += batchSize) {
        const batch = bars.slice(i, i + batchSize);
        const params: any[] = [];
        const placeholders: string[] = [];
        let idx = 1;
        for (const bar of batch) {
          placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
          params.push(displaySymbol, bar.date.split("T")[0], bar.open, bar.high, bar.low, bar.close, Math.round(bar.volumeNotional || 0), "crypto");
        }
        await client.query(
          `INSERT INTO price_history (symbol, date, open, high, low, close, volume, asset_type)
           VALUES ${placeholders.join(",")}
           ON CONFLICT (symbol, date, asset_type) DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume`,
          params
        );
      }

      console.log(`${displaySymbol}: ${bars.length} bars (${bars[0].date.split("T")[0]} to ${bars[bars.length - 1].date.split("T")[0]})`);
      await new Promise(r => setTimeout(r, 300));
    } catch (err: any) {
      console.log(`${sym}: ${err.message}`);
    }
  }

  client.release();
  await pool.end();
  console.log("Crypto extension done");
}

main().catch(e => { console.error(e); process.exit(1); });
