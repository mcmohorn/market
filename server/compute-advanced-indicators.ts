/**
 * Computes advanced_indicators, wavelet_features, and correlation_stats for every
 * symbol with enough price history — entirely from data already in price_history,
 * no external API calls. Follows the same one-query-per-symbol + upsert pattern as
 * server/update.ts's recomputeSignals.
 *
 * Importable (used by server/update.ts after each incremental data pull) or
 * runnable directly: `npm run compute-advanced`.
 */
import { pool } from "./db";
import type { StockBar } from "../shared/types";
import { analyzeAdvanced } from "../shared/indicators-advanced";
import { analyzeWavelet } from "../shared/wavelets";
import { computeCorrelationStats, computeSectorCorrelation } from "../shared/correlation";
import type { PoolClient } from "pg";

const BENCHMARKS: Record<string, string> = { stock: "SPY", crypto: "BTC" };
const LOOKBACK_DAYS = 400; // calendar days of history to pull per symbol
const SECTOR_PEER_SAMPLE = 10;

async function loadBars(client: PoolClient, symbol: string, assetType: string): Promise<StockBar[]> {
  const { rows } = await client.query(
    `SELECT date, open, high, low, close, volume FROM price_history
     WHERE symbol = $1 AND asset_type = $2 AND date >= CURRENT_DATE - $3::int
     ORDER BY date ASC`,
    [symbol, assetType, LOOKBACK_DAYS]
  );
  return rows.map(r => ({
    date: r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date).split("T")[0],
    open: parseFloat(r.open), high: parseFloat(r.high), low: parseFloat(r.low),
    close: parseFloat(r.close), volume: parseFloat(r.volume),
  }));
}

export async function computeAdvancedIndicators(): Promise<{ processed: number; skipped: number }> {
  const client = await pool.connect();

  try {
    const benchmarkBars: Record<string, StockBar[]> = {};
    for (const [assetType, sym] of Object.entries(BENCHMARKS)) {
      benchmarkBars[assetType] = await loadBars(client, sym, assetType);
      console.log(`[Advanced] Benchmark ${sym} (${assetType}): ${benchmarkBars[assetType].length} bars loaded`);
    }

    // Sample a peer basket per sector once and reuse it for every stock in that
    // sector, rather than re-querying peers per symbol (would be O(n^2)). Peer
    // dates aren't individually re-aligned to each symbol — for US equities that
    // trade the same sessions this trailing-window approximation is good enough
    // for a directional sector-correlation signal.
    const { rows: sectorRows } = await client.query(
      `SELECT DISTINCT sector FROM stocks WHERE asset_type = 'stock' AND sector IS NOT NULL AND sector != ''`
    );
    const sectorPeerBars: Record<string, StockBar[][]> = {};
    for (const { sector } of sectorRows) {
      const { rows: peers } = await client.query(
        `SELECT s.symbol FROM stocks s
         JOIN (SELECT symbol, COUNT(*) c FROM price_history WHERE asset_type = 'stock' GROUP BY symbol HAVING COUNT(*) >= 100) ph
           ON ph.symbol = s.symbol
         WHERE s.asset_type = 'stock' AND s.sector = $1
         ORDER BY random() LIMIT $2`,
        [sector, SECTOR_PEER_SAMPLE]
      );
      const barsList: StockBar[][] = [];
      for (const p of peers) barsList.push(await loadBars(client, p.symbol, "stock"));
      sectorPeerBars[sector] = barsList;
    }
    console.log(`[Advanced] Cached peer baskets for ${Object.keys(sectorPeerBars).length} sectors`);

    const { rows: symbols } = await client.query(`
      SELECT s.symbol, s.asset_type, s.sector FROM stocks s
      JOIN (SELECT symbol, asset_type, COUNT(*) c FROM price_history GROUP BY symbol, asset_type HAVING COUNT(*) >= 30) ph
        ON ph.symbol = s.symbol AND ph.asset_type = s.asset_type
      ORDER BY s.asset_type, s.symbol
    `);
    console.log(`[Advanced] Processing ${symbols.length} symbols...`);

    let processed = 0;
    let skipped = 0;

    for (const { symbol, asset_type: assetType, sector } of symbols) {
      const bars = await loadBars(client, symbol, assetType);
      if (bars.length < 30) { skipped++; continue; }

      const advanced = analyzeAdvanced(bars);
      if (advanced) {
        await client.query(
          `INSERT INTO advanced_indicators (symbol, asset_type, stoch_rsi, stoch_rsi_k, stoch_rsi_d, vwap, obv, obv_trend, atr, atr_pct, williams_r, computed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
           ON CONFLICT (symbol, asset_type) DO UPDATE SET
             stoch_rsi=$3, stoch_rsi_k=$4, stoch_rsi_d=$5, vwap=$6, obv=$7, obv_trend=$8, atr=$9, atr_pct=$10, williams_r=$11, computed_at=NOW()`,
          [symbol, assetType, advanced.stochRsi, advanced.stochRsiK, advanced.stochRsiD, advanced.vwap,
           advanced.obv, advanced.obvTrend, advanced.atr, advanced.atrPct, advanced.williamsR]
        );
      }

      const wavelet = analyzeWavelet(bars);
      if (wavelet) {
        await client.query(
          `INSERT INTO wavelet_features (symbol, asset_type, levels, trend_energy_pct, noise_energy_pct, dominant_cycle_length, denoised_price, denoised_slope_pct, wavelet_signal, computed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
           ON CONFLICT (symbol, asset_type) DO UPDATE SET
             levels=$3, trend_energy_pct=$4, noise_energy_pct=$5, dominant_cycle_length=$6, denoised_price=$7, denoised_slope_pct=$8, wavelet_signal=$9, computed_at=NOW()`,
          [symbol, assetType, wavelet.levels, wavelet.trendEnergyPct, wavelet.noiseEnergyPct,
           wavelet.dominantCycleLength, wavelet.denoisedPrice, wavelet.denoisedSlopePct, wavelet.waveletSignal]
        );
      }

      const benchSymbol = BENCHMARKS[assetType];
      const benchBars = benchmarkBars[assetType];
      if (benchSymbol && benchBars && benchBars.length > 30 && symbol !== benchSymbol) {
        const benchByDate = new Map(benchBars.map(b => [b.date, b]));
        const alignedSym: StockBar[] = [];
        const alignedBench: StockBar[] = [];
        for (const b of bars) {
          const bb = benchByDate.get(b.date);
          if (bb) { alignedSym.push(b); alignedBench.push(bb); }
        }

        if (alignedSym.length > 30) {
          const stats = computeCorrelationStats(alignedSym, alignedBench, 90);

          let sectorCorr = 0;
          if (assetType === "stock" && sector && sectorPeerBars[sector]) {
            const peers = sectorPeerBars[sector].filter(p => p.length > 30);
            sectorCorr = computeSectorCorrelation(alignedSym, peers, 90);
          }

          await client.query(
            `INSERT INTO correlation_stats (symbol, asset_type, benchmark_symbol, correlation_90d, beta_90d, relative_strength_90d, sector_correlation_90d, computed_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
             ON CONFLICT (symbol, asset_type) DO UPDATE SET
               benchmark_symbol=$3, correlation_90d=$4, beta_90d=$5, relative_strength_90d=$6, sector_correlation_90d=$7, computed_at=NOW()`,
            [symbol, assetType, benchSymbol, stats.correlation90d, stats.beta90d, stats.relativeStrength90d, sectorCorr]
          );
        }
      }

      processed++;
      if (processed % 250 === 0) {
        console.log(`  [Advanced] ${processed}/${symbols.length} processed...`);
      }
    }

    console.log(`[Advanced] Done: ${processed} processed, ${skipped} skipped (insufficient data)`);
    return { processed, skipped };
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  import("./db").then(({ initDB }) => initDB())
    .then(() => computeAdvancedIndicators())
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
