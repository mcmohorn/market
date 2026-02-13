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
        rsi: 0,
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
        rsi: 0,
        price: bar.close,
        date: bar.date,
      });
    }
  }

  return results;
}

export function calculateRSI(indicators: IndicatorData[], bars: StockBar[]): IndicatorData[] {
  const period = 12.0;
  const alpha = 1.0 / period;
  let totalGains = 0;
  let totalLosses = 0;

  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      indicators[i].rsi = 0;
      continue;
    }

    const closeNow = bars[i].close;
    const closePrev = bars[i - 1].close;
    let U = 0;
    let D = 0;

    if (closeNow > closePrev) {
      U = closeNow - closePrev;
    } else if (closeNow < closePrev) {
      D = closePrev - closeNow;
    }

    totalGains += U;
    totalLosses += D;

    if (i < 14) {
      const smmad = totalLosses / i;
      const smmau = totalGains / i;
      if (smmad === 0) {
        indicators[i].rsi = 100;
      } else {
        const rs = smmau / smmad;
        indicators[i].rsi = 100 - 100 / (1 + rs);
      }
    } else {
      const prevSmmad = i > 1 ? (indicators[i - 1] as any)._smmad || 0 : 0;
      const prevSmmau = i > 1 ? (indicators[i - 1] as any)._smmau || 0 : 0;
      const smmad = alpha * D + (1 - alpha) * prevSmmad;
      const smmau = alpha * U + (1 - alpha) * prevSmmau;

      (indicators[i] as any)._smmad = smmad;
      (indicators[i] as any)._smmau = smmau;

      if (smmad === 0) {
        indicators[i].rsi = 100;
      } else {
        const rs = smmau / smmad;
        indicators[i].rsi = 100 - 100 / (1 + rs);
      }
    }

    if (i < 14) {
      (indicators[i] as any)._smmad = totalLosses / i;
      (indicators[i] as any)._smmau = totalGains / i;
    }
  }

  return indicators;
}

export function analyzeStock(bars: StockBar[]): IndicatorData[] {
  if (bars.length < 2) return [];
  let indicators = calculateMACD(bars);
  indicators = calculateRSI(indicators, bars);
  return indicators;
}

export function getSignal(indicators: IndicatorData[]): "BUY" | "SELL" | "HOLD" {
  if (indicators.length === 0) return "HOLD";
  const last = indicators[indicators.length - 1];
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
