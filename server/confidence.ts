// Ensemble confidence engine. Combines computed_signals + advanced_indicators +
// wavelet_features + the current algorithm version's historical accuracy into one
// 0-100 confidence score, plus an itemized `components` breakdown.
//
// The components array is intentionally the *literal* data the future tooltip UI
// will render ("show our work") — each entry is a plain-language label, the point
// contribution, and a `detail` string with the actual numbers behind it. Keep new
// components in that shape so the UI never needs bespoke formatting per indicator.

export interface ConfidenceComponent {
  label: string;
  contribution: number;
  detail: string;
}

export interface ConfidenceInput {
  signal: "BUY" | "SELL" | "HOLD";
  buySignal: boolean;
  rsi: number;
  adx: number;
  macdHistogramAdjusted: number;
  stochRsiK?: number;
  stochRsiD?: number;
  obvTrend?: "UP" | "DOWN" | "FLAT";
  williamsR?: number;
  waveletSignal?: "BUY" | "SELL" | "HOLD";
  denoisedSlopePct?: number;
  algorithmAccuracyPct?: number;
}

export interface ConfidenceResult {
  confidencePct: number;
  components: ConfidenceComponent[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const {
    signal, buySignal, rsi, adx, macdHistogramAdjusted,
    stochRsiK, stochRsiD, obvTrend, williamsR,
    waveletSignal, denoisedSlopePct, algorithmAccuracyPct,
  } = input;

  const components: ConfidenceComponent[] = [];
  const isBullishSignal = signal === "BUY";
  const isBearishSignal = signal === "SELL";
  const directionless = signal === "HOLD";

  // MACD crossover alignment (0-20): does the raw crossover agree with the signal?
  {
    const aligned = (isBullishSignal && buySignal) || (isBearishSignal && !buySignal);
    const magnitude = clamp(Math.abs(macdHistogramAdjusted) * 5000, 0, 1);
    const pts = directionless ? 5 : aligned ? 10 + 10 * magnitude : 0;
    components.push({
      label: aligned ? "MACD crossover confirms direction" : directionless ? "MACD near equilibrium" : "MACD crossover disagrees",
      contribution: Math.round(pts),
      detail: `MACD histogram (price-adjusted): ${macdHistogramAdjusted.toFixed(5)}, crossover state: ${buySignal ? "bullish" : "bearish"}`,
    });
  }

  // RSI positioning (0-15): extremes strengthen conviction in the matching direction.
  {
    let pts = 0;
    let label = "RSI neutral";
    if (isBullishSignal && rsi < 40) { pts = 15 * clamp((40 - rsi) / 40, 0, 1); label = "RSI shows oversold recovery room"; }
    else if (isBearishSignal && rsi > 60) { pts = 15 * clamp((rsi - 60) / 40, 0, 1); label = "RSI shows overbought pressure"; }
    else if (directionless && rsi >= 45 && rsi <= 55) { pts = 8; label = "RSI confirms range-bound HOLD"; }
    components.push({ label, contribution: Math.round(pts), detail: `RSI(14): ${rsi.toFixed(1)}` });
  }

  // ADX trend strength (0-15): a strong trend backs a directional call; a weak
  // trend backs a HOLD and works against BUY/SELL conviction.
  {
    const strongTrend = adx >= 25;
    let pts = 0;
    let label: string;
    if (!directionless) {
      pts = strongTrend ? 15 * clamp((adx - 25) / 25, 0, 1) + 5 : 0;
      label = strongTrend ? "ADX confirms a real trend" : "ADX shows a weak/no trend";
    } else {
      pts = !strongTrend ? 10 : 0;
      label = !strongTrend ? "ADX confirms range-bound conditions" : "ADX shows trending conditions (against HOLD)";
    }
    components.push({ label, contribution: Math.round(pts), detail: `ADX(14): ${adx.toFixed(1)}` });
  }

  // Stochastic RSI confirmation (0-15): agreement between %K/%D and the signal.
  // Deep in the 0-20/80-100 extremes is treated as its own "bounce risk" regime
  // rather than a straight disagreement — a bearish K/D cross that's already
  // deeply oversold is exhaustion, not fresh conviction.
  if (stochRsiK !== undefined && stochRsiD !== undefined) {
    const extremeLow = stochRsiK < 20 && stochRsiD < 20;
    const extremeHigh = stochRsiK > 80 && stochRsiD > 80;
    const bullishStoch = stochRsiK > stochRsiD && !extremeHigh;
    const bearishStoch = stochRsiK < stochRsiD && !extremeLow;
    const aligned = (isBullishSignal && bullishStoch) || (isBearishSignal && bearishStoch);
    const inExtremeAgainstSignal = (isBullishSignal && extremeHigh) || (isBearishSignal && extremeLow);

    let pts: number;
    let label: string;
    if (aligned) { pts = 15; label = "Stochastic RSI confirms direction"; }
    else if (inExtremeAgainstSignal) { pts = 5; label = "Stochastic RSI in extreme zone (bounce risk, not a clean contradiction)"; }
    else if (directionless) { pts = 4; label = "Stochastic RSI inconclusive"; }
    else { pts = 0; label = "Stochastic RSI disagrees"; }

    components.push({
      label,
      contribution: Math.round(pts),
      detail: `Stoch RSI %K: ${stochRsiK.toFixed(1)}, %D: ${stochRsiD.toFixed(1)}`,
    });
  }

  // OBV volume confirmation (0-10): does volume flow support the price move?
  if (obvTrend) {
    const aligned = (isBullishSignal && obvTrend === "UP") || (isBearishSignal && obvTrend === "DOWN");
    const pts = directionless ? 3 : aligned ? 10 : 0;
    components.push({
      label: aligned ? "Volume flow (OBV) confirms direction" : directionless ? "Volume flow flat" : "Volume flow doesn't confirm",
      contribution: Math.round(pts),
      detail: `On-Balance Volume trend: ${obvTrend}`,
    });
  }

  // Williams %R extremes (0-10): agreement with overbought/oversold reading.
  if (williamsR !== undefined) {
    let pts = 0;
    let label = "Williams %R neutral";
    if (isBullishSignal && williamsR <= -80) { pts = 10; label = "Williams %R confirms oversold"; }
    else if (isBearishSignal && williamsR >= -20) { pts = 10; label = "Williams %R confirms overbought"; }
    components.push({ label, contribution: Math.round(pts), detail: `Williams %R: ${williamsR.toFixed(1)}` });
  }

  // Wavelet denoised trend (0-15): does the noise-filtered trend line agree?
  if (waveletSignal && denoisedSlopePct !== undefined) {
    const aligned = waveletSignal === signal;
    const magnitude = clamp(Math.abs(denoisedSlopePct) / 3, 0, 1);
    const pts = aligned ? 10 + 5 * magnitude : directionless ? 5 : 0;
    components.push({
      label: aligned ? "Wavelet-denoised trend confirms direction" : directionless ? "Wavelet trend inconclusive" : "Wavelet-denoised trend disagrees",
      contribution: Math.round(pts),
      detail: `Denoised trend slope (10-bar): ${denoisedSlopePct.toFixed(2)}%`,
    });
  }

  // Historical accuracy of the current algorithm version (0-10): a track-record
  // weight so confidence reflects how well this rule set has actually performed,
  // not just how many indicators agree right now.
  if (algorithmAccuracyPct !== undefined) {
    const pts = clamp(algorithmAccuracyPct / 10, 0, 10);
    components.push({
      label: "Weighted by algorithm's historical accuracy",
      contribution: Math.round(pts),
      detail: `Current algorithm version accuracy: ${algorithmAccuracyPct.toFixed(1)}%`,
    });
  }

  const raw = components.reduce((s, c) => s + c.contribution, 0);
  const confidencePct = Math.round(clamp(raw, 0, 100));

  return { confidencePct, components };
}
