import { pool, initDB } from "./db";
import type { StockBar } from "../shared/types";

const ALPACA_KEY = process.env.ALPACA_API_KEY_ID || "";
const ALPACA_SECRET = process.env.ALPACA_API_KEY_SECRET || "";
const ALPACA_DATA_URL = "https://data.alpaca.markets/v2";
const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets/v2";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAndStore(pgClient: any, symbols: string[], startDate: string, endDate: string): Promise<number> {
  let pageToken: string | null = null;
  let stored = 0;

  do {
    const url = new URL(`${ALPACA_DATA_URL}/stocks/bars`);
    url.searchParams.set("symbols", symbols.join(","));
    url.searchParams.set("timeframe", "1Day");
    url.searchParams.set("start", startDate);
    url.searchParams.set("end", endDate);
    url.searchParams.set("limit", "10000");
    url.searchParams.set("adjustment", "split");
    url.searchParams.set("feed", "iex");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const res = await fetch(url.toString(), {
      headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      if (res.status === 429) { await sleep(5000); continue; }
      break;
    }

    const data = await res.json();
    if (data.bars) {
      for (const [sym, rawBars] of Object.entries(data.bars as Record<string, any[]>)) {
        if (rawBars.length === 0) continue;

        const params: any[] = [];
        const ph: string[] = [];
        let idx = 1;
        for (const b of rawBars) {
          ph.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`);
          params.push(sym, b.t.split("T")[0], b.o, b.h, b.l, b.c, Math.round(b.v), "stock");
        }
        await pgClient.query(
          `INSERT INTO price_history (symbol,date,open,high,low,close,volume,asset_type) VALUES ${ph.join(",")}
           ON CONFLICT (symbol,date,asset_type) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume`,
          params
        );
        stored++;
      }
    }
    pageToken = data.next_page_token || null;
  } while (pageToken);

  return stored;
}

async function main() {
  const startYear = parseInt(process.env.START_YEAR || "2021");
  const endYear = parseInt(process.env.END_YEAR || String(startYear));
  const offset = parseInt(process.env.OFFSET || "0");
  const limit = parseInt(process.env.LIMIT || "3000");

  console.log(`=== Stock Extension (PostgreSQL): ${startYear}-${endYear}, offset=${offset}, limit=${limit} ===`);

  await initDB();
  const client = await pool.connect();

  try {
    const assetsRes = await fetch(`${ALPACA_PAPER_URL}/assets?status=active&asset_class=us_equity`, {
      headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET },
    });
    const allAssets: any[] = await assetsRes.json();
    const assets = allAssets.filter((a: any) => a.tradable && ["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS"].includes(a.exchange));

    for (const a of assets) {
      await client.query(
        `INSERT INTO stocks (symbol,name,exchange,asset_type) VALUES ($1,$2,$3,$4)
         ON CONFLICT (symbol,asset_type) DO UPDATE SET name=$2,exchange=$3`,
        [a.symbol, a.name, a.exchange, "stock"]
      );
    }

    const symbols = assets.map((a: any) => a.symbol).slice(offset, offset + limit);
    console.log(`Total assets: ${assets.length}, Processing: ${symbols.length} (${offset} to ${offset + limit})`);

    const batchSize = 30;

    for (let year = startYear; year <= endYear; year++) {
      const yearStart = `${year}-01-01`;
      const yearEnd = year < 2026 ? `${year + 1}-01-01` : new Date().toISOString().split("T")[0];
      console.log(`\nYear ${year}: ${yearStart} → ${yearEnd}`);

      let yearSyms = 0;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        try {
          const count = await fetchAndStore(client, batch, yearStart, yearEnd);
          yearSyms += count;
        } catch (err: any) {
          console.warn(`  Error at ${i}: ${err.message}`);
        }

        if ((i / batchSize) % 10 === 0 && i > 0) {
          console.log(`  ${i}/${symbols.length} done, ${yearSyms} stored`);
        }
        await sleep(200);
      }
      console.log(`Year ${year}: ${yearSyms} symbols stored`);
    }

    console.log("\nDone!");
    if (offset + limit < assets.length) {
      console.log(`Next run: OFFSET=${offset + limit}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
