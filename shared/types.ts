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
  adx: number;
  ma50: number;
  bollingerBandwidth: number;
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

export interface StrategyParams {
  macdFastPeriod: number;
  macdSlowPeriod: number;
  macdSignalPeriod: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  minBuySignal: number;
  maxSharePrice: number;
  minCashReserve: number;
  maxPositionPct: number;
  stopLossPct: number;
  takeProfitPct: number;
  preferNewBuys: boolean;
  newBuyLookbackDays: number;
}

export const DEFAULT_STRATEGY: StrategyParams = {
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
  newBuyLookbackDays: 5,
};

export interface TradeRecord {
  date: string;
  symbol: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  total: number;
  reason: string;
}

export interface PortfolioSnapshot {
  date: string;
  portfolioValue: number;
  cash: number;
  positionsValue: number;
  dayReturn: number;
  totalReturn: number;
  totalReturnPct: number;
  positions: { [symbol: string]: { quantity: number; avgCost: number; currentPrice: number; value: number; pnl: number } };
}

export interface SimulationResult {
  strategyParams: StrategyParams;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalValue: number;
  totalReturn: number;
  totalReturnPct: number;
  annualizedReturn: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: TradeRecord | null;
  worstTrade: TradeRecord | null;
  timeline: PortfolioSnapshot[];
  trades: TradeRecord[];
  benchmarkReturn: number;
  benchmarkReturnPct: number;
}

export interface StrategyComparison {
  strategies: {
    name: string;
    params: StrategyParams;
    results: {
      period: string;
      years: number;
      avgReturn: number;
      avgReturnPct: number;
      avgAnnualized: number;
      winRate: number;
      maxDrawdownPct: number;
      sharpeRatio: number;
      sampleCount: number;
    }[];
  }[];
}

export interface MarketConditionResult {
  condition: "bull" | "bear" | "sideways";
  periodCount: number;
  avgDuration: number;
  strategyPerformance: {
    strategyName: string;
    avgReturnPct: number;
    avgAnnualized: number;
    winRate: number;
    maxDrawdownPct: number;
  }[];
}

export interface SimulationRequest {
  startDate: string;
  endDate?: string;
  initialCapital: number;
  strategy: Partial<StrategyParams>;
  symbols?: string[];
  assetType?: string;
}

export interface CompareRequest {
  strategies: { name: string; params: Partial<StrategyParams> }[];
  periods: number[];
  initialCapital: number;
  iterations: number;
  symbols?: string[];
  assetType?: string;
}

export interface MarketConditionsRequest {
  strategies: { name: string; params: Partial<StrategyParams> }[];
  initialCapital: number;
  benchmark: string;
  symbols?: string[];
  assetType?: string;
}
