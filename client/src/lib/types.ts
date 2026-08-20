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

export interface ConfidenceComponent {
  label: string;
  contribution: number;
  detail: string;
}

export interface StockConfidence {
  symbol: string;
  asset_type: string;
  signal: "BUY" | "SELL" | "HOLD";
  confidence_pct: number;
  components: ConfidenceComponent[];
  computed_at: string;
}

export interface AdvancedIndicators {
  stoch_rsi: number;
  stoch_rsi_k: number;
  stoch_rsi_d: number;
  vwap: number;
  obv: number;
  obv_trend: "UP" | "DOWN" | "FLAT" | "";
  atr: number;
  atr_pct: number;
  williams_r: number;
}

export interface WaveletFeatures {
  levels: number;
  trend_energy_pct: number;
  noise_energy_pct: number;
  dominant_cycle_length: number;
  denoised_price: number;
  denoised_slope_pct: number;
  wavelet_signal: "BUY" | "SELL" | "HOLD";
}

export interface CorrelationStats {
  benchmark_symbol: string;
  correlation_90d: number;
  beta_90d: number;
  relative_strength_90d: number;
  sector_correlation_90d: number;
}

export interface StockAdvanced {
  symbol: string;
  advanced: AdvancedIndicators | null;
  wavelet: WaveletFeatures | null;
  correlation: CorrelationStats | null;
}
