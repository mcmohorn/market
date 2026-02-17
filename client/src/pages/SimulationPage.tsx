import { useState, useCallback, useEffect } from "react";
import type { SimulationResult, StrategyParams, StrategyComparison, MarketConditionResult } from "../../../shared/types";
import { runSimulation, compareStrategies, analyzeMarketConditions } from "../lib/api";
import EquityCurve from "../components/EquityCurve";
import TradeLog from "../components/TradeLog";
import SimulationStats from "../components/SimulationStats";
import StrategyComparisonView from "../components/StrategyComparisonView";
import MarketConditionsView from "../components/MarketConditionsView";
import SymbolPicker from "../components/SymbolPicker";

const DEFAULT_PARAMS: StrategyParams = {
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
  maxTradesPerDay: 10,
  minHoldDays: 0,
  useEndOfDayPrices: true,
};

type Tab = "simulate" | "compare" | "conditions";

interface SimulationPageProps {
  assetType: string;
}

const STOCK_EXCHANGES = ["ALL", "NYSE", "NASDAQ", "ARCA", "BATS", "AMEX"];

const PRESETS_KEY = "mateo_sim_presets";

interface SimPreset {
  name: string;
  savedAt: string;
  startDate: string;
  endDate: string;
  capital: number;
  params: StrategyParams;
  symbols: string[];
  exchange: string;
  assetType: string;
}

function loadPresets(): SimPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: SimPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export default function SimulationPage({ assetType }: SimulationPageProps) {
  const [tab, setTab] = useState<Tab>("simulate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState("2020-01-01");
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [capital, setCapital] = useState(10000);
  const [params, setParams] = useState<StrategyParams>(DEFAULT_PARAMS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [exchange, setExchange] = useState("ALL");

  const [presets, setPresets] = useState<SimPreset[]>(loadPresets);
  const [showPresets, setShowPresets] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const preset: SimPreset = {
      name,
      savedAt: new Date().toISOString(),
      startDate,
      endDate,
      capital,
      params,
      symbols: selectedSymbols,
      exchange,
      assetType,
    };
    const updated = [preset, ...presets.filter(p => p.name !== name)];
    savePresets(updated);
    setPresets(updated);
    setPresetName("");
    setShowSaveInput(false);
  };

  const handleLoadPreset = (preset: SimPreset) => {
    setStartDate(preset.startDate);
    setEndDate(preset.endDate);
    setCapital(preset.capital);
    setParams({ ...DEFAULT_PARAMS, ...preset.params });
    setSelectedSymbols(preset.symbols || []);
    setExchange(preset.exchange || "ALL");
    setShowPresets(false);
  };

  const handleDeletePreset = (name: string) => {
    const updated = presets.filter(p => p.name !== name);
    savePresets(updated);
    setPresets(updated);
  };

  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [compResult, setCompResult] = useState<StrategyComparison | null>(null);
  const [condResult, setCondResult] = useState<MarketConditionResult[] | null>(null);
  const [tradeLogDate, setTradeLogDate] = useState<string | null>(null);

  const exchangeFilter = exchange !== "ALL" ? exchange : undefined;

  const handleSimulate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await runSimulation({
        startDate,
        endDate,
        initialCapital: capital,
        strategy: params,
        assetType,
        exchange: exchangeFilter,
        ...(selectedSymbols.length > 0 ? { symbols: selectedSymbols } : {}),
      });
      setSimResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, capital, params, selectedSymbols, assetType, exchangeFilter]);

  const handleCompare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await compareStrategies({
        strategies: [
          { name: "Conservative", params: { ...params, rsiOverbought: 65, rsiOversold: 35, stopLossPct: 5, takeProfitPct: 10, maxPositionPct: 15 } },
          { name: "Default", params },
          { name: "Aggressive", params: { ...params, rsiOverbought: 80, rsiOversold: 20, stopLossPct: 15, takeProfitPct: 30, maxPositionPct: 40, minBuySignal: 2 } },
        ],
        periods: [5, 10, 20],
        initialCapital: capital,
        iterations: 10,
        assetType,
        exchange: exchangeFilter,
        ...(selectedSymbols.length > 0 ? { symbols: selectedSymbols } : {}),
      });
      setCompResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [params, capital, selectedSymbols, assetType, exchangeFilter]);

  const handleConditions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeMarketConditions({
        strategies: [
          { name: "Conservative", params: { ...params, rsiOverbought: 65, stopLossPct: 5, maxPositionPct: 15 } },
          { name: "Default", params },
          { name: "Aggressive", params: { ...params, rsiOverbought: 80, stopLossPct: 15, maxPositionPct: 40, minBuySignal: 2 } },
        ],
        initialCapital: capital,
        benchmark: assetType === "crypto" ? "BTC" : "SPY",
        assetType,
        exchange: exchangeFilter,
        ...(selectedSymbols.length > 0 ? { symbols: selectedSymbols } : {}),
      });
      setCondResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [params, capital, selectedSymbols, assetType, exchangeFilter]);

  const updateParam = (key: keyof StrategyParams, value: number) => {
    setParams(p => ({ ...p, [key]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-cyber-grid pb-2">
        {(["simulate", "compare", "conditions"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-mono uppercase tracking-wider transition-all ${
              tab === t
                ? "bg-cyber-green text-cyber-bg border border-cyber-green"
                : "text-cyber-muted border border-cyber-grid hover:border-cyber-green hover:text-cyber-green"
            }`}
          >
            {t === "simulate" ? "Run Simulation" : t === "compare" ? "Compare Strategies" : "Market Conditions"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-3">
          <div className="border border-cyber-grid p-3 space-y-3">
            <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider">Parameters</h3>

            <div className="space-y-2">
              <label className="block">
                <span className="text-cyber-muted text-xs font-mono">Start Date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-grid text-cyber-text px-2 py-1 text-sm font-mono focus:border-cyber-green outline-none"
                />
              </label>

              <label className="block">
                <span className="text-cyber-muted text-xs font-mono">End Date</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-grid text-cyber-text px-2 py-1 text-sm font-mono focus:border-cyber-green outline-none"
                />
              </label>

              <label className="block">
                <span className="text-cyber-muted text-xs font-mono">Initial Capital ($)</span>
                <input
                  type="number"
                  value={capital}
                  onChange={e => setCapital(Number(e.target.value))}
                  className="w-full bg-cyber-bg border border-cyber-grid text-cyber-text px-2 py-1 text-sm font-mono focus:border-cyber-green outline-none"
                />
              </label>

              <SymbolPicker selectedSymbols={selectedSymbols} onChange={setSelectedSymbols} assetType={assetType} />

              {assetType === "stock" && (
                <div>
                  <span className="text-cyber-muted text-xs font-mono block mb-1">Exchange</span>
                  <div className="flex flex-wrap gap-1">
                    {STOCK_EXCHANGES.map(ex => (
                      <button
                        key={ex}
                        onClick={() => setExchange(ex)}
                        className={`px-2 py-0.5 text-[11px] font-mono transition-all ${
                          exchange === ex
                            ? "bg-cyber-green text-cyber-bg border border-cyber-green"
                            : "text-cyber-muted border border-cyber-grid hover:border-cyber-green hover:text-cyber-green"
                        }`}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-cyber-muted text-xs font-mono hover:text-cyber-green transition-colors"
            >
              {showAdvanced ? "- Hide" : "+ Show"} Advanced Settings
            </button>

            {showAdvanced && (
              <div className="space-y-2 border-t border-cyber-grid pt-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={params.preferNewBuys}
                    onChange={e => setParams(p => ({ ...p, preferNewBuys: e.target.checked }))}
                    className="accent-[#00ff41] w-4 h-4"
                  />
                  <span className="text-cyber-muted text-xs font-mono group-hover:text-cyber-green transition-colors">
                    Prefer New Buys (slow movers)
                  </span>
                </label>

                {params.preferNewBuys && (
                  <label className="block pl-6">
                    <span className="text-cyber-muted text-xs font-mono flex justify-between">
                      <span>Lookback Days</span>
                      <span className="text-cyber-green">{params.newBuyLookbackDays}</span>
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      value={params.newBuyLookbackDays}
                      onChange={e => updateParam("newBuyLookbackDays", Number(e.target.value))}
                      className="w-full accent-[#00ff41] h-1"
                    />
                    <span className="text-cyber-muted text-[10px] font-mono block mt-1">
                      Buy within this many days of a signal flip. Lower = more selective.
                    </span>
                  </label>
                )}

                <label className="block">
                  <span className="text-cyber-muted text-xs font-mono flex justify-between">
                    <span>Max Trades/Day</span>
                    <span className="text-cyber-green">{params.maxTradesPerDay === 0 ? "∞" : params.maxTradesPerDay}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={params.maxTradesPerDay}
                    onChange={e => updateParam("maxTradesPerDay", Number(e.target.value))}
                    className="w-full accent-[#00ff41] h-1"
                  />
                  <span className="text-cyber-muted text-[10px] font-mono block mt-1">
                    Limit buys + sells per day. 0 = unlimited.
                  </span>
                </label>

                <label className="block">
                  <span className="text-cyber-muted text-xs font-mono flex justify-between">
                    <span>Min Hold Days</span>
                    <span className="text-cyber-green">{params.minHoldDays}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    value={params.minHoldDays}
                    onChange={e => updateParam("minHoldDays", Number(e.target.value))}
                    className="w-full accent-[#00ff41] h-1"
                  />
                  <span className="text-cyber-muted text-[10px] font-mono block mt-1">
                    Hold positions at least this many days before selling (stop-loss still triggers).
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={params.useEndOfDayPrices}
                    onChange={e => setParams(p => ({ ...p, useEndOfDayPrices: e.target.checked }))}
                    className="accent-[#00ff41] w-4 h-4"
                  />
                  <span className="text-cyber-muted text-xs font-mono group-hover:text-cyber-green transition-colors">
                    Use End-of-Day Prices
                  </span>
                </label>
                {!params.useEndOfDayPrices && (
                  <span className="text-cyber-muted text-[10px] font-mono block pl-6 -mt-1">
                    Uses open prices for execution instead of close prices.
                  </span>
                )}

                {([
                  ["macdFastPeriod", "MACD Fast", 2, 50],
                  ["macdSlowPeriod", "MACD Slow", 5, 100],
                  ["macdSignalPeriod", "MACD Signal", 2, 50],
                  ["rsiPeriod", "RSI Period", 5, 30],
                  ["rsiOverbought", "RSI Overbought", 50, 90],
                  ["rsiOversold", "RSI Oversold", 10, 50],
                  ["minBuySignal", "Min Buy Signal", 0, 20],
                  ["maxSharePrice", "Max Price ($)", 10, 5000],
                  ["maxPositionPct", "Max Position %", 5, 100],
                  ["stopLossPct", "Stop Loss %", 1, 50],
                  ["takeProfitPct", "Take Profit %", 5, 100],
                ] as const).map(([key, label, min, max]) => (
                  <label key={key} className="block">
                    <span className="text-cyber-muted text-xs font-mono flex justify-between">
                      <span>{label}</span>
                      <span className="text-cyber-green">{params[key]}</span>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={params[key]}
                      onChange={e => updateParam(key, Number(e.target.value))}
                      className="w-full accent-[#00ff41] h-1"
                    />
                  </label>
                ))}
              </div>
            )}

            <button
              onClick={tab === "simulate" ? handleSimulate : tab === "compare" ? handleCompare : handleConditions}
              disabled={loading}
              className="w-full py-2 bg-cyber-green text-cyber-bg font-mono text-sm uppercase tracking-wider hover:bg-[#00cc33] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-pulse">PROCESSING</span>
                  <span className="animate-spin">&#x25CE;</span>
                </span>
              ) : (
                tab === "simulate" ? "EXECUTE SIMULATION" : tab === "compare" ? "COMPARE STRATEGIES" : "ANALYZE CONDITIONS"
              )}
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => { setShowSaveInput(!showSaveInput); setShowPresets(false); }}
                className="flex-1 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-cyber-grid text-cyber-muted hover:border-cyber-green hover:text-cyber-green transition-all"
              >
                Save Settings
              </button>
              <button
                onClick={() => { setShowPresets(!showPresets); setShowSaveInput(false); }}
                className="flex-1 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-cyber-grid text-cyber-muted hover:border-cyber-green hover:text-cyber-green transition-all"
              >
                Load ({presets.length})
              </button>
            </div>

            {showSaveInput && (
              <div className="border border-cyber-grid p-2 space-y-2">
                <input
                  type="text"
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSavePreset()}
                  placeholder="Preset name..."
                  className="w-full bg-cyber-bg border border-cyber-grid text-cyber-text px-2 py-1 text-xs font-mono focus:border-cyber-green outline-none"
                  autoFocus
                />
                <button
                  onClick={handleSavePreset}
                  disabled={!presetName.trim()}
                  className="w-full py-1 text-[11px] font-mono uppercase bg-cyber-green/20 text-cyber-green border border-cyber-green/30 hover:bg-cyber-green/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            )}

            {showPresets && (
              <div className="border border-cyber-grid p-2 space-y-1 max-h-[250px] overflow-y-auto">
                {presets.length === 0 ? (
                  <p className="text-cyber-muted text-[11px] font-mono text-center py-2">No saved presets</p>
                ) : (
                  presets.map(p => (
                    <div
                      key={p.name}
                      className="flex items-center gap-1 border border-cyber-grid/50 hover:border-cyber-green/50 transition-all group"
                    >
                      <button
                        onClick={() => handleLoadPreset(p)}
                        className="flex-1 text-left px-2 py-1.5 min-w-0"
                      >
                        <div className="text-cyber-text text-xs font-mono truncate group-hover:text-cyber-green transition-colors">
                          {p.name}
                        </div>
                        <div className="text-cyber-muted text-[10px] font-mono">
                          {p.assetType === "crypto" ? "Crypto" : "Stocks"}{p.exchange !== "ALL" ? ` / ${p.exchange}` : ""}
                          {" "}&middot; ${p.capital.toLocaleString()}
                          {" "}&middot; {new Date(p.savedAt).toLocaleDateString()}
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeletePreset(p.name)}
                        className="px-2 py-1 text-cyber-muted hover:text-red-400 text-[11px] transition-colors shrink-0"
                        title="Delete preset"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {simResult && tab === "simulate" && (
            <SimulationStats result={simResult} />
          )}
        </div>

        <div className="lg:col-span-3 space-y-4">
          {error && (
            <div className="border border-red-500 bg-red-500/10 p-3 text-red-400 font-mono text-sm">
              ERROR: {error}
            </div>
          )}

          {tab === "simulate" && simResult && (
            <>
              <EquityCurve result={simResult} onDateClick={setTradeLogDate} />
              <TradeLog trades={simResult.trades} highlightDate={tradeLogDate} />
            </>
          )}

          {tab === "compare" && compResult && (
            <StrategyComparisonView data={compResult} />
          )}

          {tab === "conditions" && condResult && (
            <MarketConditionsView data={condResult} />
          )}

          {!simResult && !compResult && !condResult && !loading && (
            <div className="border border-cyber-grid p-12 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="text-cyber-green text-4xl font-mono">&#x25B6;</div>
                <p className="text-cyber-muted font-mono text-sm">
                  Configure parameters and run a simulation to see results
                </p>
                <p className="text-cyber-muted/50 font-mono text-xs">
                  The simulation engine will walk through historical data day by day,
                  making BUY/SELL decisions based on MACD and RSI signals
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
