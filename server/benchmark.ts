import pg from "pg";
import { queryBigQuery, getDataset, tbl, normalizeDate } from "./bigquery";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

interface BenchResult {
  source: string;
  query: string;
  rows: number;
  timeMs: number;
}

async function timeQuery(label: string, fn: () => Promise<any[]>): Promise<BenchResult> {
  const start = performance.now();
  const rows = await fn();
  const elapsed = performance.now() - start;
  return { source: "", query: label, rows: rows.length, timeMs: Math.round(elapsed) };
}

async function runBenchmarks() {
  console.log("=".repeat(70));
  console.log("  BENCHMARK: BigQuery vs PostgreSQL");
  console.log("  Testing simulation-relevant queries");
  console.log("=".repeat(70));

  const results: BenchResult[] = [];

  const tests: { name: string; pgFn: () => Promise<any[]>; bqFn: () => Promise<any[]> }[] = [
    {
      name: "1. Single symbol price history (AAPL, 5 years)",
      pgFn: () => pool.query(
        `SELECT symbol, date, open, high, low, close, volume FROM price_history WHERE symbol = $1 AND date >= $2 AND date <= $3 ORDER BY date ASC`,
        ["AAPL", "2021-01-01", "2026-02-13"]
      ).then(r => r.rows),
      bqFn: () => queryBigQuery(
        `SELECT symbol, date, open, high, low, close, volume FROM ${tbl("stocks", "price_history")} WHERE symbol = @sym AND date >= @start AND date <= @end ORDER BY date ASC`,
        { sym: "AAPL", start: "2021-01-01", end: "2026-02-13" }
      ),
    },
    {
      name: "2. Multi-symbol price history (10 symbols, 3 years)",
      pgFn: () => pool.query(
        `SELECT symbol, date, open, high, low, close, volume FROM price_history WHERE symbol = ANY($1) AND date >= $2 AND date <= $3 ORDER BY symbol, date ASC`,
        [["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "JPM", "V", "JNJ"], "2023-01-01", "2026-02-13"]
      ).then(r => r.rows),
      bqFn: () => queryBigQuery(
        `SELECT symbol, date, open, high, low, close, volume FROM ${tbl("stocks", "price_history")} WHERE symbol IN UNNEST(@syms) AND date >= @start AND date <= @end ORDER BY symbol, date ASC`,
        { syms: ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "JPM", "V", "JNJ"], start: "2023-01-01", end: "2026-02-13" }
      ),
    },
    {
      name: "3. All symbols full scan (1 year, simulating broad backtest)",
      pgFn: () => pool.query(
        `SELECT symbol, date, open, high, low, close, volume FROM price_history WHERE date >= $1 AND date <= $2 AND asset_type = $3 ORDER BY symbol, date ASC`,
        ["2025-01-01", "2026-02-13", "stock"]
      ).then(r => r.rows),
      bqFn: () => queryBigQuery(
        `SELECT symbol, date, open, high, low, close, volume FROM ${tbl("stocks", "price_history")} WHERE date >= @start AND date <= @end ORDER BY symbol, date ASC`,
        { start: "2025-01-01", end: "2026-02-13" }
      ),
    },
    {
      name: "4. All symbols full scan (5 years, large backtest)",
      pgFn: () => pool.query(
        `SELECT symbol, date, open, high, low, close, volume FROM price_history WHERE date >= $1 AND date <= $2 AND asset_type = $3 ORDER BY symbol, date ASC`,
        ["2021-01-01", "2026-02-13", "stock"]
      ).then(r => r.rows),
      bqFn: () => queryBigQuery(
        `SELECT symbol, date, open, high, low, close, volume FROM ${tbl("stocks", "price_history")} WHERE date >= @start AND date <= @end ORDER BY symbol, date ASC`,
        { start: "2021-01-01", end: "2026-02-13" }
      ),
    },
    {
      name: "5. Computed signals scan (latest signals for all stocks)",
      pgFn: () => pool.query(
        `SELECT * FROM computed_signals WHERE asset_type = $1 ORDER BY change_percent DESC`,
        ["stock"]
      ).then(r => r.rows),
      bqFn: () => queryBigQuery(
        `SELECT * FROM ${tbl("stocks", "computed_signals")} ORDER BY change_percent DESC`
      ),
    },
    {
      name: "6. Aggregation query (count by symbol, date range)",
      pgFn: () => pool.query(
        `SELECT symbol, COUNT(*) as cnt, MIN(date) as min_date, MAX(date) as max_date FROM price_history WHERE asset_type = $1 GROUP BY symbol ORDER BY cnt DESC LIMIT 20`,
        ["stock"]
      ).then(r => r.rows),
      bqFn: () => queryBigQuery(
        `SELECT symbol, COUNT(*) as cnt, MIN(date) as min_date, MAX(date) as max_date FROM ${tbl("stocks", "price_history")} GROUP BY symbol ORDER BY cnt DESC LIMIT 20`
      ),
    },
    {
      name: "7. Crypto price history (BTC + ETH, all time)",
      pgFn: () => pool.query(
        `SELECT symbol, date, open, high, low, close, volume FROM price_history WHERE symbol = ANY($1) AND asset_type = $2 ORDER BY symbol, date ASC`,
        [["BTC", "ETH"], "crypto"]
      ).then(r => r.rows),
      bqFn: () => queryBigQuery(
        `SELECT symbol, date, open, high, low, close, volume FROM ${tbl("crypto", "price_history")} WHERE symbol IN UNNEST(@syms) ORDER BY symbol, date ASC`,
        { syms: ["BTC", "ETH"] }
      ),
    },
    {
      name: "8. Exchange-filtered simulation query (NASDAQ stocks, 2 years)",
      pgFn: () => pool.query(
        `SELECT ph.symbol, ph.date, ph.open, ph.high, ph.low, ph.close, ph.volume
         FROM price_history ph JOIN stocks s ON s.symbol = ph.symbol
         WHERE ph.date >= $1 AND ph.date <= $2 AND s.exchange = $3
         ORDER BY ph.symbol, ph.date ASC`,
        ["2024-01-01", "2026-02-13", "NASDAQ"]
      ).then(r => r.rows),
      bqFn: () => queryBigQuery(
        `SELECT ph.symbol, ph.date, ph.open, ph.high, ph.low, ph.close, ph.volume
         FROM ${tbl("stocks", "price_history")} ph
         JOIN ${tbl("stocks", "metadata")} m ON m.symbol = ph.symbol
         WHERE ph.date >= @start AND ph.date <= @end AND m.exchange = @ex
         ORDER BY ph.symbol, ph.date ASC`,
        { start: "2024-01-01", end: "2026-02-13", ex: "NASDAQ" }
      ),
    },
  ];

  for (const test of tests) {
    console.log(`\n${test.name}`);
    console.log("-".repeat(test.name.length));

    const pgResult = await timeQuery(test.name, test.pgFn);
    pgResult.source = "PostgreSQL";
    results.push(pgResult);
    console.log(`  PostgreSQL: ${pgResult.timeMs}ms (${pgResult.rows.toLocaleString()} rows)`);

    const bqResult = await timeQuery(test.name, test.bqFn);
    bqResult.source = "BigQuery";
    results.push(bqResult);
    console.log(`  BigQuery:   ${bqResult.timeMs}ms (${bqResult.rows.toLocaleString()} rows)`);

    const faster = pgResult.timeMs < bqResult.timeMs ? "PostgreSQL" : "BigQuery";
    const ratio = pgResult.timeMs < bqResult.timeMs
      ? (bqResult.timeMs / pgResult.timeMs).toFixed(1)
      : (pgResult.timeMs / bqResult.timeMs).toFixed(1);
    console.log(`  Winner:     ${faster} (${ratio}x faster)`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("  SUMMARY");
  console.log("=".repeat(70));

  let pgWins = 0;
  let bqWins = 0;
  let pgTotalMs = 0;
  let bqTotalMs = 0;

  for (let i = 0; i < results.length; i += 2) {
    const pg = results[i];
    const bq = results[i + 1];
    pgTotalMs += pg.timeMs;
    bqTotalMs += bq.timeMs;
    if (pg.timeMs < bq.timeMs) pgWins++;
    else bqWins++;
  }

  console.log(`  PostgreSQL wins: ${pgWins}/${tests.length}`);
  console.log(`  BigQuery wins:   ${bqWins}/${tests.length}`);
  console.log(`  PostgreSQL total: ${pgTotalMs}ms`);
  console.log(`  BigQuery total:   ${bqTotalMs}ms`);
  console.log(`  Overall winner:   ${pgTotalMs < bqTotalMs ? "PostgreSQL" : "BigQuery"} (${(Math.max(pgTotalMs, bqTotalMs) / Math.min(pgTotalMs, bqTotalMs)).toFixed(1)}x faster)`);

  console.log("\n  COST ANALYSIS:");
  console.log("  - PostgreSQL (Replit): Included with workspace, no per-query cost");
  console.log("  - BigQuery: $6.25/TB scanned (on-demand), first 1TB/month free");
  console.log("  - With ~6M rows (~1GB), typical simulation scans ~100MB-1GB");
  console.log("  - Monthly cost estimate at moderate use: $0-5/month BigQuery");

  await pool.end();
}

runBenchmarks().catch(err => {
  console.error("Benchmark failed:", err.message);
  process.exit(1);
});
