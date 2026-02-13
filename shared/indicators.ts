import type { StockBar, IndicatorData } from "./types";

export function calculateMACD(bars: StockBar[]): IndicatorData[] {
  const m1 = 12.0;
  const m2 = 26.0;
  const m3 = 9.0;
  const a1 = 2.0 / (m1 + 1.0);
  const a2 = 2.0 / (m2 + 1.0);
  const a3 = 2.0 / (m3 + 1.0);
  const minDataPointsToBuy = 10;

  const results: IndicatorData[] = [];

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
        date: bar.date,
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
        date: bar.date,
      });
    }
  }

  return results;
}

export function calculateRSI(indicators: IndicatorData[], bars: StockBar[]): IndicatorData[] {
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

export function calculateADX(indicators: IndicatorData[], bars: StockBar[]): IndicatorData[] {
  const period = 14;

  if (bars.length < period * 2 + 1) return indicators;

  const trueRanges: number[] = [0];
  const plusDMs: number[] = [0];
  const minusDMs: number[] = [0];

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

  const dxValues: number[] = [];

  const computeDX = (sTR: number, sPDM: number, sMDM: number): number => {
    const plusDI = sTR > 0 ? (sPDM / sTR) * 100 : 0;
    const minusDI = sTR > 0 ? (sMDM / sTR) * 100 : 0;
    const diSum = plusDI + minusDI;
    return diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
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

export function calculateMA50AndBollinger(indicators: IndicatorData[], bars: StockBar[]): IndicatorData[] {
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
    indicators[i].bollingerBandwidth = bbMean > 0 ? ((upperBand - lowerBand) / bbMean) * 100 : 0;
  }

  return indicators;
}

export function analyzeStock(bars: StockBar[]): IndicatorData[] {
  if (bars.length < 2) return [];
  let indicators = calculateMACD(bars);
  indicators = calculateRSI(indicators, bars);
  indicators = calculateADX(indicators, bars);
  indicators = calculateMA50AndBollinger(indicators, bars);
  return indicators;
}

export function getSignal(indicators: IndicatorData[]): "BUY" | "SELL" | "HOLD" {
  if (indicators.length === 0) return "HOLD";
  const last = indicators[indicators.length - 1];

  const rsiNeutral = last.rsi >= 45 && last.rsi <= 55;
  const macdHistNearZero = last.price > 0 && Math.abs(last.macdHistogram) < 0.001 * last.price;
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

  const holdConditionsMet = [rsiNeutral, macdHistNearZero, noRecentCrossover, priceNearMA50, weakTrend]
    .filter(Boolean).length;

  if (holdConditionsMet >= 4) return "HOLD";

  if (last.rsi > 70 && !last.buySignal) return "SELL";
  if (last.rsi < 30 && last.buySignal) return "BUY";
  if (last.buySignal) return "BUY";
  return "SELL";
}

export function getSignalStrength(indicators: IndicatorData[]): number {
  if (indicators.length === 0) return 0;
  const last = indicators[indicators.length - 1];
  return Math.abs(last.macdHistogramAdjusted) * 10000;
}

export function countSignalChanges(indicators: IndicatorData[]): number {
  let changes = 0;
  for (let i = 1; i < indicators.length; i++) {
    if (indicators[i].buySignal !== indicators[i - 1].buySignal) {
      changes++;
    }
  }
  return changes;
}

export function lastSignalChangeDate(indicators: IndicatorData[]): string {
  for (let i = indicators.length - 1; i > 0; i--) {
    if (indicators[i].buySignal !== indicators[i - 1].buySignal) {
      return indicators[i].date;
    }
  }
  return indicators.length > 0 ? indicators[indicators.length - 1].date : "";
}
