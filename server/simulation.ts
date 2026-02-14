import { queryBigQuery, getDataset, tbl, normalizeDate } from "./bigquery";
import type {
  StockBar,
  IndicatorData,
  StrategyParams,
  TradeRecord,
  PortfolioSnapshot,
  SimulationResult,
  StrategyComparison,
  MarketConditionResult,
  DEFAULT_STRATEGY,
} from "../shared/types";

function computeIndicators(bars: StockBar[], params: StrategyParams): IndicatorData[] {
  const m1 = params.macdFastPeriod;
  const m2 = params.macdSlowPeriod;
  const m3 = params.macdSignalPeriod;
  const a1 = 2.0 / (m1 + 1.0);
  const a2 = 2.0 / (m2 + 1.0);
  const a3 = 2.0 / (m3 + 1.0);
  const minDataPoints = 10;
  const rsiPeriod = params.rsiPeriod;

  const results: IndicatorData[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    if (i === 0) {
      results.push({
        emaFast: bar.close, emaSlow: bar.close,
        macdFast: 0, macdSlow: 0,
        macdHistogram: 0, macdHistogramAdjusted: 0,
        buySignal: false, rsi: 50,
        adx: 0, ma50: bar.close, bollingerBandwidth: 0,
        price: bar.close, date: bar.date,
      });
      continue;
    }

    const prev = results[i - 1];
    const emaFast = a1 * bar.close + (1 - a1) * prev.emaFast;
    const emaSlow = a2 * bar.close + (1 - a2) * prev.emaSlow;
    const macdFast = emaFast - emaSlow;
    const macdSlow = a3 * macdFast + (1 - a3) * prev.macdSlow;
    const diff = macdFast - macdSlow;
    const diffAdjusted = bar.close !== 0 ? diff / bar.close : 0;

    let buySignal = false;
    if (i > minDataPoints) {
      buySignal = macdFast > macdSlow;
    }

    results.push({
      emaFast, emaSlow, macdFast, macdSlow,
      macdHistogram: diff, macdHistogramAdjusted: diffAdjusted,
      buySignal, rsi: 50,
      adx: 0, ma50: bar.close, bollingerBandwidth: 0,
      price: bar.close, date: bar.date,
    });
  }

  if (bars.length >= rsiPeriod + 1) {
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= rsiPeriod; i++) {
      const change = bars[i].close - bars[i - 1].close;
      if (change > 0) avgGain += change;
      else avgLoss += Math.abs(change);
    }
    avgGain /= rsiPeriod;
    avgLoss /= rsiPeriod;

    results[rsiPeriod].rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = rsiPeriod + 1; i < bars.length; i++) {
      const change = bars[i].close - bars[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;
      avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
      avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
      results[i].rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }

  return results;
}

interface SymbolData {
  symbol: string;
  bars: StockBar[];
  indicators: IndicatorData[];
}

async function loadPriceData(
  symbols: string[] | undefined,
  startDate: string,
  endDate: string,
  assetType?: string,
  exchange?: string
): Promise<SymbolData[]> {
  const ds = getDataset(assetType);
  const priceTable = tbl(ds, "price_history");
  const metaTable = tbl(ds, "metadata");

  let sql: string;
  const params: any = { startDate, endDate };

  if (symbols && symbols.length > 0) {
    params.symbols = symbols;
    if (exchange) {
      params.exchange = exchange;
      sql = `SELECT ph.symbol, ph.date, ph.open, ph.high, ph.low, ph.close, ph.volume
             FROM ${priceTable} ph
             JOIN ${metaTable} m ON m.symbol = ph.symbol
             WHERE ph.symbol IN UNNEST(@symbols) AND ph.date >= @startDate AND ph.date <= @endDate AND m.exchange = @exchange
             ORDER BY ph.symbol, ph.date ASC`;
    } else {
      sql = `SELECT symbol, date, open, high, low, close, volume
             FROM ${priceTable}
             WHERE symbol IN UNNEST(@symbols) AND date >= @startDate AND date <= @endDate
             ORDER BY symbol, date ASC`;
    }
  } else {
    if (exchange) {
      params.exchange = exchange;
      sql = `SELECT ph.symbol, ph.date, ph.open, ph.high, ph.low, ph.close, ph.volume
             FROM ${priceTable} ph
             JOIN ${metaTable} m ON m.symbol = ph.symbol
             WHERE ph.date >= @startDate AND ph.date <= @endDate AND m.exchange = @exchange
             ORDER BY ph.symbol, ph.date ASC`;
    } else {
      sql = `SELECT symbol, date, open, high, low, close, volume
             FROM ${priceTable}
             WHERE date >= @startDate AND date <= @endDate
             ORDER BY symbol, date ASC`;
    }
  }

  const rows = await queryBigQuery(sql, params);

  const bySymbol = new Map<string, StockBar[]>();
  for (const row of rows) {
    const sym = row.symbol;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push({
      date: normalizeDate(row.date),
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseInt(row.volume),
    });
  }

  return Array.from(bySymbol.entries())
    .filter(([_, bars]) => bars.length >= 30)
    .map(([symbol, bars]) => ({ symbol, bars, indicators: [] }));
}

export async function runSimulation(
  startDate: string,
  endDate: string,
  initialCapital: number,
  params: StrategyParams,
  symbols?: string[],
  assetType?: string,
  exchange?: string
): Promise<SimulationResult> {
  const allData = await loadPriceData(symbols, startDate, endDate, assetType, exchange);

  if (allData.length === 0) {
    throw new Error("No price data found for the given date range and symbols");
  }

  for (const sd of allData) {
    sd.indicators = computeIndicators(sd.bars, params);
  }

  const allDates = new Set<string>();
  for (const sd of allData) {
    for (const bar of sd.bars) {
      allDates.add(bar.date);
    }
  }
  const sortedDates = Array.from(allDates).sort();

  let cash = initialCapital;
  const positions: Map<string, { quantity: number; avgCost: number }> = new Map();
  const trades: TradeRecord[] = [];
  const timeline: PortfolioSnapshot[] = [];
  let peakValue = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  const signalHistory: Map<string, { lastSignal: boolean; lastChangeDay: number; changeCount: number }> = new Map();

  for (let dayIdx = 0; dayIdx < sortedDates.length; dayIdx++) {
    const date = sortedDates[dayIdx];

    const candidates: { symbol: string; bar: StockBar; indicator: IndicatorData; diffAdjusted: number; newBuyScore: number }[] = [];

    for (const sd of allData) {
      const barIdx = sd.bars.findIndex(b => b.date === date);
      if (barIdx < 0 || barIdx >= sd.indicators.length) continue;

      const bar = sd.bars[barIdx];
      const ind = sd.indicators[barIdx];

      let newBuyScore = 0;
      const hist = signalHistory.get(sd.symbol);
      if (hist) {
        if (ind.buySignal !== hist.lastSignal) {
          signalHistory.set(sd.symbol, { lastSignal: ind.buySignal, lastChangeDay: dayIdx, changeCount: hist.changeCount + 1 });
        }
      } else {
        signalHistory.set(sd.symbol, { lastSignal: ind.buySignal, lastChangeDay: dayIdx, changeCount: 0 });
      }

      if (params.preferNewBuys && ind.buySignal) {
        const sh = signalHistory.get(sd.symbol)!;
        const daysSinceChange = dayIdx - sh.lastChangeDay;
        if (daysSinceChange <= params.newBuyLookbackDays && daysSinceChange >= 0) {
          const avgDaysBetween = sh.changeCount > 0 ? dayIdx / sh.changeCount : dayIdx;
          const recencyBoost = 1 - (daysSinceChange / (params.newBuyLookbackDays + 1));
          const rarityBoost = Math.min(avgDaysBetween / 20, 5);
          newBuyScore = recencyBoost * rarityBoost;
        }
      }

      candidates.push({
        symbol: sd.symbol,
        bar,
        indicator: ind,
        diffAdjusted: ind.macdHistogramAdjusted,
        newBuyScore,
      });
    }

    if (candidates.length === 0) continue;

    for (const [sym, pos] of positions.entries()) {
      if (pos.quantity <= 0) continue;
      const cand = candidates.find(c => c.symbol === sym);
      if (!cand) continue;

      const currentPrice = cand.bar.close;
      const pnlPct = ((currentPrice - pos.avgCost) / pos.avgCost) * 100;

      let shouldSell = false;
      let reason = "";

      if (!cand.indicator.buySignal) {
        shouldSell = true;
        reason = "MACD sell signal";
      } else if (cand.indicator.rsi > params.rsiOverbought) {
        shouldSell = true;
        reason = `RSI overbought (${cand.indicator.rsi.toFixed(1)})`;
      } else if (pnlPct <= -params.stopLossPct) {
        shouldSell = true;
        reason = `Stop loss (${pnlPct.toFixed(1)}%)`;
      } else if (pnlPct >= params.takeProfitPct) {
        shouldSell = true;
        reason = `Take profit (${pnlPct.toFixed(1)}%)`;
      }

      if (shouldSell) {
        const total = pos.quantity * currentPrice;
        const costBasis = pos.quantity * pos.avgCost;
        const pnl = total - costBasis;
        const pnlPctVal = ((currentPrice - pos.avgCost) / pos.avgCost) * 100;
        cash += total;
        trades.push({
          date, symbol: sym, action: "SELL",
          quantity: pos.quantity, price: currentPrice,
          total, reason,
          pnl: Math.round(pnl * 100) / 100,
          pnlPct: Math.round(pnlPctVal * 100) / 100,
        });
        positions.delete(sym);
      }
    }

    if (params.preferNewBuys) {
      candidates.sort((a, b) => {
        if (b.newBuyScore !== a.newBuyScore) return b.newBuyScore - a.newBuyScore;
        return b.diffAdjusted - a.diffAdjusted;
      });
    } else {
      candidates.sort((a, b) => b.diffAdjusted - a.diffAdjusted);
    }

    for (const cand of candidates) {
      if (cash <= params.minCashReserve) break;
      if (positions.has(cand.symbol)) continue;
      if (cand.bar.close > params.maxSharePrice) continue;
      if (cand.bar.close <= 0) continue;

      const isBuySignal = cand.indicator.buySignal &&
        cand.indicator.macdHistogramAdjusted * 10000 > params.minBuySignal &&
        cand.indicator.rsi < params.rsiOverbought;

      if (!isBuySignal) continue;

      const maxAllocation = initialCapital * (params.maxPositionPct / 100);
      const available = Math.min(cash - params.minCashReserve, maxAllocation);
      if (available <= 0) continue;

      const quantity = Math.floor(available / cand.bar.close);
      if (quantity <= 0) continue;

      const total = quantity * cand.bar.close;
      cash -= total;

      positions.set(cand.symbol, {
        quantity,
        avgCost: cand.bar.close,
      });

      const reasonParts = [`MACD buy signal (adj: ${(cand.indicator.macdHistogramAdjusted * 10000).toFixed(2)}, RSI: ${cand.indicator.rsi.toFixed(1)})`];
      if (params.preferNewBuys && cand.newBuyScore > 0) {
        reasonParts.push(`New buy score: ${cand.newBuyScore.toFixed(2)}`);
      }

      trades.push({
        date, symbol: cand.symbol, action: "BUY",
        quantity, price: cand.bar.close, total,
        reason: reasonParts.join(" | "),
      });
    }

    let positionsValue = 0;
    const posSnapshot: PortfolioSnapshot["positions"] = {};
    for (const [sym, pos] of positions.entries()) {
      const cand = candidates.find(c => c.symbol === sym);
      const currentPrice = cand ? cand.bar.close : pos.avgCost;
      const value = pos.quantity * currentPrice;
      const pnl = (currentPrice - pos.avgCost) * pos.quantity;
      positionsValue += value;
      posSnapshot[sym] = {
        quantity: pos.quantity,
        avgCost: pos.avgCost,
        currentPrice,
        value,
        pnl,
      };
    }

    const portfolioValue = cash + positionsValue;
    const totalReturn = portfolioValue - initialCapital;
    const totalReturnPct = (totalReturn / initialCapital) * 100;

    if (portfolioValue > peakValue) peakValue = portfolioValue;
    const drawdown = peakValue - portfolioValue;
    const drawdownPct = peakValue > 0 ? (drawdown / peakValue) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    if (drawdownPct > maxDrawdownPct) maxDrawdownPct = drawdownPct;

    const prevValue = timeline.length > 0 ? timeline[timeline.length - 1].portfolioValue : initialCapital;
    const dayReturn = portfolioValue - prevValue;

    timeline.push({
      date, portfolioValue, cash, positionsValue,
      dayReturn, totalReturn, totalReturnPct,
      positions: posSnapshot,
    });
  }

  const completedTrades: { buyPrice: number; sellPrice: number; pnl: number }[] = [];
  const buyMap = new Map<string, number>();
  for (const t of trades) {
    if (t.action === "BUY") {
      buyMap.set(t.symbol + "_" + t.date, t.price);
    } else if (t.action === "SELL") {
      const keys = Array.from(buyMap.keys()).filter(k => k.startsWith(t.symbol + "_"));
      if (keys.length > 0) {
        const buyPrice = buyMap.get(keys[keys.length - 1])!;
        completedTrades.push({
          buyPrice,
          sellPrice: t.price,
          pnl: (t.price - buyPrice) * t.quantity,
        });
        buyMap.delete(keys[keys.length - 1]);
      }
    }
  }

  const winningTrades = completedTrades.filter(t => t.pnl > 0);
  const losingTrades = completedTrades.filter(t => t.pnl <= 0);
  const winRate = completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0;
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? losingTrades.reduce((s, t) => s + t.pnl, 0) / losingTrades.length : 0;

  const finalValue = timeline.length > 0 ? timeline[timeline.length - 1].portfolioValue : initialCapital;
  const totalReturn = finalValue - initialCapital;
  const totalReturnPct = (totalReturn / initialCapital) * 100;

  const dayCount = sortedDates.length;
  const years = dayCount / 252;
  const annualizedReturn = years > 0 ? (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100 : 0;

  const dailyReturns = timeline.map((s, i) => {
    if (i === 0) return 0;
    const prev = timeline[i - 1].portfolioValue;
    return prev > 0 ? (s.portfolioValue - prev) / prev : 0;
  });
  const avgDailyReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const stdDailyReturn = Math.sqrt(
    dailyReturns.reduce((s, r) => s + Math.pow(r - avgDailyReturn, 2), 0) / dailyReturns.length
  );
  const sharpeRatio = stdDailyReturn > 0 ? (avgDailyReturn / stdDailyReturn) * Math.sqrt(252) : 0;

  let benchmarkReturn = 0;
  let benchmarkReturnPct = 0;
  const spy = allData.find(d => d.symbol === "SPY");
  if (spy && spy.bars.length >= 2) {
    const spyStart = spy.bars[0].close;
    const spyEnd = spy.bars[spy.bars.length - 1].close;
    benchmarkReturnPct = ((spyEnd - spyStart) / spyStart) * 100;
    benchmarkReturn = initialCapital * (benchmarkReturnPct / 100);
  }

  const bestTrade = trades.length > 0
    ? [...trades].filter(t => t.action === "SELL").sort((a, b) => b.total - a.total)[0] || null
    : null;
  const worstTrade = trades.length > 0
    ? [...trades].filter(t => t.action === "SELL").sort((a, b) => a.total - b.total)[0] || null
    : null;

  const downsampledTimeline = downsample(timeline, 500);

  return {
    strategyParams: params,
    startDate: sortedDates[0] || startDate,
    endDate: sortedDates[sortedDates.length - 1] || endDate,
    initialCapital,
    finalValue,
    totalReturn,
    totalReturnPct,
    annualizedReturn,
    maxDrawdown,
    maxDrawdownPct,
    sharpeRatio,
    winRate,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    avgWin,
    avgLoss,
    bestTrade,
    worstTrade,
    timeline: downsampledTimeline,
    trades,
    benchmarkReturn,
    benchmarkReturnPct,
  };
}

function downsample(timeline: PortfolioSnapshot[], maxPoints: number): PortfolioSnapshot[] {
  if (timeline.length <= maxPoints) return timeline;
  const step = Math.ceil(timeline.length / maxPoints);
  const result: PortfolioSnapshot[] = [];
  for (let i = 0; i < timeline.length; i += step) {
    result.push(timeline[i]);
  }
  if (result[result.length - 1] !== timeline[timeline.length - 1]) {
    result.push(timeline[timeline.length - 1]);
  }
  return result;
}

export async function compareStrategies(
  strategies: { name: string; params: StrategyParams }[],
  periods: number[],
  initialCapital: number,
  iterations: number,
  symbols?: string[],
  assetType?: string,
  exchange?: string
): Promise<StrategyComparison> {
  const results: StrategyComparison = { strategies: [] };

  const endDate = new Date().toISOString().split("T")[0];

  for (const strat of strategies) {
    const periodResults: StrategyComparison["strategies"][0]["results"] = [];

    for (const years of periods) {
      const periodStart = new Date();
      periodStart.setFullYear(periodStart.getFullYear() - years);
      const allData = await loadPriceData(symbols, periodStart.toISOString().split("T")[0], endDate, assetType, exchange);

      if (allData.length === 0 || allData[0].bars.length < 30) {
        periodResults.push({
          period: `${years}y`, years,
          avgReturn: 0, avgReturnPct: 0, avgAnnualized: 0,
          winRate: 0, maxDrawdownPct: 0, sharpeRatio: 0, sampleCount: 0,
        });
        continue;
      }

      const allDates = new Set<string>();
      for (const sd of allData) {
        for (const bar of sd.bars) allDates.add(bar.date);
      }
      const sortedDates = Array.from(allDates).sort();

      const actualIterations = Math.min(iterations, Math.max(1, sortedDates.length - 60));
      const simResults: SimulationResult[] = [];

      for (let it = 0; it < actualIterations; it++) {
        const startIdx = Math.floor(Math.random() * (sortedDates.length - 60));
        const simStartDate = sortedDates[startIdx];
        try {
          const result = await runSimulation(simStartDate, endDate, initialCapital, strat.params, symbols, assetType, exchange);
          simResults.push(result);
        } catch {
        }
      }

      if (simResults.length === 0) {
        periodResults.push({
          period: `${years}y`, years,
          avgReturn: 0, avgReturnPct: 0, avgAnnualized: 0,
          winRate: 0, maxDrawdownPct: 0, sharpeRatio: 0, sampleCount: 0,
        });
        continue;
      }

      const avgReturn = simResults.reduce((s, r) => s + r.totalReturn, 0) / simResults.length;
      const avgReturnPct = simResults.reduce((s, r) => s + r.totalReturnPct, 0) / simResults.length;
      const avgAnnualized = simResults.reduce((s, r) => s + r.annualizedReturn, 0) / simResults.length;
      const winRate = simResults.filter(r => r.totalReturn > 0).length / simResults.length * 100;
      const maxDrawdownPct = Math.max(...simResults.map(r => r.maxDrawdownPct));
      const avgSharpe = simResults.reduce((s, r) => s + r.sharpeRatio, 0) / simResults.length;

      periodResults.push({
        period: `${years}y`, years,
        avgReturn, avgReturnPct, avgAnnualized,
        winRate, maxDrawdownPct, sharpeRatio: avgSharpe,
        sampleCount: simResults.length,
      });
    }

    results.strategies.push({
      name: strat.name,
      params: strat.params,
      results: periodResults,
    });
  }

  return results;
}

export async function analyzeMarketConditions(
  strategies: { name: string; params: StrategyParams }[],
  initialCapital: number,
  benchmark: string,
  symbols?: string[],
  assetType?: string,
  exchange?: string
): Promise<MarketConditionResult[]> {
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 10);

  const benchData = await loadPriceData([benchmark], startDate.toISOString().split("T")[0], endDate, assetType);

  if (benchData.length === 0) {
    throw new Error(`No benchmark data found for ${benchmark}`);
  }

  const benchBars = benchData[0].bars;
  const sma200: number[] = [];
  for (let i = 0; i < benchBars.length; i++) {
    const start = Math.max(0, i - 199);
    const slice = benchBars.slice(start, i + 1);
    sma200.push(slice.reduce((s, b) => s + b.close, 0) / slice.length);
  }

  interface MarketPeriod {
    condition: "bull" | "bear" | "sideways";
    startDate: string;
    endDate: string;
  }

  const periods: MarketPeriod[] = [];
  let currentCondition: "bull" | "bear" | "sideways" = "sideways";
  let periodStart = benchBars[200]?.date || benchBars[0].date;

  for (let i = 200; i < benchBars.length; i++) {
    const price = benchBars[i].close;
    const sma = sma200[i];
    const pctAbove = ((price - sma) / sma) * 100;

    let condition: "bull" | "bear" | "sideways";
    if (pctAbove > 5) condition = "bull";
    else if (pctAbove < -5) condition = "bear";
    else condition = "sideways";

    if (condition !== currentCondition) {
      periods.push({
        condition: currentCondition,
        startDate: periodStart,
        endDate: benchBars[i - 1].date,
      });
      currentCondition = condition;
      periodStart = benchBars[i].date;
    }
  }

  periods.push({
    condition: currentCondition,
    startDate: periodStart,
    endDate: benchBars[benchBars.length - 1].date,
  });

  const conditionGroups: Record<string, MarketPeriod[]> = {
    bull: periods.filter(p => p.condition === "bull"),
    bear: periods.filter(p => p.condition === "bear"),
    sideways: periods.filter(p => p.condition === "sideways"),
  };

  const results: MarketConditionResult[] = [];

  for (const condition of ["bull", "bear", "sideways"] as const) {
    const condPeriods = conditionGroups[condition];
    if (condPeriods.length === 0) {
      results.push({
        condition,
        periodCount: 0,
        avgDuration: 0,
        strategyPerformance: strategies.map(s => ({
          strategyName: s.name,
          avgReturnPct: 0,
          avgAnnualized: 0,
          winRate: 0,
          maxDrawdownPct: 0,
        })),
      });
      continue;
    }

    const avgDuration = condPeriods.reduce((s, p) => {
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      return s + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    }, 0) / condPeriods.length;

    const stratPerf: MarketConditionResult["strategyPerformance"] = [];

    for (const strat of strategies) {
      const simResults: SimulationResult[] = [];

      for (const period of condPeriods.slice(0, 5)) {
        try {
          const result = await runSimulation(
            period.startDate, period.endDate, initialCapital,
            strat.params, symbols, assetType, exchange
          );
          simResults.push(result);
        } catch {
        }
      }

      if (simResults.length === 0) {
        stratPerf.push({
          strategyName: strat.name,
          avgReturnPct: 0, avgAnnualized: 0,
          winRate: 0, maxDrawdownPct: 0,
        });
      } else {
        stratPerf.push({
          strategyName: strat.name,
          avgReturnPct: simResults.reduce((s, r) => s + r.totalReturnPct, 0) / simResults.length,
          avgAnnualized: simResults.reduce((s, r) => s + r.annualizedReturn, 0) / simResults.length,
          winRate: simResults.filter(r => r.totalReturn > 0).length / simResults.length * 100,
          maxDrawdownPct: Math.max(...simResults.map(r => r.maxDrawdownPct)),
        });
      }
    }

    results.push({
      condition,
      periodCount: condPeriods.length,
      avgDuration: Math.round(avgDuration),
      strategyPerformance: stratPerf,
    });
  }

  return results;
}
