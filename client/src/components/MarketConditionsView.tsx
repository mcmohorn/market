import type { MarketConditionResult } from "../../../shared/types";

interface Props {
  data: MarketConditionResult[];
}

const CONDITION_CONFIG = {
  bull: { label: "BULL MARKET", icon: "\u25B2", color: "text-cyber-green", border: "border-cyber-green/30", bg: "bg-cyber-green/5" },
  bear: { label: "BEAR MARKET", icon: "\u25BC", color: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/5" },
  sideways: { label: "SIDEWAYS", icon: "\u25C6", color: "text-yellow-400", border: "border-yellow-500/30", bg: "bg-yellow-500/5" },
};

export default function MarketConditionsView({ data }: Props) {
  return (
    <div className="space-y-4">
      <div className="border border-cyber-grid p-3">
        <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider mb-1">
          Strategy Performance by Market Condition
        </h3>
        <p className="text-cyber-muted text-xs font-mono mb-3">
          Based on S&P 500 vs 200-day moving average (above +5% = bull, below -5% = bear)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.map(condition => {
          const config = CONDITION_CONFIG[condition.condition];
          return (
            <div
              key={condition.condition}
              className={`border ${config.border} ${config.bg} p-4`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-2xl ${config.color}`}>{config.icon}</span>
                <div>
                  <h4 className={`font-mono text-sm uppercase tracking-wider ${config.color}`}>
                    {config.label}
                  </h4>
                  <p className="text-cyber-muted text-[10px] font-mono">
                    {condition.periodCount} periods, avg {Math.round(condition.avgDuration)} days
                  </p>
                </div>
              </div>

              {condition.strategyPerformance.length > 0 ? (
                <div className="space-y-3">
                  {condition.strategyPerformance.map((perf, i) => {
                    const isWinner = condition.strategyPerformance.every(
                      p => p.avgReturnPct <= perf.avgReturnPct
                    );
                    return (
                      <div
                        key={perf.strategyName}
                        className={`border border-cyber-grid/50 p-2 ${isWinner ? "ring-1 ring-cyber-green/30" : ""}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-cyber-text text-xs font-mono uppercase">
                            {perf.strategyName}
                          </span>
                          {isWinner && (
                            <span className="text-[9px] bg-cyber-green/20 text-cyber-green px-1.5 py-0.5 font-mono">
                              OPTIMAL
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                          <div className="flex justify-between">
                            <span className="text-cyber-muted">Avg Return</span>
                            <span className={perf.avgReturnPct >= 0 ? "text-cyber-green" : "text-red-400"}>
                              {perf.avgReturnPct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyber-muted">Annualized</span>
                            <span className={perf.avgAnnualized >= 0 ? "text-cyber-green" : "text-red-400"}>
                              {perf.avgAnnualized.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyber-muted">Win Rate</span>
                            <span className={perf.winRate > 50 ? "text-cyber-green" : "text-yellow-400"}>
                              {perf.winRate.toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyber-muted">Max DD</span>
                            <span className="text-red-400">-{perf.maxDrawdownPct.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-cyber-muted text-xs font-mono text-center py-2">
                  No data available
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="border border-cyber-grid p-3">
        <h4 className="text-cyber-green font-mono text-xs uppercase tracking-wider mb-2">
          Key Insight
        </h4>
        <p className="text-cyber-muted text-xs font-mono leading-relaxed">
          {(() => {
            const bull = data.find(d => d.condition === "bull");
            const bear = data.find(d => d.condition === "bear");
            if (!bull || !bear) return "Insufficient data for analysis.";

            const bullBest = bull.strategyPerformance.reduce(
              (best, p) => p.avgReturnPct > best.avgReturnPct ? p : best,
              bull.strategyPerformance[0]
            );
            const bearBest = bear.strategyPerformance.reduce(
              (best, p) => p.avgReturnPct > best.avgReturnPct ? p : best,
              bear.strategyPerformance[0]
            );

            if (!bullBest || !bearBest) return "Insufficient data for analysis.";

            if (bullBest.strategyName === bearBest.strategyName) {
              return `The ${bullBest.strategyName} strategy performs best in both bull and bear markets. This suggests a robust all-weather approach.`;
            }
            return `In bull markets, the ${bullBest.strategyName} strategy leads with ${bullBest.avgReturnPct.toFixed(1)}% avg return. In bear markets, ${bearBest.strategyName} is optimal with ${bearBest.avgReturnPct.toFixed(1)}% avg return. Consider switching strategies based on market regime.`;
          })()}
        </p>
      </div>
    </div>
  );
}
