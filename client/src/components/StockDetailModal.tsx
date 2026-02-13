import { useEffect, useState } from "react";
import { fetchStockDetail } from "../lib/api";
import type { StockDetail, IndicatorData } from "../lib/types";

interface Props {
  symbol: string;
  onClose: () => void;
}

export default function StockDetailModal({ symbol, onClose }: Props) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchStockDetail(symbol)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [symbol]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="panel-glow w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-cyber-panel border-b border-cyber-border p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <span className="text-xl font-bold text-cyber-green glow-green">{symbol}</span>
            {detail && (
              <>
                <span className="text-sm text-cyber-muted">{detail.name}</span>
                <span className="text-xs text-cyber-muted bg-cyber-bg px-2 py-0.5 rounded">{detail.exchange}</span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-cyber-muted hover:text-cyber-red text-lg font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-cyber-red/10 transition-all"
          >
            X
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-cyber-muted">
            <div className="animate-pulse text-cyber-green">Loading analysis...</div>
          </div>
        ) : !detail ? (
          <div className="p-12 text-center text-cyber-muted">No data available for {symbol}</div>
        ) : (
          <div className="p-4 space-y-4">
            <SummarySection summary={detail.summary} />
            <PriceChart indicators={detail.indicators} />
            <MACDChart indicators={detail.indicators} />
            <RSIChart indicators={detail.indicators} />
            <IndicatorTable indicators={detail.indicators} />
          </div>
        )}
      </div>
    </div>
  );
}

function SummarySection({ summary }: { summary: StockDetail["summary"] }) {
  const isPositive = summary.changePercent >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetricCard label="PRICE" value={`$${summary.price.toFixed(2)}`} />
      <MetricCard
        label="CHANGE"
        value={`${isPositive ? "+" : ""}${summary.changePercent.toFixed(2)}%`}
        color={isPositive ? "green" : "red"}
      />
      <MetricCard
        label="SIGNAL"
        value={summary.signal}
        color={summary.signal === "BUY" ? "green" : summary.signal === "SELL" ? "red" : "yellow"}
      />
      <MetricCard
        label="RSI"
        value={summary.rsi.toFixed(1)}
        color={summary.rsi > 70 ? "red" : summary.rsi < 30 ? "green" : "yellow"}
      />
      <MetricCard label="MACD" value={summary.macdHistogram.toFixed(4)} color={summary.macdHistogram >= 0 ? "green" : "red"} />
      <MetricCard label="STRENGTH" value={summary.signalStrength.toFixed(2)} />
      <MetricCard label="SIGNAL CHANGES" value={String(summary.signalChanges)} />
      <MetricCard label="DATA POINTS" value={String(summary.dataPoints)} />
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass =
    color === "green"
      ? "text-cyber-green"
      : color === "red"
      ? "text-cyber-red"
      : color === "yellow"
      ? "text-cyber-yellow"
      : "text-cyber-text";

  return (
    <div className="bg-cyber-bg border border-cyber-border rounded p-3">
      <div className="text-[10px] text-cyber-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}

function MiniChart({
  data,
  height = 120,
  color = "#00ff88",
  negColor,
  label,
  isHistogram = false,
}: {
  data: { x: number; y: number }[];
  height?: number;
  color?: string;
  negColor?: string;
  label: string;
  isHistogram?: boolean;
}) {
  if (data.length === 0) return null;

  const yValues = data.map((d) => d.y);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const range = maxY - minY || 1;
  const w = 700;

  const toX = (i: number) => (i / (data.length - 1)) * w;
  const toY = (v: number) => height - ((v - minY) / range) * (height - 10) - 5;

  if (isHistogram) {
    const zeroY = toY(Math.max(0, minY));
    const barW = w / data.length;

    return (
      <div>
        <div className="text-[10px] text-cyber-green uppercase tracking-widest mb-1">{label}</div>
        <div className="bg-cyber-bg border border-cyber-border rounded p-2 overflow-x-auto">
          <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ minWidth: 400 }}>
            {data.map((d, i) => {
              const y = toY(d.y);
              const barHeight = Math.abs(y - zeroY);
              const barColor = d.y >= 0 ? color : negColor || "#ff3366";
              return (
                <rect
                  key={i}
                  x={toX(i) - barW / 2}
                  y={Math.min(y, zeroY)}
                  width={Math.max(barW - 1, 1)}
                  height={Math.max(barHeight, 0.5)}
                  fill={barColor}
                  opacity={0.8}
                />
              );
            })}
            <line x1={0} y1={zeroY} x2={w} y2={zeroY} stroke="#333344" strokeWidth={0.5} />
          </svg>
        </div>
      </div>
    );
  }

  const pathD = data.map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(d.y)}`).join(" ");

  return (
    <div>
      <div className="text-[10px] text-cyber-green uppercase tracking-widest mb-1">{label}</div>
      <div className="bg-cyber-bg border border-cyber-border rounded p-2 overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ minWidth: 400 }}>
          <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} />
        </svg>
      </div>
    </div>
  );
}

function PriceChart({ indicators }: { indicators: IndicatorData[] }) {
  const data = indicators.map((d, i) => ({ x: i, y: d.price }));
  return <MiniChart data={data} label="PRICE HISTORY (90D)" color="#00aaff" height={150} />;
}

function MACDChart({ indicators }: { indicators: IndicatorData[] }) {
  const data = indicators.map((d, i) => ({ x: i, y: d.macdHistogram }));
  return <MiniChart data={data} label="MACD HISTOGRAM" isHistogram color="#00ff88" negColor="#ff3366" height={100} />;
}

function RSIChart({ indicators }: { indicators: IndicatorData[] }) {
  const data = indicators.map((d, i) => ({ x: i, y: d.rsi }));
  return <MiniChart data={data} label="RSI" color="#ffcc00" height={80} />;
}

function IndicatorTable({ indicators }: { indicators: IndicatorData[] }) {
  const recent = indicators.slice(-20).reverse();

  return (
    <div>
      <div className="text-[10px] text-cyber-green uppercase tracking-widest mb-1">RECENT INDICATOR DATA</div>
      <div className="bg-cyber-bg border border-cyber-border rounded overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-cyber-green border-b border-cyber-border">
              <th className="px-3 py-2 text-left">DATE</th>
              <th className="px-3 py-2 text-right">PRICE</th>
              <th className="px-3 py-2 text-right">MACD</th>
              <th className="px-3 py-2 text-right">SIGNAL</th>
              <th className="px-3 py-2 text-right">HIST</th>
              <th className="px-3 py-2 text-right">RSI</th>
              <th className="px-3 py-2 text-center">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((row, i) => (
              <tr key={i} className="border-b border-cyber-border/30 hover:bg-cyber-panel/50">
                <td className="px-3 py-1.5 text-cyber-muted">{row.date}</td>
                <td className="px-3 py-1.5 text-right">${row.price.toFixed(2)}</td>
                <td className={`px-3 py-1.5 text-right ${row.macdFast >= 0 ? "text-cyber-green" : "text-cyber-red"}`}>
                  {row.macdFast.toFixed(4)}
                </td>
                <td className="px-3 py-1.5 text-right text-cyber-muted">{row.macdSlow.toFixed(4)}</td>
                <td className={`px-3 py-1.5 text-right ${row.macdHistogram >= 0 ? "text-cyber-green" : "text-cyber-red"}`}>
                  {row.macdHistogram.toFixed(4)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right ${
                    row.rsi > 70 ? "text-cyber-red" : row.rsi < 30 ? "text-cyber-green" : "text-cyber-yellow"
                  }`}
                >
                  {row.rsi.toFixed(1)}
                </td>
                <td className="px-3 py-1.5 text-center">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      row.buySignal ? "bg-cyber-green/20 text-cyber-green" : "bg-cyber-red/20 text-cyber-red"
                    }`}
                  >
                    {row.buySignal ? "BUY" : "SELL"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
