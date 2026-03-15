import { pool } from "./db";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export async function generateSnapshot() {
  try {
    const [stocksResult, cryptoResult, statsResult] = await Promise.all([
      pool.query(
        `SELECT symbol, name, exchange, sector, price, change_percent, signal, signal_strength, rsi, macd_histogram, volume
         FROM computed_signals WHERE asset_type = 'stock' ORDER BY ABS(change_percent) DESC LIMIT 5`
      ),
      pool.query(
        `SELECT symbol, name, exchange, sector, price, change_percent, signal, signal_strength, rsi, macd_histogram, volume
         FROM computed_signals WHERE asset_type = 'crypto' ORDER BY ABS(change_percent) DESC LIMIT 5`
      ),
      pool.query(
        `SELECT asset_type,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE signal='BUY') as buy_count,
           COUNT(*) FILTER (WHERE signal='SELL') as sell_count,
           COUNT(*) FILTER (WHERE signal='HOLD') as hold_count
         FROM computed_signals GROUP BY asset_type`
      ),
    ]);

    const snapshot = {
      stocks: stocksResult.rows,
      crypto: cryptoResult.rows,
      stats: statsResult.rows,
      generated_at: new Date().toISOString(),
    };

    const outDir = join(process.cwd(), "client", "public");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "snapshot.json"), JSON.stringify(snapshot, null, 2));
    console.log("[Snapshot] Generated client/public/snapshot.json");
    return snapshot;
  } catch (err) {
    console.error("[Snapshot] Failed to generate snapshot:", err);
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  import("./db").then(({ initDB }) => initDB()).then(() => generateSnapshot()).then(() => process.exit(0));
}
