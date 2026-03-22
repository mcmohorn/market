/**
 * MATEO Strategy Lab — Evolutionary Strategy Optimizer
 *
 * Phases:
 *   1. Load          — pull historical bars from Postgres for top liquid symbols
 *   2. Random search — sample 600 random genomes, quick-backtest each over many windows
 *   3. Genetic algo  — evolve from the best random survivors
 *   4. Neuroevolution— OpenAI-ES trains a small NN to generate its own buy/sell signals
 *   5. Final valid.  — full multi-symbol portfolio sim for top candidates
 *   6. Output        — JSON + ready-to-paste TypeScript for the Simulation Lab
 *
 * Run:  npx tsx scripts/strategy-lab.ts
 * Time: expect 1-4 hours depending on data volume + iteration counts in CFG
 */

import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { StrategyParams, IndicatorData } from "../shared/types.js";
import { computeIndicators, _simulateOnData, loadPriceData } from "../server/simulation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── TUNABLE CONFIG ──────────────────────────────────────────────────────────

const CFG = {
  assetType: "stock" as const,
  minDataYears: 5,       // only symbols with at least this much history
  maxSymbols: 80,        // top N most-data symbols for validation pool
  evalSymbols: 20,       // smaller subset used in the fast inner training loop
  testWindows: 30,       // random ~1-year windows per genome in quick-eval
  windowLenDays: 365,

  // Phase 2: random search
  randomPopSize: 600,

  // Phase 3: genetic algorithm
  gaPopSize: 80,
  gaGenerations: 120,
  gaTournamentK: 4,
  gaMutationSigma: 0.08,
  gaEliteCount: 8,

  // Phase 4: neuroevolution (OpenAI ES)
  esPopSize: 150,
  esGenerations: 300,
  esSigma: 0.05,
  esLearningRate: 0.01,
  esNNHidden: 12,        // hidden neurons in the NN

  // Phase 5: final validation
  finalValidationYears: 5,

  topK: 5,               // how many strategies to surface in the final output
  outDir: path.join(__dirname, "output"),
};

// ─── GENOME / PARAMETER ENCODING ─────────────────────────────────────────────
// Each genome is a vector of 12 floats ∈ [0,1] mapping to strategy params.

interface Genome {
  macdFast: number;       // → macdFastPeriod  [8-16]
  macdSlow: number;       // → macdSlowPeriod  [20-35]
  macdSignal: number;     // → macdSignalPeriod [5-15]
  rsiPeriod: number;      // → rsiPeriod       [8-22]
  rsiOverbought: number;  // → rsiOverbought   [60-82]
  rsiOversold: number;    // → rsiOversold     [18-40]
  minBuySignal: number;   // → minBuySignal    [1-6]
  maxPositionPct: number; // → maxPositionPct  [10-50]
  stopLossPct: number;    // → stopLossPct     [3-20]
  takeProfitPct: number;  // → takeProfitPct   [8-45]
  preferNewBuys: number;  // → boolean at 0.5
  minHoldDays: number;    // → minHoldDays     [0-10]
}

function lerp(lo: number, hi: number, t: number) {
  return lo + (hi - lo) * Math.max(0, Math.min(1, t));
}

function genomeToParams(g: Genome): StrategyParams {
  const fast = Math.round(lerp(8, 16, g.macdFast));
  const slow = Math.max(fast + 3, Math.round(lerp(20, 35, g.macdSlow)));
  return {
    macdFastPeriod:    fast,
    macdSlowPeriod:    slow,
    macdSignalPeriod:  Math.round(lerp(5, 15, g.macdSignal)),
    rsiPeriod:         Math.round(lerp(8, 22, g.rsiPeriod)),
    rsiOverbought:     lerp(60, 82, g.rsiOverbought),
    rsiOversold:       lerp(18, 40, g.rsiOversold),
    minBuySignal:      Math.round(lerp(1, 6, g.minBuySignal)),
    maxPositionPct:    lerp(10, 50, g.maxPositionPct),
    stopLossPct:       lerp(3, 20, g.stopLossPct),
    takeProfitPct:     lerp(8, 45, g.takeProfitPct),
    preferNewBuys:     g.preferNewBuys > 0.5,
    minHoldDays:       Math.round(lerp(0, 10, g.minHoldDays)),
    // fixed defaults
    maxSharePrice:     1000,
    minCashReserve:    100,
    maxTradesPerDay:   0,
    minDataDays:       30,
    minTradeValue:     50,
    useEndOfDayPrices: true,
    newBuyLookbackDays: 5,
  };
}

function randomGenome(): Genome {
  return {
    macdFast: Math.random(), macdSlow: Math.random(), macdSignal: Math.random(),
    rsiPeriod: Math.random(), rsiOverbought: Math.random(), rsiOversold: Math.random(),
    minBuySignal: Math.random(), maxPositionPct: Math.random(),
    stopLossPct: Math.random(), takeProfitPct: Math.random(),
    preferNewBuys: Math.random(), minHoldDays: Math.random(),
  };
}

function genomeToVec(g: Genome): number[] { return Object.values(g); }
function vecToGenome(v: number[]): Genome {
  const keys = Object.keys(randomGenome()) as (keyof Genome)[];
  const g: Partial<Genome> = {};
  keys.forEach((k, i) => { (g as any)[k] = Math.max(0, Math.min(1, v[i] ?? 0.5)); });
  return g as Genome;
}

// ─── DATA TYPES ───────────────────────────────────────────────────────────────

interface PriceBar { date: string; close: number; volume: number; }
interface SymbolBars { symbol: string; bars: PriceBar[]; }

// ─── MINI BACKTESTER ─────────────────────────────────────────────────────────
// Single-symbol, single-window — used inside the GA/random-search inner loop.
// Uses the same buy/sell logic as _simulateOnData but without multi-symbol
// portfolio overhead, so it runs ~50× faster.

interface QuickResult { totalReturnPct: number; sharpe: number; maxDrawdownPct: number; }

function quickBacktest(
  bars: PriceBar[],
  indicators: IndicatorData[],
  params: StrategyParams,
  startDate: string,
  endDate: string,
  initialCapital = 10_000
): QuickResult {
  // Build date → indicator index lookup
  const dateToIdx = new Map<string, number>();
  indicators.forEach((ind, i) => dateToIdx.set(ind.date, i));

  let cash = initialCapital;
  let shares = 0;
  let entryPrice = 0;
  let entryDate = "";
  let peak = initialCapital;
  let maxDD = 0;
  const dailyValues: number[] = [];

  for (const bar of bars) {
    if (bar.date < startDate || bar.date > endDate) continue;

    const indIdx = dateToIdx.get(bar.date);
    const ind = indIdx !== undefined ? indicators[indIdx] : undefined;
    const price = bar.close;
    const portfolioVal = cash + shares * price;

    if (portfolioVal > peak) peak = portfolioVal;
    const dd = (peak - portfolioVal) / peak * 100;
    if (dd > maxDD) maxDD = dd;
    dailyValues.push(portfolioVal);

    if (!ind) continue;

    // Derive BUY / SELL decision from MACD buySignal + RSI thresholds
    const wantBuy  = ind.buySignal && ind.rsi < params.rsiOverbought;
    const wantSell = !ind.buySignal || ind.rsi > params.rsiOverbought;

    if (shares > 0) {
      const daysHeld = daysBetween(entryDate, bar.date);
      const retPct = (price - entryPrice) / entryPrice * 100;
      const stopHit = retPct <= -params.stopLossPct;
      const tpHit   = retPct >=  params.takeProfitPct;
      const canSell = daysHeld >= (params.minHoldDays ?? 0);
      if (stopHit || tpHit || (wantSell && canSell)) {
        cash += shares * price;
        shares = 0;
      }
    }

    if (shares === 0 && wantBuy && cash >= (params.minTradeValue ?? 0)) {
      if (price <= params.maxSharePrice) {
        const maxSpend = cash * (params.maxPositionPct / 100);
        const canBuy = Math.floor(maxSpend / price);
        if (canBuy > 0) {
          shares = canBuy;
          cash -= shares * price;
          entryPrice = price;
          entryDate = bar.date;
        }
      }
    }
  }

  // Close any open position at period end
  if (shares > 0) {
    const last = [...bars].reverse().find(b => b.date <= endDate);
    if (last) { cash += shares * last.close; shares = 0; }
  }

  const totalReturnPct = (cash - initialCapital) / initialCapital * 100;

  // Annualised Sharpe from daily P&L
  let sharpe = 0;
  if (dailyValues.length > 2) {
    const dr: number[] = [];
    for (let i = 1; i < dailyValues.length; i++) {
      dr.push((dailyValues[i] - dailyValues[i - 1]) / dailyValues[i - 1]);
    }
    const mean = dr.reduce((a, b) => a + b, 0) / dr.length;
    const std  = Math.sqrt(dr.reduce((s, r) => s + (r - mean) ** 2, 0) / dr.length);
    sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;
  }

  return { totalReturnPct, sharpe, maxDrawdownPct: maxDD };
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

// ─── FITNESS FUNCTION ────────────────────────────────────────────────────────

interface FitnessScore {
  totalReturnPct: number; sharpe: number; maxDrawdownPct: number; fitness: number;
}

function computeFitness(
  symbols: SymbolBars[],
  params: StrategyParams,
  windows: Array<{ startDate: string; endDate: string }>
): FitnessScore {
  const results: QuickResult[] = [];
  for (const sym of symbols) {
    const stBars = sym.bars.map(b => ({
      date: b.date, open: b.close, high: b.close, low: b.close,
      close: b.close, volume: b.volume,
    }));
    const indicators = computeIndicators(stBars, params);
    for (const win of windows) {
      results.push(quickBacktest(sym.bars, indicators, params, win.startDate, win.endDate));
    }
  }
  if (results.length === 0) return { totalReturnPct: 0, sharpe: 0, maxDrawdownPct: 0, fitness: -999 };

  const avgRet    = results.reduce((s, r) => s + r.totalReturnPct,  0) / results.length;
  const avgSharpe = results.reduce((s, r) => s + r.sharpe,          0) / results.length;
  const avgDD     = results.reduce((s, r) => s + r.maxDrawdownPct,  0) / results.length;

  const ddPenalty = Math.min(1, avgDD / 50);
  const fitness   = avgSharpe * (1 - 0.4 * ddPenalty) +
                    0.1 * Math.sign(avgRet) * Math.log1p(Math.abs(avgRet));

  return { totalReturnPct: avgRet, sharpe: avgSharpe, maxDrawdownPct: avgDD, fitness };
}

// ─── PHASE 2: RANDOM SEARCH ──────────────────────────────────────────────────

function phase2_randomSearch(
  symbols: SymbolBars[],
  windows: Array<{ startDate: string; endDate: string }>
): Array<{ genome: Genome; score: FitnessScore }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PHASE 2 — Random Search  (${CFG.randomPopSize} genomes × ${windows.length} windows)`);
  console.log("=".repeat(60));

  const results: Array<{ genome: Genome; score: FitnessScore }> = [];
  const logEvery = Math.ceil(CFG.randomPopSize / 20);

  for (let i = 0; i < CFG.randomPopSize; i++) {
    const genome = randomGenome();
    const score = computeFitness(symbols, genomeToParams(genome), windows);
    results.push({ genome, score });

    if ((i + 1) % logEvery === 0 || i === 0) {
      const best = results.reduce((b, r) => r.score.fitness > b.score.fitness ? r : b);
      console.log(
        `  [${String(i + 1).padStart(4)}/${CFG.randomPopSize}]  ` +
        `best fit=${best.score.fitness.toFixed(3)}  ` +
        `sharpe=${best.score.sharpe.toFixed(2)}  ` +
        `ret=${best.score.totalReturnPct.toFixed(1)}%  ` +
        `dd=${best.score.maxDrawdownPct.toFixed(1)}%`
      );
    }
  }

  results.sort((a, b) => b.score.fitness - a.score.fitness);
  console.log(`\n  ✓ Top random: fitness=${results[0].score.fitness.toFixed(3)}  sharpe=${results[0].score.sharpe.toFixed(2)}`);
  return results;
}

// ─── PHASE 3: GENETIC ALGORITHM ──────────────────────────────────────────────

function tournament(pop: Array<{ vec: number[]; fitness: number }>, k: number) {
  const contenders = Array.from({ length: k }, () => pop[Math.floor(Math.random() * pop.length)]);
  return contenders.reduce((best, c) => c.fitness > best.fitness ? c : best);
}

function crossover(a: number[], b: number[]): number[] {
  return a.map((v, i) => Math.random() < 0.5 ? v : b[i]);
}

function mutate(v: number[], sigma: number): number[] {
  return v.map(x => Math.max(0, Math.min(1, x + (Math.random() * 2 - 1) * sigma)));
}

function phase3_genetic(
  seeds: Array<{ genome: Genome; score: FitnessScore }>,
  symbols: SymbolBars[],
  windows: Array<{ startDate: string; endDate: string }>
): Array<{ genome: Genome; score: FitnessScore }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PHASE 3 — Genetic Algorithm  (pop=${CFG.gaPopSize}, gen=${CFG.gaGenerations})`);
  console.log("=".repeat(60));

  let pop = seeds.slice(0, CFG.gaPopSize).map(s => ({
    vec: genomeToVec(s.genome), fitness: s.score.fitness,
  }));

  while (pop.length < CFG.gaPopSize) {
    const g = randomGenome();
    pop.push({ vec: genomeToVec(g), fitness: computeFitness(symbols, genomeToParams(g), windows).fitness });
  }

  for (let gen = 0; gen < CFG.gaGenerations; gen++) {
    pop.sort((a, b) => b.fitness - a.fitness);
    const elite = pop.slice(0, CFG.gaEliteCount);

    const children: typeof pop = [];
    while (children.length < CFG.gaPopSize - CFG.gaEliteCount) {
      const childVec = mutate(crossover(tournament(pop, CFG.gaTournamentK).vec, tournament(pop, CFG.gaTournamentK).vec), CFG.gaMutationSigma);
      const g = vecToGenome(childVec);
      children.push({ vec: childVec, fitness: computeFitness(symbols, genomeToParams(g), windows).fitness });
    }

    pop = [...elite, ...children];

    if ((gen + 1) % 10 === 0 || gen === 0) {
      pop.sort((a, b) => b.fitness - a.fitness);
      const p = genomeToParams(vecToGenome(pop[0].vec));
      console.log(
        `  Gen ${String(gen + 1).padStart(3)}/${CFG.gaGenerations}  ` +
        `fit=${pop[0].fitness.toFixed(3)}  ` +
        `MACD=${p.macdFastPeriod}/${p.macdSlowPeriod}/${p.macdSignalPeriod}  ` +
        `RSI=${p.rsiPeriod}(${p.rsiOversold.toFixed(0)}-${p.rsiOverbought.toFixed(0)})  ` +
        `SL=${p.stopLossPct.toFixed(1)}%  TP=${p.takeProfitPct.toFixed(1)}%`
      );
    }
  }

  pop.sort((a, b) => b.fitness - a.fitness);
  return pop.slice(0, CFG.topK * 3).map(p => {
    const genome = vecToGenome(p.vec);
    const score = computeFitness(symbols, genomeToParams(genome), windows);
    return { genome, score };
  });
}

// ─── PHASE 4: NEUROEVOLUTION ─────────────────────────────────────────────────
//
// Small feedforward NN: 6 inputs → HIDDEN hidden (tanh) → 1 output (tanh)
// Trained via OpenAI Evolution Strategy.
//
// Input features per bar:
//   [0] (RSI - 50) / 50
//   [1] MACD histogram z-score
//   [2] MACD fast (line) z-score
//   [3] tanh(5-day price momentum × 10)
//   [4] tanh(20-day price momentum × 5)
//   [5] tanh(volume ratio vs avg)
//
// Signal: output > 0.2 → BUY, < -0.2 → SELL, else → HOLD

const IN  = 6;
const HID = CFG.esNNHidden;
const OUT = 1;
const NN_LEN = IN * HID + HID + HID * OUT + OUT;  // weights + biases

function forwardNN(w: Float64Array, input: number[]): number {
  const h = new Array<number>(HID);
  for (let j = 0; j < HID; j++) {
    let s = w[IN * HID + j]; // hidden bias
    for (let i = 0; i < IN; i++) s += w[i * HID + j] * input[i];
    h[j] = Math.tanh(s);
  }
  const off = IN * HID + HID;
  let out = w[off + HID]; // output bias
  for (let j = 0; j < HID; j++) out += w[off + j] * h[j];
  return Math.tanh(out);
}

function nnToSignal(out: number): "BUY" | "SELL" | "HOLD" {
  return out > 0.2 ? "BUY" : out < -0.2 ? "SELL" : "HOLD";
}

interface NNFeatureRow { date: string; close: number; features: number[]; }

function buildNNFeatures(bars: PriceBar[]): NNFeatureRow[] {
  if (bars.length < 25) return [];
  const closes  = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume);
  const avgVol  = volumes.reduce((a, b) => a + b, 0) / volumes.length || 1;

  // A very light MACD / RSI approximation just for feature generation.
  // We use a simple 12/26 EMA difference as the MACD-like feature and a
  // 14-period RSI — these are fixed here because NN learns its own thresholds.
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdArr = closes.map((_, i) => ema12[i] - ema26[i]);
  const rsiArr  = simpleRSI(closes, 14);

  const histVals = macdArr.filter(v => isFinite(v));
  const histStd  = stdDev(histVals) || 1;
  const histMean = histVals.reduce((a, b) => a + b, 0) / histVals.length;

  const rows: NNFeatureRow[] = [];
  for (let i = 26; i < bars.length; i++) {
    const mom5  = i >= 5  ? (closes[i] - closes[i - 5])  / closes[i - 5]  : 0;
    const mom20 = i >= 20 ? (closes[i] - closes[i - 20]) / closes[i - 20] : 0;
    const volR  = volumes[i] / avgVol - 1;
    rows.push({
      date: bars[i].date,
      close: bars[i].close,
      features: [
        (rsiArr[i] - 50) / 50,
        (macdArr[i] - histMean) / histStd,
        ema12[i] / (ema26[i] || 1) - 1,
        Math.tanh(mom5 * 10),
        Math.tanh(mom20 * 5),
        Math.tanh(volR),
      ],
    });
  }
  return rows;
}

function nnQuickBacktest(
  rows: NNFeatureRow[],
  weights: Float64Array,
  params: StrategyParams,
  startDate: string,
  endDate: string,
  initialCapital = 10_000
): QuickResult {
  let cash = initialCapital;
  let shares = 0;
  let entryPrice = 0;
  let entryDate = "";
  let peak = initialCapital;
  let maxDD = 0;
  const dailyVals: number[] = [];

  for (const row of rows) {
    if (row.date < startDate || row.date > endDate) continue;
    const price = row.close;
    const pv = cash + shares * price;
    if (pv > peak) peak = pv;
    const dd = (peak - pv) / peak * 100;
    if (dd > maxDD) maxDD = dd;
    dailyVals.push(pv);

    const sig = nnToSignal(forwardNN(weights, row.features));
    if (shares > 0) {
      const ret = (price - entryPrice) / entryPrice * 100;
      const held = daysBetween(entryDate, row.date);
      if (ret <= -params.stopLossPct || ret >= params.takeProfitPct || (sig === "SELL" && held >= (params.minHoldDays ?? 0))) {
        cash += shares * price; shares = 0;
      }
    }
    if (shares === 0 && sig === "BUY" && cash >= 50 && price <= params.maxSharePrice) {
      const n = Math.floor(cash * (params.maxPositionPct / 100) / price);
      if (n > 0) { shares = n; cash -= n * price; entryPrice = price; entryDate = row.date; }
    }
  }
  if (shares > 0) { const last = [...rows].reverse().find(r => r.date <= endDate); if (last) { cash += shares * last.close; } }

  const ret = (cash - initialCapital) / initialCapital * 100;
  let sharpe = 0;
  if (dailyVals.length > 2) {
    const dr = dailyVals.slice(1).map((v, i) => (v - dailyVals[i]) / dailyVals[i]);
    const m = dr.reduce((a, b) => a + b, 0) / dr.length;
    const s = Math.sqrt(dr.reduce((a, v) => a + (v - m) ** 2, 0) / dr.length);
    sharpe = s > 0 ? (m / s) * Math.sqrt(252) : 0;
  }
  return { totalReturnPct: ret, sharpe, maxDrawdownPct: maxDD };
}

function evalNN(
  weights: Float64Array,
  symFeatures: Array<{ rows: NNFeatureRow[] }>,
  windows: Array<{ startDate: string; endDate: string }>,
  params: StrategyParams
): number {
  let total = 0; let n = 0;
  for (const s of symFeatures) {
    for (const w of windows) {
      const r = nnQuickBacktest(s.rows, weights, params, w.startDate, w.endDate);
      total += r.sharpe - 0.3 * (r.maxDrawdownPct / 30);
      n++;
    }
  }
  return n > 0 ? total / n : -999;
}

function phase4_neuroevolution(
  symbols: SymbolBars[],
  windows: Array<{ startDate: string; endDate: string }>,
  defaultParams: StrategyParams
): { weights: Float64Array; fitness: number } {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PHASE 4 — Neuroevolution  (ES pop=${CFG.esPopSize}, gen=${CFG.esGenerations}, weights=${NN_LEN})`);
  console.log("=".repeat(60));

  const symFeatures = symbols.slice(0, 30).map(s => ({ rows: buildNNFeatures(s.bars) }));
  const evalWins = windows.slice(0, 15); // fast subset

  const nnParams: StrategyParams = { ...defaultParams, maxPositionPct: 25, stopLossPct: 10, takeProfitPct: 20 };

  let theta = new Float64Array(NN_LEN).map(() => (Math.random() * 2 - 1) * 0.3);
  let bestFit = -Infinity;
  let bestW = theta.slice();

  for (let gen = 0; gen < CFG.esGenerations; gen++) {
    const noises: Float64Array[] = [];
    const fits: number[] = [];

    for (let k = 0; k < CFG.esPopSize; k++) {
      const noise = new Float64Array(NN_LEN).map(() => gaussRand());
      const cand = theta.map((v, i) => v + CFG.esSigma * noise[i]) as Float64Array;
      noises.push(noise);
      fits.push(evalNN(cand, symFeatures, evalWins, nnParams));
    }

    const ranked = rankNorm(fits);
    const update = new Float64Array(NN_LEN).fill(0);
    for (let k = 0; k < CFG.esPopSize; k++) {
      for (let w = 0; w < NN_LEN; w++) update[w] += ranked[k] * noises[k][w];
    }
    const scale = CFG.esLearningRate / (CFG.esPopSize * CFG.esSigma);
    for (let w = 0; w < NN_LEN; w++) theta[w] += scale * update[w];

    const curFit = evalNN(theta, symFeatures, evalWins, nnParams);
    if (curFit > bestFit) { bestFit = curFit; bestW = theta.slice(); }

    if ((gen + 1) % 25 === 0 || gen === 0) {
      console.log(`  Gen ${String(gen + 1).padStart(3)}/${CFG.esGenerations}  cur=${curFit.toFixed(3)}  best=${bestFit.toFixed(3)}`);
    }
  }

  console.log(`\n  ✓ Best NN fitness: ${bestFit.toFixed(3)}`);
  return { weights: bestW, fitness: bestFit };
}

// ─── MATH HELPERS ─────────────────────────────────────────────────────────────

let _spare: number | null = null;
function gaussRand(): number {
  if (_spare !== null) { const s = _spare; _spare = null; return s; }
  const u = Math.random(), v = Math.random();
  const m = Math.sqrt(-2 * Math.log(u));
  _spare = m * Math.sin(2 * Math.PI * v);
  return m * Math.cos(2 * Math.PI * v);
}

function rankNorm(fits: number[]): number[] {
  const n = fits.length;
  const sorted = [...fits].sort((a, b) => a - b);
  return fits.map(f => sorted.indexOf(f) / (n - 1) - 0.5);
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 1;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function ema(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out = new Array<number>(prices.length).fill(0);
  out[0] = prices[0];
  for (let i = 1; i < prices.length; i++) out[i] = prices[i] * k + out[i - 1] * (1 - k);
  return out;
}

function simpleRSI(prices: number[], period: number): number[] {
  const out = new Array<number>(prices.length).fill(50);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period && i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  if (period < prices.length) out[period] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    const g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  }
  return out;
}

// ─── PHASE 5: FINAL VALIDATION ───────────────────────────────────────────────

async function phase5_validation(
  candidates: Array<{ name: string; params: StrategyParams; quickFitness: number }>
): Promise<Array<{ name: string; params: StrategyParams; quickFitness: number; result: any }>> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PHASE 5 — Full Portfolio Validation  (${candidates.length} candidates, ${CFG.finalValidationYears} yr)`);
  console.log("=".repeat(60));

  const endDate = new Date().toISOString().split("T")[0];
  const start   = new Date();
  start.setFullYear(start.getFullYear() - CFG.finalValidationYears);
  const startDateStr = start.toISOString().split("T")[0];

  // Warmup window for indicator stability
  const warmup = new Date(start);
  warmup.setDate(warmup.getDate() - 120);
  const warmupStr = warmup.toISOString().split("T")[0];

  console.log(`  Loading ${CFG.finalValidationYears}-year dataset from Postgres…`);
  const allData = await loadPriceData(undefined, warmupStr, endDate, CFG.assetType);
  console.log(`  Loaded ${allData.length} symbols`);

  const validated: Array<{ name: string; params: StrategyParams; quickFitness: number; result: any }> = [];

  for (const c of candidates) {
    for (const sd of allData) {
      sd.indicators = computeIndicators(sd.bars, c.params);
    }
    try {
      const result = _simulateOnData(allData, startDateStr, endDate, 10_000, c.params);
      validated.push({ ...c, result });
      console.log(
        `  ✓ ${c.name.padEnd(38)}  ` +
        `ret=${result.totalReturnPct.toFixed(1)}%  ` +
        `sharpe=${result.sharpeRatio.toFixed(2)}  ` +
        `dd=${result.maxDrawdownPct.toFixed(1)}%  ` +
        `trades=${result.trades.length}`
      );
    } catch (e: any) {
      console.log(`  ✗ ${c.name}: ${e.message}`);
    }
  }

  return validated;
}

// ─── DATA LOADING ────────────────────────────────────────────────────────────

async function loadTestSymbols(pool: Pool): Promise<SymbolBars[]> {
  console.log(`\n${"=".repeat(60)}`);
  console.log("PHASE 1 — Loading historical data from Postgres");
  console.log("=".repeat(60));

  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - CFG.minDataYears);
  const minDateStr = minDate.toISOString().split("T")[0];

  const { rows: symRows } = await pool.query<{ symbol: string; count: string }>(`
    SELECT symbol, COUNT(*) AS count
    FROM price_history
    WHERE asset_type = $1 AND date >= $2
    GROUP BY symbol
    HAVING COUNT(*) >= 800
    ORDER BY count DESC
    LIMIT $3
  `, [CFG.assetType, minDateStr, CFG.maxSymbols]);

  console.log(`  Found ${symRows.length} qualifying symbols`);

  const symbols: SymbolBars[] = [];
  for (const row of symRows) {
    const { rows: bars } = await pool.query<{ date: string; close: string; volume: string }>(`
      SELECT date, close, volume
      FROM price_history
      WHERE symbol = $1 AND asset_type = $2 AND date >= $3
      ORDER BY date ASC
    `, [row.symbol, CFG.assetType, minDateStr]);
    if (bars.length < 200) continue;
    symbols.push({
      symbol: row.symbol,
      bars: bars.map(b => ({
        date: b.date.toString().slice(0, 10),
        close: parseFloat(b.close),
        volume: parseFloat(b.volume),
      })),
    });
  }

  console.log(`  Loaded ${symbols.length} symbols with sufficient history`);
  return symbols;
}

function buildTestWindows(symbols: SymbolBars[]): Array<{ startDate: string; endDate: string }> {
  const allDates = symbols.flatMap(s => s.bars.map(b => b.date)).sort();
  const minTs = new Date(allDates[0]).getTime();
  const maxTs = new Date(allDates[allDates.length - 1]).getTime();
  const winMs = CFG.windowLenDays * 86_400_000;
  const wins: Array<{ startDate: string; endDate: string }> = [];
  for (let i = 0; i < CFG.testWindows; i++) {
    const s = minTs + Math.random() * (maxTs - winMs - minTs);
    wins.push({
      startDate: new Date(s).toISOString().slice(0, 10),
      endDate:   new Date(s + winMs).toISOString().slice(0, 10),
    });
  }
  console.log(`  Built ${wins.length} test windows  (${allDates[0]} → ${allDates[allDates.length - 1]})`);
  return wins;
}

// ─── OUTPUT ──────────────────────────────────────────────────────────────────

function styleLabel(p: StrategyParams): string {
  if (p.stopLossPct < 6 && p.takeProfitPct < 15) return "Precision";
  if (p.takeProfitPct > 32)                        return "Aggressive";
  if (p.stopLossPct < 7)                            return "Defensive";
  if (p.preferNewBuys)                              return "Momentum";
  if (p.rsiPeriod >= 18)                            return "Slow-Trend";
  if (p.macdFastPeriod <= 10)                       return "Fast-Signal";
  return "Balanced";
}

function saveOutput(
  gaResults: Array<{ genome: Genome; score: FitnessScore }>,
  nnResult: { weights: Float64Array; fitness: number },
  validated: Array<{ name: string; params: StrategyParams; quickFitness: number; result: any }>
) {
  fs.mkdirSync(CFG.outDir, { recursive: true });

  const today = new Date().toISOString().split("T")[0];
  const fiveAgo = new Date(); fiveAgo.setFullYear(fiveAgo.getFullYear() - 5);
  const fiveAgoStr = fiveAgo.toISOString().split("T")[0];

  // ── Full results JSON ──────────────────────────────────────────────
  const fullResults = {
    generatedAt: new Date().toISOString(),
    config: CFG,
    gaTopStrategies: gaResults.slice(0, CFG.topK).map((r, i) => ({
      rank: i + 1,
      params: genomeToParams(r.genome),
      quickFitness: r.score.fitness,
      quickSharpe: r.score.sharpe,
      quickReturnPct: r.score.totalReturnPct,
      quickMaxDD: r.score.maxDrawdownPct,
    })),
    nnStrategy: {
      weights: Array.from(nnResult.weights),
      fitness: nnResult.fitness,
      architecture: { inputs: IN, hidden: HID, outputs: OUT },
    },
    validatedResults: validated.map(v => ({
      name: v.name,
      params: v.params,
      quickFitness: v.quickFitness,
      fullReturnPct:  v.result?.totalReturnPct,
      fullSharpe:     v.result?.sharpeRatio,
      fullMaxDD:      v.result?.maxDrawdownPct,
      tradeCount:     v.result?.trades?.length,
    })),
  };
  const jsonPath = path.join(CFG.outDir, "strategy-lab-results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(fullResults, null, 2));
  console.log(`\n  Saved full results     → ${jsonPath}`);

  // ── NN weights JSON ────────────────────────────────────────────────
  const nnPath = path.join(CFG.outDir, "nn-weights.json");
  fs.writeFileSync(nnPath, JSON.stringify({
    weights: Array.from(nnResult.weights), fitness: nnResult.fitness,
    architecture: { inputs: IN, hidden: HID, outputs: OUT },
  }, null, 2));
  console.log(`  Saved NN weights       → ${nnPath}`);

  // ── Built-in strategies TypeScript ────────────────────────────────
  const presets = validated
    .filter(v => v.result)
    .sort((a, b) => (b.result?.sharpeRatio ?? 0) - (a.result?.sharpeRatio ?? 0))
    .slice(0, CFG.topK)
    .map(v => ({
      name: `ML: ${v.name}`,
      startDate: fiveAgoStr,
      endDate: today,
      initialCapital: 10_000,
      params: v.params,
      symbols: [] as string[],
      exchange: "",
      assetType: CFG.assetType,
    }));

  const tsCode = `/**
 * Built-in strategy presets — generated by scripts/strategy-lab.ts
 * Generated: ${new Date().toISOString()}
 *
 * ML-evolved strategies: random search → genetic algorithm → neuroevolution,
 * validated against ${CFG.finalValidationYears} years of real market data.
 * Shown as "Pro Presets" in the Simulation Lab for all Pro members.
 *
 * To regenerate:  npx tsx scripts/strategy-lab.ts
 * To apply:       copy this file to client/src/lib/builtInStrategies.ts
 *                 then run:  npx tsx scripts/apply-strategies.ts
 */
import type { StrategyParams } from "../../shared/types";

export interface BuiltInPreset {
  name: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  params: StrategyParams;
  symbols: string[];
  exchange: string;
  assetType: string;
}

export const BUILT_IN_STRATEGIES: BuiltInPreset[] = ${JSON.stringify(presets, null, 2)};

// Neural-network weights from Phase 4 neuroevolution (for future NN inference)
export const NN_WEIGHTS: number[] = ${JSON.stringify(Array.from(nnResult.weights))};
export const NN_ARCH = ${JSON.stringify({ inputs: IN, hidden: HID, outputs: OUT })};
`;

  const tsPath = path.join(CFG.outDir, "built-in-strategies.ts");
  fs.writeFileSync(tsPath, tsCode);
  console.log(`  Saved frontend presets → ${tsPath}`);

  // ── Summary table ──────────────────────────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("FINAL RESULTS SUMMARY");
  console.log("=".repeat(70));
  console.log(`${"Strategy".padEnd(40)} ${"Return".padStart(8)} ${"Sharpe".padStart(7)} ${"MaxDD".padStart(7)} ${"Trades".padStart(7)}`);
  console.log("─".repeat(70));
  for (const v of validated) {
    if (!v.result) { console.log(`${v.name.padEnd(40)} (no result — data gap)`); continue; }
    console.log(
      `${v.name.padEnd(40)} ` +
      `${(v.result.totalReturnPct.toFixed(1) + "%").padStart(8)} ` +
      `${v.result.sharpeRatio.toFixed(2).padStart(7)} ` +
      `${(v.result.maxDrawdownPct.toFixed(1) + "%").padStart(7)} ` +
      `${String(v.result.trades.length).padStart(7)}`
    );
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("NEXT STEP — Wire presets into the Simulation Lab:");
  console.log("=".repeat(70));
  console.log(`
  1. Review:  ${tsPath}
  2. Copy to: client/src/lib/builtInStrategies.ts
  3. Run:     npx tsx scripts/apply-strategies.ts
     (patches SimulationPage to show a "Pro Presets" panel)
`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"█".repeat(60)}`);
  console.log("  MATEO STRATEGY LAB — Evolutionary Optimizer");
  console.log(`  Started: ${new Date().toLocaleString()}`);
  console.log(`  Config:  ${CFG.randomPopSize} random → GA ${CFG.gaPopSize}×${CFG.gaGenerations} → ES ${CFG.esPopSize}×${CFG.esGenerations}`);
  console.log(`${"█".repeat(60)}\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // ── Phase 1: load data ────────────────────────────────────────────
    const allSymbols = await loadTestSymbols(pool);
    if (allSymbols.length < 5) throw new Error("Not enough seeded data. Run yarn seed-db first.");
    const windows = buildTestWindows(allSymbols);
    const evalSyms = allSymbols.slice(0, CFG.evalSymbols); // smaller fast-eval subset

    const defaultParams: StrategyParams = {
      macdFastPeriod: 12, macdSlowPeriod: 26, macdSignalPeriod: 9,
      rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30, minBuySignal: 3,
      maxPositionPct: 25, stopLossPct: 10, takeProfitPct: 20,
      preferNewBuys: false, minHoldDays: 0, maxSharePrice: 1000,
      minCashReserve: 100, maxTradesPerDay: 0, minDataDays: 30,
      minTradeValue: 50, useEndOfDayPrices: true, newBuyLookbackDays: 5,
    };

    // ── Phase 2: random search ────────────────────────────────────────
    const randomResults = phase2_randomSearch(evalSyms, windows);

    // ── Phase 3: genetic algorithm ────────────────────────────────────
    const gaResults = phase3_genetic(randomResults, evalSyms, windows);

    // ── Phase 4: neuroevolution ───────────────────────────────────────
    const nnResult = phase4_neuroevolution(allSymbols, windows, defaultParams);

    // ── Phase 5: final validation ─────────────────────────────────────
    // Pick top GA strategies (diverse styles)
    const candidates: Array<{ name: string; params: StrategyParams; quickFitness: number }> = [];
    const seenStyles = new Set<string>();

    for (const r of gaResults) {
      if (candidates.length >= CFG.topK) break;
      const params = genomeToParams(r.genome);
      const style  = styleLabel(params);
      const name   = `${style} (MACD ${params.macdFastPeriod}/${params.macdSlowPeriod}, RSI ${params.rsiPeriod})`;
      if (!seenStyles.has(style)) {
        seenStyles.add(style);
        candidates.push({ name, params, quickFitness: r.score.fitness });
      }
    }
    // Fill remaining slots without style filter
    for (const r of gaResults) {
      if (candidates.length >= CFG.topK) break;
      const params = genomeToParams(r.genome);
      const name = `Strategy-${candidates.length + 1} (MACD ${params.macdFastPeriod}/${params.macdSlowPeriod})`;
      if (!candidates.some(c => c.params === params)) {
        candidates.push({ name, params, quickFitness: r.score.fitness });
      }
    }

    const validated = await phase5_validation(candidates);

    // ── Phase 6: save output ──────────────────────────────────────────
    saveOutput(gaResults, nnResult, validated);

    console.log(`\n  ✓ Done at ${new Date().toLocaleString()}\n`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error("\n[FATAL]", err); process.exit(1); });
