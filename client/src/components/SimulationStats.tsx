import type { SimulationResult } from "../../../shared/types";

interface Props {
  result: SimulationResult;
}

export default function SimulationStats({ result }: Props) {
  const stats = [
    { label: "Final Value", value: `$${result.finalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: result.totalReturn >= 0 ? "text-cyber-green" : "text-red-400" },
    { label: "Total Return", value: `${result.totalReturnPct >= 0 ? "+" : ""}${result.totalReturnPct.toFixed(2)}%`, color: result.totalReturnPct >= 0 ? "text-cyber-green" : "text-red-400" },
    { label: "Annualized", value: `${result.annualizedReturn >= 0 ? "+" : ""}${result.annualizedReturn.toFixed(2)}%`, color: result.annualizedReturn >= 0 ? "text-cyber-green" : "text-red-400" },
    { label: "Sharpe Ratio", value: result.sharpeRatio.toFixed(3), color: result.sharpeRatio > 1 ? "text-cyber-green" : result.sharpeRatio > 0 ? "text-yellow-400" : "text-red-400" },
    { label: "Max Drawdown", value: `-${result.maxDrawdownPct.toFixed(2)}%`, color: result.maxDrawdownPct < 10 ? "text-cyber-green" : result.maxDrawdownPct < 25 ? "text-yellow-400" : "text-red-400" },
    { label: "Win Rate", value: `${result.winRate.toFixed(1)}%`, color: result.winRate > 50 ? "text-cyber-green" : "text-yellow-400" },
    { label: "Total Trades", value: String(result.totalTrades), color: "text-cyber-text" },
    { label: "Winning", value: String(result.winningTrades), color: "text-cyber-green" },
    { label: "Losing", value: String(result.losingTrades), color: "text-red-400" },
    { label: "Avg Win", value: `$${result.avgWin.toFixed(0)}`, color: "text-cyber-green" },
    { label: "Avg Loss", value: `$${result.avgLoss.toFixed(0)}`, color: "text-red-400" },
    { label: "Benchmark (SPY)", value: `${result.benchmarkReturnPct >= 0 ? "+" : ""}${result.benchmarkReturnPct.toFixed(2)}%`, color: "text-cyan-400" },
  ];

  const beat = result.totalReturnPct > result.benchmarkReturnPct;

  return (
    <div className="border border-cyber-grid p-3 space-y-2">
      <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider">Results</h3>

      <div className={`text-center py-2 border ${beat ? "border-cyber-green/30 bg-cyber-green/5" : "border-red-500/30 bg-red-500/5"}`}>
        <span className={`font-mono text-xs ${beat ? "text-cyber-green" : "text-red-400"}`}>
          {beat ? "BEAT THE MARKET" : "UNDERPERFORMED"}
        </span>
      </div>

      <div className="space-y-1">
        {stats.map(s => (
          <div key={s.label} className="flex justify-between text-xs font-mono">
            <span className="text-cyber-muted">{s.label}</span>
            <span className={s.color}>{s.value}</span>
          </div>
        ))}
      </div>

      <div className="text-[10px] text-cyber-muted/50 font-mono pt-1 border-t border-cyber-grid">
        {result.startDate} to {result.endDate}
      </div>
    </div>
  );
}
