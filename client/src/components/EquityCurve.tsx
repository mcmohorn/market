import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from "recharts";
import type { SimulationResult } from "../../../shared/types";

interface Props {
  result: SimulationResult;
}

export default function EquityCurve({ result }: Props) {
  const chartData = useMemo(() => {
    return result.timeline.map(snap => ({
      date: snap.date,
      portfolio: Math.round(snap.portfolioValue * 100) / 100,
      cash: Math.round(snap.cash * 100) / 100,
      positions: Math.round(snap.positionsValue * 100) / 100,
      baseline: result.initialCapital,
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

  return (
    <div className="border border-cyber-grid p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider">
          Equity Curve
        </h3>
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
        <ComposedChart data={chartData}>
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
          <Tooltip
            contentStyle={{
              backgroundColor: "#0a0f0a",
              border: "1px solid #1a3a1a",
              fontFamily: "monospace",
              fontSize: 11,
            }}
            labelStyle={{ color: "#00ff41" }}
            formatter={(value: number, name: string) => [
              `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              name.charAt(0).toUpperCase() + name.slice(1),
            ]}
          />
          <ReferenceLine
            y={result.initialCapital}
            stroke="#333"
            strokeDasharray="3 3"
            label={{ value: "Start", fill: "#666", fontSize: 10, fontFamily: "monospace" }}
          />
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
