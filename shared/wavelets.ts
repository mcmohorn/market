import type { StockBar } from "./types";

// Multi-level Haar discrete wavelet transform (DWT) over the close-price series.
// Haar is the simplest wavelet — each level replaces adjacent pairs with their
// average (the next level's approximation) and half-difference (the detail
// coefficients for that level), which is exactly a trend/noise split at
// progressively coarser time scales. No external DSP library needed.

export interface WaveletFeatures {
  levels: number;
  trendEnergyPct: number;
  noiseEnergyPct: number;
  dominantCycleLength: number;
  denoisedPrice: number;
  denoisedSlopePct: number;
  waveletSignal: "BUY" | "SELL" | "HOLD";
}

interface DwtLevel {
  approx: number[];
  detail: number[];
}

/** One level of the Haar transform: pairs [a,b] -> approx (a+b)/sqrt2, detail (a-b)/sqrt2.
 *  Drops a trailing odd element (carried through unchanged) so every level works on pairs. */
function haarStep(signal: number[]): DwtLevel {
  const n = signal.length;
  const half = Math.floor(n / 2);
  const approx: number[] = new Array(half);
  const detail: number[] = new Array(half);
  const SQRT2 = Math.SQRT2;
  for (let i = 0; i < half; i++) {
    const a = signal[2 * i];
    const b = signal[2 * i + 1];
    approx[i] = (a + b) / SQRT2;
    detail[i] = (a - b) / SQRT2;
  }
  return { approx, detail };
}

function energy(series: number[]): number {
  return series.reduce((s, v) => s + v * v, 0);
}

/** Decomposes `signal` down to `maxLevels` (or fewer if the series is too short),
 *  returning each level's detail coefficients and its approximation (so callers
 *  can reconstruct a trend at any depth, not just the coarsest one). */
function decompose(signal: number[], maxLevels: number): { details: number[][]; approxByLevel: number[][] } {
  const details: number[][] = [];
  const approxByLevel: number[][] = [];
  let current = signal;
  let levels = 0;
  while (levels < maxLevels && current.length >= 4) {
    const { approx, detail } = haarStep(current);
    details.push(detail);
    approxByLevel.push(approx);
    current = approx;
    levels++;
  }
  return { details, approxByLevel };
}

/** Reconstructs a denoised (trend-only) series by inverse-transforming with all
 *  detail coefficients zeroed — i.e. only the coarsest approximation survives,
 *  upsampled back through each level by repeating values (a simple, stable
 *  reconstruction that avoids re-deriving the full inverse Haar transform). */
function reconstructTrend(finalApprox: number[], levels: number): number[] {
  let series = finalApprox;
  for (let i = 0; i < levels; i++) {
    const upsampled: number[] = [];
    for (const v of series) {
      // With detail assumed 0, a level's two source samples were equal, so
      // approx = (a+b)/sqrt2 = a*sqrt2 => a = b = approx/sqrt2.
      const point = v / Math.SQRT2;
      upsampled.push(point, point);
    }
    series = upsampled;
  }
  return series;
}

export function analyzeWavelet(bars: StockBar[], maxLevels = 5): WaveletFeatures | null {
  if (bars.length < 32) return null;

  const closes = bars.map(b => b.close);
  // Use the most recent power-of-two-friendly window so pairing is clean.
  const windowSize = Math.min(closes.length, 256);
  const signal = closes.slice(closes.length - windowSize);

  const { details, approxByLevel } = decompose(signal, maxLevels);
  if (details.length === 0) return null;

  const finalApprox = approxByLevel[approxByLevel.length - 1];
  const totalEnergy = energy(signal) || 1;
  const noiseEnergy = details.reduce((s, d) => s + energy(d), 0);
  const trendEnergy = energy(finalApprox);
  const trendEnergyPct = Math.min(100, (trendEnergy / totalEnergy) * 100);
  const noiseEnergyPct = Math.min(100, (noiseEnergy / totalEnergy) * 100);

  // Dominant cycle: the detail level carrying the most energy corresponds to a
  // time scale of 2^level bars — report that as the dominant cycle length.
  let dominantLevelIdx = 0;
  let maxLevelEnergy = -Infinity;
  details.forEach((d, idx) => {
    const e = energy(d);
    if (e > maxLevelEnergy) {
      maxLevelEnergy = e;
      dominantLevelIdx = idx;
    }
  });
  const dominantCycleLength = Math.pow(2, dominantLevelIdx + 1);

  // Reconstructing all the way from the coarsest approximation makes a step
  // function with blocks 2^levels bars wide (e.g. 32 bars at 5 levels) — a
  // 10-bar slope lookback then lands inside one flat block most of the time.
  // Use a shallower depth (4-bar blocks) for the trend/slope read specifically,
  // while the energy stats above still reflect the full decomposition depth.
  const trendDepth = Math.min(2, approxByLevel.length);
  const trendApprox = approxByLevel[trendDepth - 1];
  const trend = reconstructTrend(trendApprox, trendDepth);
  const denoisedPrice = trend[trend.length - 1] ?? signal[signal.length - 1];

  const lookback = Math.min(10, trend.length - 1);
  const priorTrend = trend[trend.length - 1 - lookback];
  const denoisedSlopePct = priorTrend && priorTrend !== 0
    ? ((denoisedPrice - priorTrend) / priorTrend) * 100
    : 0;

  let waveletSignal: "BUY" | "SELL" | "HOLD" = "HOLD";
  if (denoisedSlopePct > 0.5) waveletSignal = "BUY";
  else if (denoisedSlopePct < -0.5) waveletSignal = "SELL";

  return {
    levels: details.length,
    trendEnergyPct,
    noiseEnergyPct,
    dominantCycleLength,
    denoisedPrice,
    denoisedSlopePct,
    waveletSignal,
  };
}
