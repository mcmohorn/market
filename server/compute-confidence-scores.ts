/**
 * Computes signal_confidence for every symbol in computed_signals, joining in
 * advanced_indicators/wavelet_features where available and weighting by the
 * current algorithm version's historical accuracy. Best run after
 * computeAdvancedIndicators so the join has data (not required — the confidence
 * engine degrades gracefully with fewer components).
 *
 * Importable (used by server/update.ts) or runnable directly: `npm run compute-confidence`.
 */
import { pool } from "./db";
import { computeConfidence } from "./confidence";
import { getCurrentAlgorithmVersion } from "./predictions";

export async function computeConfidenceScores(): Promise<{ scored: number }> {
  const client = await pool.connect();

  try {
    const currentVersion = await getCurrentAlgorithmVersion();
    const { rows: versionRows } = await client.query(
      `SELECT accuracy_pct FROM algorithm_versions WHERE version_num = $1`,
      [currentVersion]
    );
    const algorithmAccuracyPct = versionRows[0]?.accuracy_pct ?? 0;
    console.log(`[Confidence] Using algorithm version ${currentVersion} (accuracy: ${algorithmAccuracyPct.toFixed(1)}%)`);

    const { rows } = await client.query(`
      SELECT
        cs.symbol, cs.asset_type, cs.signal, cs.rsi, cs.adx, cs.macd_histogram_adjusted,
        ai.stoch_rsi_k, ai.stoch_rsi_d, ai.obv_trend, ai.williams_r,
        wf.wavelet_signal, wf.denoised_slope_pct
      FROM computed_signals cs
      LEFT JOIN advanced_indicators ai ON ai.symbol = cs.symbol AND ai.asset_type = cs.asset_type
      LEFT JOIN wavelet_features wf ON wf.symbol = cs.symbol AND wf.asset_type = cs.asset_type
    `);
    console.log(`[Confidence] Scoring ${rows.length} symbols...`);

    let processed = 0;
    for (const row of rows) {
      // computed_signals doesn't retain the raw MACD crossover boolean, only the
      // adjusted histogram — reconstruct buySignal from its sign as the closest
      // available proxy (matches shared/indicators.ts's own crossover definition).
      const buySignal = (row.macd_histogram_adjusted ?? 0) > 0;

      const { confidencePct, components } = computeConfidence({
        signal: row.signal,
        buySignal,
        rsi: row.rsi ?? 50,
        adx: row.adx ?? 0,
        macdHistogramAdjusted: row.macd_histogram_adjusted ?? 0,
        stochRsiK: row.stoch_rsi_k ?? undefined,
        stochRsiD: row.stoch_rsi_d ?? undefined,
        obvTrend: row.obv_trend || undefined,
        williamsR: row.williams_r ?? undefined,
        waveletSignal: row.wavelet_signal || undefined,
        denoisedSlopePct: row.denoised_slope_pct ?? undefined,
        algorithmAccuracyPct,
      });

      await client.query(
        `INSERT INTO signal_confidence (symbol, asset_type, signal, confidence_pct, components, computed_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (symbol, asset_type) DO UPDATE SET
           signal=$3, confidence_pct=$4, components=$5, computed_at=NOW()`,
        [row.symbol, row.asset_type, row.signal, confidencePct, JSON.stringify(components)]
      );

      processed++;
      if (processed % 500 === 0) {
        console.log(`  [Confidence] ${processed}/${rows.length} scored...`);
      }
    }

    console.log(`[Confidence] Done: ${processed} symbols scored`);
    return { scored: processed };
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  import("./db").then(({ initDB }) => initDB())
    .then(() => computeConfidenceScores())
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
