import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Header from "./components/Header";
import type { AssetType } from "./components/Header";
import SignalAlerts from "./components/SignalAlerts";
import TopPerformers from "./components/TopPerformers";
import StockGrid from "./components/StockGrid";
import StockDetailModal from "./components/StockDetailModal";
import StatsBar from "./components/StatsBar";
import SellAlertBanner from "./components/SellAlertBanner";
import SimulationPage from "./pages/SimulationPage";
import RecapsPage from "./pages/RecapsPage";
import PaperMoneyPage from "./pages/PaperMoneyPage";
import MarketNewsPage from "./pages/MarketNewsPage";
import LoginPage from "./pages/LoginPage";
import AboutPage from "./pages/AboutPage";
import WatchlistPage from "./pages/WatchlistPage";
import NotificationsPage from "./pages/NotificationsPage";
import HistoryPage from "./pages/HistoryPage";
import { getAsOfDate, type TimeJump } from "./lib/api";

async function fetchUnreadCount(firebaseUser: any): Promise<number> {
  try {
    const token = await firebaseUser.getIdToken();
    const res = await fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return 0;
    const data: { read: boolean }[] = await res.json();
    return data.filter(n => !n.read).length;
  } catch { return 0; }
}

type View = "scanner" | "simulation" | "paper" | "news" | "recaps" | "watchlist" | "notifications" | "history" | "about";

function NavTab({ label, active, onClick, badge }: { label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-all border-b-2 ${
        active ? "border-cyber-green text-cyber-green" : "border-transparent text-cyber-muted hover:text-cyber-green/70"
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function AppInner() {
  const { user, firebaseUser, loading, logout } = useAuth();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [view, setView] = useState<View>("scanner");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [timeJump, setTimeJump] = useState<TimeJump>("latest");
  const [showLogin, setShowLogin] = useState(false);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!firebaseUser || user?.account_type !== "pro") { setUnreadCount(0); return; }
    fetchUnreadCount(firebaseUser).then(setUnreadCount);
    const id = setInterval(() => fetchUnreadCount(firebaseUser).then(setUnreadCount), 60_000);
    return () => clearInterval(id);
  }, [firebaseUser, user?.account_type]);

  const handleAssetTypeChange = useCallback((type: AssetType) => {
    setAssetType(type);
    setTimeJump("latest");
  }, []);

  const asOfDate = getAsOfDate(timeJump);

  const isPro = user?.account_type === "pro";
  const isLoggedIn = !!user;

  function handleSymbolClick(symbol: string) {
    if (!isLoggedIn) {
      setLoginPrompt(true);
      return;
    }
    setSelectedSymbol(symbol);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cyber-bg flex items-center justify-center">
        <div className="text-cyber-green font-mono text-sm animate-pulse">INITIALIZING MATEO...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyber-bg scanline">
      <Header
        assetType={assetType}
        onAssetTypeChange={handleAssetTypeChange}
        user={user}
        onLogin={() => setShowLogin(true)}
        onLogout={logout}
      />

      <nav className="max-w-[1920px] mx-auto px-4 pt-4">
        <div className="flex items-center gap-1 border-b border-cyber-grid flex-wrap">
          <NavTab label="Market Scanner" active={view === "scanner"} onClick={() => setView("scanner")} />
          {isLoggedIn && <NavTab label="Paper Money" active={view === "paper"} onClick={() => setView("paper")} />}
          {isPro && <NavTab label="Simulation Lab" active={view === "simulation"} onClick={() => setView("simulation")} />}
          {isPro && <NavTab label="Watchlist" active={view === "watchlist"} onClick={() => setView("watchlist")} />}
          {isPro && <NavTab label="Your History" active={view === "history"} onClick={() => setView("history")} />}
          <NavTab label="Market News" active={view === "news"} onClick={() => setView("news")} />
          <NavTab label="Recaps" active={view === "recaps"} onClick={() => setView("recaps")} />
          {isPro && <NavTab label="Notifications" active={view === "notifications"} onClick={() => { setView("notifications"); setUnreadCount(0); }} badge={unreadCount} />}
          <NavTab label="About" active={view === "about"} onClick={() => setView("about")} />
          {!isLoggedIn && (
            <button
              onClick={() => setShowLogin(true)}
              className="ml-auto px-4 py-1.5 text-xs font-mono uppercase tracking-widest border border-cyber-green text-cyber-green hover:bg-cyber-green hover:text-cyber-bg transition-all"
            >
              Sign In
            </button>
          )}
        </div>
      </nav>

      {isLoggedIn && <SellAlertBanner onGoToPaperMoney={() => setView("paper")} />}

      <main className="max-w-[1920px] mx-auto px-4 py-4 space-y-4">
        {view === "scanner" && (
          <>
            {!isLoggedIn && (
              <div className="border border-cyber-green/20 bg-cyber-green/5 px-4 py-2 flex items-center justify-between">
                <p className="text-cyber-muted font-mono text-xs">
                  Preview mode — showing top 5 results per section.{" "}
                  <button onClick={() => setShowLogin(true)} className="text-cyber-green underline hover:no-underline">
                    Sign in for full access
                  </button>
                </p>
              </div>
            )}
            <StatsBar assetType={assetType} asOfDate={asOfDate} />
            <SignalAlerts assetType={assetType} onSelectSymbol={handleSymbolClick} limit={isLoggedIn ? undefined : 5} />
            <TopPerformers assetType={assetType} asOfDate={asOfDate} onSelectSymbol={handleSymbolClick} limit={isLoggedIn ? undefined : 5} />
            <StockGrid assetType={assetType} timeJump={timeJump} onTimeJumpChange={setTimeJump} onSelectSymbol={handleSymbolClick} limit={isLoggedIn ? undefined : 5} />
          </>
        )}

        {view === "simulation" && isPro && (
          <SimulationPage assetType={assetType} onSelectSymbol={handleSymbolClick} />
        )}

        {view === "simulation" && !isPro && (
          <div className="border border-cyber-grid p-8 text-center space-y-4 max-w-xl mx-auto mt-8">
            <div className="text-cyber-green font-mono text-4xl">⚗</div>
            <h2 className="text-cyber-green font-mono text-lg uppercase tracking-widest">Simulation Lab</h2>
            <p className="text-cyber-muted font-mono text-sm leading-relaxed">
              Run backtests across years of historical data using configurable MACD+RSI strategies.
              Compare Conservative, Default, and Aggressive approaches across 5–30 year windows.
              Analyze bull vs bear market performance.
            </p>
            <button
              onClick={() => setShowLogin(true)}
              className="px-6 py-2 bg-cyber-green text-cyber-bg font-mono text-sm font-bold uppercase tracking-wider hover:bg-cyber-green/80 transition-all"
            >
              Join Pro
            </button>
          </div>
        )}

        {view === "paper" && isLoggedIn && (
          <PaperMoneyPage assetType={assetType} onSelectSymbol={handleSymbolClick} isPro={isPro} />
        )}

        {view === "news" && <MarketNewsPage onSelectSymbol={handleSymbolClick} />}
        {view === "recaps" && <RecapsPage />}
        {view === "about" && <AboutPage />}

        {view === "watchlist" && isPro && (
          <WatchlistPage onSelectSymbol={handleSymbolClick} />
        )}

        {view === "notifications" && isPro && (
          <NotificationsPage onSelectSymbol={handleSymbolClick} />
        )}

        {view === "history" && (
          <HistoryPage assetType={assetType} />
        )}
      </main>

      {showLogin && <LoginPage onClose={() => setShowLogin(false)} />}

      {loginPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="border border-cyber-green/40 bg-cyber-bg p-6 max-w-sm w-full space-y-4">
            <h3 className="text-cyber-green font-mono text-sm uppercase tracking-widest">Sign In Required</h3>
            <p className="text-cyber-muted font-mono text-xs leading-relaxed">
              Create a free account to view full stock details, price charts, and technical indicators.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setLoginPrompt(false); setShowLogin(true); }}
                className="flex-1 px-4 py-2 bg-cyber-green text-cyber-bg font-mono text-xs font-bold uppercase hover:bg-cyber-green/80 transition-all"
              >
                Sign In
              </button>
              <button
                onClick={() => setLoginPrompt(false)}
                className="px-4 py-2 border border-cyber-grid text-cyber-muted font-mono text-xs hover:text-cyber-green transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedSymbol && (
        <StockDetailModal
          symbol={selectedSymbol}
          onClose={() => setSelectedSymbol(null)}
          isPro={isPro}
          assetType={assetType}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
