export interface StockBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorData {
  emaFast: number;
  emaSlow: number;
  macdFast: number;
  macdSlow: number;
  macdHistogram: number;
  macdHistogramAdjusted: number;
  buySignal: boolean;
  rsi: number;
  price: number;
  date: string;
}

export interface StockAnalysis {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  signal: "BUY" | "SELL" | "HOLD";
  macdHistogram: number;
  macdHistogramAdjusted: number;
  rsi: number;
  signalStrength: number;
  lastSignalChange: string;
  signalChanges: number;
  dataPoints: number;
  volume: number;
}

export interface StockDetail {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  indicators: IndicatorData[];
  summary: StockAnalysis;
}

export interface TopPerformer {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  signal: "BUY" | "SELL" | "HOLD";
  rsi: number;
}
