import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { runSimulation } from "../lib/api";
import type { StrategyParams } from "../../../shared/types";
import { DEFAULT_STRATEGY } from "../../../shared/types";
import SimulationSummary from "../components/SimulationSummary";

interface SavedSim {
  id: number;
  name: string;
  asset_type: string;
  params: StrategyParams;
  result_summary: Record<string, any>;
  start_date: string;
  end_date: string;
  created_at: string;
}

const DEFAULT_PRESETS: { name: string; params: Partial<StrategyParams>; label: string }[] = [
  {
    name: "Conservative",
    label: "Low-risk, tight stop-loss",
    params: { rsiOverbought: 65, rsiOversold: 35, stopLossPct: 5, takeProfitPct: 10, maxPositionPct: 15 },
  },
  {
    name: "Default",
    label: "Balanced MACD+RSI strategy",
    params: {},
  },
  {
    name: "Aggressive",
    label: "High conviction, larger positions",
    params: { rsiOverbought: 80, rsiOversold: 20, stopLossPct: 15, takeProfitPct: 30, maxPositionPct: 40, minBuySignal: 2 },
  },
];

export default function HistoryPage({ assetType }: { assetType: string }) {
  const { user, firebaseUser } = useAuth();
  const [savedSims, setSavedSims] = useState<SavedSim[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningPreset, setRunningPreset] = useState<string | null>(null);
  const [presetResult, setPresetResult] = useState<{ name: string; result: any } | null>(null);

  const getToken = useCallback(async () => {
    if (!firebaseUser) return null;
    return firebaseUser.getIdToken();
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch("/api/simulations", { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setSavedSims(data);
      } catch {}
    })();
  }, [firebaseUser, getToken]);

  async function runPreset(preset: typeof DEFAULT_PRESETS[0]) {
    setRunningPreset(preset.name);
    setPresetResult(null);
    try {
      const joinDate = user?.created_at ? new Date(user.created_at).toISOString().split("T")[0] : "2024-01-01";
      const today = new Date().toISOString().split("T")[0];
      const params: StrategyParams = { ...DEFAULT_STRATEGY, ...preset.params };
      const result = await runSimulation({
        startDate: joinDate,
        endDate: today,
        initialCapital: 10000,
        params,
        assetType,
      });
      setPresetResult({ name: preset.name, result });
    } catch (e: any) {
      console.error(e);
    } finally {
      setRunningPreset(null);
    }
  }

  async function deleteSim(id: number) {
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/simulations/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setSavedSims(prev => prev.filter(s => s.id !== id));
    } catch {}
  }

  const joinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-cyber-green font-mono text-lg uppercase tracking-widest">Your History</h2>
      </div>

      {joinDate && (
        <div className="border border-cyber-green/20 bg-cyber-green/5 p-4 font-mono text-sm">
          <span className="text-cyber-muted">Member since: </span>
          <span className="text-cyber-green">{joinDate}</span>
          <span className="text-cyber-muted ml-3">— see what you could have made with these strategies since then:</span>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-cyber-muted font-mono text-xs uppercase tracking-widest">Default Strategy Previews</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DEFAULT_PRESETS.map(preset => (
            <div key={preset.name} className="border border-cyber-grid p-4 space-y-3">
              <div>
                <div className="text-cyber-green font-mono text-sm font-bold">{preset.name}</div>
                <div className="text-cyber-muted font-mono text-[11px]">{preset.label}</div>
              </div>
              <button
                onClick={() => runPreset(preset)}
                disabled={!!runningPreset}
                className="w-full px-3 py-2 text-xs font-mono uppercase tracking-wider border border-cyber-green/40 text-cyber-green hover:bg-cyber-green/10 transition-all disabled:opacity-50"
              >
                {runningPreset === preset.name ? "Running..." : "Run from Join Date"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {presetResult && (
        <div className="space-y-2">
          <h3 className="text-cyber-muted font-mono text-xs uppercase tracking-widest">
            Result: {presetResult.name} strategy from {joinDate} to today
          </h3>
          <SimulationSummary result={presetResult.result} />
        </div>
      )}

      {user?.account_type === "pro" && savedSims.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-cyber-muted font-mono text-xs uppercase tracking-widest">Saved Simulations</h3>
          <div className="space-y-2">
            {savedSims.map(sim => (
              <div key={sim.id} className="border border-cyber-grid p-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-cyber-green font-mono text-sm font-bold">{sim.name || "Unnamed Simulation"}</div>
                  <div className="text-cyber-muted font-mono text-[11px]">
                    {sim.start_date} → {sim.end_date} · {sim.asset_type}
                  </div>
                  {sim.result_summary?.totalReturn != null && (
                    <div className={`font-mono text-sm ${sim.result_summary.totalReturn >= 0 ? "text-cyber-green" : "text-red-400"}`}>
                      {sim.result_summary.totalReturn >= 0 ? "+" : ""}{sim.result_summary.totalReturn?.toFixed(2)}% return
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteSim(sim.id)}
                  className="text-cyber-muted hover:text-red-400 text-[10px] font-mono uppercase tracking-wider transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {user?.account_type !== "pro" && (
        <div className="border border-yellow-500/30 bg-yellow-500/5 p-4 text-center space-y-2">
          <p className="text-yellow-400 font-mono text-sm">Pro accounts can save simulations and load them here.</p>
          <p className="text-cyber-muted font-mono text-xs">Upgrade to Pro to save and compare strategies over time.</p>
        </div>
      )}
    </div>
  );
}
