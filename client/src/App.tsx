import { useCallback, useState } from "react";
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

type View = "scanner" | "simulation" | "recaps" | "paper" | "news";
export type TimeJump = "1d" | "1w" | "1m" | "3m" | "6m" | "1y" | "latest";

export function getAsOfDate(jump: TimeJump): string | undefined {
  if (jump === "latest") return undefined;
  const now = new Date();
  switch (jump) {
    case "1d": now.setDate(now.getDate() - 1); break;
    case "1w": now.setDate(now.getDate() - 7); break;
    case "1m": now.setMonth(now.getMonth() - 1); break;
    case "3m": now.setMonth(now.getMonth() - 3); break;
    case "6m": now.setMonth(now.getMonth() - 6); break;
    case "1y": now.setFullYear(now.getFullYear() - 1); break;
  }
  return now.toISOString().split("T")[0];
}

export default function App() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [view, setView] = useState<View>("scanner");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [timeJump, setTimeJump] = useState<TimeJump>("latest");

  const handleAssetTypeChange = useCallback((type: AssetType) => {
    setAssetType(type);
    setTimeJump("latest");
  }, []);

  const asOfDate = getAsOfDate(timeJump);

  return (
    <div className="min-h-screen bg-cyber-bg scanline">
      <Header assetType={assetType} onAssetTypeChange={handleAssetTypeChange} />
      <nav className="max-w-[1920px] mx-auto px-4 pt-4">
        <div className="flex items-center gap-1 border-b border-cyber-grid">
          <button
            onClick={() => setView("scanner")}
            className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-all border-b-2 ${
              view === "scanner"
                ? "border-cyber-green text-cyber-green"
                : "border-transparent text-cyber-muted hover:text-cyber-green/70"
            }`}
          >
            Market Scanner
          </button>
          <button
            onClick={() => setView("simulation")}
            className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-all border-b-2 ${
              view === "simulation"
                ? "border-cyber-green text-cyber-green"
                : "border-transparent text-cyber-muted hover:text-cyber-green/70"
            }`}
          >
            Simulation Lab
          </button>
          <button
            onClick={() => setView("paper")}
            className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-all border-b-2 ${
              view === "paper"
                ? "border-cyber-green text-cyber-green"
                : "border-transparent text-cyber-muted hover:text-cyber-green/70"
            }`}
          >
            Paper Money
          </button>
          <button
            onClick={() => setView("news")}
            className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-all border-b-2 ${
              view === "news"
                ? "border-cyber-green text-cyber-green"
                : "border-transparent text-cyber-muted hover:text-cyber-green/70"
            }`}
          >
            Market News
          </button>
          <button
            onClick={() => setView("recaps")}
            className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-all border-b-2 ${
              view === "recaps"
                ? "border-cyber-green text-cyber-green"
                : "border-transparent text-cyber-muted hover:text-cyber-green/70"
            }`}
          >
            Recaps
          </button>
        </div>
      </nav>
      <SellAlertBanner onGoToPaperMoney={() => setView("paper")} />
      <main className="max-w-[1920px] mx-auto px-4 py-4 space-y-4">
        {view === "scanner" && (
          <>
            <StatsBar assetType={assetType} asOfDate={asOfDate} />
            <SignalAlerts assetType={assetType} onSelectSymbol={setSelectedSymbol} />
            <TopPerformers assetType={assetType} asOfDate={asOfDate} onSelectSymbol={setSelectedSymbol} />
            <StockGrid assetType={assetType} timeJump={timeJump} onTimeJumpChange={setTimeJump} onSelectSymbol={setSelectedSymbol} />
          </>
        )}
        {view === "simulation" && <SimulationPage assetType={assetType} />}
        {view === "paper" && <PaperMoneyPage assetType={assetType} />}
        {view === "news" && <MarketNewsPage />}
        {view === "recaps" && <RecapsPage />}
      </main>
      {selectedSymbol && (
        <StockDetailModal
          symbol={selectedSymbol}
          onClose={() => setSelectedSymbol(null)}
        />
      )}
    </div>
  );
}
