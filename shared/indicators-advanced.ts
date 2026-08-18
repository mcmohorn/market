import type { StockBar } from "./types";

// Extended technical indicators, kept separate from indicators.ts (which owns the
// core MACD/RSI/ADX/MA50/Bollinger stack that feeds computed_signals). These feed
// the advanced_indicators table instead — a distinct expansion pass over the same
// StockBar[] input, computed at the current bar (not a full per-bar history).

export interface AdvancedIndicatorSnapshot {
  stochRsi: number;
  stochRsiK: number;
  stochRsiD: number;
  vwap: number;
  obv: number;
  obvTrend: "UP" | "DOWN" | "FLAT";
  atr: number;
  atrPct: number;
  williamsR: number;
}

/** Classic RSI series (Wilder smoothing), same formula as indicators.ts's calculateRSI
 *  but returned as a plain array so it can feed Stochastic RSI without recomputing
 *  the full IndicatorData shape. */
function rsiSeries(bars: StockBar[], period = 14): number[] {
  const out = new Array(bars.length).fill(50);
  if (bars.length < period + 1) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < bars.length; i++) {
    const change = bars[i].close - bars[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Stochastic RSI: normalizes RSI's own recent range to [0,100], then smooths
 *  with %K/%D moving averages — more sensitive than raw RSI to short-term swings. */
function calculateStochRsi(bars: StockBar[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3) {
  const rsi = rsiSeries(bars, rsiPeriod);
  const n = bars.length;
  if (n < rsiPeriod + stochPeriod) return { stochRsi: 0, stochRsiK: 0, stochRsiD: 0 };

  const stoch = new Array(n).fill(0);
  for (let i = stochPeriod - 1; i < n; i++) {
    const window = rsi.slice(i - stochPeriod + 1, i + 1);
    const lo = Math.min(...window);
    const hi = Math.max(...window);
    stoch[i] = hi === lo ? 0 : ((rsi[i] - lo) / (hi - lo)) * 100;
  }

  const smoothAvg = (series: number[], end: number, period: number) => {
    const start = Math.max(0, end - period + 1);
    const slice = series.slice(start, end + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  };

  const kSeries = new Array(n).fill(0);
  for (let i = 0; i < n; i++) kSeries[i] = smoothAvg(stoch, i, kSmooth);
  const dSeries = new Array(n).fill(0);
  for (let i = 0; i < n; i++) dSeries[i] = smoothAvg(kSeries, i, dSmooth);

  return { stochRsi: stoch[n - 1], stochRsiK: kSeries[n - 1], stochRsiD: dSeries[n - 1] };
}

/** Volume-Weighted Average Price over the trailing window (default 20 bars —
 *  there's no true intraday session reset available from daily bars, so this is
 *  a rolling VWAP rather than a session VWAP). */
function calculateVWAP(bars: StockBar[], period = 20): number {
  const start = Math.max(0, bars.length - period);
  const slice = bars.slice(start);
  let pv = 0;
  let v = 0;
  for (const b of slice) {
    const typicalPrice = (b.high + b.low + b.close) / 3;
    pv += typicalPrice * b.volume;
    v += b.volume;
  }
  return v > 0 ? pv / v : slice.length > 0 ? slice[slice.length - 1].close : 0;
}

/** On-Balance Volume: cumulative volume signed by daily price direction. Trend is
 *  read off the slope of the last 10 bars of OBV, not its absolute level. */
function calculateOBV(bars: StockBar[]): { obv: number; obvTrend: "UP" | "DOWN" | "FLAT" } {
  const series = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) series[i] = series[i - 1] + bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) series[i] = series[i - 1] - bars[i].volume;
    else series[i] = series[i - 1];
  }
  const n = series.length;
  const lookback = Math.min(10, n - 1);
  const obv = series[n - 1] || 0;
  if (lookback < 2) return { obv, obvTrend: "FLAT" };
  const delta = series[n - 1] - series[n - 1 - lookback];
  const trend = delta > 0 ? "UP" : delta < 0 ? "DOWN" : "FLAT";
  return { obv, obvTrend: trend };
}

/** Average True Range (Wilder smoothing) — volatility in price units and as a
 *  percent of the last close, so it's comparable across symbols of any price. */
function calculateATR(bars: StockBar[], period = 14): { atr: number; atrPct: number } {
  if (bars.length < period + 1) return { atr: 0, atrPct: 0 };
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const { high, low } = bars[i];
    const prevClose = bars[i - 1].close;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  let atr = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  const lastClose = bars[bars.length - 1].close;
  return { atr, atrPct: lastClose > 0 ? (atr / lastClose) * 100 : 0 };
}

/** Williams %R: like Stochastic but inverted/unscaled ([-100, 0]), 0 = at the
 *  period high, -100 = at the period low. */
function calculateWilliamsR(bars: StockBar[], period = 14): number {
  if (bars.length < period) return 0;
  const window = bars.slice(bars.length - period);
  const hi = Math.max(...window.map(b => b.high));
  const lo = Math.min(...window.map(b => b.low));
  const close = bars[bars.length - 1].close;
  return hi === lo ? 0 : ((hi - close) / (hi - lo)) * -100;
}

export function analyzeAdvanced(bars: StockBar[]): AdvancedIndicatorSnapshot | null {
  if (bars.length < 30) return null;
  const stoch = calculateStochRsi(bars);
  const vwap = calculateVWAP(bars);
  const { obv, obvTrend } = calculateOBV(bars);
  const { atr, atrPct } = calculateATR(bars);
  const williamsR = calculateWilliamsR(bars);
  return { ...stoch, vwap, obv, obvTrend, atr, atrPct, williamsR };
}
