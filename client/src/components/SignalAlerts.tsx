import { useEffect, useState } from "react";
import { fetchSignalAlerts } from "../lib/api";
import type { SignalAlert } from "../lib/api";

interface Props {
  assetType: string;
  onSelectSymbol: (symbol: string) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AlertCard({ alert, onClick }: { alert: SignalAlert; onClick: () => void }) {
  const isBuy = alert.signal === "BUY";
  const isHighAlert = alert.avgDaysBetweenChanges >= 20;

  return (
    <button
      onClick={onClick}
      className={`panel transition-all duration-200 p-3 text-left min-w-[180px] cursor-pointer group relative overflow-hidden ${
        isHighAlert
          ? isBuy
            ? "border-cyber-green/40 hover:border-cyber-green/80"
            : "border-cyber-red/40 hover:border-cyber-red/80"
          : "hover:border-cyber-green/50"
      }`}
    >
      {isHighAlert && (
        <div className={`absolute top-0 right-0 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
          isBuy ? "bg-cyber-green/20 text-cyber-green" : "bg-cyber-red/20 text-cyber-red"
        }`}>
          RARE
        </div>
      )}

      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-bold text-cyber-text group-hover:text-cyber-green transition-colors">
          {alert.symbol}
        </span>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] ${isBuy ? "text-cyber-red" : "text-cyber-green"}`}>
            {isBuy ? "SELL" : "BUY"}
          </span>
          <span className={`text-[10px] ${isBuy ? "text-cyber-green" : "text-cyber-red"}`}>
            →
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
              isBuy
                ? "bg-cyber-green/20 text-cyber-green"
                : "bg-cyber-red/20 text-cyber-red"
            }`}
          >
            {alert.signal}
          </span>
        </div>
      </div>

      <div className="text-[10px] text-cyber-muted truncate mb-2">{alert.name}</div>

      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-cyber-text">${alert.price.toFixed(2)}</span>
        <span className={`text-xs font-bold ${alert.changePercent >= 0 ? "text-cyber-green" : "text-cyber-red"}`}>
          {alert.changePercent >= 0 ? "+" : ""}{alert.changePercent.toFixed(2)}%
        </span>
      </div>

      <div className="border-t border-cyber-border/50 pt-1.5 space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-cyber-muted uppercase">Changed</span>
          <span className="text-[10px] text-cyber-text">
            {formatDate(alert.lastSignalChange)}
            <span className="text-cyber-muted ml-1">({alert.daysSinceChange}d ago)</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-cyber-muted uppercase">Avg Freq</span>
          <span className={`text-[10px] font-bold ${
            alert.avgDaysBetweenChanges >= 20 ? "text-cyber-yellow" : "text-cyber-muted"
          }`}>
            ~{alert.avgDaysBetweenChanges}d between flips
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-cyber-muted uppercase">Total Flips</span>
          <span className="text-[10px] text-cyber-muted">
            {alert.signalChanges}x in {alert.dataPoints}d
          </span>
        </div>
      </div>
    </button>
  );
}

export default function SignalAlerts({ assetType, onSelectSymbol }: Props) {
  const [alerts, setAlerts] = useState<SignalAlert[]>([]);

  useEffect(() => {
    fetchSignalAlerts(assetType)
      .then(setAlerts)
      .catch(() => setAlerts([]));
  }, [assetType]);

  if (alerts.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-cyber-yellow rounded-full animate-pulse" />
        <span className="text-cyber-yellow">SIGNAL CHANGE ALERTS</span>
        <span className="text-cyber-muted">— Recently flipped BUY↔SELL (slow movers ranked higher)</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {alerts.map((alert) => (
          <AlertCard
            key={alert.symbol}
            alert={alert}
            onClick={() => onSelectSymbol(alert.symbol)}
          />
        ))}
      </div>
    </div>
  );
}
