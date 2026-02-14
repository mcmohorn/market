import { useState, useMemo, useRef, useEffect } from "react";
import type { TradeRecord } from "../../../shared/types";

type SortField = "date" | "pnl";
type SortDir = "asc" | "desc";

interface Props {
  trades: TradeRecord[];
  highlightDate?: string | null;
}

export default function TradeLog({ trades, highlightDate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [filterSymbol, setFilterSymbol] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const scrollRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "pnl" ? "desc" : "asc");
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  const filteredAndSorted = useMemo(() => {
    let list = filterSymbol ? trades.filter(t => t.symbol === filterSymbol) : [...trades];
    if (sortField === "pnl") {
      list.sort((a, b) => {
        const aPnl = a.action === "SELL" && a.pnl != null ? a.pnl : (sortDir === "asc" ? Infinity : -Infinity);
        const bPnl = b.action === "SELL" && b.pnl != null ? b.pnl : (sortDir === "asc" ? Infinity : -Infinity);
        return sortDir === "asc" ? aPnl - bPnl : bPnl - aPnl;
      });
    } else {
      list.sort((a, b) => {
        const cmp = a.date.localeCompare(b.date);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [trades, filterSymbol, sortField, sortDir]);

  const recentSlice = useMemo(() => {
    if (sortField === "date" && sortDir === "asc") return filteredAndSorted.slice(-50);
    return filteredAndSorted.slice(0, 50);
  }, [filteredAndSorted, sortField, sortDir]);

  const shouldExpand = expanded || !!highlightDate;
  const displayTrades = shouldExpand ? filteredAndSorted : recentSlice;

  const highlightIndex = useMemo(() => {
    if (!highlightDate) return -1;
    let closest = -1;
    let closestDist = Infinity;
    for (let i = 0; i < displayTrades.length; i++) {
      const dist = Math.abs(new Date(displayTrades[i].date).getTime() - new Date(highlightDate).getTime());
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    return closest;
  }, [displayTrades, highlightDate]);

  useEffect(() => {
    if (!highlightDate) return;
    if (sortField !== "date") {
      setSortField("date");
      setSortDir("asc");
    }
  }, [highlightDate]);

  useEffect(() => {
    if (highlightDate && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }, [highlightDate, highlightIndex]);

  return (
    <div className="border border-cyber-grid p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider">
            Trade Log ({filteredAndSorted.length}{filterSymbol ? `/${trades.length}` : ""} trades)
          </h3>
          {filterSymbol && (
            <button
              onClick={() => setFilterSymbol(null)}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono bg-cyber-green/20 text-cyber-green border border-cyber-green/30 hover:bg-cyber-green/30 transition-colors"
            >
              {filterSymbol} <span className="text-[9px] ml-0.5">✕</span>
            </button>
          )}
          {sortField === "pnl" && (
            <span className="text-[10px] font-mono text-yellow-500">sorted by P&L</span>
          )}
        </div>
        {filteredAndSorted.length > 50 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-cyber-muted text-xs font-mono hover:text-cyber-green"
          >
            {expanded ? "Show Recent" : `Show All (${filteredAndSorted.length})`}
          </button>
        )}
      </div>
      <div ref={scrollRef} className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-cyber-bg z-10">
            <tr className="text-cyber-muted border-b border-cyber-grid">
              <th
                className="text-left py-1 px-2 cursor-pointer hover:text-cyber-green select-none"
                onClick={() => toggleSort("date")}
              >
                DATE{sortIndicator("date")}
              </th>
              <th className="text-left py-1 px-2">ACTION</th>
              <th className="text-left py-1 px-2">SYMBOL</th>
              <th className="text-right py-1 px-2">QTY</th>
              <th className="text-right py-1 px-2">PRICE</th>
              <th className="text-right py-1 px-2">TOTAL</th>
              <th
                className="text-right py-1 px-2 cursor-pointer hover:text-cyber-green select-none"
                onClick={() => toggleSort("pnl")}
              >
                P&L{sortIndicator("pnl")}
              </th>
              <th className="text-left py-1 px-2">REASON</th>
            </tr>
          </thead>
          <tbody>
            {displayTrades.map((trade, i) => {
              const isHighlighted = i === highlightIndex;
              return (
                <tr
                  key={i}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={`border-b border-cyber-grid/30 transition-colors ${
                    isHighlighted
                      ? "bg-cyber-green/20 ring-1 ring-cyber-green/40"
                      : "hover:bg-cyber-grid/10"
                  }`}
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
                  <td className="py-1 px-2">
                    <button
                      onClick={() => setFilterSymbol(filterSymbol === trade.symbol ? null : trade.symbol)}
                      className={`hover:text-cyber-green cursor-pointer transition-colors ${
                        filterSymbol === trade.symbol ? "text-cyber-green underline" : "text-cyber-text"
                      }`}
                    >
                      {trade.symbol}
                    </button>
                  </td>
                  <td className="py-1 px-2 text-right text-cyber-text">{trade.quantity}</td>
                  <td className="py-1 px-2 text-right text-cyber-text">
                    ${trade.price.toFixed(2)}
                  </td>
                  <td className="py-1 px-2 text-right text-cyber-text">
                    ${trade.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-1 px-2 text-right">
                    {trade.action === "SELL" && trade.pnl != null ? (
                      <span className={trade.pnl >= 0 ? "text-cyber-green" : "text-red-400"}>
                        {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-[10px] ml-1">
                          ({trade.pnlPct! >= 0 ? "+" : ""}{trade.pnlPct!.toFixed(1)}%)
                        </span>
                      </span>
                    ) : (
                      <span className="text-cyber-muted">—</span>
                    )}
                  </td>
                  <td className="py-1 px-2 text-cyber-muted text-[10px] max-w-[200px] truncate">
                    {trade.reason}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {trades.length === 0 && (
          <p className="text-center text-cyber-muted py-4">No trades executed</p>
        )}
      </div>
    </div>
  );
}
