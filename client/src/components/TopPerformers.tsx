import { useEffect, useState } from "react";
import { fetchTopPerformers } from "../lib/api";
import type { TopPerformer } from "../lib/types";

interface Props {
  assetType: string;
  asOfDate?: string;
  onSelectSymbol: (symbol: string) => void;
}

function TickerCard({ item, onClick }: { item: TopPerformer; onClick: () => void }) {
  const isPositive = item.changePercent >= 0;

  return (
    <button
      onClick={onClick}
      className="panel hover:border-cyber-green/50 transition-all duration-200 p-3 text-left min-w-[140px] cursor-pointer group"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-cyber-text group-hover:text-cyber-green transition-colors">
          {item.symbol}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
            item.signal === "BUY"
              ? "bg-cyber-green/20 text-cyber-green"
              : item.signal === "SELL"
              ? "bg-cyber-red/20 text-cyber-red"
              : "bg-cyber-yellow/20 text-cyber-yellow"
          }`}
        >
          {item.signal}
        </span>
      </div>
      <div className="text-xs text-cyber-muted truncate mb-1">{item.name}</div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-cyber-text">${item.price.toFixed(2)}</span>
        <span
          className={`text-xs font-bold ${isPositive ? "text-cyber-green" : "text-cyber-red"}`}
        >
          {isPositive ? "+" : ""}{item.changePercent.toFixed(2)}%
        </span>
      </div>
    </button>
  );
}

export default function TopPerformers({ assetType, asOfDate, onSelectSymbol }: Props) {
  const [data, setData] = useState<{
    gainers: TopPerformer[];
    losers: TopPerformer[];
    strongBuys: TopPerformer[];
  } | null>(null);

  useEffect(() => {
    fetchTopPerformers(assetType, asOfDate)
      .then(setData)
      .catch(() => setData(null));
  }, [assetType, asOfDate]);

  if (!data || (data.gainers.length === 0 && data.losers.length === 0)) {
    return null;
  }

  return (
    <div className="space-y-3">
      <Section title="TOP GAINERS" items={data.gainers} onSelect={onSelectSymbol} />
      <Section title="STRONG BUY SIGNALS" items={data.strongBuys} onSelect={onSelectSymbol} />
      <Section title="TOP LOSERS" items={data.losers} onSelect={onSelectSymbol} />
    </div>
  );
}

function Section({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: TopPerformer[];
  onSelect: (symbol: string) => void;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] text-cyber-green uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-cyber-green rounded-full" />
        {title}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {items.map((item) => (
          <TickerCard
            key={item.symbol}
            item={item}
            onClick={() => onSelect(item.symbol)}
          />
        ))}
      </div>
    </div>
  );
}
