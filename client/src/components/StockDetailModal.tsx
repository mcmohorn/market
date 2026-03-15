import { useEffect, useState, useMemo, useCallback } from "react";
import { fetchStockDetail } from "../lib/api";
import type { StockDetail, IndicatorData } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, CartesianGrid, Area, Cell,
} from "recharts";

interface Props {
  symbol: string;
  onClose: () => void;
  isPro?: boolean;
  assetType?: string;
}

type SortField = "date" | "price" | "macdHistogram" | "rsi";
type SortDir = "asc" | "desc";

export default function StockDetailModal({ symbol, onClose, isPro, assetType: modalAssetType }: Props) {
  const { firebaseUser } = useAuth();
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [watched, setWatched] = useState(false);
  const [watching, setWatching] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);

  const [activeChart, setActiveChart] = useState<"price" | "macd" | "rsi">("price");

  useEffect(() => {
    setLoading(true);
    fetchStockDetail(symbol)
      .then((d) => {
        setDetail(d);
        if (d.indicators.length > 0) {
          const all = d.indicators;
          const cutoff = Math.max(0, all.length - 90);
          setStartDate(all[cutoff].date);
          setEndDate(all[all.length - 1].date);
        }
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [symbol]);

  const filteredIndicators = useMemo(() => {
    if (!detail) return [];
    return detail.indicators.filter((d) => {
      if (startDate && d.date < startDate) return false;
      if (endDate && d.date > endDate) return false;
      return true;
    });
  }, [detail, startDate, endDate]);

  const sortedForTable = useMemo(() => {
    const arr = [...filteredIndicators];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "price": cmp = a.price - b.price; break;
        case "macdHistogram": cmp = a.macdHistogram - b.macdHistogram; break;
        case "rsi": cmp = a.rsi - b.rsi; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredIndicators, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "desc");
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  const setPresetRange = useCallback(
    (days: number | null) => {
      if (!detail || detail.indicators.length === 0) return;
      const all = detail.indicators;
      const latestDate = all[all.length - 1].date;
      setEndDate(latestDate);
      if (days === null) {
        setStartDate(all[0].date);
      } else {
        const d = new Date(latestDate);
        d.setDate(d.getDate() - days);
        const cutoffStr = d.toISOString().split("T")[0];
        setStartDate(cutoffStr < all[0].date ? all[0].date : cutoffStr);
      }
    },
    [detail]
  );

  const handleChartMouseDown = useCallback((e: any) => {
    if (e?.activeLabel) setDragStart(e.activeLabel);
  }, []);

  const handleChartMouseMove = useCallback(
    (e: any) => {
      if (dragStart && e?.activeLabel) setDragEnd(e.activeLabel);
    },
    [dragStart]
  );

  const handleChartMouseUp = useCallback(() => {
    if (dragStart && dragEnd && dragStart !== dragEnd) {
      const [from, to] = [dragStart, dragEnd].sort();
      setStartDate(from);
      setEndDate(to);
    }
    setDragStart(null);
    setDragEnd(null);
  }, [dragStart, dragEnd]);

  const resetZoom = useCallback(() => {
    if (!detail || detail.indicators.length === 0) return;
    const all = detail.indicators;
    setStartDate(all[0].date);
    setEndDate(all[all.length - 1].date);
  }, [detail]);

  const allDates = useMemo(() => {
    if (!detail) return { min: "", max: "" };
    const all = detail.indicators;
    return { min: all[0]?.date || "", max: all[all.length - 1]?.date || "" };
  }, [detail]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="panel-glow w-full max-w-5xl max-h-[90vh] overflow-y-auto m-4"
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
          <div className="flex items-center gap-2">
            {isPro && (
              <button
                disabled={watching || watched}
                onClick={async () => {
                  if (!firebaseUser) return;
                  setWatching(true);
                  try {
                    const token = await firebaseUser.getIdToken();
                    const assetT = detail?.exchange === "CRYPTO" ? "crypto" : (modalAssetType || "stock");
                    await fetch("/api/watchlist", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ symbol, asset_type: assetT }),
                    });
                    setWatched(true);
                  } catch {}
                  setWatching(false);
                }}
                className={`px-3 py-1 text-xs font-mono uppercase tracking-wider border transition-all ${
                  watched
                    ? "border-cyber-green/30 text-cyber-green/50 cursor-default"
                    : "border-cyber-green/40 text-cyber-green hover:bg-cyber-green/10"
                }`}
              >
                {watched ? "✓ Watching" : watching ? "..." : "+ Watch"}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-cyber-muted hover:text-cyber-red text-lg font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-cyber-red/10 transition-all"
            >
              X
            </button>
          </div>
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

            <div className="border border-cyber-grid p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-[10px] text-cyber-green uppercase tracking-widest">Date Range</div>
                <input
                  type="date"
                  value={startDate}
                  min={allDates.min}
                  max={endDate || allDates.max}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-cyber-bg border border-cyber-border text-cyber-text text-xs font-mono px-2 py-1 rounded"
                />
                <span className="text-cyber-muted text-xs">to</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || allDates.min}
                  max={allDates.max}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-cyber-bg border border-cyber-border text-cyber-text text-xs font-mono px-2 py-1 rounded"
                />
                <div className="flex gap-1 ml-auto">
                  {[
                    { label: "30D", days: 30 },
                    { label: "90D", days: 90 },
                    { label: "6M", days: 180 },
                    { label: "1Y", days: 365 },
                    { label: "ALL", days: null },
                  ].map(({ label, days }) => (
                    <button
                      key={label}
                      onClick={() => setPresetRange(days)}
                      className="px-2 py-0.5 text-[10px] font-mono uppercase border border-cyber-green/30 text-cyber-green hover:bg-cyber-green/10 transition-all"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={resetZoom}
                    className="px-2 py-0.5 text-[10px] font-mono uppercase border border-cyber-yellow/30 text-cyber-yellow hover:bg-cyber-yellow/10 transition-all ml-1"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-cyber-muted font-mono">
                Showing {filteredIndicators.length} of {detail.indicators.length} data points
                {dragStart ? " — drag to zoom" : " — click & drag on chart to zoom"}
              </div>
            </div>

            <div className="flex gap-2 mb-1">
              {(["price", "macd", "rsi"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveChart(tab)}
                  className={`px-3 py-1 text-[11px] font-mono uppercase tracking-wider border transition-all ${
                    activeChart === tab
                      ? "border-cyber-green text-cyber-green bg-cyber-green/10"
                      : "border-cyber-grid text-cyber-muted hover:text-cyber-green hover:border-cyber-green/40"
                  }`}
                >
                  {tab === "price" ? "Price" : tab === "macd" ? "MACD" : "RSI"}
                </button>
              ))}
            </div>

            {activeChart === "price" && (
              <InteractivePriceChart
                data={filteredIndicators}
                dragStart={dragStart}
                dragEnd={dragEnd}
                onMouseDown={handleChartMouseDown}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
              />
            )}
            {activeChart === "macd" && (
              <InteractiveMACDChart
                data={filteredIndicators}
                dragStart={dragStart}
                dragEnd={dragEnd}
                onMouseDown={handleChartMouseDown}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
              />
            )}
            {activeChart === "rsi" && (
              <InteractiveRSIChart
                data={filteredIndicators}
                dragStart={dragStart}
                dragEnd={dragEnd}
                onMouseDown={handleChartMouseDown}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
              />
            )}

            <IndicatorTable
              data={sortedForTable}
              sortField={sortField}
              sortDir={sortDir}
              toggleSort={toggleSort}
              sortIndicator={sortIndicator}
            />
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
      <MetricCard label="CHANGE" value={`${isPositive ? "+" : ""}${summary.changePercent.toFixed(2)}%`} color={isPositive ? "green" : "red"} />
      <MetricCard label="SIGNAL" value={summary.signal} color={summary.signal === "BUY" ? "green" : summary.signal === "SELL" ? "red" : "yellow"} />
      <MetricCard label="RSI" value={summary.rsi.toFixed(1)} color={summary.rsi > 70 ? "red" : summary.rsi < 30 ? "green" : "yellow"} />
      <MetricCard label="MACD" value={summary.macdHistogram.toFixed(4)} color={summary.macdHistogram >= 0 ? "green" : "red"} />
      <MetricCard label="STRENGTH" value={summary.signalStrength.toFixed(2)} />
      <MetricCard label="SIGNAL CHANGES" value={String(summary.signalChanges)} />
      <MetricCard label="DATA POINTS" value={String(summary.dataPoints)} />
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass = color === "green" ? "text-cyber-green" : color === "red" ? "text-cyber-red" : color === "yellow" ? "text-cyber-yellow" : "text-cyber-text";
  return (
    <div className="bg-cyber-bg border border-cyber-border rounded p-3">
      <div className="text-[10px] text-cyber-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}

interface ChartProps {
  data: IndicatorData[];
  dragStart: string | null;
  dragEnd: string | null;
  onMouseDown: (e: any) => void;
  onMouseMove: (e: any) => void;
  onMouseUp: () => void;
}

function InteractivePriceChart({ data, dragStart, dragEnd, onMouseDown, onMouseMove, onMouseUp }: ChartProps) {
  if (data.length === 0) return null;
  const prices = data.map((d) => d.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const pad = (maxP - minP) * 0.05 || 1;

  return (
    <div className="border border-cyber-grid p-2">
      <div className="text-[10px] text-cyber-green uppercase tracking-widest mb-1">Price History</div>
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart
          data={data}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          style={{ cursor: "crosshair", userSelect: "none" }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
          <XAxis
            dataKey="date"
            stroke="#333"
            tick={{ fill: "#666", fontSize: 9, fontFamily: "monospace" }}
            tickFormatter={(d) => d.slice(5)}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis
            stroke="#333"
            domain={[minP - pad, maxP + pad]}
            tick={{ fill: "#666", fontSize: 9, fontFamily: "monospace" }}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#0a0f0a", border: "1px solid #1a3a1a", fontFamily: "monospace", fontSize: 11 }}
            labelStyle={{ color: "#00ff41" }}
            formatter={(v: number) => [`$${v.toFixed(2)}`, "Price"]}
          />
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00aaff" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#00aaff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="price" fill="url(#priceGrad)" stroke="none" />
          <Line type="monotone" dataKey="price" stroke="#00aaff" dot={false} strokeWidth={1.5} />
          {dragStart && dragEnd && (
            <ReferenceArea x1={dragStart} x2={dragEnd} strokeOpacity={0.3} fill="#00ff41" fillOpacity={0.15} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function InteractiveMACDChart({ data, dragStart, dragEnd, onMouseDown, onMouseMove, onMouseUp }: ChartProps) {
  if (data.length === 0) return null;
  return (
    <div className="border border-cyber-grid p-2">
      <div className="text-[10px] text-cyber-green uppercase tracking-widest mb-1">MACD Histogram</div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart
          data={data}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          style={{ cursor: "crosshair", userSelect: "none" }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
          <XAxis
            dataKey="date"
            stroke="#333"
            tick={{ fill: "#666", fontSize: 9, fontFamily: "monospace" }}
            tickFormatter={(d) => d.slice(5)}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis stroke="#333" tick={{ fill: "#666", fontSize: 9, fontFamily: "monospace" }} />
          <Tooltip
            contentStyle={{ backgroundColor: "#0a0f0a", border: "1px solid #1a3a1a", fontFamily: "monospace", fontSize: 11 }}
            labelStyle={{ color: "#00ff41" }}
          />
          <ReferenceLine y={0} stroke="#333" />
          <Bar dataKey="macdHistogram" name="Histogram">
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.macdHistogram >= 0 ? "#00ff88" : "#ff3366"} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="macdFast" stroke="#00aaff" dot={false} strokeWidth={1} name="MACD" />
          <Line type="monotone" dataKey="macdSlow" stroke="#ff6600" dot={false} strokeWidth={1} name="Signal" />
          {dragStart && dragEnd && (
            <ReferenceArea x1={dragStart} x2={dragEnd} strokeOpacity={0.3} fill="#00ff41" fillOpacity={0.15} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function InteractiveRSIChart({ data, dragStart, dragEnd, onMouseDown, onMouseMove, onMouseUp }: ChartProps) {
  if (data.length === 0) return null;
  return (
    <div className="border border-cyber-grid p-2">
      <div className="text-[10px] text-cyber-green uppercase tracking-widest mb-1">RSI</div>
      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart
          data={data}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          style={{ cursor: "crosshair", userSelect: "none" }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
          <XAxis
            dataKey="date"
            stroke="#333"
            tick={{ fill: "#666", fontSize: 9, fontFamily: "monospace" }}
            tickFormatter={(d) => d.slice(5)}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis stroke="#333" domain={[0, 100]} tick={{ fill: "#666", fontSize: 9, fontFamily: "monospace" }} />
          <Tooltip
            contentStyle={{ backgroundColor: "#0a0f0a", border: "1px solid #1a3a1a", fontFamily: "monospace", fontSize: 11 }}
            labelStyle={{ color: "#00ff41" }}
            formatter={(v: number) => [v.toFixed(1), "RSI"]}
          />
          <ReferenceLine y={70} stroke="#ff4444" strokeDasharray="3 3" label={{ value: "70", fill: "#ff4444", fontSize: 9 }} />
          <ReferenceLine y={30} stroke="#00ff41" strokeDasharray="3 3" label={{ value: "30", fill: "#00ff41", fontSize: 9 }} />
          <Line type="monotone" dataKey="rsi" stroke="#ffcc00" dot={false} strokeWidth={1.5} />
          {dragStart && dragEnd && (
            <ReferenceArea x1={dragStart} x2={dragEnd} strokeOpacity={0.3} fill="#00ff41" fillOpacity={0.15} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function IndicatorTable({
  data,
  sortField,
  sortDir,
  toggleSort,
  sortIndicator,
}: {
  data: IndicatorData[];
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (f: SortField) => void;
  sortIndicator: (f: SortField) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const display = expanded ? data : data.slice(0, 50);

  return (
    <div className="border border-cyber-grid p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-cyber-green uppercase tracking-widest">
          Indicator Data ({data.length} rows)
        </div>
        {data.length > 50 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-cyber-muted text-xs font-mono hover:text-cyber-green"
          >
            {expanded ? "Show Less" : `Show All (${data.length})`}
          </button>
        )}
      </div>
      <div className="bg-cyber-bg border border-cyber-border rounded overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-cyber-bg z-10">
            <tr className="text-cyber-green border-b border-cyber-border">
              <th className="px-3 py-2 text-left cursor-pointer hover:text-cyber-yellow select-none" onClick={() => toggleSort("date")}>
                DATE{sortIndicator("date")}
              </th>
              <th className="px-3 py-2 text-right cursor-pointer hover:text-cyber-yellow select-none" onClick={() => toggleSort("price")}>
                PRICE{sortIndicator("price")}
              </th>
              <th className="px-3 py-2 text-right">MACD</th>
              <th className="px-3 py-2 text-right">SIGNAL</th>
              <th className="px-3 py-2 text-right cursor-pointer hover:text-cyber-yellow select-none" onClick={() => toggleSort("macdHistogram")}>
                HIST{sortIndicator("macdHistogram")}
              </th>
              <th className="px-3 py-2 text-right cursor-pointer hover:text-cyber-yellow select-none" onClick={() => toggleSort("rsi")}>
                RSI{sortIndicator("rsi")}
              </th>
              <th className="px-3 py-2 text-center">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {display.map((row, i) => (
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
                <td className={`px-3 py-1.5 text-right ${row.rsi > 70 ? "text-cyber-red" : row.rsi < 30 ? "text-cyber-green" : "text-cyber-yellow"}`}>
                  {row.rsi.toFixed(1)}
                </td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${row.buySignal ? "bg-cyber-green/20 text-cyber-green" : "bg-cyber-red/20 text-cyber-red"}`}>
                    {row.buySignal ? "BUY" : "SELL"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <p className="text-center text-cyber-muted py-4 text-xs">No data in selected range</p>}
      </div>
    </div>
  );
}
