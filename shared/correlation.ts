import type { StockBar } from "./types";

// Correlation, beta, and relative strength vs. a benchmark series (SPY for stocks,
// BTC for crypto), plus correlation vs. a sector-average return series. All inputs
// are plain aligned-by-date daily bar arrays — alignment/date-matching happens in
// the caller (scripts/compute-advanced-indicators.ts), this module is pure math.

export interface CorrelationStats {
  correlation90d: number;
  beta90d: number;
  relativeStrength90d: number;
}

function dailyReturns(bars: StockBar[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    out.push(prev !== 0 ? (bars[i].close - prev) / prev : 0);
  }
  return out;
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const x = a.slice(a.length - n);
  const y = b.slice(b.length - n);
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  const denom = Math.sqrt(varX * varY);
  return denom === 0 ? 0 : cov / denom;
}

function beta(symbolReturns: number[], benchmarkReturns: number[]): number {
  const n = Math.min(symbolReturns.length, benchmarkReturns.length);
  if (n < 2) return 0;
  const x = benchmarkReturns.slice(benchmarkReturns.length - n);
  const y = symbolReturns.slice(symbolReturns.length - n);
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varX = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - meanX) * (y[i] - meanY);
    varX += (x[i] - meanX) * (x[i] - meanX);
  }
  return varX === 0 ? 0 : cov / varX;
}

function cumulativeReturnPct(bars: StockBar[], lookback: number): number {
  if (bars.length < 2) return 0;
  const start = Math.max(0, bars.length - 1 - lookback);
  const startPrice = bars[start].close;
  const endPrice = bars[bars.length - 1].close;
  return startPrice !== 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;
}

/** symbolBars and benchmarkBars must already be date-aligned by the caller
 *  (same trading days, same order) — correlation/beta on misaligned series is
 *  meaningless, so this function trusts the caller rather than re-aligning. */
export function computeCorrelationStats(
  symbolBars: StockBar[],
  benchmarkBars: StockBar[],
  lookbackDays = 90
): CorrelationStats {
  const symWindow = symbolBars.slice(-lookbackDays - 1);
  const benchWindow = benchmarkBars.slice(-lookbackDays - 1);
  const symReturns = dailyReturns(symWindow);
  const benchReturns = dailyReturns(benchWindow);

  const correlation90d = pearsonCorrelation(symReturns, benchReturns);
  const beta90d = beta(symReturns, benchReturns);
  const symRet = cumulativeReturnPct(symbolBars, lookbackDays);
  const benchRet = cumulativeReturnPct(benchmarkBars, lookbackDays);
  const relativeStrength90d = symRet - benchRet;

  return { correlation90d, beta90d, relativeStrength90d };
}

/** Correlation of a symbol's returns against the average daily return across a
 *  basket of sector peers (peerBarsList already date-aligned to symbolBars by
 *  the caller). */
export function computeSectorCorrelation(symbolBars: StockBar[], peerBarsList: StockBar[][], lookbackDays = 90): number {
  if (peerBarsList.length === 0) return 0;
  const symReturns = dailyReturns(symbolBars.slice(-lookbackDays - 1));
  const peerReturnsList = peerBarsList.map(p => dailyReturns(p.slice(-lookbackDays - 1)));
  const n = Math.min(symReturns.length, ...peerReturnsList.map(r => r.length));
  if (n < 2) return 0;

  const avgPeerReturns: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (const r of peerReturnsList) sum += r[r.length - n + i];
    avgPeerReturns.push(sum / peerReturnsList.length);
  }

  return pearsonCorrelation(symReturns.slice(-n), avgPeerReturns);
}
