import { pool, initDB } from "./db";
import { ensureBigQueryTables, insertRows, clearTable, getBigQueryClient, PROJECT_ID, STOCKS_DATASET, CRYPTO_DATASET } from "./bigquery";
import { analyzeStock, getSignal, getSignalStrength, countSignalChanges, lastSignalChangeDate } from "../shared/indicators";
import type { StockBar } from "../shared/types";

const ALPACA_KEY = process.env.ALPACA_API_KEY_ID || "";
const ALPACA_SECRET = process.env.ALPACA_API_KEY_SECRET || "";
const TIINGO_TOKEN = process.env.TIINGO_API_TOKEN || "";

const ALPACA_DATA_URL = "https://data.alpaca.markets/v2";
const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets/v2";

const USE_BIGQUERY = process.env.USE_BIGQUERY !== "false";

interface AlpacaAsset {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  status: string;
  tradable: boolean;
}

async function fetchAlpacaAssets(): Promise<AlpacaAsset[]> {
  console.log("Fetching tradable assets from Alpaca...");
  const res = await fetch(`${ALPACA_PAPER_URL}/assets?status=active&asset_class=us_equity`, {
    headers: {
      "APCA-API-KEY-ID": ALPACA_KEY,
      "APCA-API-SECRET-KEY": ALPACA_SECRET,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca assets API error ${res.status}: ${text}`);
  }

  const assets: AlpacaAsset[] = await res.json();
  return assets.filter(a => a.tradable && ["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS"].includes(a.exchange));
}

async function fetchAlpacaBars(symbols: string[], startDate: string, endDate: string): Promise<Record<string, StockBar[]>> {
  const results: Record<string, StockBar[]> = {};
  const batchSize = 50;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const symbolsParam = batch.join(",");

    let pageToken: string | null = null;
    do {
      const url = new URL(`${ALPACA_DATA_URL}/stocks/bars`);
      url.searchParams.set("symbols", symbolsParam);
      url.searchParams.set("timeframe", "1Day");
      url.searchParams.set("start", startDate);
      url.searchParams.set("end", endDate);
      url.searchParams.set("limit", "10000");
      url.searchParams.set("adjustment", "split");
      if (pageToken) url.searchParams.set("page_token", pageToken);

      const res = await fetch(url.toString(), {
        headers: {
          "APCA-API-KEY-ID": ALPACA_KEY,
          "APCA-API-SECRET-KEY": ALPACA_SECRET,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Alpaca bars error for batch starting at ${i}: ${res.status} ${text}`);
        break;
      }

      const data = await res.json();

      if (data.bars) {
        for (const [sym, bars] of Object.entries(data.bars as Record<string, any[]>)) {
          if (!results[sym]) results[sym] = [];
          for (const bar of bars) {
            results[sym].push({
              date: bar.t.split("T")[0],
              open: bar.o,
              high: bar.h,
              low: bar.l,
              close: bar.c,
              volume: bar.v,
            });
          }
        }
      }

      pageToken = data.next_page_token || null;
    } while (pageToken);

    if (i % 200 === 0 && i > 0) {
      console.log(`  Fetched bars for ${i}/${symbols.length} symbols...`);
      await sleep(500);
    }
  }

  return results;
}

async function fetchTiingoCrypto(): Promise<Record<string, StockBar[]>> {
  if (!TIINGO_TOKEN) {
    console.log("No Tiingo token, skipping crypto data");
    return {};
  }

  console.log("Fetching crypto data from Tiingo...");
  const cryptoSymbols = [
    "btcusd", "ethusd", "bnbusd", "xrpusd", "adausd", "dogeusd",
    "solusd", "dotusd", "maticusd", "ltcusd", "linkusd", "avaxusd",
    "uniusd", "atomusd", "xlmusd", "nearusd", "algousd", "ftmusd",
  ];

  const results: Record<string, StockBar[]> = {};
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  for (const sym of cryptoSymbols) {
    try {
      const url = `https://api.tiingo.com/tiingo/crypto/prices?tickers=${sym}&startDate=${startDate}&endDate=${endDate}&resampleFreq=1day&token=${TIINGO_TOKEN}`;
      const res = await fetch(url);

      if (!res.ok) {
        console.log(`  Tiingo error for ${sym}: ${res.status}`);
        continue;
      }

      const data = await res.json();
      if (data && data.length > 0 && data[0].priceData) {
        const displaySymbol = sym.replace("usd", "").toUpperCase();
        results[displaySymbol] = data[0].priceData.map((d: any) => ({
          date: d.date.split("T")[0],
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volumeNotional || 0,
        }));
      }

      await sleep(200);
    } catch (err) {
      console.log(`  Error fetching ${sym}:`, err);
    }
  }

  return results;
}

async function storePriceDataPostgres(allBars: Record<string, StockBar[]>, assetType: string, assetMeta?: Map<string, { name: string; exchange: string }>) {
  const client = await pool.connect();
  try {
    for (const [symbol, bars] of Object.entries(allBars)) {
      if (bars.length < 30) continue;

      const meta = assetMeta?.get(symbol);
      await client.query(
        `INSERT INTO stocks (symbol, name, exchange, asset_type) VALUES ($1, $2, $3, $4)
         ON CONFLICT (symbol) DO UPDATE SET name = $2, exchange = $3`,
        [symbol, meta?.name || symbol, meta?.exchange || "", assetType]
      );

      const batchSize = 500;
      for (let i = 0; i < bars.length; i += batchSize) {
        const batch = bars.slice(i, i + batchSize);
        const batchParams: any[] = [];
        const batchPlaceholders: string[] = [];
        let bpIdx = 1;

        for (const bar of batch) {
          batchPlaceholders.push(`($${bpIdx++}, $${bpIdx++}, $${bpIdx++}, $${bpIdx++}, $${bpIdx++}, $${bpIdx++}, $${bpIdx++}, $${bpIdx++})`);
          batchParams.push(symbol, bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume, assetType);
        }

        await client.query(
          `INSERT INTO price_history (symbol, date, open, high, low, close, volume, asset_type)
           VALUES ${batchPlaceholders.join(",")}
           ON CONFLICT (symbol, date) DO UPDATE SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume`,
          batchParams
        );
      }
    }
  } finally {
    client.release();
  }
}

async function storePriceDataBigQuery(allBars: Record<string, StockBar[]>, dataset: string, assetMeta?: Map<string, { name: string; exchange: string }>) {
  const metaRows: any[] = [];
  const priceRows: any[] = [];

  for (const [symbol, bars] of Object.entries(allBars)) {
    if (bars.length < 30) continue;

    const meta = assetMeta?.get(symbol);
    metaRows.push({
      symbol,
      name: meta?.name || symbol,
      exchange: meta?.exchange || "",
      sector: "",
      asset_type: dataset === CRYPTO_DATASET ? "crypto" : "stock",
    });

    for (const bar of bars) {
      priceRows.push({
        symbol,
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
    }
  }

  if (metaRows.length > 0) {
    console.log(`  Inserting ${metaRows.length} metadata rows to BigQuery ${dataset}.metadata...`);
    await insertRows(dataset, "metadata", metaRows);
  }

  if (priceRows.length > 0) {
    console.log(`  Inserting ${priceRows.length} price rows to BigQuery ${dataset}.price_history...`);
    await insertRows(dataset, "price_history", priceRows);
  }
}

async function computeAndStoreSignals() {
  console.log("Computing indicators for all symbols...");
  const client = await pool.connect();
  try {
    const symbolsResult = await client.query(`SELECT DISTINCT symbol FROM price_history`);
    const symbols = symbolsResult.rows.map(r => r.symbol);
    let processed = 0;

    const bqSignalRows: any[] = [];

    for (const symbol of symbols) {
      const barsResult = await client.query(
        `SELECT date, open, high, low, close, volume FROM price_history WHERE symbol = $1 ORDER BY date ASC`,
        [symbol]
      );

      const bars: StockBar[] = barsResult.rows.map(r => ({
        date: r.date.toISOString().split("T")[0],
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      }));

      if (bars.length < 30) continue;

      const indicators = analyzeStock(bars);
      if (indicators.length === 0) continue;

      const last = indicators[indicators.length - 1];
      const prevClose = bars.length > 1 ? bars[bars.length - 2].close : bars[bars.length - 1].close;
      const changeVal = last.price - prevClose;
      const changePct = prevClose !== 0 ? (changeVal / prevClose) * 100 : 0;

      const stockInfo = await client.query(`SELECT name, exchange, sector, asset_type FROM stocks WHERE symbol = $1`, [symbol]);
      const meta = stockInfo.rows[0] || { name: symbol, exchange: "", sector: "", asset_type: "stock" };

      const signal = getSignal(indicators);
      const signalStrengthVal = getSignalStrength(indicators);
      const lastChange = lastSignalChangeDate(indicators);
      const signalChangesVal = countSignalChanges(indicators);

      await client.query(
        `INSERT INTO computed_signals (symbol, name, exchange, sector, asset_type, price, change_val, change_percent, signal, macd_histogram, macd_histogram_adjusted, rsi, signal_strength, last_signal_change, signal_changes, data_points, volume, computed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
         ON CONFLICT (symbol) DO UPDATE SET
           name=$2, exchange=$3, sector=$4, asset_type=$5, price=$6, change_val=$7, change_percent=$8, signal=$9, macd_histogram=$10, macd_histogram_adjusted=$11, rsi=$12, signal_strength=$13, last_signal_change=$14, signal_changes=$15, data_points=$16, volume=$17, computed_at=NOW()`,
        [
          symbol, meta.name, meta.exchange, meta.sector || "", meta.asset_type,
          last.price, changeVal, changePct,
          signal, last.macdHistogram, last.macdHistogramAdjusted,
          last.rsi, signalStrengthVal,
          lastChange, signalChangesVal,
          bars.length, bars[bars.length - 1].volume,
        ]
      );

      if (USE_BIGQUERY) {
        const bqDataset = meta.asset_type === "crypto" ? CRYPTO_DATASET : STOCKS_DATASET;
        bqSignalRows.push({
          dataset: bqDataset,
          row: {
            symbol,
            name: meta.name,
            exchange: meta.exchange,
            sector: meta.sector || "",
            asset_type: meta.asset_type,
            price: last.price,
            change_val: changeVal,
            change_percent: changePct,
            signal,
            macd_histogram: last.macdHistogram,
            macd_histogram_adjusted: last.macdHistogramAdjusted,
            rsi: last.rsi,
            signal_strength: signalStrengthVal,
            last_signal_change: lastChange,
            signal_changes: signalChangesVal,
            data_points: bars.length,
            volume: bars[bars.length - 1].volume,
            computed_at: new Date().toISOString(),
          },
        });
      }

      processed++;
      if (processed % 200 === 0) {
        console.log(`  Computed signals for ${processed}/${symbols.length} symbols`);
      }
    }
    console.log(`Computed signals for ${processed} symbols total`);

    if (USE_BIGQUERY && bqSignalRows.length > 0) {
      const stockSignals = bqSignalRows.filter(r => r.dataset === STOCKS_DATASET).map(r => r.row);
      const cryptoSignals = bqSignalRows.filter(r => r.dataset === CRYPTO_DATASET).map(r => r.row);

      if (stockSignals.length > 0) {
        console.log(`  Writing ${stockSignals.length} stock signals to BigQuery...`);
        await insertRows(STOCKS_DATASET, "computed_signals", stockSignals);
      }
      if (cryptoSignals.length > 0) {
        console.log(`  Writing ${cryptoSignals.length} crypto signals to BigQuery...`);
        await insertRows(CRYPTO_DATASET, "computed_signals", cryptoSignals);
      }
    }
  } finally {
    client.release();
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Market Data Seed ===");
  console.log("Initializing PostgreSQL...");
  await initDB();

  if (USE_BIGQUERY) {
    console.log("Initializing BigQuery tables...");
    try {
      await ensureBigQueryTables();
    } catch (err: any) {
      console.warn("BigQuery setup warning:", err.message);
      console.log("Will continue with PostgreSQL only. Set GOOGLE_CREDENTIALS_JSON to enable BigQuery.");
    }
  }

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  console.log(`Date range: ${startDate} to ${endDate}`);

  if (ALPACA_KEY && ALPACA_SECRET) {
    const assets = await fetchAlpacaAssets();
    console.log(`Found ${assets.length} tradable assets`);

    const assetMeta = new Map(assets.map(a => [a.symbol, { name: a.name, exchange: a.exchange }]));
    const allSymbols = assets.map(a => a.symbol);

    const chunkSize = 200;
    for (let i = 0; i < allSymbols.length; i += chunkSize) {
      const chunk = allSymbols.slice(i, i + chunkSize);
      console.log(`Fetching bars for chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(allSymbols.length / chunkSize)} (${chunk.length} symbols)...`);
      const bars = await fetchAlpacaBars(chunk, startDate, endDate);
      await storePriceDataPostgres(bars, "stock", assetMeta);
      console.log(`  Stored ${Object.keys(bars).length} symbols to PostgreSQL`);

      if (USE_BIGQUERY) {
        try {
          await storePriceDataBigQuery(bars, STOCKS_DATASET, assetMeta);
          console.log(`  Stored ${Object.keys(bars).length} symbols to BigQuery`);
        } catch (err: any) {
          console.warn(`  BigQuery write warning: ${err.message}`);
        }
      }

      await sleep(1000);
    }
  } else {
    console.log("No Alpaca API keys configured - skipping stock data");
    console.log("Set ALPACA_API_KEY_ID and ALPACA_API_KEY_SECRET to fetch stock data");
  }

  if (TIINGO_TOKEN) {
    const cryptoBars = await fetchTiingoCrypto();
    const cryptoMeta = new Map(Object.keys(cryptoBars).map(s => [s, { name: s, exchange: "CRYPTO" }]));
    await storePriceDataPostgres(cryptoBars, "crypto", cryptoMeta);
    console.log(`Stored ${Object.keys(cryptoBars).length} crypto symbols to PostgreSQL`);

    if (USE_BIGQUERY) {
      try {
        await storePriceDataBigQuery(cryptoBars, CRYPTO_DATASET, cryptoMeta);
        console.log(`Stored ${Object.keys(cryptoBars).length} crypto symbols to BigQuery`);
      } catch (err: any) {
        console.warn(`  BigQuery write warning: ${err.message}`);
      }
    }
  } else {
    console.log("No Tiingo token configured - skipping crypto data");
    console.log("Set TIINGO_API_TOKEN to fetch crypto data");
  }

  await computeAndStoreSignals();
  console.log("=== Seed complete ===");
  process.exit(0);
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
