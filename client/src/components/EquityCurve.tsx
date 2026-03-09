import { useMemo, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from "recharts";
import type { SimulationResult, PortfolioSnapshot } from "../../../shared/types";

interface Props {
  result: SimulationResult;
  onDateClick?: (date: string) => void;
  highlightDate?: string | null;
}

interface ChartPoint {
  date: string;
  portfolio: number;
  cash: number;
  positions: number;
  baseline: number;
  snapshot: PortfolioSnapshot;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  const point: ChartPoint = payload[0]?.payload;
  if (!point) return null;

  const snap = point.snapshot;
  const posEntries = snap.positions ? Object.entries(snap.positions) : [];
  const sortedPositions = posEntries
    .filter(([, p]) => p.quantity > 0)
    .sort((a, b) => b[1].value - a[1].value);

  return (
    <div
      style={{
        backgroundColor: "#0a0f0a",
        border: "1px solid #1a3a1a",
        fontFamily: "monospace",
        fontSize: 11,
        padding: "8px 10px",
        maxWidth: 320,
      }}
    >
      <div style={{ color: "#00ff41", marginBottom: 6, fontWeight: "bold" }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
        <span style={{ color: "#888" }}>Portfolio</span>
        <span style={{ color: point.portfolio >= point.baseline ? "#00ff41" : "#ff4444" }}>
          ${point.portfolio.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
        <span style={{ color: "#888" }}>Cash</span>
        <span style={{ color: "#eab308" }}>
          ${point.cash.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: sortedPositions.length > 0 ? 4 : 0 }}>
        <span style={{ color: "#888" }}>Positions</span>
        <span style={{ color: "#06b6d4" }}>
          ${point.positions.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      {sortedPositions.length > 0 && (
        <div style={{ borderTop: "1px solid #1a3a1a", paddingTop: 4, marginTop: 2 }}>
          <div style={{ color: "#06b6d4", fontSize: 10, marginBottom: 3, textTransform: "uppercase", letterSpacing: 1 }}>
            Holdings ({sortedPositions.length})
          </div>
          {sortedPositions.slice(0, 10).map(([symbol, pos]) => {
            const pnl = pos.pnl;
            const pnlPct = pos.avgCost > 0 ? ((pos.currentPrice - pos.avgCost) / pos.avgCost) * 100 : 0;
            return (
              <div key={symbol} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10, marginBottom: 1 }}>
                <span style={{ color: "#e0e0e0" }}>
                  {symbol} <span style={{ color: "#555" }}>x{pos.quantity}</span>
                </span>
                <span style={{ color: "#888" }}>
                  @${pos.currentPrice.toFixed(2)}
                </span>
                <span style={{ color: pnl >= 0 ? "#00ff41" : "#ff4444" }}>
                  {pnl >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                </span>
              </div>
            );
          })}
          {sortedPositions.length > 10 && (
            <div style={{ color: "#555", fontSize: 9, marginTop: 2 }}>
              +{sortedPositions.length - 10} more...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EquityCurve({ result, onDateClick, highlightDate }: Props) {
  const chartData = useMemo(() => {
    return result.timeline.map(snap => ({
      date: snap.date,
      portfolio: Math.round(snap.portfolioValue * 100) / 100,
      cash: Math.round(snap.cash * 100) / 100,
      positions: Math.round(snap.positionsValue * 100) / 100,
      baseline: result.initialCapital,
      snapshot: snap,
    }));
  }, [result]);

  const yMin = useMemo(() => {
    const min = Math.min(...chartData.map(d => d.portfolio));
    return Math.floor(min * 0.95);
  }, [chartData]);

  const yMax = useMemo(() => {
    const max = Math.max(...chartData.map(d => d.portfolio));
    return Math.ceil(max * 1.05);
  }, [chartData]);

  const isProfit = result.totalReturn >= 0;

  const highlightPoint = useMemo(() => {
    if (!highlightDate) return null;
    let closest: ChartPoint | null = null;
    let closestDist = Infinity;
    for (const pt of chartData) {
      const dist = Math.abs(new Date(pt.date).getTime() - new Date(highlightDate).getTime());
      if (dist < closestDist) {
        closestDist = dist;
        closest = pt;
      }
    }
    return closest;
  }, [highlightDate, chartData]);

  const handleClick = useCallback((state: any) => {
    if (state?.activePayload?.[0]?.payload?.date && onDateClick) {
      onDateClick(state.activePayload[0].payload.date);
    }
  }, [onDateClick]);

  return (
    <div className="border border-cyber-grid p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider">
            Equity Curve
          </h3>
          {onDateClick && (
            <span className="text-cyber-muted text-[10px] font-mono">
              (click chart to jump to trade log)
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1">
            <span className="w-3 h-[2px] bg-cyber-green inline-block"></span>
            <span className="text-cyber-muted">Portfolio</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-[2px] bg-yellow-500 inline-block"></span>
            <span className="text-cyber-muted">Cash</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-[2px] bg-cyan-500 inline-block"></span>
            <span className="text-cyber-muted">Positions</span>
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} onClick={handleClick} style={{ cursor: onDateClick ? "crosshair" : "default" }}>
          <defs>
            <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isProfit ? "#00ff41" : "#ff4444"} stopOpacity={0.3} />
              <stop offset="100%" stopColor={isProfit ? "#00ff41" : "#ff4444"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            stroke="#333"
            tick={{ fill: "#666", fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={d => d.slice(5)}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            stroke="#333"
            domain={[yMin, yMax]}
            tick={{ fill: "#666", fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={v => `$${(v / 1000).toFixed(1)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={result.initialCapital}
            stroke="#333"
            strokeDasharray="3 3"
            label={{ value: "Start", fill: "#666", fontSize: 10, fontFamily: "monospace" }}
          />
          {highlightPoint && (
            <ReferenceLine
              x={highlightPoint.date}
              stroke="#ff6600"
              strokeWidth={2}
              strokeDasharray="4 2"
              label={{
                value: `$${highlightPoint.portfolio.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
                fill: "#ff6600",
                fontSize: 10,
                fontFamily: "monospace",
                position: "top",
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="portfolio"
            fill="url(#portfolioGrad)"
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey="portfolio"
            stroke={isProfit ? "#00ff41" : "#ff4444"}
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="cash"
            stroke="#eab308"
            dot={false}
            strokeWidth={1}
            opacity={0.6}
          />
          <Line
            type="monotone"
            dataKey="positions"
            stroke="#06b6d4"
            dot={false}
            strokeWidth={1}
            opacity={0.6}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
