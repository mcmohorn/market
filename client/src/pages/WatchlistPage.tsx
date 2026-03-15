import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

interface WatchlistEntry {
  id: number;
  symbol: string;
  asset_type: string;
  last_known_signal: string;
  added_at: string;
  current_signal?: string;
  current_price?: number;
  change_percent?: number;
}

async function apiFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function WatchlistPage({ onSelectSymbol }: { onSelectSymbol?: (symbol: string) => void }) {
  const { user, firebaseUser } = useAuth();
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSymbol, setAddSymbol] = useState("");
  const [addAsset, setAddAsset] = useState<"stock" | "crypto">("stock");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    if (!firebaseUser) throw new Error("Not logged in");
    return firebaseUser.getIdToken();
  }, [firebaseUser]);

  const loadWatchlist = useCallback(async () => {
    try {
      const token = await getToken();
      const data = await apiFetch("/api/watchlist", token);
      setItems(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadWatchlist(); }, [loadWatchlist]);

  async function handleAdd() {
    const sym = addSymbol.trim().toUpperCase();
    if (!sym) return;
    setAdding(true);
    setError(null);
    try {
      const token = await getToken();
      await apiFetch("/api/watchlist", token, {
        method: "POST",
        body: JSON.stringify({ symbol: sym, asset_type: addAsset }),
      });
      setAddSymbol("");
      await loadWatchlist();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(symbol: string, asset_type: string) {
    try {
      const token = await getToken();
      await apiFetch(`/api/watchlist/${symbol}?asset_type=${asset_type}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(i => !(i.symbol === symbol && i.asset_type === asset_type)));
    } catch (e: any) {
      setError(e.message);
    }
  }

  const signalColor = (s: string) =>
    s === "BUY" ? "text-cyber-green bg-cyber-green/10" :
    s === "SELL" ? "text-red-400 bg-red-500/10" :
    "text-yellow-400 bg-yellow-500/10";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-cyber-green font-mono text-lg uppercase tracking-widest">Watchlist</h2>
        {user?.account_type !== "pro" && (
          <span className="text-yellow-400 font-mono text-xs border border-yellow-500/30 px-2 py-1">Pro Feature</span>
        )}
      </div>

      {user?.account_type === "pro" && (
        <div className="border border-cyber-grid p-3 flex items-end gap-2">
          <div className="flex-1">
            <label className="text-cyber-muted text-xs font-mono block mb-1">Symbol</label>
            <input
              value={addSymbol}
              onChange={e => setAddSymbol(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="e.g. AAPL"
              className="w-full bg-cyber-bg border border-cyber-grid text-cyber-text px-2 py-1.5 text-sm font-mono focus:border-cyber-green outline-none"
            />
          </div>
          <div>
            <label className="text-cyber-muted text-xs font-mono block mb-1">Type</label>
            <select
              value={addAsset}
              onChange={e => setAddAsset(e.target.value as "stock" | "crypto")}
              className="bg-cyber-bg border border-cyber-grid text-cyber-text px-2 py-1.5 text-sm font-mono focus:border-cyber-green outline-none"
            >
              <option value="stock">Stock</option>
              <option value="crypto">Crypto</option>
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !addSymbol.trim()}
            className="px-4 py-1.5 bg-cyber-green text-cyber-bg text-xs font-mono font-bold uppercase tracking-wider hover:bg-cyber-green/80 transition-all disabled:opacity-50"
          >
            {adding ? "..." : "+ Add"}
          </button>
        </div>
      )}

      {error && <p className="text-red-400 font-mono text-xs">{error}</p>}

      {loading ? (
        <p className="text-cyber-muted font-mono text-sm">Loading watchlist...</p>
      ) : items.length === 0 ? (
        <div className="border border-cyber-grid p-8 text-center">
          <p className="text-cyber-muted font-mono text-sm">No symbols on your watchlist yet.</p>
          <p className="text-cyber-muted font-mono text-xs mt-1">Add symbols above or use the "Watch" button in any stock detail view.</p>
        </div>
      ) : (
        <div className="border border-cyber-grid overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-cyber-grid text-cyber-muted">
                <th className="text-left py-2 px-3">SYMBOL</th>
                <th className="text-left py-2 px-3">TYPE</th>
                <th className="text-left py-2 px-3">SIGNAL</th>
                <th className="text-right py-2 px-3">PRICE</th>
                <th className="text-right py-2 px-3">CHANGE</th>
                <th className="text-right py-2 px-3">ADDED</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={`${item.symbol}-${item.asset_type}`} className="border-b border-cyber-grid/30 hover:bg-cyber-grid/10">
                  <td className="py-2 px-3">
                    <button
                      onClick={() => onSelectSymbol?.(item.symbol)}
                      className="text-cyber-green font-bold hover:underline"
                    >
                      {item.symbol}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-cyber-muted capitalize">{item.asset_type}</td>
                  <td className="py-2 px-3">
                    {item.current_signal ? (
                      <span className={`px-1.5 py-0.5 text-[10px] ${signalColor(item.current_signal)}`}>
                        {item.current_signal}
                      </span>
                    ) : (
                      <span className="text-cyber-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-cyber-text">
                    {item.current_price ? `$${item.current_price.toFixed(2)}` : "—"}
                  </td>
                  <td className={`py-2 px-3 text-right ${(item.change_percent || 0) >= 0 ? "text-cyber-green" : "text-red-400"}`}>
                    {item.change_percent != null ? `${item.change_percent >= 0 ? "+" : ""}${item.change_percent.toFixed(2)}%` : "—"}
                  </td>
                  <td className="py-2 px-3 text-right text-cyber-muted">
                    {new Date(item.added_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => handleRemove(item.symbol, item.asset_type)}
                      className="text-cyber-muted hover:text-red-400 text-[10px] uppercase tracking-wider transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
