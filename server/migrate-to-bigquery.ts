import { pool, initDB } from "./db";
import { ensureBigQueryTables, insertRows, dropAndRecreateTables, STOCKS_DATASET, CRYPTO_DATASET } from "./bigquery";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const mode = process.env.MODE || "all";
  const offset = parseInt(process.env.OFFSET || "0");
  const limit = parseInt(process.env.LIMIT || "500");

  console.log(`=== PostgreSQL → BigQuery Migration (mode=${mode}, offset=${offset}, limit=${limit}) ===`);
  await initDB();

  if (mode === "setup" || (mode === "all" && offset === 0)) {
    console.log("Setting up BigQuery tables (drop + recreate)...");
    await dropAndRecreateTables();
    console.log("BigQuery tables ready\n");
  } else {
    await ensureBigQueryTables();
  }

  const client = await pool.connect();

  try {
    if (mode === "setup") {
      console.log("Setup complete. Run with MODE=metadata, then MODE=prices, then MODE=signals");
      return;
    }

    if (mode === "all" || mode === "metadata") {
      console.log("--- Migrating metadata ---");
      const metaRes = await client.query(
        `SELECT symbol, name, exchange, COALESCE(sector, '') as sector, asset_type FROM stocks ORDER BY asset_type, symbol`
      );

      const stockMeta: any[] = [];
      const cryptoMeta: any[] = [];
      for (const r of metaRes.rows) {
        const row = { symbol: r.symbol, name: r.name, exchange: r.exchange, sector: r.sector, asset_type: r.asset_type };
        if (r.asset_type === "crypto") cryptoMeta.push(row);
        else stockMeta.push(row);
      }

      if (stockMeta.length > 0) {
        console.log(`  Inserting ${stockMeta.length} stock metadata rows...`);
        await insertRows(STOCKS_DATASET, "metadata", stockMeta);
      }
      if (cryptoMeta.length > 0) {
        console.log(`  Inserting ${cryptoMeta.length} crypto metadata rows...`);
        await insertRows(CRYPTO_DATASET, "metadata", cryptoMeta);
      }
      console.log("  Metadata done\n");
    }

    if (mode === "all" || mode === "prices") {
      for (const assetType of ["stock", "crypto"] as const) {
        const dataset = assetType === "crypto" ? CRYPTO_DATASET : STOCKS_DATASET;

        const symbolsRes = await client.query(
          `SELECT DISTINCT symbol FROM price_history WHERE asset_type = $1 ORDER BY symbol`, [assetType]
        );
        const allSymbols = symbolsRes.rows.map((r: any) => r.symbol);
        const symbols = allSymbols.slice(offset, offset + limit);

        if (symbols.length === 0) {
          console.log(`  ${assetType}: no symbols in range ${offset}-${offset + limit} (total: ${allSymbols.length})`);
          continue;
        }

        console.log(`--- Migrating ${assetType} price_history: symbols ${offset}-${offset + symbols.length} of ${allSymbols.length} ---`);

        let migrated = 0;
        let bqBatch: any[] = [];

        for (let si = 0; si < symbols.length; si++) {
          const symbol = symbols[si];
          const barsRes = await client.query(
            `SELECT symbol, date, open, high, low, close, volume FROM price_history WHERE symbol = $1 AND asset_type = $2 ORDER BY date`,
            [symbol, assetType]
          );

          for (const r of barsRes.rows) {
            bqBatch.push({
              symbol: r.symbol,
              date: r.date.toISOString().split("T")[0],
              open: r.open,
              high: r.high,
              low: r.low,
              close: r.close,
              volume: Math.round(r.volume),
            });
          }
          migrated += barsRes.rows.length;

          if (bqBatch.length >= 5000) {
            await insertRows(dataset, "price_history", bqBatch);
            bqBatch = [];
          }

          if (si % 100 === 0 && si > 0) {
            console.log(`    ${si}/${symbols.length} symbols, ${migrated.toLocaleString()} rows`);
          }
        }

        if (bqBatch.length > 0) {
          await insertRows(dataset, "price_history", bqBatch);
        }

        console.log(`  ${assetType}: ${migrated.toLocaleString()} rows migrated (${symbols.length} symbols)`);
        if (offset + limit < allSymbols.length) {
          console.log(`  Next run: OFFSET=${offset + limit}`);
        }
      }
    }

    if (mode === "all" || mode === "signals") {
      console.log("\n--- Migrating computed_signals ---");
      const sigRes = await client.query(
        `SELECT symbol, name, exchange, COALESCE(sector, '') as sector, asset_type, price, change_val, change_percent,
                signal, macd_histogram, macd_histogram_adjusted, rsi, signal_strength,
                last_signal_change, signal_changes, data_points, volume, computed_at
         FROM computed_signals ORDER BY asset_type, symbol`
      );

      const stockSignals: any[] = [];
      const cryptoSignals: any[] = [];
      for (const r of sigRes.rows) {
        const row = {
          symbol: r.symbol, name: r.name, exchange: r.exchange, sector: r.sector,
          asset_type: r.asset_type, price: r.price, change_val: r.change_val,
          change_percent: r.change_percent, signal: r.signal,
          macd_histogram: r.macd_histogram, macd_histogram_adjusted: r.macd_histogram_adjusted,
          rsi: r.rsi, signal_strength: r.signal_strength,
          last_signal_change: r.last_signal_change, signal_changes: r.signal_changes,
          data_points: r.data_points, volume: r.volume,
          computed_at: r.computed_at ? r.computed_at.toISOString() : new Date().toISOString(),
        };
        if (r.asset_type === "crypto") cryptoSignals.push(row);
        else stockSignals.push(row);
      }

      if (stockSignals.length > 0) {
        console.log(`  Inserting ${stockSignals.length} stock signals...`);
        await insertRows(STOCKS_DATASET, "computed_signals", stockSignals);
      }
      if (cryptoSignals.length > 0) {
        console.log(`  Inserting ${cryptoSignals.length} crypto signals...`);
        await insertRows(CRYPTO_DATASET, "computed_signals", cryptoSignals);
      }
      console.log("  Signals done");
    }

    console.log("\n=== Migration step complete ===");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error("Migration failed:", e); process.exit(1); });
