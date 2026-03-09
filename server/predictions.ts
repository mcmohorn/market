import { pool } from "./db";

export async function ensureBaselineVersion(): Promise<void> {
  const result = await pool.query(`SELECT COUNT(*) as cnt FROM algorithm_versions`);
  if (parseInt(result.rows[0].cnt) === 0) {
    await pool.query(
      `INSERT INTO algorithm_versions (version_num, params, notes) VALUES (1, $1, 'Initial baseline version')
       ON CONFLICT (version_num) DO NOTHING`,
      [JSON.stringify({
        macdFastPeriod: 12, macdSlowPeriod: 26, macdSignalPeriod: 9,
        rsiPeriod: 12, rsiOverbought: 70, rsiOversold: 30,
        minBuySignal: 4, maxSharePrice: 500,
      })]
    );
  }
}

export async function getCurrentAlgorithmVersion(): Promise<number> {
  await ensureBaselineVersion();
  const result = await pool.query(
    `SELECT COALESCE(MAX(version_num), 1) as max_version FROM algorithm_versions`
  );
  return result.rows[0].max_version;
}

export async function createAlgorithmVersion(params: any, notes: string = ""): Promise<number> {
  const currentMax = await getCurrentAlgorithmVersion();
  const newVersion = currentMax + 1;
  await pool.query(
    `INSERT INTO algorithm_versions (version_num, params, notes) VALUES ($1, $2, $3)
     ON CONFLICT (version_num) DO NOTHING`,
    [newVersion, JSON.stringify(params), notes]
  );
  return newVersion;
}

export async function generateDailyPredictions(): Promise<number> {
  const version = await getCurrentAlgorithmVersion();
  const today = new Date().toISOString().split("T")[0];

  const existing = await pool.query(
    `SELECT COUNT(*) as cnt FROM predictions WHERE predicted_date = $1`,
    [today]
  );
  if (parseInt(existing.rows[0].cnt) > 0) {
    return 0;
  }

  const signals = await pool.query(
    `SELECT symbol, asset_type, signal, price FROM computed_signals WHERE signal IN ('BUY', 'SELL')`
  );

  let inserted = 0;
  for (const row of signals.rows) {
    await pool.query(
      `INSERT INTO predictions (symbol, asset_type, predicted_signal, predicted_date, predicted_price, algorithm_version)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.symbol, row.asset_type, row.signal, today, row.price, version]
    );
    inserted++;
  }

  return inserted;
}

export async function evaluatePastPredictions(): Promise<{ evaluated: number; correct: number; wrong: number }> {
  const unresolved = await pool.query(
    `SELECT p.id, p.symbol, p.asset_type, p.predicted_signal, p.predicted_date, p.predicted_price
     FROM predictions p
     WHERE p.correct IS NULL AND p.predicted_date < CURRENT_DATE`
  );

  let evaluated = 0;
  let correct = 0;
  let wrong = 0;

  for (const pred of unresolved.rows) {
    const nextDay = new Date(pred.predicted_date);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];

    const priceResult = await pool.query(
      `SELECT close FROM price_history
       WHERE symbol = $1 AND asset_type = $2 AND date >= $3
       ORDER BY date ASC LIMIT 1`,
      [pred.symbol, pred.asset_type, nextDayStr]
    );

    if (priceResult.rows.length === 0) continue;

    const actualPrice = priceResult.rows[0].close;
    const priceChange = actualPrice - pred.predicted_price;
    const pctChange = (priceChange / pred.predicted_price) * 100;

    let isCorrect = false;
    if (pred.predicted_signal === "BUY" && pctChange > 0) isCorrect = true;
    if (pred.predicted_signal === "SELL" && pctChange < 0) isCorrect = true;

    const actualSignal = pctChange > 0 ? "BUY" : pctChange < 0 ? "SELL" : "HOLD";

    await pool.query(
      `UPDATE predictions SET actual_signal = $1, actual_price = $2, correct = $3 WHERE id = $4`,
      [actualSignal, actualPrice, isCorrect, pred.id]
    );

    evaluated++;
    if (isCorrect) correct++;
    else wrong++;
  }

  if (evaluated > 0) {
    await updateVersionAccuracy();
  }

  return { evaluated, correct, wrong };
}

async function updateVersionAccuracy(): Promise<void> {
  const versions = await pool.query(`SELECT DISTINCT algorithm_version FROM predictions WHERE correct IS NOT NULL`);

  for (const v of versions.rows) {
    const stats = await pool.query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE correct = true) as correct_count
       FROM predictions WHERE algorithm_version = $1 AND correct IS NOT NULL`,
      [v.algorithm_version]
    );
    const total = parseInt(stats.rows[0].total);
    const correctCount = parseInt(stats.rows[0].correct_count);
    const accuracy = total > 0 ? (correctCount / total) * 100 : 0;

    await pool.query(
      `UPDATE algorithm_versions SET accuracy_pct = $1, total_predictions = $2, correct_predictions = $3
       WHERE version_num = $4`,
      [accuracy, total, correctCount, v.algorithm_version]
    );
  }
}

export async function getRecap(type: "daily" | "weekly" | "monthly"): Promise<any> {
  let daysBack = 1;
  if (type === "weekly") daysBack = 7;
  if (type === "monthly") daysBack = 30;

  const topMovers = await pool.query(
    `SELECT symbol, name, asset_type, price, change_percent, signal
     FROM computed_signals
     ORDER BY ABS(change_percent) DESC LIMIT 20`
  );

  const signalChanges = await pool.query(
    `SELECT symbol, name, asset_type, signal, last_signal_change, change_percent
     FROM computed_signals
     WHERE last_signal_change != '' AND last_signal_change IS NOT NULL
     ORDER BY computed_at DESC LIMIT 20`
  );

  const predictionStats = await pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE correct = true) as correct_count,
       COUNT(*) FILTER (WHERE correct = false) as wrong_count,
       COUNT(*) FILTER (WHERE correct IS NULL) as pending
     FROM predictions
     WHERE predicted_date >= CURRENT_DATE - $1::int`,
    [daysBack]
  );

  const recentPredictions = await pool.query(
    `SELECT symbol, asset_type, predicted_signal, predicted_date, predicted_price,
            actual_signal, actual_price, correct
     FROM predictions
     WHERE predicted_date >= CURRENT_DATE - $1::int
     ORDER BY predicted_date DESC, symbol ASC
     LIMIT 50`,
    [daysBack]
  );

  const versionPerformance = await pool.query(
    `SELECT version_num, params, accuracy_pct, total_predictions, correct_predictions, notes, created_at
     FROM algorithm_versions ORDER BY version_num DESC`
  );

  const stats = predictionStats.rows[0];

  return {
    type,
    period: `Last ${daysBack} day${daysBack > 1 ? "s" : ""}`,
    topMovers: topMovers.rows,
    signalChanges: signalChanges.rows,
    predictionAccuracy: {
      total: parseInt(stats.total),
      correct: parseInt(stats.correct_count),
      wrong: parseInt(stats.wrong_count),
      pending: parseInt(stats.pending),
      accuracyPct: parseInt(stats.total) > 0
        ? ((parseInt(stats.correct_count) / (parseInt(stats.correct_count) + parseInt(stats.wrong_count))) * 100) || 0
        : 0,
    },
    recentPredictions: recentPredictions.rows,
    algorithmVersions: versionPerformance.rows,
  };
}

export async function getAlgorithmVersions(): Promise<any[]> {
  const result = await pool.query(
    `SELECT version_num, params, accuracy_pct, total_predictions, correct_predictions, notes, created_at
     FROM algorithm_versions ORDER BY version_num DESC`
  );
  return result.rows;
}
