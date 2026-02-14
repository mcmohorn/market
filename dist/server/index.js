import{createRequire}from'module';const require=createRequire(import.meta.url);

// server/index.ts
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// server/db.ts
import pg from "pg";
var pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS stocks (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        name VARCHAR(255) DEFAULT '',
        exchange VARCHAR(50) DEFAULT '',
        sector VARCHAR(100) DEFAULT '',
        asset_type VARCHAR(20) DEFAULT 'stock',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        date DATE NOT NULL,
        open DOUBLE PRECISION,
        high DOUBLE PRECISION,
        low DOUBLE PRECISION,
        close DOUBLE PRECISION,
        volume BIGINT,
        asset_type VARCHAR(20) DEFAULT 'stock'
      );

      CREATE INDEX IF NOT EXISTS idx_price_history_symbol ON price_history(symbol);
      CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date);
      CREATE INDEX IF NOT EXISTS idx_price_history_asset ON price_history(asset_type);

      CREATE TABLE IF NOT EXISTS computed_signals (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        name VARCHAR(255) DEFAULT '',
        exchange VARCHAR(50) DEFAULT '',
        sector VARCHAR(100) DEFAULT '',
        asset_type VARCHAR(20) DEFAULT 'stock',
        price DOUBLE PRECISION,
        change_val DOUBLE PRECISION DEFAULT 0,
        change_percent DOUBLE PRECISION DEFAULT 0,
        signal VARCHAR(10) DEFAULT 'HOLD',
        macd_histogram DOUBLE PRECISION DEFAULT 0,
        macd_histogram_adjusted DOUBLE PRECISION DEFAULT 0,
        rsi DOUBLE PRECISION DEFAULT 0,
        signal_strength DOUBLE PRECISION DEFAULT 0,
        last_signal_change VARCHAR(20) DEFAULT '',
        signal_changes INT DEFAULT 0,
        data_points INT DEFAULT 0,
        volume BIGINT DEFAULT 0,
        computed_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_computed_signals_signal ON computed_signals(signal);
      CREATE INDEX IF NOT EXISTS idx_computed_signals_change ON computed_signals(change_percent);
    `);
    console.log("Database tables initialized");
  } finally {
    client.release();
  }
}

// server/routes.ts
import { Router } from "express";

// shared/indicators.ts
function calculateMACD(bars) {
  const m1 = 12;
  const m2 = 26;
  const m3 = 9;
  const a1 = 2 / (m1 + 1);
  const a2 = 2 / (m2 + 1);
  const a3 = 2 / (m3 + 1);
  const minDataPointsToBuy = 10;
  const results = [];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (i === 0) {
      results.push({
        emaFast: bar.close,
        emaSlow: bar.close,
        macdFast: 0,
        macdSlow: 0,
        macdHistogram: 0,
        macdHistogramAdjusted: 0,
        buySignal: false,
        rsi: 50,
        adx: 0,
        ma50: bar.close,
        bollingerBandwidth: 0,
        price: bar.close,
        date: bar.date
      });
    } else {
      const prev = results[i - 1];
      const emaFast = a1 * bar.close + (1 - a1) * prev.emaFast;
      const emaSlow = a2 * bar.close + (1 - a2) * prev.emaSlow;
      const macdFast = emaFast - emaSlow;
      const macdSlow = a3 * macdFast + (1 - a3) * prev.macdSlow;
      const diff = macdFast - macdSlow;
      const diffAdjusted = bar.close !== 0 ? diff / bar.close : 0;
      let buySignal = false;
      if (i > minDataPointsToBuy) {
        buySignal = macdFast > macdSlow;
      }
      results.push({
        emaFast,
        emaSlow,
        macdFast,
        macdSlow,
        macdHistogram: diff,
        macdHistogramAdjusted: diffAdjusted,
        buySignal,
        rsi: 50,
        adx: 0,
        ma50: bar.close,
        bollingerBandwidth: 0,
        price: bar.close,
        date: bar.date
      });
    }
  }
  return results;
}
function calculateRSI(indicators, bars) {
  const period = 14;
  if (bars.length < period + 1) return indicators;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  if (avgLoss === 0) {
    indicators[period].rsi = 100;
  } else {
    const rs = avgGain / avgLoss;
    indicators[period].rsi = 100 - 100 / (1 + rs);
  }
  for (let i = period + 1; i < bars.length; i++) {
    const change = bars[i].close - bars[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) {
      indicators[i].rsi = 100;
    } else {
      const rs = avgGain / avgLoss;
      indicators[i].rsi = 100 - 100 / (1 + rs);
    }
  }
  return indicators;
}
function calculateADX(indicators, bars) {
  const period = 14;
  if (bars.length < period * 2 + 1) return indicators;
  const trueRanges = [0];
  const plusDMs = [0];
  const minusDMs = [0];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const prevHigh = bars[i - 1].high;
    const prevLow = bars[i - 1].low;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    smoothTR += trueRanges[i];
    smoothPlusDM += plusDMs[i];
    smoothMinusDM += minusDMs[i];
  }
  const dxValues = [];
  const computeDX = (sTR, sPDM, sMDM) => {
    const plusDI = sTR > 0 ? sPDM / sTR * 100 : 0;
    const minusDI = sTR > 0 ? sMDM / sTR * 100 : 0;
    const diSum = plusDI + minusDI;
    return diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0;
  };
  dxValues.push(computeDX(smoothTR, smoothPlusDM, smoothMinusDM));
  for (let i = period + 1; i < bars.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trueRanges[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDMs[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDMs[i];
    dxValues.push(computeDX(smoothTR, smoothPlusDM, smoothMinusDM));
    if (dxValues.length === period) {
      const adx = dxValues.reduce((s, v) => s + v, 0) / period;
      indicators[i].adx = adx;
    } else if (dxValues.length > period) {
      const prevADX = indicators[i - 1].adx;
      indicators[i].adx = (prevADX * (period - 1) + dxValues[dxValues.length - 1]) / period;
    }
  }
  return indicators;
}
function calculateMA50AndBollinger(indicators, bars) {
  const maPeriod = 50;
  const bbPeriod = 20;
  for (let i = 0; i < bars.length; i++) {
    const maStart = Math.max(0, i - maPeriod + 1);
    const maSlice = bars.slice(maStart, i + 1);
    indicators[i].ma50 = maSlice.reduce((s, b) => s + b.close, 0) / maSlice.length;
    const bbStart = Math.max(0, i - bbPeriod + 1);
    const bbSlice = bars.slice(bbStart, i + 1);
    const bbMean = bbSlice.reduce((s, b) => s + b.close, 0) / bbSlice.length;
    const variance = bbSlice.reduce((s, b) => s + Math.pow(b.close - bbMean, 2), 0) / bbSlice.length;
    const stdDev = Math.sqrt(variance);
    const upperBand = bbMean + 2 * stdDev;
    const lowerBand = bbMean - 2 * stdDev;
    indicators[i].bollingerBandwidth = bbMean > 0 ? (upperBand - lowerBand) / bbMean * 100 : 0;
  }
  return indicators;
}
function analyzeStock(bars) {
  if (bars.length < 2) return [];
  let indicators = calculateMACD(bars);
  indicators = calculateRSI(indicators, bars);
  indicators = calculateADX(indicators, bars);
  indicators = calculateMA50AndBollinger(indicators, bars);
  return indicators;
}
function getSignal(indicators) {
  if (indicators.length === 0) return "HOLD";
  const last = indicators[indicators.length - 1];
  const rsiNeutral = last.rsi >= 45 && last.rsi <= 55;
  const macdHistNearZero = last.price > 0 && Math.abs(last.macdHistogram) < 1e-3 * last.price;
  const priceNearMA50 = last.ma50 > 0 && Math.abs(last.price - last.ma50) / last.ma50 <= 0.02;
  const weakTrend = last.adx > 0 ? last.adx < 20 : false;
  let noRecentCrossover = true;
  const lookback = Math.min(5, indicators.length - 1);
  for (let j = indicators.length - lookback; j < indicators.length; j++) {
    if (j > 0 && indicators[j].buySignal !== indicators[j - 1].buySignal) {
      noRecentCrossover = false;
      break;
    }
  }
  const holdConditionsMet = [rsiNeutral, macdHistNearZero, noRecentCrossover, priceNearMA50, weakTrend].filter(Boolean).length;
  if (holdConditionsMet >= 4) return "HOLD";
  if (last.rsi > 70 && !last.buySignal) return "SELL";
  if (last.rsi < 30 && last.buySignal) return "BUY";
  if (last.buySignal) return "BUY";
  return "SELL";
}
function getSignalStrength(indicators) {
  if (indicators.length === 0) return 0;
  const last = indicators[indicators.length - 1];
  return Math.abs(last.macdHistogramAdjusted) * 1e4;
}
function countSignalChanges(indicators) {
  let changes = 0;
  for (let i = 1; i < indicators.length; i++) {
    if (indicators[i].buySignal !== indicators[i - 1].buySignal) {
      changes++;
    }
  }
  return changes;
}
function lastSignalChangeDate(indicators) {
  for (let i = indicators.length - 1; i > 0; i--) {
    if (indicators[i].buySignal !== indicators[i - 1].buySignal) {
      return indicators[i].date;
    }
  }
  return indicators.length > 0 ? indicators[indicators.length - 1].date : "";
}

// server/simulation.ts
function computeIndicators(bars, params) {
  const m1 = params.macdFastPeriod;
  const m2 = params.macdSlowPeriod;
  const m3 = params.macdSignalPeriod;
  const a1 = 2 / (m1 + 1);
  const a2 = 2 / (m2 + 1);
  const a3 = 2 / (m3 + 1);
  const minDataPoints = 10;
  const rsiPeriod = params.rsiPeriod;
  const results = [];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (i === 0) {
      results.push({
        emaFast: bar.close,
        emaSlow: bar.close,
        macdFast: 0,
        macdSlow: 0,
        macdHistogram: 0,
        macdHistogramAdjusted: 0,
        buySignal: false,
        rsi: 50,
        adx: 0,
        ma50: bar.close,
        bollingerBandwidth: 0,
        price: bar.close,
        date: bar.date
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
      emaFast,
      emaSlow,
      macdFast,
      macdSlow,
      macdHistogram: diff,
      macdHistogramAdjusted: diffAdjusted,
      buySignal,
      rsi: 50,
      adx: 0,
      ma50: bar.close,
      bollingerBandwidth: 0,
      price: bar.close,
      date: bar.date
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
async function loadPriceData(symbols, startDate, endDate, assetType, exchange) {
  let query;
  let queryParams;
  const atFilter = assetType === "crypto" ? "crypto" : "stock";
  if (symbols && symbols.length > 0) {
    if (exchange) {
      query = `SELECT ph.symbol, ph.date, ph.open, ph.high, ph.low, ph.close, ph.volume
               FROM price_history ph
               JOIN stocks s ON s.symbol = ph.symbol AND s.asset_type = ph.asset_type
               WHERE ph.symbol = ANY($1) AND ph.date >= $2 AND ph.date <= $3 AND ph.asset_type = $4 AND s.exchange = $5
               ORDER BY ph.symbol, ph.date ASC`;
      queryParams = [symbols, startDate, endDate, atFilter, exchange];
    } else {
      query = `SELECT symbol, date, open, high, low, close, volume
               FROM price_history
               WHERE symbol = ANY($1) AND date >= $2 AND date <= $3 AND asset_type = $4
               ORDER BY symbol, date ASC`;
      queryParams = [symbols, startDate, endDate, atFilter];
    }
  } else {
    if (exchange) {
      query = `SELECT ph.symbol, ph.date, ph.open, ph.high, ph.low, ph.close, ph.volume
               FROM price_history ph
               JOIN stocks s ON s.symbol = ph.symbol AND s.asset_type = ph.asset_type
               WHERE ph.date >= $1 AND ph.date <= $2 AND ph.asset_type = $3 AND s.exchange = $4
               ORDER BY ph.symbol, ph.date ASC`;
      queryParams = [startDate, endDate, atFilter, exchange];
    } else {
      query = `SELECT symbol, date, open, high, low, close, volume
               FROM price_history
               WHERE date >= $1 AND date <= $2 AND asset_type = $3
               ORDER BY symbol, date ASC`;
      queryParams = [startDate, endDate, atFilter];
    }
  }
  const result = await pool.query(query, queryParams);
  const bySymbol = /* @__PURE__ */ new Map();
  for (const row of result.rows) {
    const sym = row.symbol;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym).push({
      date: row.date.toISOString().split("T")[0],
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseInt(row.volume)
    });
  }
  return Array.from(bySymbol.entries()).filter(([_, bars]) => bars.length >= 30).map(([symbol, bars]) => ({ symbol, bars, indicators: [] }));
}
async function runSimulation(startDate, endDate, initialCapital, params, symbols, assetType, exchange) {
  const allData = await loadPriceData(symbols, startDate, endDate, assetType, exchange);
  if (allData.length === 0) {
    throw new Error("No price data found for the given date range and symbols");
  }
  for (const sd of allData) {
    sd.indicators = computeIndicators(sd.bars, params);
  }
  const allDates = /* @__PURE__ */ new Set();
  for (const sd of allData) {
    for (const bar of sd.bars) {
      allDates.add(bar.date);
    }
  }
  const sortedDates = Array.from(allDates).sort();
  let cash = initialCapital;
  const positions = /* @__PURE__ */ new Map();
  const trades = [];
  const timeline = [];
  let peakValue = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const signalHistory = /* @__PURE__ */ new Map();
  for (let dayIdx = 0; dayIdx < sortedDates.length; dayIdx++) {
    const date = sortedDates[dayIdx];
    const candidates = [];
    for (const sd of allData) {
      const barIdx = sd.bars.findIndex((b) => b.date === date);
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
        const sh = signalHistory.get(sd.symbol);
        const daysSinceChange = dayIdx - sh.lastChangeDay;
        if (daysSinceChange <= params.newBuyLookbackDays && daysSinceChange >= 0) {
          const avgDaysBetween = sh.changeCount > 0 ? dayIdx / sh.changeCount : dayIdx;
          const recencyBoost = 1 - daysSinceChange / (params.newBuyLookbackDays + 1);
          const rarityBoost = Math.min(avgDaysBetween / 20, 5);
          newBuyScore = recencyBoost * rarityBoost;
        }
      }
      candidates.push({
        symbol: sd.symbol,
        bar,
        indicator: ind,
        diffAdjusted: ind.macdHistogramAdjusted,
        newBuyScore
      });
    }
    if (candidates.length === 0) continue;
    for (const [sym, pos] of positions.entries()) {
      if (pos.quantity <= 0) continue;
      const cand = candidates.find((c) => c.symbol === sym);
      if (!cand) continue;
      const currentPrice = cand.bar.close;
      const pnlPct = (currentPrice - pos.avgCost) / pos.avgCost * 100;
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
        const pnlPctVal = (currentPrice - pos.avgCost) / pos.avgCost * 100;
        cash += total;
        trades.push({
          date,
          symbol: sym,
          action: "SELL",
          quantity: pos.quantity,
          price: currentPrice,
          total,
          reason,
          pnl: Math.round(pnl * 100) / 100,
          pnlPct: Math.round(pnlPctVal * 100) / 100
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
      const isBuySignal = cand.indicator.buySignal && cand.indicator.macdHistogramAdjusted * 1e4 > params.minBuySignal && cand.indicator.rsi < params.rsiOverbought;
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
        avgCost: cand.bar.close
      });
      const reasonParts = [`MACD buy signal (adj: ${(cand.indicator.macdHistogramAdjusted * 1e4).toFixed(2)}, RSI: ${cand.indicator.rsi.toFixed(1)})`];
      if (params.preferNewBuys && cand.newBuyScore > 0) {
        reasonParts.push(`New buy score: ${cand.newBuyScore.toFixed(2)}`);
      }
      trades.push({
        date,
        symbol: cand.symbol,
        action: "BUY",
        quantity,
        price: cand.bar.close,
        total,
        reason: reasonParts.join(" | ")
      });
    }
    let positionsValue = 0;
    const posSnapshot = {};
    for (const [sym, pos] of positions.entries()) {
      const cand = candidates.find((c) => c.symbol === sym);
      const currentPrice = cand ? cand.bar.close : pos.avgCost;
      const value = pos.quantity * currentPrice;
      const pnl = (currentPrice - pos.avgCost) * pos.quantity;
      positionsValue += value;
      posSnapshot[sym] = {
        quantity: pos.quantity,
        avgCost: pos.avgCost,
        currentPrice,
        value,
        pnl
      };
    }
    const portfolioValue = cash + positionsValue;
    const totalReturn2 = portfolioValue - initialCapital;
    const totalReturnPct2 = totalReturn2 / initialCapital * 100;
    if (portfolioValue > peakValue) peakValue = portfolioValue;
    const drawdown = peakValue - portfolioValue;
    const drawdownPct = peakValue > 0 ? drawdown / peakValue * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    if (drawdownPct > maxDrawdownPct) maxDrawdownPct = drawdownPct;
    const prevValue = timeline.length > 0 ? timeline[timeline.length - 1].portfolioValue : initialCapital;
    const dayReturn = portfolioValue - prevValue;
    timeline.push({
      date,
      portfolioValue,
      cash,
      positionsValue,
      dayReturn,
      totalReturn: totalReturn2,
      totalReturnPct: totalReturnPct2,
      positions: posSnapshot
    });
  }
  const completedTrades = [];
  const buyMap = /* @__PURE__ */ new Map();
  for (const t of trades) {
    if (t.action === "BUY") {
      buyMap.set(t.symbol + "_" + t.date, t.price);
    } else if (t.action === "SELL") {
      const keys = Array.from(buyMap.keys()).filter((k) => k.startsWith(t.symbol + "_"));
      if (keys.length > 0) {
        const buyPrice = buyMap.get(keys[keys.length - 1]);
        completedTrades.push({
          buyPrice,
          sellPrice: t.price,
          pnl: (t.price - buyPrice) * t.quantity
        });
        buyMap.delete(keys[keys.length - 1]);
      }
    }
  }
  const winningTrades = completedTrades.filter((t) => t.pnl > 0);
  const losingTrades = completedTrades.filter((t) => t.pnl <= 0);
  const winRate = completedTrades.length > 0 ? winningTrades.length / completedTrades.length * 100 : 0;
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? losingTrades.reduce((s, t) => s + t.pnl, 0) / losingTrades.length : 0;
  const finalValue = timeline.length > 0 ? timeline[timeline.length - 1].portfolioValue : initialCapital;
  const totalReturn = finalValue - initialCapital;
  const totalReturnPct = totalReturn / initialCapital * 100;
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
  const sharpeRatio = stdDailyReturn > 0 ? avgDailyReturn / stdDailyReturn * Math.sqrt(252) : 0;
  let benchmarkReturn = 0;
  let benchmarkReturnPct = 0;
  const spy = allData.find((d) => d.symbol === "SPY");
  if (spy && spy.bars.length >= 2) {
    const spyStart = spy.bars[0].close;
    const spyEnd = spy.bars[spy.bars.length - 1].close;
    benchmarkReturnPct = (spyEnd - spyStart) / spyStart * 100;
    benchmarkReturn = initialCapital * (benchmarkReturnPct / 100);
  }
  const bestTrade = trades.length > 0 ? [...trades].filter((t) => t.action === "SELL").sort((a, b) => b.total - a.total)[0] || null : null;
  const worstTrade = trades.length > 0 ? [...trades].filter((t) => t.action === "SELL").sort((a, b) => a.total - b.total)[0] || null : null;
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
    benchmarkReturnPct
  };
}
function downsample(timeline, maxPoints) {
  if (timeline.length <= maxPoints) return timeline;
  const step = Math.ceil(timeline.length / maxPoints);
  const result = [];
  for (let i = 0; i < timeline.length; i += step) {
    result.push(timeline[i]);
  }
  if (result[result.length - 1] !== timeline[timeline.length - 1]) {
    result.push(timeline[timeline.length - 1]);
  }
  return result;
}
async function compareStrategies(strategies, periods, initialCapital, iterations, symbols, assetType, exchange) {
  const results = { strategies: [] };
  const endDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  for (const strat of strategies) {
    const periodResults = [];
    for (const years of periods) {
      const periodStart = /* @__PURE__ */ new Date();
      periodStart.setFullYear(periodStart.getFullYear() - years);
      const allData = await loadPriceData(symbols, periodStart.toISOString().split("T")[0], endDate, assetType, exchange);
      if (allData.length === 0 || allData[0].bars.length < 30) {
        periodResults.push({
          period: `${years}y`,
          years,
          avgReturn: 0,
          avgReturnPct: 0,
          avgAnnualized: 0,
          winRate: 0,
          maxDrawdownPct: 0,
          sharpeRatio: 0,
          sampleCount: 0
        });
        continue;
      }
      const allDates = /* @__PURE__ */ new Set();
      for (const sd of allData) {
        for (const bar of sd.bars) allDates.add(bar.date);
      }
      const sortedDates = Array.from(allDates).sort();
      const actualIterations = Math.min(iterations, Math.max(1, sortedDates.length - 60));
      const simResults = [];
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
          period: `${years}y`,
          years,
          avgReturn: 0,
          avgReturnPct: 0,
          avgAnnualized: 0,
          winRate: 0,
          maxDrawdownPct: 0,
          sharpeRatio: 0,
          sampleCount: 0
        });
        continue;
      }
      const avgReturn = simResults.reduce((s, r) => s + r.totalReturn, 0) / simResults.length;
      const avgReturnPct = simResults.reduce((s, r) => s + r.totalReturnPct, 0) / simResults.length;
      const avgAnnualized = simResults.reduce((s, r) => s + r.annualizedReturn, 0) / simResults.length;
      const winRate = simResults.filter((r) => r.totalReturn > 0).length / simResults.length * 100;
      const maxDrawdownPct = Math.max(...simResults.map((r) => r.maxDrawdownPct));
      const avgSharpe = simResults.reduce((s, r) => s + r.sharpeRatio, 0) / simResults.length;
      periodResults.push({
        period: `${years}y`,
        years,
        avgReturn,
        avgReturnPct,
        avgAnnualized,
        winRate,
        maxDrawdownPct,
        sharpeRatio: avgSharpe,
        sampleCount: simResults.length
      });
    }
    results.strategies.push({
      name: strat.name,
      params: strat.params,
      results: periodResults
    });
  }
  return results;
}
async function analyzeMarketConditions(strategies, initialCapital, benchmark, symbols, assetType, exchange) {
  const endDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const startDate = /* @__PURE__ */ new Date();
  startDate.setFullYear(startDate.getFullYear() - 10);
  const benchData = await loadPriceData([benchmark], startDate.toISOString().split("T")[0], endDate, assetType);
  if (benchData.length === 0) {
    throw new Error(`No benchmark data found for ${benchmark}`);
  }
  const benchBars = benchData[0].bars;
  const sma200 = [];
  for (let i = 0; i < benchBars.length; i++) {
    const start2 = Math.max(0, i - 199);
    const slice = benchBars.slice(start2, i + 1);
    sma200.push(slice.reduce((s, b) => s + b.close, 0) / slice.length);
  }
  const periods = [];
  let currentCondition = "sideways";
  let periodStart = benchBars[200]?.date || benchBars[0].date;
  for (let i = 200; i < benchBars.length; i++) {
    const price = benchBars[i].close;
    const sma = sma200[i];
    const pctAbove = (price - sma) / sma * 100;
    let condition;
    if (pctAbove > 5) condition = "bull";
    else if (pctAbove < -5) condition = "bear";
    else condition = "sideways";
    if (condition !== currentCondition) {
      periods.push({
        condition: currentCondition,
        startDate: periodStart,
        endDate: benchBars[i - 1].date
      });
      currentCondition = condition;
      periodStart = benchBars[i].date;
    }
  }
  periods.push({
    condition: currentCondition,
    startDate: periodStart,
    endDate: benchBars[benchBars.length - 1].date
  });
  const conditionGroups = {
    bull: periods.filter((p) => p.condition === "bull"),
    bear: periods.filter((p) => p.condition === "bear"),
    sideways: periods.filter((p) => p.condition === "sideways")
  };
  const results = [];
  for (const condition of ["bull", "bear", "sideways"]) {
    const condPeriods = conditionGroups[condition];
    if (condPeriods.length === 0) {
      results.push({
        condition,
        periodCount: 0,
        avgDuration: 0,
        strategyPerformance: strategies.map((s) => ({
          strategyName: s.name,
          avgReturnPct: 0,
          avgAnnualized: 0,
          winRate: 0,
          maxDrawdownPct: 0
        }))
      });
      continue;
    }
    const avgDuration = condPeriods.reduce((s, p) => {
      const start2 = new Date(p.startDate);
      const end = new Date(p.endDate);
      return s + (end.getTime() - start2.getTime()) / (1e3 * 60 * 60 * 24);
    }, 0) / condPeriods.length;
    const stratPerf = [];
    for (const strat of strategies) {
      const simResults = [];
      for (const period of condPeriods.slice(0, 5)) {
        try {
          const result = await runSimulation(period.startDate, period.endDate, initialCapital, strat.params, symbols, assetType, exchange);
          simResults.push(result);
        } catch {
        }
      }
      if (simResults.length === 0) {
        stratPerf.push({
          strategyName: strat.name,
          avgReturnPct: 0,
          avgAnnualized: 0,
          winRate: 0,
          maxDrawdownPct: 0
        });
        continue;
      }
      stratPerf.push({
        strategyName: strat.name,
        avgReturnPct: simResults.reduce((s, r) => s + r.totalReturnPct, 0) / simResults.length,
        avgAnnualized: simResults.reduce((s, r) => s + r.annualizedReturn, 0) / simResults.length,
        winRate: simResults.filter((r) => r.totalReturn > 0).length / simResults.length * 100,
        maxDrawdownPct: Math.max(...simResults.map((r) => r.maxDrawdownPct))
      });
    }
    results.push({
      condition,
      periodCount: condPeriods.length,
      avgDuration,
      strategyPerformance: stratPerf
    });
  }
  return results;
}

// server/routes.ts
var defaultStrategy = {
  macdFastPeriod: 12,
  macdSlowPeriod: 26,
  macdSignalPeriod: 9,
  rsiPeriod: 12,
  rsiOverbought: 70,
  rsiOversold: 30,
  minBuySignal: 4,
  maxSharePrice: 500,
  minCashReserve: 100,
  maxPositionPct: 25,
  stopLossPct: 10,
  takeProfitPct: 20,
  preferNewBuys: false,
  newBuyLookbackDays: 5
};
var router = Router();
function getAssetTypeFilter(assetType) {
  if (assetType === "crypto") return "crypto";
  return "stock";
}
async function computeSignalsAsOfDate(assetFilter, asOfDate, signalFilter, searchFilter, sortCol, sortOrder, lim, off, sectorFilter) {
  const symbolsResult = await pool.query(
    `SELECT DISTINCT ph.symbol, s.name, s.exchange, s.sector
     FROM price_history ph
     LEFT JOIN stocks s ON s.symbol = ph.symbol
     WHERE ph.asset_type = $1
     ORDER BY ph.symbol`,
    [assetFilter]
  );
  const allResults = [];
  for (const row of symbolsResult.rows) {
    const sym = row.symbol;
    const priceResult = await pool.query(
      `SELECT date, open, high, low, close, volume FROM price_history WHERE symbol = $1 AND asset_type = $2 AND date <= $3 ORDER BY date ASC`,
      [sym, assetFilter, asOfDate]
    );
    if (priceResult.rows.length < 2) continue;
    const bars = priceResult.rows.map((r) => ({
      date: r.date.toISOString().split("T")[0],
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume
    }));
    const indicators = analyzeStock(bars);
    if (indicators.length === 0) continue;
    const last = indicators[indicators.length - 1];
    const signal = getSignal(indicators);
    const strength = getSignalStrength(indicators);
    const changes = countSignalChanges(indicators);
    const lastChange = lastSignalChangeDate(indicators);
    const firstBar = bars[0];
    const lastBar = bars[bars.length - 1];
    const change = lastBar.close - firstBar.close;
    const changePercent = firstBar.close !== 0 ? change / firstBar.close * 100 : 0;
    if (signalFilter && signalFilter !== "ALL" && signal !== signalFilter) continue;
    if (searchFilter && !sym.toLowerCase().includes(searchFilter.toLowerCase()) && !(row.name || "").toLowerCase().includes(searchFilter.toLowerCase())) continue;
    if (sectorFilter && sectorFilter !== "ALL" && (row.sector || "") !== sectorFilter) continue;
    allResults.push({
      symbol: sym,
      name: row.name || sym,
      exchange: row.exchange || "",
      sector: row.sector || "",
      price: lastBar.close,
      change,
      changePercent,
      signal,
      macdHistogram: last.macdHistogram,
      macdHistogramAdjusted: last.macdHistogramAdjusted,
      rsi: last.rsi,
      signalStrength: strength,
      lastSignalChange: lastChange,
      signalChanges: changes,
      dataPoints: bars.length,
      volume: lastBar.volume
    });
  }
  const col = sortCol || "change_percent";
  const dir = sortOrder === "asc" ? 1 : -1;
  allResults.sort((a, b) => {
    const va = a[col === "change_percent" ? "changePercent" : col === "signal_strength" ? "signalStrength" : col === "macd_histogram" ? "macdHistogram" : col] ?? 0;
    const vb = b[col === "change_percent" ? "changePercent" : col === "signal_strength" ? "signalStrength" : col === "macd_histogram" ? "macdHistogram" : col] ?? 0;
    return (va - vb) * dir;
  });
  const total = allResults.length;
  const sliced = allResults.slice(off || 0, (off || 0) + (lim || 100));
  return { data: sliced, total };
}
router.get("/api/stocks/signal-alerts", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type);
    const result = await pool.query(
      `SELECT symbol, name, exchange, sector, signal, price, change_percent,
              last_signal_change, signal_changes, data_points
       FROM computed_signals
       WHERE asset_type = $1
         AND last_signal_change IS NOT NULL
         AND last_signal_change != ''
         AND signal_changes > 0
         AND data_points >= 60
       ORDER BY last_signal_change DESC
       LIMIT 200`,
      [assetFilter]
    );
    const now = /* @__PURE__ */ new Date();
    const alerts = result.rows.map((row) => {
      const lastChangeDate = new Date(row.last_signal_change);
      const daysSinceChange = Math.max(1, Math.floor((now.getTime() - lastChangeDate.getTime()) / (1e3 * 60 * 60 * 24)));
      const avgDaysBetweenChanges = row.data_points / row.signal_changes;
      const alertScore = avgDaysBetweenChanges / daysSinceChange;
      return {
        symbol: row.symbol,
        name: row.name,
        exchange: row.exchange,
        sector: row.sector,
        signal: row.signal,
        price: row.price,
        changePercent: row.change_percent,
        lastSignalChange: row.last_signal_change,
        daysSinceChange,
        signalChanges: row.signal_changes,
        dataPoints: row.data_points,
        avgDaysBetweenChanges: Math.round(avgDaysBetweenChanges * 10) / 10,
        alertScore: Math.round(alertScore * 100) / 100
      };
    }).filter((a) => a.daysSinceChange <= 14).sort((a, b) => b.alertScore - a.alertScore).slice(0, 20);
    res.json(alerts);
  } catch (err) {
    console.error("Error fetching signal alerts:", err);
    res.status(500).json({ error: "Failed to fetch signal alerts" });
  }
});
router.get("/api/sectors", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type);
    const result = await pool.query(
      `SELECT DISTINCT sector FROM stocks WHERE asset_type = $1 AND sector IS NOT NULL AND sector != '' ORDER BY sector`,
      [assetFilter]
    );
    res.json(result.rows.map((r) => r.sector));
  } catch (err) {
    console.error("Error fetching sectors:", err);
    res.status(500).json({ error: "Failed to fetch sectors" });
  }
});
router.get("/api/stocks", async (req, res) => {
  try {
    const { signal, sort, order, search, limit, offset, asset_type, as_of_date, sector } = req.query;
    const assetFilter = getAssetTypeFilter(asset_type);
    const lim = Math.min(parseInt(limit) || 100, 500);
    const off = parseInt(offset) || 0;
    if (as_of_date && typeof as_of_date === "string") {
      const result2 = await computeSignalsAsOfDate(
        assetFilter,
        as_of_date,
        signal,
        search,
        sort,
        order,
        lim,
        off,
        sector
      );
      return res.json(result2);
    }
    let query = `SELECT * FROM computed_signals WHERE asset_type = $1`;
    const params = [assetFilter];
    let paramIdx = 2;
    if (signal && signal !== "ALL") {
      query += ` AND signal = $${paramIdx++}`;
      params.push(signal);
    }
    if (search) {
      query += ` AND (symbol ILIKE $${paramIdx} OR name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (sector && sector !== "ALL") {
      query += ` AND sector = $${paramIdx++}`;
      params.push(sector);
    }
    const sortCol = sort || "change_percent";
    const sortOrder = order === "asc" ? "ASC" : "DESC";
    const validCols = ["symbol", "name", "price", "change_percent", "signal", "rsi", "macd_histogram", "signal_strength", "volume", "macd_histogram_adjusted"];
    const safeSort = validCols.includes(sortCol) ? sortCol : "change_percent";
    query += ` ORDER BY ${safeSort} ${sortOrder}`;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(lim, off);
    const result = await pool.query(query, params);
    let countQuery = `SELECT COUNT(*) as total FROM computed_signals WHERE asset_type = $1`;
    const countParams = [assetFilter];
    if (signal && signal !== "ALL") {
      countQuery += ` AND signal = $${countParams.length + 1}`;
      countParams.push(signal);
    }
    if (search) {
      const searchIdx = countParams.length + 1;
      countQuery += ` AND (symbol ILIKE $${searchIdx} OR name ILIKE $${searchIdx})`;
      countParams.push(`%${search}%`);
    }
    if (sector && sector !== "ALL") {
      countQuery += ` AND sector = $${countParams.length + 1}`;
      countParams.push(sector);
    }
    const countResult = await pool.query(countQuery, countParams);
    res.json({
      data: result.rows.map((row) => ({
        symbol: row.symbol,
        name: row.name,
        exchange: row.exchange,
        sector: row.sector,
        price: row.price,
        change: row.change_val,
        changePercent: row.change_percent,
        signal: row.signal,
        macdHistogram: row.macd_histogram,
        macdHistogramAdjusted: row.macd_histogram_adjusted,
        rsi: row.rsi,
        signalStrength: row.signal_strength,
        lastSignalChange: row.last_signal_change,
        signalChanges: row.signal_changes,
        dataPoints: row.data_points,
        volume: row.volume
      })),
      total: parseInt(countResult.rows[0].total)
    });
  } catch (err) {
    console.error("Error fetching stocks:", err);
    res.status(500).json({ error: "Failed to fetch stocks" });
  }
});
router.get("/api/stocks/top-performers", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type);
    const asOfDate = req.query.as_of_date;
    if (asOfDate) {
      const result = await computeSignalsAsOfDate(assetFilter, asOfDate);
      const all = result.data;
      const sorted = [...all].sort((a, b) => b.changePercent - a.changePercent);
      const gainers2 = sorted.slice(0, 10);
      const losers2 = [...all].sort((a, b) => a.changePercent - b.changePercent).slice(0, 10);
      const strongBuys2 = all.filter((r) => r.signal === "BUY").sort((a, b) => b.signalStrength - a.signalStrength).slice(0, 10);
      const mapRow2 = (row) => ({
        symbol: row.symbol,
        name: row.name,
        price: row.price,
        changePercent: row.changePercent,
        signal: row.signal,
        rsi: row.rsi
      });
      return res.json({
        gainers: gainers2.map(mapRow2),
        losers: losers2.map(mapRow2),
        strongBuys: strongBuys2.map(mapRow2)
      });
    }
    const gainers = await pool.query(
      `SELECT * FROM computed_signals WHERE asset_type = $1 ORDER BY change_percent DESC LIMIT 10`,
      [assetFilter]
    );
    const losers = await pool.query(
      `SELECT * FROM computed_signals WHERE asset_type = $1 ORDER BY change_percent ASC LIMIT 10`,
      [assetFilter]
    );
    const strongBuys = await pool.query(
      `SELECT * FROM computed_signals WHERE asset_type = $1 AND signal = 'BUY' ORDER BY signal_strength DESC LIMIT 10`,
      [assetFilter]
    );
    const mapRow = (row) => ({
      symbol: row.symbol,
      name: row.name,
      price: row.price,
      changePercent: row.change_percent,
      signal: row.signal,
      rsi: row.rsi
    });
    res.json({
      gainers: gainers.rows.map(mapRow),
      losers: losers.rows.map(mapRow),
      strongBuys: strongBuys.rows.map(mapRow)
    });
  } catch (err) {
    console.error("Error fetching top performers:", err);
    res.status(500).json({ error: "Failed to fetch top performers" });
  }
});
router.get("/api/stocks/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const stockResult = await pool.query(
      `SELECT * FROM computed_signals WHERE symbol = $1`,
      [symbol.toUpperCase()]
    );
    if (stockResult.rows.length === 0) {
      return res.status(404).json({ error: "Stock not found" });
    }
    const stock = stockResult.rows[0];
    const priceResult = await pool.query(
      `SELECT date, open, high, low, close, volume FROM price_history WHERE symbol = $1 ORDER BY date ASC`,
      [symbol.toUpperCase()]
    );
    const bars = priceResult.rows.map((row) => ({
      date: row.date.toISOString().split("T")[0],
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume
    }));
    const indicators = analyzeStock(bars);
    res.json({
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      sector: stock.sector,
      indicators: indicators.slice(-90),
      summary: {
        symbol: stock.symbol,
        name: stock.name,
        exchange: stock.exchange,
        sector: stock.sector,
        price: stock.price,
        change: stock.change_val,
        changePercent: stock.change_percent,
        signal: stock.signal,
        macdHistogram: stock.macd_histogram,
        macdHistogramAdjusted: stock.macd_histogram_adjusted,
        rsi: stock.rsi,
        signalStrength: stock.signal_strength,
        lastSignalChange: stock.last_signal_change,
        signalChanges: stock.signal_changes,
        dataPoints: stock.data_points,
        volume: stock.volume
      }
    });
  } catch (err) {
    console.error("Error fetching stock detail:", err);
    res.status(500).json({ error: "Failed to fetch stock detail" });
  }
});
router.get("/api/stats", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type);
    const total = await pool.query(`SELECT COUNT(*) as count FROM computed_signals WHERE asset_type = $1`, [assetFilter]);
    const buys = await pool.query(`SELECT COUNT(*) as count FROM computed_signals WHERE asset_type = $1 AND signal = 'BUY'`, [assetFilter]);
    const sells = await pool.query(`SELECT COUNT(*) as count FROM computed_signals WHERE asset_type = $1 AND signal = 'SELL'`, [assetFilter]);
    const holds = await pool.query(`SELECT COUNT(*) as count FROM computed_signals WHERE asset_type = $1 AND signal = 'HOLD'`, [assetFilter]);
    const lastUpdate = await pool.query(`SELECT MAX(computed_at) as last_update FROM computed_signals WHERE asset_type = $1`, [assetFilter]);
    res.json({
      total: parseInt(total.rows[0].count),
      buys: parseInt(buys.rows[0].count),
      sells: parseInt(sells.rows[0].count),
      holds: parseInt(holds.rows[0].count),
      lastUpdate: lastUpdate.rows[0].last_update
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});
router.get("/api/symbols", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type);
    const result = await pool.query(
      `SELECT DISTINCT symbol FROM price_history WHERE asset_type = $1 ORDER BY symbol`,
      [assetFilter]
    );
    res.json(result.rows.map((r) => r.symbol));
  } catch (err) {
    console.error("Error fetching symbols:", err);
    res.status(500).json({ error: "Failed to fetch symbols" });
  }
});
router.get("/api/data-range", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type);
    const result = await pool.query(
      `SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(DISTINCT symbol) as symbol_count, COUNT(*) as total_bars FROM price_history WHERE asset_type = $1`,
      [assetFilter]
    );
    const row = result.rows[0];
    res.json({
      minDate: row.min_date ? row.min_date.toISOString().split("T")[0] : null,
      maxDate: row.max_date ? row.max_date.toISOString().split("T")[0] : null,
      symbolCount: parseInt(row.symbol_count),
      totalBars: parseInt(row.total_bars)
    });
  } catch (err) {
    console.error("Error fetching data range:", err);
    res.status(500).json({ error: "Failed to fetch data range" });
  }
});
router.post("/api/simulation/run", async (req, res) => {
  try {
    const body = req.body;
    if (!body.startDate) {
      return res.status(400).json({ error: "startDate is required" });
    }
    const endDate = body.endDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const initialCapital = body.initialCapital || 1e4;
    const params = { ...defaultStrategy, ...body.strategy };
    const result = await runSimulation(
      body.startDate,
      endDate,
      initialCapital,
      params,
      body.symbols,
      body.assetType,
      body.exchange
    );
    res.json(result);
  } catch (err) {
    console.error("Simulation error:", err);
    res.status(500).json({ error: err.message || "Simulation failed" });
  }
});
router.post("/api/simulation/compare", async (req, res) => {
  try {
    const body = req.body;
    const strategies = body.strategies.map((s) => ({
      name: s.name,
      params: { ...defaultStrategy, ...s.params }
    }));
    const result = await compareStrategies(
      strategies,
      body.periods || [5, 10, 20],
      body.initialCapital || 1e4,
      body.iterations || 10,
      body.symbols,
      body.assetType,
      body.exchange
    );
    res.json(result);
  } catch (err) {
    console.error("Compare error:", err);
    res.status(500).json({ error: err.message || "Comparison failed" });
  }
});
router.post("/api/simulation/market-conditions", async (req, res) => {
  try {
    const body = req.body;
    const strategies = body.strategies.map((s) => ({
      name: s.name,
      params: { ...defaultStrategy, ...s.params }
    }));
    const result = await analyzeMarketConditions(
      strategies,
      body.initialCapital || 1e4,
      body.benchmark || "SPY",
      body.symbols,
      body.assetType,
      body.exchange
    );
    res.json(result);
  } catch (err) {
    console.error("Market conditions error:", err);
    res.status(500).json({ error: err.message || "Market conditions analysis failed" });
  }
});
var routes_default = router;

// server/index.ts
var app = express();
var PORT = parseInt(process.env.PORT || "5000");
app.use(cors());
app.use(express.json());
app.use(routes_default);
var __filename_ = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
var __dirname_ = path.dirname(__filename_);
var distPath = path.resolve(__dirname_, "../public");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});
async function start() {
  await initDB();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
start().catch(console.error);
