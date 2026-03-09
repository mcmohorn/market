import { useEffect, useState } from "react";
import { fetchPaperMoneySignals } from "../lib/api";

interface SellAlert {
  symbol: string;
  signal: string;
  price: number;
  change_percent: number;
}

interface Props {
  onGoToPaperMoney: () => void;
}

const STORAGE_KEY = "mateo_paper_portfolio";

export default function SellAlertBanner({ onGoToPaperMoney }: Props) {
  const [alerts, setAlerts] = useState<SellAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkHoldings = async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const portfolio = JSON.parse(raw);
        const holdingsArr = portfolio.holdings || [];
        const symbols = holdingsArr
          .filter((h: any) => h.quantity > 0)
          .map((h: any) => h.symbol);
        if (symbols.length === 0) return;

        const signals = await fetchPaperMoneySignals(symbols);
        const sellSignals = signals.filter(s => s.signal === "SELL");
        setAlerts(sellSignals);
      } catch {
        // silently fail
      }
    };

    checkHoldings();
    const interval = setInterval(checkHoldings, 60000);
    return () => clearInterval(interval);
  }, []);

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.symbol));

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="max-w-[1920px] mx-auto px-4 pt-4">
      {visibleAlerts.map(alert => (
        <div
          key={alert.symbol}
          className="mb-2 border-2 border-cyber-red bg-cyber-red/10 rounded-lg p-4 flex items-center justify-between animate-pulse"
        >
          <div className="flex items-center gap-4">
            <div className="text-3xl">&#9888;</div>
            <div>
              <div className="text-cyber-red font-bold text-lg tracking-wider">
                HEY! IT'S TIME TO SELL {alert.symbol}
              </div>
              <div className="text-cyber-muted text-sm mt-1">
                Signal: <span className="text-cyber-red font-bold">SELL</span>
                {" | "}Price: ${alert.price?.toFixed(2)}
                {" | "}Change: <span className={alert.change_percent < 0 ? "text-cyber-red" : "text-cyber-green"}>
                  {alert.change_percent?.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onGoToPaperMoney}
              className="px-4 py-2 bg-cyber-red text-black font-bold text-sm uppercase tracking-wider rounded hover:bg-cyber-red/80 transition-all"
            >
              Go Sell Now
            </button>
            <button
              onClick={() => setDismissed(prev => new Set([...prev, alert.symbol]))}
              className="px-3 py-2 text-cyber-muted hover:text-cyber-text text-sm border border-cyber-border rounded"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
