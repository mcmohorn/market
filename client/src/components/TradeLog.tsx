import { useState } from "react";
import type { TradeRecord } from "../../../shared/types";

interface Props {
  trades: TradeRecord[];
}

export default function TradeLog({ trades }: Props) {
  const [expanded, setExpanded] = useState(false);
  const displayTrades = expanded ? trades : trades.slice(-50);

  return (
    <div className="border border-cyber-grid p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider">
          Trade Log ({trades.length} trades)
        </h3>
        {trades.length > 50 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-cyber-muted text-xs font-mono hover:text-cyber-green"
          >
            {expanded ? "Show Recent" : `Show All (${trades.length})`}
          </button>
        )}
      </div>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-cyber-bg">
            <tr className="text-cyber-muted border-b border-cyber-grid">
              <th className="text-left py-1 px-2">DATE</th>
              <th className="text-left py-1 px-2">ACTION</th>
              <th className="text-left py-1 px-2">SYMBOL</th>
              <th className="text-right py-1 px-2">QTY</th>
              <th className="text-right py-1 px-2">PRICE</th>
              <th className="text-right py-1 px-2">TOTAL</th>
              <th className="text-left py-1 px-2">REASON</th>
            </tr>
          </thead>
          <tbody>
            {displayTrades.map((trade, i) => (
              <tr
                key={i}
                className="border-b border-cyber-grid/30 hover:bg-cyber-grid/10 transition-colors"
              >
                <td className="py-1 px-2 text-cyber-muted">{trade.date}</td>
                <td className="py-1 px-2">
                  <span className={`px-1.5 py-0.5 text-[10px] ${
                    trade.action === "BUY"
                      ? "bg-cyber-green/20 text-cyber-green border border-cyber-green/30"
                      : "bg-red-500/20 text-red-400 border border-red-500/30"
                  }`}>
                    {trade.action}
                  </span>
                </td>
                <td className="py-1 px-2 text-cyber-text">{trade.symbol}</td>
                <td className="py-1 px-2 text-right text-cyber-text">{trade.quantity}</td>
                <td className="py-1 px-2 text-right text-cyber-text">
                  ${trade.price.toFixed(2)}
                </td>
                <td className="py-1 px-2 text-right text-cyber-text">
                  ${trade.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-1 px-2 text-cyber-muted text-[10px] max-w-[200px] truncate">
                  {trade.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {trades.length === 0 && (
          <p className="text-center text-cyber-muted py-4">No trades executed</p>
        )}
      </div>
    </div>
  );
}
