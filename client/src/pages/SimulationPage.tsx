import { useState, useCallback, useEffect } from "react";
import type { SimulationResult, StrategyParams, StrategyComparison, MarketConditionResult } from "../../../shared/types";
import { runSimulation, compareStrategies, analyzeMarketConditions } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { BUILT_IN_STRATEGIES } from "../lib/builtInStrategies";
import EquityCurve from "../components/EquityCurve";
import TradeLog from "../components/TradeLog";
import SimulationSummary from "../components/SimulationSummary";
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
  minDataDays: 14,
  minTradeValue: 20,
  useEndOfDayPrices: true,
};

type Tab = "simulate" | "compare" | "conditions";

interface SimulationPageProps {
  assetType: string;
  onSelectSymbol?: (symbol: string) => void;
  isPro?: boolean;
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

export default function SimulationPage({ assetType, onSelectSymbol, isPro }: SimulationPageProps) {
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
  const [showMLPresets, setShowMLPresets] = useState(false);

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
  const [hoveredTradeDate, setHoveredTradeDate] = useState<string | null>(null);

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

              <div>
                <span className="text-cyber-muted text-xs font-mono block mb-1">Duration (from start)</span>
                <div className="flex gap-1">
                  {[
                    { label: "1M", months: 1 },
                    { label: "3M", months: 3 },
                    { label: "6M", months: 6 },
                    { label: "1Y", months: 12 },
                  ].map(({ label, months }) => (
                    <button
                      key={label}
                      onClick={() => {
                        const d = new Date(startDate);
                        d.setMonth(d.getMonth() + months);
                        const today = new Date().toISOString().split("T")[0];
                        const newEnd = d.toISOString().split("T")[0];
                        setEndDate(newEnd > today ? today : newEnd);
                      }}
                      className="flex-1 px-2 py-1 text-[11px] font-mono uppercase border border-cyber-green/30 text-cyber-green hover:bg-cyber-green/10 transition-all"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

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

                <label className="block">
                  <span className="text-cyber-muted text-xs font-mono flex justify-between">
                    <span>Min Data Days</span>
                    <span className="text-cyber-green">{params.minDataDays}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    value={params.minDataDays}
                    onChange={e => updateParam("minDataDays", Number(e.target.value))}
                    className="w-full accent-[#00ff41] h-1"
                  />
                  <span className="text-cyber-muted text-[10px] font-mono block mt-1">
                    Minimum days of price data required before considering a buy for any symbol.
                  </span>
                </label>

                <label className="block">
                  <span className="text-cyber-muted text-xs font-mono flex justify-between">
                    <span>Min Trade Value ($)</span>
                    <span className="text-cyber-green">${params.minTradeValue}</span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={params.minTradeValue}
                    onChange={e => updateParam("minTradeValue", Number(e.target.value))}
                    className="w-full bg-cyber-bg border border-cyber-grid text-cyber-text px-2 py-1 text-sm font-mono focus:border-cyber-green outline-none"
                  />
                  <span className="text-cyber-muted text-[10px] font-mono block mt-1">
                    Skip trades below this dollar amount to minimize transaction costs.
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

            {/* ML-Evolved Pro Presets */}
            {BUILT_IN_STRATEGIES.length > 0 && (
              <div className="pt-1 border-t border-cyber-grid/30">
                <button
                  onClick={() => setShowMLPresets(!showMLPresets)}
                  className="w-full py-1.5 text-[11px] font-mono uppercase tracking-wider border border-yellow-500/40 text-yellow-400/80 hover:border-yellow-400 hover:text-yellow-400 transition-all flex items-center justify-center gap-2"
                >
                  <span>⚡</span>
                  <span>ML Presets ({BUILT_IN_STRATEGIES.length})</span>
                  <span className="text-[9px] bg-yellow-500/20 px-1 rounded">PRO</span>
                </button>

                {showMLPresets && (
                  <div className="border border-yellow-500/30 p-2 space-y-1 max-h-[280px] overflow-y-auto mt-1">
                    <p className="text-[10px] font-mono text-yellow-400/60 px-1 pb-1">
                      ML-evolved via genetic algorithm + neuroevolution
                    </p>
                    {BUILT_IN_STRATEGIES.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setStartDate(p.startDate);
                          setEndDate(p.endDate);
                          setCapital(p.initialCapital);
                          setParams({ ...DEFAULT_PARAMS, ...p.params });
                          setSelectedSymbols(p.symbols || []);
                          setExchange(p.exchange || "ALL");
                          setShowMLPresets(false);
                        }}
                        className="w-full text-left px-2 py-2 border border-yellow-500/20 hover:border-yellow-400/60 hover:bg-yellow-500/5 transition-all group"
                      >
                        <div className="text-yellow-300 text-xs font-mono group-hover:text-yellow-200 transition-colors truncate">
                          {p.name}
                        </div>
                        <div className="text-yellow-500/60 text-[10px] font-mono mt-0.5">
                          MACD {p.params.macdFastPeriod}/{p.params.macdSlowPeriod}/{p.params.macdSignalPeriod}
                          {" · "}RSI {p.params.rsiPeriod} ({p.params.rsiOversold.toFixed(0)}–{p.params.rsiOverbought.toFixed(0)})
                          {" · "}SL {p.params.stopLossPct.toFixed(1)}% / TP {p.params.takeProfitPct.toFixed(1)}%
                        </div>
                      </button>
                    ))}
                  </div>
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
              <EquityCurve result={simResult} onDateClick={setTradeLogDate} highlightDate={hoveredTradeDate} />
              <TradeLog trades={simResult.trades} highlightDate={tradeLogDate} onTradeHover={setHoveredTradeDate} onSelectSymbol={onSelectSymbol} />
              <SimulationSummary result={simResult} />
              <SaveSimulationButton
                simResult={simResult}
                params={params}
                startDate={startDate}
                endDate={endDate}
                assetType={assetType}
              />
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

interface SaveSimulationButtonProps {
  simResult: SimulationResult;
  params: StrategyParams;
  startDate: string;
  endDate: string;
  assetType: string;
}

function SaveSimulationButton({ simResult, params, startDate, endDate, assetType }: SaveSimulationButtonProps) {
  const { firebaseUser, user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [simName, setSimName] = useState("");

  if (!user || user.account_type !== "pro") {
    return (
      <div className="border border-cyber-grid/30 p-3 text-center text-cyber-muted/50 font-mono text-xs">
        Pro users can save simulations to their history
      </div>
    );
  }

  if (saved) {
    return (
      <div className="border border-cyber-green/30 p-3 text-center text-cyber-green font-mono text-xs">
        ✓ Simulation saved to your history
      </div>
    );
  }

  return (
    <div className="border border-cyber-grid p-3 space-y-2">
      <div className="text-[10px] text-cyber-green uppercase tracking-widest font-mono">Save to History</div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Simulation name (optional)"
          value={simName}
          onChange={e => setSimName(e.target.value)}
          className="flex-1 bg-cyber-bg border border-cyber-border text-cyber-text text-xs font-mono px-2 py-1 focus:border-cyber-green outline-none"
        />
        <button
          disabled={saving}
          onClick={async () => {
            if (!firebaseUser) return;
            setSaving(true);
            try {
              const token = await firebaseUser.getIdToken();
              const name = simName.trim() || `${assetType.toUpperCase()} ${startDate} – ${endDate}`;
              await fetch("/api/simulations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  name,
                  params: { ...params, startDate, endDate, assetType },
                  result_summary: {
                    totalReturn: simResult.totalReturn,
                    totalReturnPct: simResult.totalReturnPct,
                    tradeCount: simResult.trades?.length ?? 0,
                    winRate: simResult.winRate,
                    maxDrawdown: simResult.maxDrawdown,
                  },
                }),
              });
              setSaved(true);
            } catch {}
            setSaving(false);
          }}
          className="px-4 py-1 text-xs font-mono uppercase tracking-wider border border-cyber-green/60 text-cyber-green hover:bg-cyber-green/10 transition-all disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
