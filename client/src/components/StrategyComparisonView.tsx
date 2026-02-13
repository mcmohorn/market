import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { StrategyComparison } from "../../../shared/types";

interface Props {
  data: StrategyComparison;
}

const COLORS = ["#00ff41", "#06b6d4", "#eab308", "#f97316", "#a855f7"];

export default function StrategyComparisonView({ data }: Props) {
  const chartData = data.strategies[0]?.results.map((_, periodIdx) => {
    const entry: any = {
      period: data.strategies[0].results[periodIdx].period,
    };
    data.strategies.forEach((strat, i) => {
      entry[strat.name] = Math.round((strat.results[periodIdx]?.avgAnnualized || 0) * 100) / 100;
    });
    return entry;
  }) || [];

  return (
    <div className="space-y-4">
      <div className="border border-cyber-grid p-3">
        <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider mb-3">
          Annualized Return by Strategy & Period
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <XAxis
              dataKey="period"
              stroke="#333"
              tick={{ fill: "#666", fontSize: 11, fontFamily: "monospace" }}
            />
            <YAxis
              stroke="#333"
              tick={{ fill: "#666", fontSize: 11, fontFamily: "monospace" }}
              tickFormatter={v => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0a0f0a",
                border: "1px solid #1a3a1a",
                fontFamily: "monospace",
                fontSize: 11,
              }}
              formatter={(value: number) => [`${value}%`, ""]}
            />
            <Legend
              wrapperStyle={{ fontFamily: "monospace", fontSize: 11 }}
            />
            {data.strategies.map((strat, i) => (
              <Bar
                key={strat.name}
                dataKey={strat.name}
                fill={COLORS[i % COLORS.length]}
                opacity={0.8}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {data.strategies.map((strat, i) => (
          <div key={strat.name} className="border border-cyber-grid p-3">
            <h4 className="font-mono text-sm uppercase tracking-wider mb-2" style={{ color: COLORS[i] }}>
              {strat.name}
            </h4>
            <div className="space-y-2">
              {strat.results.map(r => (
                <div key={r.period} className="border-b border-cyber-grid/30 pb-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-cyber-muted">{r.period} Period</span>
                    <span className="text-cyber-text">{r.sampleCount} samples</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] font-mono mt-1">
                    <div className="flex justify-between">
                      <span className="text-cyber-muted">Avg Return</span>
                      <span className={r.avgReturnPct >= 0 ? "text-cyber-green" : "text-red-400"}>
                        {r.avgReturnPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cyber-muted">Annualized</span>
                      <span className={r.avgAnnualized >= 0 ? "text-cyber-green" : "text-red-400"}>
                        {r.avgAnnualized.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cyber-muted">Win Rate</span>
                      <span className={r.winRate > 50 ? "text-cyber-green" : "text-yellow-400"}>
                        {r.winRate.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cyber-muted">Max DD</span>
                      <span className="text-red-400">-{r.maxDrawdownPct.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cyber-muted">Sharpe</span>
                      <span className="text-cyber-text">{r.sharpeRatio.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
