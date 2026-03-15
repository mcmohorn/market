import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

interface Notification {
  id: number;
  symbol: string;
  asset_type: string;
  message: string;
  signal_from: string;
  signal_to: string;
  read: boolean;
  created_at: string;
}

export default function NotificationsPage({ onSelectSymbol }: { onSelectSymbol?: (symbol: string) => void }) {
  const { firebaseUser } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const getToken = useCallback(async () => {
    if (!firebaseUser) throw new Error("Not logged in");
    return firebaseUser.getIdToken();
  }, [firebaseUser]);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setItems(data);
    } catch {}
    setLoading(false);
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  async function markAllRead() {
    try {
      const token = await getToken();
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(prev => prev.map(i => ({ ...i, read: true })));
    } catch {}
  }

  const signalColor = (s: string) =>
    s === "BUY" ? "text-cyber-green" : s === "SELL" ? "text-red-400" : "text-yellow-400";

  const unread = items.filter(i => !i.read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-cyber-green font-mono text-lg uppercase tracking-widest">
          Notifications {unread > 0 && <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 ml-2">{unread}</span>}
        </h2>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="text-cyber-muted text-xs font-mono hover:text-cyber-green transition-colors uppercase tracking-wider"
          >
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-cyber-muted font-mono text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <div className="border border-cyber-grid p-8 text-center">
          <p className="text-cyber-muted font-mono text-sm">No notifications yet.</p>
          <p className="text-cyber-muted font-mono text-xs mt-1">Signal change alerts for your watchlist symbols will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              className={`border p-3 flex items-start gap-3 ${
                item.read ? "border-cyber-grid/40 bg-transparent" : "border-cyber-green/30 bg-cyber-green/5"
              }`}
            >
              {!item.read && <div className="w-1.5 h-1.5 bg-cyber-green rounded-full mt-1.5 flex-shrink-0" />}
              {item.read && <div className="w-1.5 h-1.5 flex-shrink-0" />}
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectSymbol?.(item.symbol)}
                    className="text-cyber-green font-mono text-sm font-bold hover:underline"
                  >
                    {item.symbol}
                  </button>
                  <span className="text-cyber-muted font-mono text-[10px]">{item.asset_type}</span>
                  {item.signal_from && item.signal_to && (
                    <span className="font-mono text-xs">
                      <span className={signalColor(item.signal_from)}>{item.signal_from}</span>
                      <span className="text-cyber-muted mx-1">→</span>
                      <span className={signalColor(item.signal_to)}>{item.signal_to}</span>
                    </span>
                  )}
                </div>
                <p className="text-cyber-text font-mono text-xs">{item.message}</p>
                <p className="text-cyber-muted font-mono text-[10px]">
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
