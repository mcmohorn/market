import { useMemo } from "react";
import type { SimulationResult, TradeRecord } from "../../../shared/types";

interface Props {
  result: SimulationResult;
}

function buildSummaryText(r: SimulationResult): string {
  const sells = r.trades.filter(t => t.action === "SELL" && t.pnl != null);
  const sortedByPnl = [...sells].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  const topWins = sortedByPnl.filter(t => (t.pnl || 0) > 0).slice(0, 5);
  const topLosses = sortedByPnl.filter(t => (t.pnl || 0) < 0).reverse().slice(0, 5);

  const totalPnl = sells.reduce((s, t) => s + (t.pnl || 0), 0);
  const avgHold = computeAvgHoldDays(r.trades);

  const uniqueSymbols = new Set(r.trades.map(t => t.symbol));
  const symbolPnl: Record<string, number> = {};
  for (const t of sells) {
    symbolPnl[t.symbol] = (symbolPnl[t.symbol] || 0) + (t.pnl || 0);
  }
  const bestSymbol = Object.entries(symbolPnl).sort((a, b) => b[1] - a[1])[0];
  const worstSymbol = Object.entries(symbolPnl).sort((a, b) => a[1] - b[1])[0];

  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════");
  lines.push("  MATEO SIMULATION SUMMARY REPORT");
  lines.push("═══════════════════════════════════════════════════");
  lines.push("");
  lines.push(`Period: ${r.startDate} to ${r.endDate}`);
  lines.push(`Initial Capital: $${r.initialCapital.toLocaleString()}`);
  lines.push(`Final Value: $${r.finalValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  lines.push("");
  lines.push("─── PERFORMANCE ───────────────────────────────────");
  lines.push(`Total Return: ${r.totalReturnPct >= 0 ? "+" : ""}${r.totalReturnPct.toFixed(2)}% ($${r.totalReturn.toLocaleString("en-US", { maximumFractionDigits: 2 })})`);
  lines.push(`Annualized Return: ${r.annualizedReturn >= 0 ? "+" : ""}${r.annualizedReturn.toFixed(2)}%`);
  lines.push(`Benchmark (SPY): ${r.benchmarkReturnPct >= 0 ? "+" : ""}${r.benchmarkReturnPct.toFixed(2)}%`);
  lines.push(`${r.totalReturnPct > r.benchmarkReturnPct ? ">>> BEAT THE MARKET <<<" : ">>> UNDERPERFORMED THE MARKET <<<"}`);
  lines.push(`Sharpe Ratio: ${r.sharpeRatio.toFixed(3)}`);
  lines.push(`Max Drawdown: -${r.maxDrawdownPct.toFixed(2)}%`);
  lines.push("");
  lines.push("─── TRADING ACTIVITY ──────────────────────────────");
  lines.push(`Total Trades: ${r.totalTrades} (${r.winningTrades} wins, ${r.losingTrades} losses)`);
  lines.push(`Win Rate: ${r.winRate.toFixed(1)}%`);
  lines.push(`Average Win: $${r.avgWin.toFixed(2)}`);
  lines.push(`Average Loss: $${r.avgLoss.toFixed(2)}`);
  lines.push(`Realized P&L: $${totalPnl.toFixed(2)}`);
  lines.push(`Symbols Traded: ${uniqueSymbols.size}`);
  if (avgHold > 0) lines.push(`Avg Hold Duration: ${avgHold.toFixed(1)} days`);
  lines.push("");

  if (topWins.length > 0) {
    lines.push("─── BIGGEST WINS ─────────────────────────────────");
    for (const t of topWins) {
      lines.push(`  ${t.symbol} on ${t.date}: +$${(t.pnl || 0).toFixed(2)} (+${(t.pnlPct || 0).toFixed(1)}%) - ${t.quantity} shares @ $${t.price.toFixed(2)}`);
    }
    lines.push("");
  }

  if (topLosses.length > 0) {
    lines.push("─── BIGGEST LOSSES ───────────────────────────────");
    for (const t of topLosses) {
      lines.push(`  ${t.symbol} on ${t.date}: -$${Math.abs(t.pnl || 0).toFixed(2)} (${(t.pnlPct || 0).toFixed(1)}%) - ${t.quantity} shares @ $${t.price.toFixed(2)}`);
      if (t.reason.includes("Stop loss")) lines.push(`    ^ Stop loss triggered`);
      if (t.reason.includes("RSI overbought")) lines.push(`    ^ Sold due to RSI overbought`);
    }
    lines.push("");
  }

  if (bestSymbol) {
    lines.push("─── SYMBOL ANALYSIS ──────────────────────────────");
    lines.push(`Best Performer: ${bestSymbol[0]} (net +$${bestSymbol[1].toFixed(2)})`);
    if (worstSymbol && worstSymbol[1] < 0) {
      lines.push(`Worst Performer: ${worstSymbol[0]} (net -$${Math.abs(worstSymbol[1]).toFixed(2)})`);
    }
    lines.push("");
  }

  lines.push("─── STRATEGY PARAMS ──────────────────────────────");
  lines.push(`MACD: ${r.strategyParams.macdFastPeriod}/${r.strategyParams.macdSlowPeriod}/${r.strategyParams.macdSignalPeriod}`);
  lines.push(`RSI Period: ${r.strategyParams.rsiPeriod}, Overbought: ${r.strategyParams.rsiOverbought}, Oversold: ${r.strategyParams.rsiOversold}`);
  lines.push(`Min Buy Signal: ${r.strategyParams.minBuySignal}, Max Share Price: $${r.strategyParams.maxSharePrice}`);
  lines.push(`Stop Loss: ${r.strategyParams.stopLossPct}%, Take Profit: ${r.strategyParams.takeProfitPct}%`);
  lines.push(`Max Position: ${r.strategyParams.maxPositionPct}%, Cash Reserve: $${r.strategyParams.minCashReserve}`);
  lines.push(`Max Trades/Day: ${r.strategyParams.maxTradesPerDay}, Min Hold: ${r.strategyParams.minHoldDays} days`);
  lines.push("");
  lines.push("─── KEY TAKEAWAYS ────────────────────────────────");

  if (r.winRate > 60) lines.push("  + Strong win rate indicates reliable signal detection");
  else if (r.winRate < 40) lines.push("  - Low win rate suggests signals need refinement");

  if (r.sharpeRatio > 1) lines.push("  + Good risk-adjusted returns (Sharpe > 1)");
  else if (r.sharpeRatio < 0.5) lines.push("  - Poor risk-adjusted returns, consider tighter risk management");

  if (r.maxDrawdownPct > 25) lines.push("  - Large drawdown, consider lower position sizes or tighter stops");
  else if (r.maxDrawdownPct < 10) lines.push("  + Well-controlled drawdown");

  if (topLosses.length > 0 && topLosses.some(t => t.reason.includes("Stop loss"))) {
    lines.push("  ! Multiple stop losses hit - consider adjusting stop loss percentage");
  }

  if (r.totalTrades < 5) lines.push("  ! Very few trades - consider widening parameters or longer date range");

  const avgWinLossRatio = r.avgLoss > 0 ? r.avgWin / r.avgLoss : 0;
  if (avgWinLossRatio > 2) lines.push(`  + Strong win/loss ratio (${avgWinLossRatio.toFixed(1)}x) - winners are much larger than losers`);
  else if (avgWinLossRatio > 0 && avgWinLossRatio < 1) lines.push(`  - Avg loss exceeds avg win (${avgWinLossRatio.toFixed(1)}x) - let winners run longer`);

  lines.push("");
  lines.push("═══════════════════════════════════════════════════");
  lines.push(`  Generated by MATEO on ${new Date().toISOString().split("T")[0]}`);
  lines.push("═══════════════════════════════════════════════════");

  return lines.join("\n");
}

function computeAvgHoldDays(trades: TradeRecord[]): number {
  const buys: Record<string, string> = {};
  const holdDays: number[] = [];
  for (const t of trades) {
    if (t.action === "BUY") {
      buys[t.symbol] = t.date;
    } else if (t.action === "SELL" && buys[t.symbol]) {
      const buyDate = new Date(buys[t.symbol]);
      const sellDate = new Date(t.date);
      const diff = (sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24);
      holdDays.push(diff);
      delete buys[t.symbol];
    }
  }
  return holdDays.length > 0 ? holdDays.reduce((s, d) => s + d, 0) / holdDays.length : 0;
}

export default function SimulationSummary({ result }: Props) {
  const summaryText = useMemo(() => buildSummaryText(result), [result]);

  const sells = useMemo(() => {
    return result.trades
      .filter(t => t.action === "SELL" && t.pnl != null)
      .sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  }, [result.trades]);

  const topWins = sells.filter(t => (t.pnl || 0) > 0).slice(0, 5);
  const topLosses = sells.filter(t => (t.pnl || 0) < 0).reverse().slice(0, 5);

  const totalPnl = sells.reduce((s, t) => s + (t.pnl || 0), 0);

  const downloadTxt = () => {
    const blob = new Blob([summaryText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mateo_simulation_summary_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (result.totalTrades === 0) return null;

  return (
    <div className="border border-cyber-grid p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider">
          Simulation Summary
        </h3>
        <button
          onClick={downloadTxt}
          className="px-3 py-1 text-[11px] font-mono uppercase tracking-wider border border-cyber-green/40 text-cyber-green hover:bg-cyber-green/10 transition-all"
        >
          Export Summary TXT
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-cyber-panel border border-cyber-grid p-3">
          <div className="text-[10px] text-cyber-muted uppercase tracking-wider">Realized P&L</div>
          <div className={`text-lg font-mono font-bold ${totalPnl >= 0 ? "text-cyber-green" : "text-cyber-red"}`}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-cyber-panel border border-cyber-grid p-3">
          <div className="text-[10px] text-cyber-muted uppercase tracking-wider">Win/Loss Ratio</div>
          <div className="text-lg font-mono font-bold text-cyber-text">
            {result.avgLoss > 0 ? (result.avgWin / result.avgLoss).toFixed(2) : "N/A"}x
          </div>
        </div>
        <div className="bg-cyber-panel border border-cyber-grid p-3">
          <div className="text-[10px] text-cyber-muted uppercase tracking-wider">Symbols Traded</div>
          <div className="text-lg font-mono font-bold text-cyber-text">
            {new Set(result.trades.map(t => t.symbol)).size}
          </div>
        </div>
        <div className="bg-cyber-panel border border-cyber-grid p-3">
          <div className="text-[10px] text-cyber-muted uppercase tracking-wider">vs Benchmark</div>
          <div className={`text-lg font-mono font-bold ${result.totalReturnPct > result.benchmarkReturnPct ? "text-cyber-green" : "text-cyber-red"}`}>
            {(result.totalReturnPct - result.benchmarkReturnPct) >= 0 ? "+" : ""}
            {(result.totalReturnPct - result.benchmarkReturnPct).toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topWins.length > 0 && (
          <div>
            <h4 className="text-xs font-mono text-cyber-green uppercase tracking-wider mb-2">Biggest Wins</h4>
            <div className="space-y-1">
              {topWins.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-mono bg-cyber-green/5 border border-cyber-green/20 px-3 py-1.5 rounded">
                  <span className="text-cyber-text">{t.symbol} <span className="text-cyber-muted text-[10px]">{t.date}</span></span>
                  <span className="text-cyber-green">+${(t.pnl || 0).toFixed(2)} <span className="text-[10px]">(+{(t.pnlPct || 0).toFixed(1)}%)</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {topLosses.length > 0 && (
          <div>
            <h4 className="text-xs font-mono text-cyber-red uppercase tracking-wider mb-2">Biggest Losses</h4>
            <div className="space-y-1">
              {topLosses.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-mono bg-cyber-red/5 border border-cyber-red/20 px-3 py-1.5 rounded">
                  <span className="text-cyber-text">{t.symbol} <span className="text-cyber-muted text-[10px]">{t.date}</span></span>
                  <span className="text-cyber-red">-${Math.abs(t.pnl || 0).toFixed(2)} <span className="text-[10px]">({(t.pnlPct || 0).toFixed(1)}%)</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-mono text-cyber-yellow uppercase tracking-wider mb-2">Key Takeaways</h4>
        <div className="bg-cyber-panel border border-cyber-grid p-3 space-y-1.5">
          {result.winRate > 60 && (
            <p className="text-xs font-mono text-cyber-green">+ Strong win rate ({result.winRate.toFixed(1)}%) indicates reliable signal detection</p>
          )}
          {result.winRate < 40 && result.totalTrades > 5 && (
            <p className="text-xs font-mono text-cyber-red">- Low win rate ({result.winRate.toFixed(1)}%) suggests signals need refinement</p>
          )}
          {result.sharpeRatio > 1 && (
            <p className="text-xs font-mono text-cyber-green">+ Good risk-adjusted returns (Sharpe {result.sharpeRatio.toFixed(2)})</p>
          )}
          {result.sharpeRatio < 0.5 && result.totalTrades > 5 && (
            <p className="text-xs font-mono text-cyber-red">- Poor risk-adjusted returns, consider tighter risk management</p>
          )}
          {result.maxDrawdownPct > 25 && (
            <p className="text-xs font-mono text-cyber-red">- Large drawdown (-{result.maxDrawdownPct.toFixed(1)}%), consider lower position sizes or tighter stops</p>
          )}
          {result.maxDrawdownPct < 10 && result.totalTrades > 5 && (
            <p className="text-xs font-mono text-cyber-green">+ Well-controlled drawdown (-{result.maxDrawdownPct.toFixed(1)}%)</p>
          )}
          {result.totalTrades < 5 && (
            <p className="text-xs font-mono text-cyber-yellow">! Very few trades executed - consider widening parameters or longer date range</p>
          )}
          {result.avgLoss > 0 && result.avgWin / result.avgLoss > 2 && (
            <p className="text-xs font-mono text-cyber-green">+ Winners are {(result.avgWin / result.avgLoss).toFixed(1)}x larger than losers on average</p>
          )}
          {result.avgLoss > 0 && result.avgWin / result.avgLoss < 1 && result.totalTrades > 5 && (
            <p className="text-xs font-mono text-cyber-red">- Average loss exceeds average win - consider letting winners run longer</p>
          )}
          {result.totalReturnPct > result.benchmarkReturnPct && (
            <p className="text-xs font-mono text-cyber-green">+ Strategy outperformed SPY benchmark by {(result.totalReturnPct - result.benchmarkReturnPct).toFixed(2)}%</p>
          )}
          {result.totalReturnPct <= result.benchmarkReturnPct && result.totalTrades > 5 && (
            <p className="text-xs font-mono text-cyber-red">- Underperformed SPY by {(result.benchmarkReturnPct - result.totalReturnPct).toFixed(2)}% - simple index fund would have been better</p>
          )}
        </div>
      </div>
    </div>
  );
}
