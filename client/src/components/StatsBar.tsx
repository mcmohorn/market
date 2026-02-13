import { useEffect, useState } from "react";
import { fetchStats } from "../lib/api";

interface Stats {
  total: number;
  buys: number;
  sells: number;
  holds: number;
  lastUpdate: string | null;
}

interface Props {
  assetType: string;
  asOfDate?: string;
}

export default function StatsBar({ assetType, asOfDate }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetchStats(assetType)
      .then(setStats)
      .catch(() => setStats(null));
  }, [assetType]);

  if (!stats || stats.total === 0) {
    return (
      <div className="panel-glow p-4 text-center">
        <div className="text-cyber-green glow-green text-sm mb-1">SYSTEM STATUS</div>
        <div className="text-cyber-muted text-xs">
          No {assetType === "crypto" ? "crypto" : "stock"} data loaded yet. Run the seed script to pull data:
          <code className="ml-2 text-cyber-green bg-black/50 px-2 py-1 rounded">npm run seed-db</code>
        </div>
      </div>
    );
  }

  const label = assetType === "crypto" ? "Tokens" : "Symbols";

  return (
    <div className="panel p-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-6">
        <div>
          <div className="text-[10px] text-cyber-muted uppercase tracking-widest">{label}</div>
          <div className="text-lg font-bold text-cyber-text">{stats.total.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] text-cyber-muted uppercase tracking-widest">Buy Signals</div>
          <div className="text-lg font-bold text-cyber-green">{stats.buys.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] text-cyber-muted uppercase tracking-widest">Sell Signals</div>
          <div className="text-lg font-bold text-cyber-red">{stats.sells.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] text-cyber-muted uppercase tracking-widest">Hold</div>
          <div className="text-lg font-bold text-cyber-yellow">{stats.holds.toLocaleString()}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {asOfDate && (
          <div className="text-[10px] text-cyber-yellow font-bold uppercase tracking-wider">
            Historical: {asOfDate}
          </div>
        )}
        {stats.lastUpdate && (
          <div className="text-[10px] text-cyber-muted">
            Last updated: {new Date(stats.lastUpdate).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
