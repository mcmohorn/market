import "dotenv/config";
/**
 * Backfill computed_signals for all symbols that have price data
 * but are missing from computed_signals (no external API calls needed).
 *
 * Run: yarn backfill-signals
 */
import { Pool } from "pg";
import { analyzeStock, getSignal, getSignalStrength, lastSignalChangeDate, countSignalChanges } from "../shared/indicators";
import type { StockBar } from "../shared/types";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log("=== MATEO Signal Backfill ===");

  const { rows: missing } = await pool.query<{ symbol: string; asset_type: string; cnt: number }>(`
    SELECT ph.symbol, ph.asset_type, ph.cnt
    FROM (
      SELECT symbol, asset_type, COUNT(*) AS cnt
      FROM price_history
      GROUP BY symbol, asset_type
      HAVING COUNT(*) >= 30
    ) ph
    LEFT JOIN computed_signals cs ON cs.symbol = ph.symbol AND cs.asset_type = ph.asset_type
    WHERE cs.symbol IS NULL
    ORDER BY ph.asset_type, ph.symbol
  `);

  if (missing.length === 0) {
    console.log("Nothing to backfill — all symbols already have computed signals.");
    await pool.end();
    return;
  }

  console.log(`Found ${missing.length} symbols missing from computed_signals. Computing...`);

  const client = await pool.connect();
  let processed = 0;
  let skipped = 0;

  try {
    for (const { symbol, asset_type } of missing) {
      const { rows: barRows } = await client.query(
        `SELECT date, open, high, low, close, volume FROM price_history
         WHERE symbol = $1 AND asset_type = $2 ORDER BY date ASC`,
        [symbol, asset_type]
      );

      const bars: StockBar[] = barRows.map(r => ({
        date: r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date).split("T")[0],
        open: parseFloat(r.open),
        high: parseFloat(r.high),
        low: parseFloat(r.low),
        close: parseFloat(r.close),
        volume: parseFloat(r.volume),
      }));

      if (bars.length < 30) { skipped++; continue; }

      const indicators = analyzeStock(bars);
      if (indicators.length === 0) { skipped++; continue; }

      const last = indicators[indicators.length - 1];
      const prevClose = bars.length > 1 ? bars[bars.length - 2].close : bars[bars.length - 1].close;
      const changeVal = last.price - prevClose;
      const changePct = prevClose !== 0 ? (changeVal / prevClose) * 100 : 0;

      const { rows: metaRows } = await client.query(
        `SELECT name, exchange, sector FROM stocks WHERE symbol = $1 AND asset_type = $2`,
        [symbol, asset_type]
      );
      const meta = metaRows[0] || { name: symbol, exchange: "", sector: "" };

      const signal = getSignal(indicators);
      const signalStrengthVal = getSignalStrength(indicators);
      const lastChange = lastSignalChangeDate(indicators);
      const signalChangesVal = countSignalChanges(indicators);

      await client.query(
        `INSERT INTO computed_signals
           (symbol, name, exchange, sector, asset_type, price, change_val, change_percent,
            signal, macd_histogram, macd_histogram_adjusted, rsi, signal_strength,
            last_signal_change, signal_changes, data_points, volume, computed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
         ON CONFLICT (symbol, asset_type) DO UPDATE SET
           name=$2, exchange=$3, sector=$4, price=$6, change_val=$7, change_percent=$8,
           signal=$9, macd_histogram=$10, macd_histogram_adjusted=$11, rsi=$12,
           signal_strength=$13, last_signal_change=$14, signal_changes=$15,
           data_points=$16, volume=$17, computed_at=NOW()`,
        [
          symbol, meta.name, meta.exchange, meta.sector || "", asset_type,
          last.price, changeVal, changePct,
          signal, last.macdHistogram, last.macdHistogramAdjusted,
          last.rsi, signalStrengthVal,
          lastChange, signalChangesVal,
          bars.length, bars[bars.length - 1].volume,
        ]
      );

      processed++;
      if (processed % 100 === 0) {
        console.log(`  ${processed}/${missing.length} done...`);
      }
    }
  } finally {
    client.release();
  }

  console.log(`\nBackfill complete: ${processed} signals computed, ${skipped} skipped (insufficient data)`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
