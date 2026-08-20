// Single source of truth for indicator/metric explanations, shared between grid
// column header tooltips and the detail modal so the wording never drifts.

export const GLOSSARY = {
  signal: "Overall BUY/SELL/HOLD call, derived from MACD crossover, RSI, ADX trend strength, and how recently the signal last changed.",
  rsi: "Relative Strength Index (14-period): momentum on a 0-100 scale. Above 70 is typically overbought, below 30 oversold.",
  macd: "MACD histogram: the gap between the fast and slow EMA, adjusted for price. Positive means the fast average is above the slow one (bullish momentum).",
  adx: "Average Directional Index (14-period): trend strength on a 0-100 scale, direction-agnostic. Above 25 signals a real trend; below 20 signals range-bound/choppy conditions.",
  signalStrength: "Magnitude of the price-adjusted MACD histogram, scaled up for readability — higher means a more pronounced momentum move.",
  signalChanges: "How many times BUY/SELL has flipped over the symbol's full price history — a rough proxy for how choppy vs. stable its signal has been.",
  dataPoints: "Number of daily bars of price history behind this analysis. More history generally means more reliable indicator values.",
  confidence: "0–100 ensemble score combining every indicator below plus this algorithm's own historical accuracy. Hover each line item for the reasoning behind its points.",
  stochRsi: "Stochastic RSI: normalizes RSI's own recent range to 0-100, more sensitive to short-term swings than raw RSI. %K/%D crossing is the signal; below 20 or above 80 is an extreme (bounce-risk) zone.",
  vwap: "Volume-Weighted Average Price over the trailing 20 bars — price weighted by how much volume traded there. Price above VWAP leans bullish, below leans bearish.",
  obv: "On-Balance Volume: cumulative volume, added on up days and subtracted on down days. The trend (not the absolute level) shows whether volume is confirming the price move.",
  atr: "Average True Range (14-period): typical bar-to-bar price movement, in dollars and as a percent of price — a volatility measure, not a direction signal.",
  williamsR: "Williams %R: like Stochastic but scaled -100 to 0. Near 0 = at the recent high (overbought), near -100 = at the recent low (oversold).",
  waveletTrend: "Haar wavelet decomposition of the price series into a denoised trend and short-term noise. Trend energy % is how much of the total price movement is trend vs. noise.",
  waveletSlope: "Slope of the noise-filtered (denoised) trend line over the last ~10 bars — a cleaner read on direction than raw price, since day-to-day noise is filtered out.",
  correlation: "90-day correlation of daily returns vs. the benchmark (SPY for stocks, BTC for crypto). Near +1 moves together, near -1 moves opposite, near 0 is unrelated.",
  beta: "90-day beta vs. the benchmark: how much this symbol tends to move for each 1% move in the benchmark. Beta > 1 amplifies the benchmark's moves, < 1 dampens them.",
  relativeStrength: "This symbol's return minus the benchmark's return over the same 90-day window — positive means it's outperforming the benchmark.",
  sectorCorrelation: "90-day correlation of daily returns vs. a basket of same-sector peers — how much this symbol moves with its sector vs. independently.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
