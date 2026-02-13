import { pool, initDB } from "./db";
import { analyzeStock, getSignal, getSignalStrength, countSignalChanges, lastSignalChangeDate } from "../shared/indicators";
import type { StockBar } from "../shared/types";

const ALPACA_KEY = process.env.ALPACA_API_KEY_ID || "";
const ALPACA_SECRET = process.env.ALPACA_API_KEY_SECRET || "";
const TIINGO_TOKEN = process.env.TIINGO_API_TOKEN || "";
const ALPACA_DATA_URL = "https://data.alpaca.markets/v2";
const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets/v2";

const STOCK_START = "2016-01-01";
const CRYPTO_START = "2016-01-01";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAlpacaAssets() {
  const res = await fetch(`${ALPACA_PAPER_URL}/assets?status=active&asset_class=us_equity`, {
    headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET },
  });
  if (!res.ok) throw new Error(`Alpaca assets error: ${res.status}`);
  const assets: any[] = await res.json();
  return assets.filter((a: any) => a.tradable && ["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS"].includes(a.exchange));
}

async function fetchBarsForBatch(symbols: string[], startDate: string, endDate: string): Promise<Record<string, StockBar[]>> {
  const results: Record<string, StockBar[]> = {};
  let pageToken: string | null = null;
  let retries = 0;
  const symbolsParam = symbols.join(",");

  do {
    const url = new URL(`${ALPACA_DATA_URL}/stocks/bars`);
    url.searchParams.set("symbols", symbolsParam);
    url.searchParams.set("timeframe", "1Day");
    url.searchParams.set("start", startDate);
    url.searchParams.set("end", endDate);
    url.searchParams.set("limit", "10000");
    url.searchParams.set("adjustment", "split");
    url.searchParams.set("feed", "iex");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    try {
      const res = await fetch(url.toString(), {
        headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        if (res.status === 429) {
          retries++;
          if (retries > 5) break;
          console.log(`  Rate limited, waiting ${3 + retries * 2}s...`);
          await sleep(3000 + retries * 2000);
          continue;
        }
        console.warn(`  API error ${res.status} for batch`);
        break;
      }

      const data = await res.json();
      if (data.bars) {
        for (const [sym, bars] of Object.entries(data.bars as Record<string, any[]>)) {
          if (!results[sym]) results[sym] = [];
          for (const bar of bars) {
            results[sym].push({ date: bar.t.split("T")[0], open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v });
          }
        }
      }
      pageToken = data.next_page_token || null;
      retries = 0;
    } catch (err: any) {
      retries++;
      if (retries > 5) break;
      await sleep(2000 * retries);
    }
  } while (pageToken);

  return results;
}

async function fetchBarsForSymbol(symbol: string, startDate: string, endDate: string): Promise<StockBar[]> {
  const bars: StockBar[] = [];
  let pageToken: string | null = null;
  let retries = 0;

  do {
    const url = new URL(`${ALPACA_DATA_URL}/stocks/bars`);
    url.searchParams.set("symbols", symbol);
    url.searchParams.set("timeframe", "1Day");
    url.searchParams.set("start", startDate);
    url.searchParams.set("end", endDate);
    url.searchParams.set("limit", "10000");
    url.searchParams.set("adjustment", "split");
    url.searchParams.set("feed", "iex");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    try {
      const res = await fetch(url.toString(), {
        headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        if (res.status === 429) {
          retries++;
          if (retries > 3) break;
          await sleep(3000 + retries * 2000);
          continue;
        }
        break;
      }

      const data = await res.json();
      if (data.bars && data.bars[symbol]) {
        for (const bar of data.bars[symbol]) {
          bars.push({ date: bar.t.split("T")[0], open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v });
        }
      }
      pageToken = data.next_page_token || null;
      retries = 0;
    } catch (err: any) {
      retries++;
      if (retries > 3) break;
      await sleep(2000);
    }
  } while (pageToken);

  return bars;
}

async function storeSymbolBars(client: any, symbol: string, bars: StockBar[], assetType: string) {
  const batchSize = 500;
  for (let i = 0; i < bars.length; i += batchSize) {
    const batch = bars.slice(i, i + batchSize);
    const params: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const bar of batch) {
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      params.push(symbol, bar.date, bar.open, bar.high, bar.low, bar.close, Math.round(bar.volume), assetType);
    }
    await client.query(
      `INSERT INTO price_history (symbol, date, open, high, low, close, volume, asset_type)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (symbol, date, asset_type) DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume`,
      params
    );
  }
}

async function computeSignalForSymbol(client: any, symbol: string) {
  const barsResult = await client.query(
    `SELECT date, open, high, low, close, volume FROM price_history WHERE symbol = $1 ORDER BY date ASC`,
    [symbol]
  );

  const bars: StockBar[] = barsResult.rows.map((r: any) => ({
    date: r.date.toISOString().split("T")[0],
    open: parseFloat(r.open), high: parseFloat(r.high),
    low: parseFloat(r.low), close: parseFloat(r.close),
    volume: parseInt(r.volume),
  }));

  if (bars.length < 30) return;

  const indicators = analyzeStock(bars);
  if (indicators.length === 0) return;

  const last = indicators[indicators.length - 1];
  const prevClose = bars.length > 1 ? bars[bars.length - 2].close : bars[bars.length - 1].close;
  const changeVal = last.price - prevClose;
  const changePct = prevClose !== 0 ? (changeVal / prevClose) * 100 : 0;

  const stockInfo = await client.query(`SELECT name, exchange, sector, asset_type FROM stocks WHERE symbol = $1`, [symbol]);
  const meta = stockInfo.rows[0] || { name: symbol, exchange: "", sector: "", asset_type: "stock" };

  await client.query(
    `INSERT INTO computed_signals (symbol, name, exchange, sector, asset_type, price, change_val, change_percent, signal, macd_histogram, macd_histogram_adjusted, rsi, signal_strength, last_signal_change, signal_changes, data_points, volume, computed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
     ON CONFLICT (symbol, asset_type) DO UPDATE SET
       name=$2, exchange=$3, sector=$4, price=$6, change_val=$7, change_percent=$8, signal=$9, macd_histogram=$10, macd_histogram_adjusted=$11, rsi=$12, signal_strength=$13, last_signal_change=$14, signal_changes=$15, data_points=$16, volume=$17, computed_at=NOW()`,
    [
      symbol, meta.name, meta.exchange, meta.sector || "", meta.asset_type,
      last.price, changeVal, changePct,
      getSignal(indicators), last.macdHistogram, last.macdHistogramAdjusted,
      last.rsi, getSignalStrength(indicators),
      lastSignalChangeDate(indicators), countSignalChanges(indicators),
      bars.length, bars[bars.length - 1].volume,
    ]
  );
}

async function main() {
  console.log("=== Extended Market Data Seed ===");
  await initDB();
  const endDate = new Date().toISOString().split("T")[0];

  const client = await pool.connect();
  try {
    const existingData = await client.query(
      `SELECT symbol, asset_type, MIN(date) as earliest, COUNT(*) as bar_count FROM price_history GROUP BY symbol, asset_type`
    );
    const existingMap = new Map<string, { earliest: string; count: number }>();
    for (const row of existingData.rows) {
      existingMap.set(`${row.symbol}:${row.asset_type}`, {
        earliest: row.earliest.toISOString().split("T")[0],
        count: parseInt(row.bar_count),
      });
    }
    console.log(`Existing data: ${existingMap.size} symbol/asset combos`);

    if (ALPACA_KEY && ALPACA_SECRET) {
      const assets = await fetchAlpacaAssets();
      console.log(`Found ${assets.length} tradable assets`);

      const assetMeta = new Map(assets.map((a: any) => [a.symbol, { name: a.name, exchange: a.exchange }]));
      const needExtending: string[] = [];
      let skipped = 0;

      for (const asset of assets) {
        const key = `${asset.symbol}:stock`;
        const existing = existingMap.get(key);
        if (existing && existing.earliest <= "2016-02-01" && existing.count > 500) {
          skipped++;
        } else {
          needExtending.push(asset.symbol);
        }
      }

      const MAX_PER_RUN = parseInt(process.env.BATCH_LIMIT || "1000");
      const toProcess = needExtending.slice(0, MAX_PER_RUN);
      console.log(`Need extending: ${needExtending.length}, Already complete: ${skipped}, Processing this run: ${toProcess.length}`);

      const batchSize = 30;
      let totalExtended = 0;

      for (let i = 0; i < toProcess.length; i += batchSize) {
        const batch = toProcess.slice(i, i + batchSize);

        for (const sym of batch) {
          const meta = assetMeta.get(sym);
          await client.query(
            `INSERT INTO stocks (symbol, name, exchange, asset_type) VALUES ($1, $2, $3, $4)
             ON CONFLICT (symbol, asset_type) DO UPDATE SET name = $2, exchange = $3`,
            [sym, meta?.name || sym, meta?.exchange || "", "stock"]
          );
        }

        try {
          const barsMap = await fetchBarsForBatch(batch, STOCK_START, endDate);
          for (const [sym, bars] of Object.entries(barsMap)) {
            if (bars.length > 0) {
              await storeSymbolBars(client, sym, bars, "stock");
              totalExtended++;
            }
          }
        } catch (err: any) {
          console.warn(`  Batch error: ${err.message}`);
        }

        const progress = Math.min(i + batchSize, toProcess.length);
        if ((i / batchSize) % 5 === 0) {
          console.log(`Progress: ${progress}/${toProcess.length} symbols fetched, ${totalExtended} extended`);
        }

        await sleep(300);
      }

      console.log(`Stocks done: ${totalExtended} extended, ${skipped} already complete`);
      if (needExtending.length > MAX_PER_RUN) {
        console.log(`NOTE: ${needExtending.length - MAX_PER_RUN} symbols remaining. Run again to continue.`);
      }
    }

    if (TIINGO_TOKEN) {
      console.log("Extending crypto data...");
      const cryptoSymbols = [
        "btcusd", "ethusd", "bnbusd", "xrpusd", "adausd", "dogeusd",
        "solusd", "dotusd", "maticusd", "ltcusd", "linkusd", "avaxusd",
        "uniusd", "atomusd", "xlmusd", "nearusd", "algousd", "ftmusd",
      ];

      for (const sym of cryptoSymbols) {
        const displaySymbol = sym.replace("usd", "").toUpperCase();
        try {
          const url = `https://api.tiingo.com/tiingo/crypto/prices?tickers=${sym}&startDate=${CRYPTO_START}&endDate=${endDate}&resampleFreq=1day&token=${TIINGO_TOKEN}`;
          const res = await fetch(url);
          if (!res.ok) { console.log(`  Tiingo error for ${sym}: ${res.status}`); continue; }

          const data = await res.json();
          if (!data?.length || !data[0].priceData) { console.log(`  No data for ${sym}`); continue; }

          const bars: StockBar[] = data[0].priceData.map((d: any) => ({
            date: d.date.split("T")[0], open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volumeNotional || 0,
          }));

          await client.query(
            `INSERT INTO stocks (symbol, name, exchange, asset_type) VALUES ($1, $2, $3, $4)
             ON CONFLICT (symbol, asset_type) DO UPDATE SET name = $2, exchange = $3`,
            [displaySymbol, displaySymbol, "CRYPTO", "crypto"]
          );

          await storeSymbolBars(client, displaySymbol, bars, "crypto");
          console.log(`  ${displaySymbol}: ${bars.length} bars (${bars[0].date} to ${bars[bars.length - 1].date})`);
          await sleep(300);
        } catch (err: any) {
          console.log(`  Error for ${sym}: ${err.message}`);
        }
      }
    }

    console.log("Recomputing all signals...");
    const allSymbols = await client.query(`SELECT DISTINCT symbol FROM price_history`);
    let sigProcessed = 0;
    for (const row of allSymbols.rows) {
      try {
        await computeSignalForSymbol(client, row.symbol);
      } catch {}
      sigProcessed++;
      if (sigProcessed % 500 === 0) console.log(`  Signals: ${sigProcessed}/${allSymbols.rows.length}`);
    }
    console.log(`Computed signals for ${sigProcessed} symbols`);

  } finally {
    client.release();
    await pool.end();
  }

  console.log("=== Extended seed complete ===");
  process.exit(0);
}

main().catch(err => { console.error("Seed failed:", err); process.exit(1); });
