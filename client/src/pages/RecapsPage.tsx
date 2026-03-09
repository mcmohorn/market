import { useState, useEffect, useCallback } from "react";
import { fetchRecap, fetchAlgorithmVersions, generatePredictions } from "../lib/api";

type RecapType = "daily" | "weekly" | "monthly";

interface Prediction {
  symbol: string;
  asset_type: string;
  predicted_signal: string;
  predicted_date: string;
  predicted_price: number;
  actual_signal: string | null;
  actual_price: number | null;
  correct: boolean | null;
}

interface Mover {
  symbol: string;
  name: string;
  asset_type: string;
  price: number;
  change_percent: number;
  signal: string;
}

interface SignalChange {
  symbol: string;
  name: string;
  asset_type: string;
  signal: string;
  last_signal_change: string;
  change_percent: number;
}

interface AlgoVersion {
  version_num: number;
  params: any;
  accuracy_pct: number | null;
  total_predictions: number | null;
  correct_predictions: number | null;
  notes: string;
  created_at: string;
}

interface RecapData {
  type: string;
  period: string;
  topMovers: Mover[];
  signalChanges: SignalChange[];
  predictionAccuracy: {
    total: number;
    correct: number;
    wrong: number;
    pending: number;
    accuracyPct: number;
  };
  recentPredictions: Prediction[];
  algorithmVersions: AlgoVersion[];
}

export default function RecapsPage() {
  const [recapType, setRecapType] = useState<RecapType>("daily");
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [versions, setVersions] = useState<AlgoVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recapData, versionsData] = await Promise.all([
        fetchRecap(recapType),
        fetchAlgorithmVersions(),
      ]);
      setRecap(recapData);
      setVersions(versionsData);
    } catch (err: any) {
      setError(err.message || "Failed to load recap data");
    } finally {
      setLoading(false);
    }
  }, [recapType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const signalColor = (signal: string) => {
    if (signal === "BUY") return "text-cyber-green";
    if (signal === "SELL") return "text-cyber-red";
    return "text-cyber-yellow";
  };

  const signalBg = (signal: string) => {
    if (signal === "BUY") return "bg-cyber-green/10 border-cyber-green/30";
    if (signal === "SELL") return "bg-cyber-red/10 border-cyber-red/30";
    return "bg-cyber-yellow/10 border-cyber-yellow/30";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-mono text-cyber-green tracking-wider uppercase">
            Recaps & Predictions
          </h2>
          <p className="text-xs text-cyber-muted mt-1">
            Performance tracking, prediction accuracy, and algorithm versioning
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              setGenerating(true);
              try {
                await generatePredictions();
                await loadData();
              } catch {}
              setGenerating(false);
            }}
            disabled={generating}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider border border-cyber-green/40 text-cyber-green hover:bg-cyber-green/10 rounded transition-all disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate Predictions"}
          </button>
          <div className="flex items-center gap-1 bg-cyber-bg rounded border border-cyber-border overflow-hidden">
            {(["daily", "weekly", "monthly"] as RecapType[]).map((t) => (
              <button
                key={t}
                onClick={() => setRecapType(t)}
                className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-all ${
                  recapType === t
                    ? "bg-cyber-green/20 text-cyber-green"
                    : "text-cyber-muted hover:text-cyber-green/70"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-cyber-green animate-pulse font-mono text-sm">
            LOADING RECAP DATA...
          </div>
        </div>
      )}

      {error && (
        <div className="border border-cyber-red/30 bg-cyber-red/10 rounded p-4 text-cyber-red text-sm font-mono">
          {error}
        </div>
      )}

      {!loading && !error && recap && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-cyber-panel border border-cyber-border rounded p-4">
              <div className="text-xs text-cyber-muted uppercase tracking-wider mb-1">Period</div>
              <div className="text-lg font-mono text-cyber-green">{recap.period}</div>
            </div>
            <div className="bg-cyber-panel border border-cyber-border rounded p-4">
              <div className="text-xs text-cyber-muted uppercase tracking-wider mb-1">Predictions</div>
              <div className="text-lg font-mono text-cyber-text">{recap.predictionAccuracy.total}</div>
            </div>
            <div className="bg-cyber-panel border border-cyber-border rounded p-4">
              <div className="text-xs text-cyber-muted uppercase tracking-wider mb-1">Accuracy</div>
              <div className={`text-lg font-mono ${recap.predictionAccuracy.accuracyPct >= 50 ? "text-cyber-green" : "text-cyber-red"}`}>
                {recap.predictionAccuracy.accuracyPct.toFixed(1)}%
              </div>
            </div>
            <div className="bg-cyber-panel border border-cyber-border rounded p-4">
              <div className="text-xs text-cyber-muted uppercase tracking-wider mb-1">Correct / Wrong / Pending</div>
              <div className="text-lg font-mono">
                <span className="text-cyber-green">{recap.predictionAccuracy.correct}</span>
                <span className="text-cyber-muted"> / </span>
                <span className="text-cyber-red">{recap.predictionAccuracy.wrong}</span>
                <span className="text-cyber-muted"> / </span>
                <span className="text-cyber-yellow">{recap.predictionAccuracy.pending}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-cyber-panel border border-cyber-border rounded">
              <div className="px-4 py-3 border-b border-cyber-border">
                <h3 className="text-sm font-mono text-cyber-green uppercase tracking-wider">
                  Top Movers
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-cyber-muted border-b border-cyber-border">
                      <th className="text-left px-4 py-2">Symbol</th>
                      <th className="text-left px-4 py-2">Name</th>
                      <th className="text-right px-4 py-2">Price</th>
                      <th className="text-right px-4 py-2">Change %</th>
                      <th className="text-center px-4 py-2">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recap.topMovers.slice(0, 10).map((m) => (
                      <tr key={m.symbol} className="border-b border-cyber-border/30 hover:bg-cyber-green/5">
                        <td className="px-4 py-2 text-cyber-blue">{m.symbol}</td>
                        <td className="px-4 py-2 text-cyber-text truncate max-w-[120px]">{m.name}</td>
                        <td className="px-4 py-2 text-right text-cyber-text">${Number(m.price).toFixed(2)}</td>
                        <td className={`px-4 py-2 text-right ${Number(m.change_percent) >= 0 ? "text-cyber-green" : "text-cyber-red"}`}>
                          {Number(m.change_percent) >= 0 ? "+" : ""}{Number(m.change_percent).toFixed(2)}%
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] border ${signalBg(m.signal)} ${signalColor(m.signal)}`}>
                            {m.signal}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {recap.topMovers.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-cyber-muted">No movers data</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-cyber-panel border border-cyber-border rounded">
              <div className="px-4 py-3 border-b border-cyber-border">
                <h3 className="text-sm font-mono text-cyber-green uppercase tracking-wider">
                  Recent Signal Changes
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-cyber-muted border-b border-cyber-border">
                      <th className="text-left px-4 py-2">Symbol</th>
                      <th className="text-left px-4 py-2">Name</th>
                      <th className="text-center px-4 py-2">Signal</th>
                      <th className="text-right px-4 py-2">Change %</th>
                      <th className="text-right px-4 py-2">Changed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recap.signalChanges.slice(0, 10).map((s) => (
                      <tr key={s.symbol} className="border-b border-cyber-border/30 hover:bg-cyber-green/5">
                        <td className="px-4 py-2 text-cyber-blue">{s.symbol}</td>
                        <td className="px-4 py-2 text-cyber-text truncate max-w-[120px]">{s.name}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] border ${signalBg(s.signal)} ${signalColor(s.signal)}`}>
                            {s.signal}
                          </span>
                        </td>
                        <td className={`px-4 py-2 text-right ${Number(s.change_percent) >= 0 ? "text-cyber-green" : "text-cyber-red"}`}>
                          {Number(s.change_percent) >= 0 ? "+" : ""}{Number(s.change_percent).toFixed(2)}%
                        </td>
                        <td className="px-4 py-2 text-right text-cyber-muted">{s.last_signal_change}</td>
                      </tr>
                    ))}
                    {recap.signalChanges.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-cyber-muted">No signal changes</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-cyber-panel border border-cyber-border rounded">
            <div className="px-4 py-3 border-b border-cyber-border">
              <h3 className="text-sm font-mono text-cyber-green uppercase tracking-wider">
                Prediction Results
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-cyber-muted border-b border-cyber-border">
                    <th className="text-left px-4 py-2">Date</th>
                    <th className="text-left px-4 py-2">Symbol</th>
                    <th className="text-center px-4 py-2">Predicted</th>
                    <th className="text-right px-4 py-2">Pred. Price</th>
                    <th className="text-center px-4 py-2">Actual</th>
                    <th className="text-right px-4 py-2">Act. Price</th>
                    <th className="text-center px-4 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {recap.recentPredictions.map((p, i) => (
                    <tr key={`${p.symbol}-${p.predicted_date}-${i}`} className="border-b border-cyber-border/30 hover:bg-cyber-green/5">
                      <td className="px-4 py-2 text-cyber-muted">{p.predicted_date}</td>
                      <td className="px-4 py-2 text-cyber-blue">{p.symbol}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] border ${signalBg(p.predicted_signal)} ${signalColor(p.predicted_signal)}`}>
                          {p.predicted_signal}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-cyber-text">
                        ${p.predicted_price ? Number(p.predicted_price).toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {p.actual_signal ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] border ${signalBg(p.actual_signal)} ${signalColor(p.actual_signal)}`}>
                            {p.actual_signal}
                          </span>
                        ) : (
                          <span className="text-cyber-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-cyber-text">
                        {p.actual_price ? `$${Number(p.actual_price).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {p.correct === true && (
                          <span className="text-cyber-green font-bold">CORRECT</span>
                        )}
                        {p.correct === false && (
                          <span className="text-cyber-red font-bold">WRONG</span>
                        )}
                        {p.correct === null && (
                          <span className="text-cyber-yellow">PENDING</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {recap.recentPredictions.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-cyber-muted">No predictions yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-cyber-panel border border-cyber-border rounded">
            <div className="px-4 py-3 border-b border-cyber-border">
              <h3 className="text-sm font-mono text-cyber-green uppercase tracking-wider">
                Algorithm Version History
              </h3>
            </div>
            {versions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-cyber-muted border-b border-cyber-border">
                      <th className="text-left px-4 py-2">Version</th>
                      <th className="text-right px-4 py-2">Accuracy</th>
                      <th className="text-right px-4 py-2">Total</th>
                      <th className="text-right px-4 py-2">Correct</th>
                      <th className="text-left px-4 py-2">Notes</th>
                      <th className="text-right px-4 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.version_num} className="border-b border-cyber-border/30 hover:bg-cyber-green/5">
                        <td className="px-4 py-2 text-cyber-blue">v{v.version_num}</td>
                        <td className={`px-4 py-2 text-right ${
                          v.accuracy_pct !== null
                            ? v.accuracy_pct >= 50 ? "text-cyber-green" : "text-cyber-red"
                            : "text-cyber-muted"
                        }`}>
                          {v.accuracy_pct !== null ? `${Number(v.accuracy_pct).toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-cyber-text">{v.total_predictions ?? 0}</td>
                        <td className="px-4 py-2 text-right text-cyber-green">{v.correct_predictions ?? 0}</td>
                        <td className="px-4 py-2 text-cyber-muted truncate max-w-[200px]">{v.notes || "—"}</td>
                        <td className="px-4 py-2 text-right text-cyber-muted">
                          {v.created_at ? new Date(v.created_at).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-cyber-muted text-sm">
                No algorithm versions tracked yet
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}