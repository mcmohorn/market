import "dotenv/config";
/**
 * MATEO Strategy Lab — Evolutionary Strategy Optimizer  v2
 *
 * Run:     yarn strategy-lab
 * Resume:  yarn strategy-lab --resume <run_id>
 *
 * Phases:
 *   1. Setup    — create checkpoint tables, load 5 years of price bars
 *   2. Sanity   — verify the backtester works on known good params
 *   3. Random   — 800 random genomes evaluated on short + long windows
 *   4. GA       — two separate genetic algorithm tracks:
 *                   (a) short-term / scalp  (30-90 day windows)
 *                   (b) long-term / trend   (180-730 day windows)
 *   5. Neuro    — OpenAI-ES neural network signal generator
 *   6. Validate — full multi-symbol portfolio sim for top candidates
 *   7. Output   — JSON + TypeScript presets for the Simulation Lab
 *
 * Checkpoints are written to Postgres after every phase so the script
 * can be resumed from the last completed phase if interrupted.
 */

import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { StrategyParams, IndicatorData } from "../shared/types.js";
import { computeIndicators, _simulateOnData, loadPriceData } from "../server/simulation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI ARGS ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const resumeIdx = args.indexOf("--resume");
const RESUME_RUN_ID: number | null = resumeIdx >= 0 ? parseInt(args[resumeIdx + 1]) : null;

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CFG = {
  assetType:        "stock" as const,
  lookbackYears:    5,          // how far back to load data
  maxSymbols:       80,         // total symbol pool
  quickEvalSymbols: 20,         // smaller subset for inner training loop (faster)

  // Window counts for quick evaluation (per genome)
  shortWindows:  25,            // 30-90 day windows  (scalp / short-term track)
  longWindows:   20,            // 180-730 day windows (trend / long-term track)

  // Phase 3: random search
  randomPop:     800,

  // Phase 4: Genetic algorithm
  gaPopSize:     100,
  gaGenerations: 150,
  gaTournamentK: 4,
  gaEliteCount:  10,
  gaSigmaInit:   0.10,         // initial mutation sigma (adaptive)

  // Phase 5: Neuroevolution
  esPopSize:     200,
  esGenerations: 400,
  esSigma:       0.05,
  esLR:          0.01,
  esHidden:      16,

  // Phase 6: final validation
  validateYears: 5,

  topK:          5,
  outDir:        path.join(__dirname, "output"),
};

// ─── DATE HELPER ─────────────────────────────────────────────────────────────
// Postgres date columns arrive as JS Date objects; .toString() gives
// "Fri Apr 01 2022 ..." — we need ISO "2022-04-01".
function fmt(d: any): string {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d).split("T")[0];
}

// ─── GENOME / PARAM ENCODING ──────────────────────────────────────────────────
interface Genome { [k: string]: number; }   // all values ∈ [0,1]
const KEYS = ["macdFast","macdSlow","macdSignal","rsiPeriod",
               "rsiOB","rsiOS","minBuySignal","maxPosPct",
               "stopLoss","takeProfit","preferNew","minHold"] as const;
type GKey = typeof KEYS[number];

const BOUNDS: Record<GKey, [number,number]> = {
  macdFast:    [5,  20],
  macdSlow:    [15, 60],
  macdSignal:  [4,  20],
  rsiPeriod:   [5,  28],
  rsiOB:       [55, 85],
  rsiOS:       [15, 45],
  minBuySignal:[1,   6],
  maxPosPct:   [8,  60],
  stopLoss:    [2,  25],
  takeProfit:  [6,  60],
  preferNew:   [0,   1],
  minHold:     [0,  14],
};

function lerp(lo: number, hi: number, t: number) {
  return lo + (hi - lo) * Math.max(0, Math.min(1, t));
}

function genomeToParams(g: Genome): StrategyParams {
  const fast = Math.round(lerp(...BOUNDS.macdFast, g.macdFast));
  const slow = Math.max(fast + 4, Math.round(lerp(...BOUNDS.macdSlow, g.macdSlow)));
  return {
    macdFastPeriod:    fast,
    macdSlowPeriod:    slow,
    macdSignalPeriod:  Math.round(lerp(...BOUNDS.macdSignal, g.macdSignal)),
    rsiPeriod:         Math.round(lerp(...BOUNDS.rsiPeriod, g.rsiPeriod)),
    rsiOverbought:     lerp(...BOUNDS.rsiOB, g.rsiOB),
    rsiOversold:       lerp(...BOUNDS.rsiOS, g.rsiOS),
    minBuySignal:      Math.round(lerp(...BOUNDS.minBuySignal, g.minBuySignal)),
    maxPositionPct:    lerp(...BOUNDS.maxPosPct, g.maxPosPct),
    stopLossPct:       lerp(...BOUNDS.stopLoss, g.stopLoss),
    takeProfitPct:     lerp(...BOUNDS.takeProfit, g.takeProfit),
    preferNewBuys:     g.preferNew > 0.5,
    minHoldDays:       Math.round(lerp(...BOUNDS.minHold, g.minHold)),
    maxSharePrice:     2000, minCashReserve: 100, maxTradesPerDay: 0,
    minDataDays: 20, minTradeValue: 30, useEndOfDayPrices: true,
    newBuyLookbackDays: 5,
  };
}

function randGenome(): Genome {
  const g: Genome = {};
  KEYS.forEach(k => { g[k] = Math.random(); });
  return g;
}

function paramsToGenome(p: StrategyParams): Genome {
  const g: Genome = {};
  const inv = (lo: number, hi: number, v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  g.macdFast   = inv(...BOUNDS.macdFast,    p.macdFastPeriod);
  g.macdSlow   = inv(...BOUNDS.macdSlow,    p.macdSlowPeriod);
  g.macdSignal = inv(...BOUNDS.macdSignal,  p.macdSignalPeriod);
  g.rsiPeriod  = inv(...BOUNDS.rsiPeriod,   p.rsiPeriod);
  g.rsiOB      = inv(...BOUNDS.rsiOB,       p.rsiOverbought);
  g.rsiOS      = inv(...BOUNDS.rsiOS,       p.rsiOversold);
  g.minBuySignal = inv(...BOUNDS.minBuySignal, p.minBuySignal);
  g.maxPosPct  = inv(...BOUNDS.maxPosPct,   p.maxPositionPct);
  g.stopLoss   = inv(...BOUNDS.stopLoss,    p.stopLossPct);
  g.takeProfit = inv(...BOUNDS.takeProfit,  p.takeProfitPct);
  g.preferNew  = p.preferNewBuys ? 0.8 : 0.2;
  g.minHold    = inv(...BOUNDS.minHold,     p.minHoldDays);
  return g;
}

function vecOf(g: Genome): number[] { return KEYS.map(k => g[k]); }
function ofVec(v: number[]): Genome {
  const g: Genome = {};
  KEYS.forEach((k, i) => { g[k] = Math.max(0, Math.min(1, v[i] ?? 0.5)); });
  return g;
}

// ─── ARCHETYPAL SEEDS ─────────────────────────────────────────────────────────
// Pre-seeded strategies across risk/timeframe spectrum so the GA starts from
// sensible regions rather than pure random.
const ARCHETYPES: { name: string; params: Partial<StrategyParams> }[] = [
  { name: "Scalper",      params: { macdFastPeriod: 5,  macdSlowPeriod: 13, macdSignalPeriod: 5,  rsiPeriod: 7,  rsiOverbought: 80, rsiOversold: 20, stopLossPct: 3,  takeProfitPct: 8,  maxPositionPct: 15, minHoldDays: 0, preferNewBuys: true  } },
  { name: "Swing",        params: { macdFastPeriod: 12, macdSlowPeriod: 26, macdSignalPeriod: 9,  rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30, stopLossPct: 7,  takeProfitPct: 15, maxPositionPct: 25, minHoldDays: 2, preferNewBuys: false } },
  { name: "Trend",        params: { macdFastPeriod: 20, macdSlowPeriod: 50, macdSignalPeriod: 13, rsiPeriod: 21, rsiOverbought: 75, rsiOversold: 25, stopLossPct: 15, takeProfitPct: 40, maxPositionPct: 40, minHoldDays: 5, preferNewBuys: false } },
  { name: "Aggressive",   params: { macdFastPeriod: 8,  macdSlowPeriod: 21, macdSignalPeriod: 8,  rsiPeriod: 10, rsiOverbought: 80, rsiOversold: 20, stopLossPct: 5,  takeProfitPct: 30, maxPositionPct: 50, minHoldDays: 0, preferNewBuys: true  } },
  { name: "Conservative", params: { macdFastPeriod: 12, macdSlowPeriod: 26, macdSignalPeriod: 9,  rsiPeriod: 14, rsiOverbought: 65, rsiOversold: 35, stopLossPct: 5,  takeProfitPct: 10, maxPositionPct: 15, minHoldDays: 3, preferNewBuys: false } },
  { name: "Momentum",     params: { macdFastPeriod: 10, macdSlowPeriod: 22, macdSignalPeriod: 7,  rsiPeriod: 12, rsiOverbought: 72, rsiOversold: 28, stopLossPct: 8,  takeProfitPct: 20, maxPositionPct: 30, minHoldDays: 1, preferNewBuys: true  } },
];

// ─── DATA TYPES ───────────────────────────────────────────────────────────────
interface PriceBar { date: string; close: number; volume: number; }
interface SymbolBars { symbol: string; bars: PriceBar[]; }
interface Window { startDate: string; endDate: string; }
interface QuickResult { ret: number; sharpe: number; dd: number; }
interface ScoredGenome { genome: Genome; fitness: number; ret: number; sharpe: number; dd: number; }

// ─── MINI BACKTESTER ─────────────────────────────────────────────────────────
// Fast single-symbol per-window evaluation used in all inner training loops.
function quickBacktest(
  bars: PriceBar[], inds: IndicatorData[],
  params: StrategyParams, start: string, end: string,
  capital = 10_000
): QuickResult {
  const indMap = new Map(inds.map(ind => [ind.date, ind]));
  let cash = capital, shares = 0, entryPrice = 0, entryDate = "";
  let peak = capital, maxDD = 0;
  const daily: number[] = [];

  for (const bar of bars) {
    if (bar.date < start || bar.date > end) continue;
    const ind = indMap.get(bar.date);
    const pv = cash + shares * bar.close;
    if (pv > peak) peak = pv;
    const dd = (peak - pv) / peak * 100;
    if (dd > maxDD) maxDD = dd;
    daily.push(pv);
    if (!ind) continue;

    const wantBuy  = ind.buySignal && ind.rsi < params.rsiOverbought;
    const wantSell = !ind.buySignal || ind.rsi > params.rsiOverbought;

    if (shares > 0) {
      const held = daysBetween(entryDate, bar.date);
      const ret  = (bar.close - entryPrice) / entryPrice * 100;
      if (ret <= -params.stopLossPct || ret >= params.takeProfitPct ||
          (wantSell && held >= (params.minHoldDays ?? 0))) {
        cash += shares * bar.close; shares = 0;
      }
    }
    if (shares === 0 && wantBuy && cash >= (params.minTradeValue ?? 0) &&
        bar.close <= params.maxSharePrice) {
      const n = Math.floor(cash * (params.maxPositionPct / 100) / bar.close);
      if (n > 0) { shares = n; cash -= n * bar.close; entryPrice = bar.close; entryDate = bar.date; }
    }
  }
  if (shares > 0) {
    const last = [...bars].reverse().find(b => b.date <= end);
    if (last) { cash += shares * last.close; shares = 0; }
  }

  const ret = (cash - capital) / capital * 100;
  let sharpe = 0;
  if (daily.length > 2) {
    const dr = daily.slice(1).map((v, i) => (v - daily[i]) / daily[i]);
    const m  = dr.reduce((a, b) => a + b, 0) / dr.length;
    const s  = Math.sqrt(dr.reduce((a, v) => a + (v - m) ** 2, 0) / dr.length);
    sharpe = s > 0 ? (m / s) * Math.sqrt(252) : 0;
  }
  return { ret, sharpe, dd: maxDD };
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

// ─── FITNESS ──────────────────────────────────────────────────────────────────
// Profit-first: primary weight on return %, secondary on Sharpe, penalty for
// catastrophic drawdown (>40%).  Tested over a mix of short + long windows
// so the genome must perform across timeframes.
function evalGenome(
  syms: SymbolBars[], params: StrategyParams, windows: Window[]
): { fitness: number; ret: number; sharpe: number; dd: number } {
  const results: QuickResult[] = [];
  for (const sym of syms) {
    const stBars = sym.bars.map(b => ({ date: b.date, open: b.close, high: b.close, low: b.close, close: b.close, volume: b.volume }));
    const inds = computeIndicators(stBars, params);
    for (const w of windows) {
      results.push(quickBacktest(sym.bars, inds, params, w.startDate, w.endDate));
    }
  }
  if (results.length === 0) return { fitness: -999, ret: 0, sharpe: 0, dd: 0 };

  const avgRet    = results.reduce((s, r) => s + r.ret,    0) / results.length;
  const avgSharpe = results.reduce((s, r) => s + r.sharpe, 0) / results.length;
  const avgDD     = results.reduce((s, r) => s + r.dd,     0) / results.length;
  const winRate   = results.filter(r => r.ret > 0).length / results.length;

  // Profit-first fitness:
  //   60% weight on normalized return (capped at 200% per period to avoid outlier dominance)
  //   25% weight on Sharpe ratio
  //   15% weight on win rate
  //   penalty for average drawdown > 40%
  const retScore  = Math.tanh(avgRet / 40);          // saturates around 80%+ return
  const ddPenalty = Math.max(0, (avgDD - 40) / 60);  // 0 below 40% dd, rises to 1 at 100%
  const fitness   = (0.60 * retScore + 0.25 * Math.tanh(avgSharpe) + 0.15 * winRate) * (1 - ddPenalty);

  return { fitness, ret: avgRet, sharpe: avgSharpe, dd: avgDD };
}

// ─── WINDOW BUILDERS ──────────────────────────────────────────────────────────
function buildWindows(bars: PriceBar[], count: number, minDays: number, maxDays: number): Window[] {
  const dates = bars.map(b => b.date).sort();
  const minTs  = new Date(dates[0]).getTime();
  const maxTs  = new Date(dates[dates.length - 1]).getTime();
  const wins: Window[] = [];
  let attempts = 0;
  while (wins.length < count && attempts < count * 10) {
    attempts++;
    const lenMs  = (minDays + Math.random() * (maxDays - minDays)) * 86_400_000;
    const latest = maxTs - lenMs;
    if (latest <= minTs) continue;
    const start = minTs + Math.random() * (latest - minTs);
    wins.push({
      startDate: new Date(start).toISOString().slice(0, 10),
      endDate:   new Date(start + lenMs).toISOString().slice(0, 10),
    });
  }
  return wins;
}

// ─── GENETIC ALGORITHM ───────────────────────────────────────────────────────
function tournament(pop: ScoredGenome[], k: number): ScoredGenome {
  const c = Array.from({ length: k }, () => pop[Math.floor(Math.random() * pop.length)]);
  return c.reduce((b, x) => x.fitness > b.fitness ? x : b);
}

function crossover(a: number[], b: number[]): number[] {
  // Blend crossover: each gene is a random blend of both parents
  const alpha = Math.random();
  return a.map((v, i) => alpha * v + (1 - alpha) * b[i]);
}

function mutate(v: number[], sigma: number): number[] {
  return v.map(x => Math.max(0, Math.min(1, x + gaussRand() * sigma)));
}

function runGA(
  seeds: ScoredGenome[],
  syms: SymbolBars[],
  windows: Window[],
  label: string
): ScoredGenome[] {
  console.log(`\n  [${label}] GA  pop=${CFG.gaPopSize}  gen=${CFG.gaGenerations}`);

  let pop: ScoredGenome[] = [];

  // Seed with top survivors + archetypes
  for (const s of seeds.slice(0, Math.min(CFG.gaPopSize / 2, seeds.length))) {
    pop.push(s);
  }
  // Fill the rest fresh
  while (pop.length < CFG.gaPopSize) {
    const g = randGenome();
    const p = genomeToParams(g);
    const s = evalGenome(syms, p, windows);
    pop.push({ genome: g, ...s });
  }

  let sigma = CFG.gaSigmaInit;
  let stuckGens = 0;
  let prevBest = -Infinity;

  for (let gen = 0; gen < CFG.gaGenerations; gen++) {
    pop.sort((a, b) => b.fitness - a.fitness);
    const elite = pop.slice(0, CFG.gaEliteCount);

    const children: ScoredGenome[] = [];
    while (children.length < CFG.gaPopSize - CFG.gaEliteCount) {
      const childVec = mutate(
        crossover(vecOf(tournament(pop, CFG.gaTournamentK).genome), vecOf(tournament(pop, CFG.gaTournamentK).genome)),
        sigma
      );
      const g = ofVec(childVec);
      const p = genomeToParams(g);
      const s = evalGenome(syms, p, windows);
      children.push({ genome: g, ...s });
    }

    pop = [...elite, ...children];

    // Adaptive mutation: increase sigma if stuck, decrease if improving
    if (pop[0].fitness > prevBest + 0.001) {
      stuckGens = 0;
      sigma = Math.max(0.03, sigma * 0.98);
    } else {
      stuckGens++;
      if (stuckGens > 10) sigma = Math.min(0.3, sigma * 1.15);
    }
    prevBest = pop[0].fitness;

    if ((gen + 1) % 25 === 0 || gen === 0) {
      const b = pop[0];
      const p = genomeToParams(b.genome);
      console.log(
        `    Gen ${String(gen + 1).padStart(3)}  fit=${b.fitness.toFixed(3)}  ` +
        `ret=${b.ret.toFixed(1)}%  sharpe=${b.sharpe.toFixed(2)}  dd=${b.dd.toFixed(1)}%  ` +
        `MACD=${p.macdFastPeriod}/${p.macdSlowPeriod}/${p.macdSignalPeriod}  ` +
        `RSI=${p.rsiPeriod}(${p.rsiOversold.toFixed(0)}-${p.rsiOverbought.toFixed(0)})  σ=${sigma.toFixed(3)}`
      );
    }
  }

  pop.sort((a, b) => b.fitness - a.fitness);
  return pop.slice(0, CFG.gaPopSize);
}

// ─── NEUROEVOLUTION ───────────────────────────────────────────────────────────
const IN = 6, HID = CFG.esHidden, OUT = 1;
const NN_LEN = IN * HID + HID + HID * OUT + OUT;

function fwdNN(w: Float64Array, inp: number[]): number {
  const h = new Array<number>(HID);
  for (let j = 0; j < HID; j++) {
    let s = w[IN * HID + j];
    for (let i = 0; i < IN; i++) s += w[i * HID + j] * inp[i];
    h[j] = Math.tanh(s);
  }
  const off = IN * HID + HID;
  let out = w[off + HID];
  for (let j = 0; j < HID; j++) out += w[off + j] * h[j];
  return Math.tanh(out);
}

interface NNRow { date: string; close: number; features: number[]; }

function buildFeatures(bars: PriceBar[]): NNRow[] {
  if (bars.length < 30) return [];
  const c = bars.map(b => b.close), v = bars.map(b => b.volume);
  const avgV = v.reduce((a, b) => a + b, 0) / v.length || 1;
  const e12 = ema(c, 12), e26 = ema(c, 26);
  const macd = c.map((_, i) => e12[i] - e26[i]);
  const rsi  = simpleRSI(c, 14);
  const hists = macd.filter(isFinite);
  const hStd = stdDev(hists) || 1, hMean = hists.reduce((a, b) => a + b, 0) / hists.length;
  return bars.slice(26).map((bar, ii) => {
    const i = ii + 26;
    const mom5  = i >= 5  ? (c[i] - c[i-5])  / c[i-5]  : 0;
    const mom20 = i >= 20 ? (c[i] - c[i-20]) / c[i-20] : 0;
    return {
      date: bar.date, close: bar.close,
      features: [
        (rsi[i] - 50) / 50,
        (macd[i] - hMean) / hStd,
        e12[i] / (e26[i] || 1) - 1,
        Math.tanh(mom5 * 10),
        Math.tanh(mom20 * 5),
        Math.tanh(v[i] / avgV - 1),
      ],
    };
  });
}

function nnBacktest(rows: NNRow[], w: Float64Array, params: StrategyParams, start: string, end: string): QuickResult {
  const capital = 10_000;
  let cash = capital, shares = 0, entry = 0, entryDate = "", peak = capital, maxDD = 0;
  const daily: number[] = [];
  for (const row of rows) {
    if (row.date < start || row.date > end) continue;
    const pv = cash + shares * row.close;
    if (pv > peak) peak = pv;
    const dd = (peak - pv) / peak * 100;
    if (dd > maxDD) maxDD = dd;
    daily.push(pv);
    const out = fwdNN(w, row.features);
    const sig = out > 0.2 ? "BUY" : out < -0.2 ? "SELL" : "HOLD";
    if (shares > 0) {
      const ret = (row.close - entry) / entry * 100;
      const held = daysBetween(entryDate, row.date);
      if (ret <= -params.stopLossPct || ret >= params.takeProfitPct ||
          (sig === "SELL" && held >= (params.minHoldDays ?? 0))) {
        cash += shares * row.close; shares = 0;
      }
    }
    if (shares === 0 && sig === "BUY" && cash >= 30 && row.close <= params.maxSharePrice) {
      const n = Math.floor(cash * (params.maxPositionPct / 100) / row.close);
      if (n > 0) { shares = n; cash -= n * row.close; entry = row.close; entryDate = row.date; }
    }
  }
  if (shares > 0) { const last = [...rows].reverse().find(r => r.date <= end); if (last) cash += shares * last.close; }
  const ret = (cash - capital) / capital * 100;
  let sharpe = 0;
  if (daily.length > 2) {
    const dr = daily.slice(1).map((v, i) => (v - daily[i]) / daily[i]);
    const m = dr.reduce((a, b) => a + b, 0) / dr.length;
    const s = Math.sqrt(dr.reduce((a, v) => a + (v - m) ** 2, 0) / dr.length);
    sharpe = s > 0 ? (m / s) * Math.sqrt(252) : 0;
  }
  return { ret, sharpe, dd: maxDD };
}

function evalNN(w: Float64Array, symFeats: { rows: NNRow[] }[], wins: Window[], params: StrategyParams): number {
  let total = 0, n = 0;
  for (const s of symFeats) {
    for (const win of wins) {
      const r = nnBacktest(s.rows, w, params, win.startDate, win.endDate);
      total += Math.tanh(r.ret / 40) * 0.6 + Math.tanh(r.sharpe) * 0.25 - Math.max(0, (r.dd - 40) / 60) * 0.15;
      n++;
    }
  }
  return n > 0 ? total / n : -999;
}

// ─── MATH HELPERS ─────────────────────────────────────────────────────────────
let _spare: number | null = null;
function gaussRand(): number {
  if (_spare !== null) { const s = _spare; _spare = null; return s; }
  const u = Math.random(), v = Math.random();
  const m = Math.sqrt(-2 * Math.log(u + 1e-10));
  _spare = m * Math.sin(2 * Math.PI * v);
  return m * Math.cos(2 * Math.PI * v);
}

function rankNorm(fits: number[]): number[] {
  const n = fits.length, sorted = [...fits].sort((a, b) => a - b);
  return fits.map(f => sorted.indexOf(f) / (n - 1) - 0.5);
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 1;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length) || 1;
}

function ema(prices: number[], period: number): number[] {
  const k = 2 / (period + 1), out = [...prices];
  for (let i = 1; i < prices.length; i++) out[i] = prices[i] * k + out[i - 1] * (1 - k);
  return out;
}

function simpleRSI(prices: number[], period: number): number[] {
  const out = new Array(prices.length).fill(50);
  let ag = 0, al = 0;
  for (let i = 1; i <= period && i < prices.length; i++) {
    const d = prices[i] - prices[i-1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  if (period < prices.length) out[period] = 100 - 100 / (1 + ag / (al || 1e-10));
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i-1];
    ag = (ag * (period-1) + Math.max(0, d)) / period;
    al = (al * (period-1) + Math.max(0, -d)) / period;
    out[i] = 100 - 100 / (1 + ag / (al || 1e-10));
  }
  return out;
}

// ─── POSTGRES CHECKPOINT ─────────────────────────────────────────────────────

async function setupDB(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strategy_lab_runs (
      id       SERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      status   TEXT DEFAULT 'running',
      config   JSONB
    );
    CREATE TABLE IF NOT EXISTS strategy_lab_checkpoints (
      run_id   INTEGER,
      phase    TEXT,
      data     JSONB,
      saved_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (run_id, phase)
    );
  `);
}

async function createRun(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO strategy_lab_runs (config) VALUES ($1) RETURNING id`,
    [JSON.stringify(CFG)]
  );
  return rows[0].id;
}

async function saveCheckpoint(pool: Pool, runId: number, phase: string, data: any): Promise<void> {
  await pool.query(`
    INSERT INTO strategy_lab_checkpoints (run_id, phase, data)
    VALUES ($1, $2, $3)
    ON CONFLICT (run_id, phase) DO UPDATE SET data=$3, saved_at=NOW()
  `, [runId, phase, JSON.stringify(data)]);
  console.log(`  [DB] Saved checkpoint: ${phase}`);
}

async function loadCheckpoint(pool: Pool, runId: number, phase: string): Promise<any | null> {
  const { rows } = await pool.query(
    `SELECT data FROM strategy_lab_checkpoints WHERE run_id=$1 AND phase=$2`,
    [runId, phase]
  );
  return rows.length > 0 ? rows[0].data : null;
}

async function markDone(pool: Pool, runId: number): Promise<void> {
  await pool.query(`UPDATE strategy_lab_runs SET status='done' WHERE id=$1`, [runId]);
}

// ─── DATA LOADING ─────────────────────────────────────────────────────────────

async function loadData(pool: Pool): Promise<SymbolBars[]> {
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 1 — Loading 5-year price history from Postgres");
  console.log("=".repeat(60));

  const since = new Date();
  since.setFullYear(since.getFullYear() - CFG.lookbackYears);
  const sinceStr = since.toISOString().split("T")[0];

  const { rows: symRows } = await pool.query<{ symbol: string; cnt: string }>(`
    SELECT symbol, COUNT(*) AS cnt
    FROM price_history
    WHERE asset_type=$1 AND date>=$2
    GROUP BY symbol HAVING COUNT(*)>=600
    ORDER BY cnt DESC LIMIT $3
  `, [CFG.assetType, sinceStr, CFG.maxSymbols]);

  console.log(`  Found ${symRows.length} symbols with ≥600 trading days in last ${CFG.lookbackYears} years`);

  const symbols: SymbolBars[] = [];
  for (const row of symRows) {
    const { rows: bars } = await pool.query<{ date: any; close: string; volume: string }>(`
      SELECT date::text AS date, close, volume
      FROM price_history
      WHERE symbol=$1 AND asset_type=$2 AND date>=$3
      ORDER BY date ASC
    `, [row.symbol, CFG.assetType, sinceStr]);

    if (bars.length < 200) continue;
    symbols.push({
      symbol: row.symbol,
      bars: bars.map(b => ({
        date:   fmt(b.date),     // ← uses fmt() — handles both string and Date objects
        close:  parseFloat(b.close),
        volume: parseFloat(b.volume),
      })),
    });
  }

  console.log(`  Loaded ${symbols.length} symbols`);
  if (symbols.length > 0) {
    const allDates = symbols.flatMap(s => s.bars.map(b => b.date)).sort();
    console.log(`  Date range: ${allDates[0]} → ${allDates[allDates.length - 1]}`);
  }
  return symbols;
}

// ─── SANITY CHECK ─────────────────────────────────────────────────────────────
// Verify the backtester actually produces trades before wasting hours on the GA.
function sanityCheck(symbols: SymbolBars[]): boolean {
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 2 — Sanity check (default params, known good window)");
  console.log("=".repeat(60));

  const params = genomeToParams(paramsToGenome({
    macdFastPeriod: 12, macdSlowPeriod: 26, macdSignalPeriod: 9,
    rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30, minBuySignal: 3,
    maxPositionPct: 25, stopLossPct: 10, takeProfitPct: 20,
    preferNewBuys: false, minHoldDays: 0, maxSharePrice: 2000,
    minCashReserve: 100, maxTradesPerDay: 0, minDataDays: 20,
    minTradeValue: 30, useEndOfDayPrices: true, newBuyLookbackDays: 5,
  }));

  const sym = symbols[0];
  const midDate = sym.bars[Math.floor(sym.bars.length * 0.4)].date;
  const endDate = sym.bars[Math.floor(sym.bars.length * 0.9)].date;

  const stBars = sym.bars.map(b => ({ date: b.date, open: b.close, high: b.close, low: b.close, close: b.close, volume: b.volume }));
  const inds = computeIndicators(stBars, params);
  const result = quickBacktest(sym.bars, inds, params, midDate, endDate);

  const hasBuySignals = inds.some(i => i.buySignal);
  const buys  = inds.filter(i => i.buySignal).length;
  const sells = inds.filter(i => !i.buySignal).length;

  console.log(`  Symbol: ${sym.symbol}  Window: ${midDate} → ${endDate}`);
  console.log(`  Indicators: ${inds.length} bars  BUY signals: ${buys}  SELL signals: ${sells}`);
  console.log(`  Backtest: ret=${result.ret.toFixed(1)}%  sharpe=${result.sharpe.toFixed(2)}  dd=${result.dd.toFixed(1)}%`);

  if (!hasBuySignals) {
    console.error("\n  ✗ FATAL: No BUY signals generated. Check indicator computation or date format.");
    return false;
  }
  console.log("  ✓ Backtester working correctly\n");
  return true;
}

// ─── PHASES ───────────────────────────────────────────────────────────────────

async function phase_random(
  syms: SymbolBars[], shortWins: Window[], longWins: Window[],
  pool: Pool, runId: number
): Promise<ScoredGenome[]> {
  const ckpt = await loadCheckpoint(pool, runId, "random");
  if (ckpt) { console.log("\n  ↩  Random search: loaded from checkpoint"); return ckpt; }

  const allWins = [...shortWins.slice(0, 12), ...longWins.slice(0, 8)]; // 20 mixed windows
  const evalSyms = syms.slice(0, CFG.quickEvalSymbols);

  console.log("\n" + "=".repeat(60));
  console.log(`PHASE 3 — Random Search  (${CFG.randomPop} genomes × ${allWins.length} windows × ${evalSyms.length} symbols)`);
  console.log("=".repeat(60));

  // Start with archetype seeds, then random
  const results: ScoredGenome[] = [];

  for (const arch of ARCHETYPES) {
    const full = { ...genomeToParams(randGenome()), ...arch.params };
    const g = paramsToGenome(full as StrategyParams);
    const s = evalGenome(evalSyms, full as StrategyParams, allWins);
    results.push({ genome: g, ...s });
    console.log(`  [Seed] ${arch.name.padEnd(14)} fit=${s.fitness.toFixed(3)}  ret=${s.ret.toFixed(1)}%  sharpe=${s.sharpe.toFixed(2)}`);
  }

  const logEvery = Math.ceil(CFG.randomPop / 20);
  for (let i = 0; i < CFG.randomPop; i++) {
    const g = randGenome();
    const p = genomeToParams(g);
    const s = evalGenome(evalSyms, p, allWins);
    results.push({ genome: g, ...s });
    if ((i + 1) % logEvery === 0) {
      results.sort((a, b) => b.fitness - a.fitness);
      const best = results[0];
      console.log(`  [${String(i+1).padStart(4)}/${CFG.randomPop}]  best fit=${best.fitness.toFixed(3)}  ret=${best.ret.toFixed(1)}%  sharpe=${best.sharpe.toFixed(2)}  dd=${best.dd.toFixed(1)}%`);
    }
  }

  results.sort((a, b) => b.fitness - a.fitness);
  console.log(`\n  ✓ Best random: fit=${results[0].fitness.toFixed(3)}  ret=${results[0].ret.toFixed(1)}%`);
  await saveCheckpoint(pool, runId, "random", results.slice(0, 100));
  return results;
}

async function phase_genetic(
  randomResults: ScoredGenome[], syms: SymbolBars[],
  shortWins: Window[], longWins: Window[],
  pool: Pool, runId: number
): Promise<{ short: ScoredGenome[]; long: ScoredGenome[] }> {
  const ckpt = await loadCheckpoint(pool, runId, "genetic");
  if (ckpt) { console.log("\n  ↩  Genetic algorithm: loaded from checkpoint"); return ckpt; }

  console.log("\n" + "=".repeat(60));
  console.log("PHASE 4 — Genetic Algorithm  (two tracks: short-term + long-term)");
  console.log("=".repeat(60));

  const evalSyms = syms.slice(0, CFG.quickEvalSymbols);
  const shortPop = runGA(randomResults.slice(0, 30), evalSyms, shortWins, "Short-term/Scalp");
  const longPop  = runGA(randomResults.slice(0, 30), evalSyms, longWins,  "Long-term/Trend");

  const result = { short: shortPop.slice(0, 20), long: longPop.slice(0, 20) };
  await saveCheckpoint(pool, runId, "genetic", result);
  return result;
}

async function phase_neuro(
  syms: SymbolBars[], allWins: Window[],
  pool: Pool, runId: number
): Promise<{ weights: number[]; fitness: number }> {
  const ckpt = await loadCheckpoint(pool, runId, "neuro");
  if (ckpt) { console.log("\n  ↩  Neuroevolution: loaded from checkpoint"); return ckpt; }

  console.log("\n" + "=".repeat(60));
  console.log(`PHASE 5 — Neuroevolution  (ES pop=${CFG.esPopSize}, gen=${CFG.esGenerations}, weights=${NN_LEN})`);
  console.log("=".repeat(60));

  const symFeats = syms.slice(0, 30).map(s => ({ rows: buildFeatures(s.bars) }));
  const evalWins = allWins.slice(0, 20);
  const nnParams = genomeToParams(paramsToGenome({
    macdFastPeriod: 12, macdSlowPeriod: 26, macdSignalPeriod: 9,
    rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30, minBuySignal: 3,
    maxPositionPct: 25, stopLossPct: 10, takeProfitPct: 20,
    preferNewBuys: false, minHoldDays: 0, maxSharePrice: 2000,
    minCashReserve: 100, maxTradesPerDay: 0, minDataDays: 20,
    minTradeValue: 30, useEndOfDayPrices: true, newBuyLookbackDays: 5,
  }));

  let theta = new Float64Array(NN_LEN).map(() => (Math.random() * 2 - 1) * 0.3);
  let bestFit = -Infinity, bestW = theta.slice();

  for (let gen = 0; gen < CFG.esGenerations; gen++) {
    const noises: Float64Array[] = [];
    const fits: number[] = [];
    for (let k = 0; k < CFG.esPopSize; k++) {
      const n = new Float64Array(NN_LEN).map(() => gaussRand());
      noises.push(n);
      fits.push(evalNN(theta.map((v, i) => v + CFG.esSigma * n[i]) as Float64Array, symFeats, evalWins, nnParams));
    }
    const ranked = rankNorm(fits);
    const update = new Float64Array(NN_LEN).fill(0);
    for (let k = 0; k < CFG.esPopSize; k++) for (let w = 0; w < NN_LEN; w++) update[w] += ranked[k] * noises[k][w];
    const scale = CFG.esLR / (CFG.esPopSize * CFG.esSigma);
    for (let w = 0; w < NN_LEN; w++) theta[w] += scale * update[w];
    const cur = evalNN(theta, symFeats, evalWins, nnParams);
    if (cur > bestFit) { bestFit = cur; bestW = theta.slice(); }
    if ((gen + 1) % 50 === 0 || gen === 0)
      console.log(`  Gen ${String(gen+1).padStart(3)}/${CFG.esGenerations}  cur=${cur.toFixed(3)}  best=${bestFit.toFixed(3)}`);
  }

  const result = { weights: Array.from(bestW), fitness: bestFit };
  await saveCheckpoint(pool, runId, "neuro", result);
  console.log(`\n  ✓ Best NN fitness: ${bestFit.toFixed(3)}`);
  return result;
}

async function phase_validate(
  candidates: Array<{ name: string; params: StrategyParams; track: string }>,
  pool: Pool, runId: number
): Promise<Array<{ name: string; params: StrategyParams; track: string; result: any }>> {
  const ckpt = await loadCheckpoint(pool, runId, "validate");
  if (ckpt) { console.log("\n  ↩  Validation: loaded from checkpoint"); return ckpt; }

  console.log("\n" + "=".repeat(60));
  console.log(`PHASE 6 — Full Portfolio Validation  (${candidates.length} candidates, ${CFG.validateYears} yr)`);
  console.log("=".repeat(60));

  const end = new Date().toISOString().split("T")[0];
  const start = new Date(); start.setFullYear(start.getFullYear() - CFG.validateYears);
  const warmup = new Date(start); warmup.setDate(warmup.getDate() - 120);
  const startStr = start.toISOString().split("T")[0];
  const warmupStr = warmup.toISOString().split("T")[0];

  console.log(`  Loading data from Postgres...`);
  const allData = await loadPriceData(undefined, warmupStr, end, CFG.assetType);
  console.log(`  Loaded ${allData.length} symbols for full validation\n`);

  const results: Array<{ name: string; params: StrategyParams; track: string; result: any }> = [];
  for (const c of candidates) {
    for (const sd of allData) sd.indicators = computeIndicators(sd.bars, c.params);
    try {
      const r = _simulateOnData(allData, startStr, end, 10_000, c.params);
      results.push({ ...c, result: r });
      console.log(
        `  ✓ ${c.name.padEnd(42)} [${c.track.padEnd(6)}]  ` +
        `ret=${r.totalReturnPct.toFixed(1)}%  sharpe=${r.sharpeRatio.toFixed(2)}  ` +
        `dd=${r.maxDrawdownPct.toFixed(1)}%  trades=${r.trades.length}`
      );
    } catch (e: any) { console.log(`  ✗ ${c.name}: ${e.message}`); }
  }

  await saveCheckpoint(pool, runId, "validate", results);
  return results;
}

// ─── OUTPUT ───────────────────────────────────────────────────────────────────

function saveOutput(
  validated: Array<{ name: string; params: StrategyParams; track: string; result: any }>,
  nn: { weights: number[]; fitness: number }
) {
  fs.mkdirSync(CFG.outDir, { recursive: true });

  const today = new Date().toISOString().split("T")[0];
  const fiveAgo = new Date(); fiveAgo.setFullYear(fiveAgo.getFullYear() - 5);
  const fiveAgoStr = fiveAgo.toISOString().split("T")[0];

  // Sort by return (profit-first)
  const sorted = [...validated].filter(v => v.result).sort((a, b) => b.result.totalReturnPct - a.result.totalReturnPct);

  // Full JSON
  fs.writeFileSync(path.join(CFG.outDir, "strategy-lab-results.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    results: sorted.map(v => ({
      name: v.name, track: v.track, params: v.params,
      ret: v.result.totalReturnPct, sharpe: v.result.sharpeRatio,
      dd: v.result.maxDrawdownPct, trades: v.result.trades.length,
    })),
    nn: { weights: nn.weights, fitness: nn.fitness, arch: { inputs: IN, hidden: HID, outputs: OUT } },
  }, null, 2));

  // NN weights
  fs.writeFileSync(path.join(CFG.outDir, "nn-weights.json"), JSON.stringify(
    { weights: nn.weights, fitness: nn.fitness, arch: { inputs: IN, hidden: HID, outputs: OUT } }, null, 2
  ));

  // Frontend TypeScript presets
  const presets = sorted.slice(0, CFG.topK).map(v => ({
    name: `ML: ${v.name}`,
    startDate: fiveAgoStr, endDate: today, initialCapital: 10_000,
    params: v.params, symbols: [] as string[], exchange: "", assetType: CFG.assetType,
  }));

  const tsCode = `/**
 * ML-evolved strategy presets — generated by scripts/strategy-lab.ts
 * Generated: ${new Date().toISOString()}
 * To regenerate: yarn strategy-lab
 * To apply: yarn apply-strategies
 */
import type { StrategyParams } from "../../../shared/types";

export interface BuiltInPreset {
  name: string; startDate: string; endDate: string; initialCapital: number;
  params: StrategyParams; symbols: string[]; exchange: string; assetType: string;
}

export const BUILT_IN_STRATEGIES: BuiltInPreset[] = ${JSON.stringify(presets, null, 2)};

export const NN_WEIGHTS: number[] = ${JSON.stringify(nn.weights)};
export const NN_ARCH = ${JSON.stringify({ inputs: IN, hidden: HID, outputs: OUT })};
`;
  fs.writeFileSync(path.join(CFG.outDir, "built-in-strategies.ts"), tsCode);

  // Summary
  console.log("\n" + "=".repeat(72));
  console.log("RESULTS  (sorted by total return — profit-first)");
  console.log("=".repeat(72));
  console.log(`${"Strategy".padEnd(44)} ${"Track".padEnd(7)} ${"Return".padStart(8)} ${"Sharpe".padStart(7)} ${"MaxDD".padStart(7)} ${"Trades".padStart(7)}`);
  console.log("─".repeat(72));
  for (const v of sorted) {
    if (!v.result) continue;
    console.log(
      `${v.name.padEnd(44)} ${v.track.padEnd(7)} ` +
      `${(v.result.totalReturnPct.toFixed(1)+"%").padStart(8)} ` +
      `${v.result.sharpeRatio.toFixed(2).padStart(7)} ` +
      `${(v.result.maxDrawdownPct.toFixed(1)+"%").padStart(7)} ` +
      `${String(v.result.trades.length).padStart(7)}`
    );
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log("NEXT STEPS");
  console.log("=".repeat(72));
  console.log(`
  Results saved to: ${CFG.outDir}/

  1. Review the results above and strategy-lab-results.json
  2. Apply the top strategies to your Simulation Lab:
       yarn apply-strategies
     (copies built-in-strategies.ts → client/src/lib/builtInStrategies.ts)

  3. The strategies will appear as an "ML Presets" button in the
     Simulation Lab — click any to instantly load its parameters.

  4. To regenerate with higher iteration counts, edit CFG in the script
     and rerun:  yarn strategy-lab

  5. To resume an interrupted run:
       yarn strategy-lab --resume <run_id>
     Check run IDs: SELECT id, started_at, status FROM strategy_lab_runs;
`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "█".repeat(60));
  console.log("  MATEO STRATEGY LAB  v2  — Profit-First Optimizer");
  console.log(`  ${new Date().toLocaleString()}`);
  console.log(`  Config: random=${CFG.randomPop}  GA=${CFG.gaPopSize}×${CFG.gaGenerations}  ES=${CFG.esPopSize}×${CFG.esGenerations}`);
  if (RESUME_RUN_ID) console.log(`  Resuming run #${RESUME_RUN_ID}`);
  console.log("█".repeat(60));

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await setupDB(pool);
    const runId = RESUME_RUN_ID ?? await createRun(pool);
    if (!RESUME_RUN_ID) console.log(`\n  Run ID: ${runId}  (resume with: yarn strategy-lab --resume ${runId})`);

    // ── Phase 1: load data
    const symbols = await loadData(pool);
    if (symbols.length < 5) throw new Error("Not enough data. Run: yarn seed-db");

    // Build representative bars for window generation
    const longestSym = symbols.reduce((best, s) => s.bars.length > best.bars.length ? s : best);
    const shortWins  = buildWindows(longestSym.bars, CFG.shortWindows, 30,  90);
    const longWins   = buildWindows(longestSym.bars, CFG.longWindows,  180, 730);
    const allWins    = [...shortWins, ...longWins];

    console.log(`  Short windows (30-90d):   ${shortWins.length}   Long windows (180-730d): ${longWins.length}`);

    // ── Phase 2: sanity check
    if (!sanityCheck(symbols)) process.exit(1);

    // ── Phase 3: random search
    const randomResults = await phase_random(symbols, shortWins, longWins, pool, runId);

    // ── Phase 4: GA (two tracks)
    const gaResult = await phase_genetic(randomResults, symbols, shortWins, longWins, pool, runId);

    // ── Phase 5: neuroevolution
    const nnResult = await phase_neuro(symbols, allWins, pool, runId);

    // ── Phase 6: build candidate list (diverse styles from both tracks)
    const candidates: Array<{ name: string; params: StrategyParams; track: string }> = [];
    const seen = new Set<string>();

    const addCandidate = (sg: ScoredGenome, track: "short" | "long") => {
      if (candidates.length >= CFG.topK * 2) return;
      const p = genomeToParams(sg.genome);
      const key = `${p.macdFastPeriod}-${p.macdSlowPeriod}-${p.rsiPeriod}`;
      if (seen.has(key)) return;
      seen.add(key);
      const trackLabel = track === "short" ? "Scalp" : "Trend";
      const style = p.takeProfitPct > 30 ? "Aggressive" : p.stopLossPct < 6 ? "Defensive" : p.preferNewBuys ? "Momentum" : p.rsiPeriod >= 18 ? "Slow" : "Balanced";
      candidates.push({
        name: `${trackLabel}-${style} (MACD ${p.macdFastPeriod}/${p.macdSlowPeriod}, RSI ${p.rsiPeriod})`,
        params: p,
        track: trackLabel,
      });
    };

    // Alternate between tracks so output is diverse
    const maxPerTrack = Math.ceil(CFG.topK * 1.5);
    for (let i = 0; i < maxPerTrack; i++) {
      if (gaResult.short[i]) addCandidate(gaResult.short[i], "short");
      if (gaResult.long[i])  addCandidate(gaResult.long[i],  "long");
    }

    // ── Phase 6: full portfolio validation
    const validated = await phase_validate(candidates, pool, runId);

    // ── Phase 7: output
    saveOutput(validated, nnResult);
    await markDone(pool, runId);
    console.log(`\n  ✓ Completed at ${new Date().toLocaleString()}  (run #${runId})\n`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error("\n[FATAL]", err); process.exit(1); });
