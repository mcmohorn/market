import { useState } from "react";
import Header from "./components/Header";
import TopPerformers from "./components/TopPerformers";
import StockGrid from "./components/StockGrid";
import StockDetailModal from "./components/StockDetailModal";
import StatsBar from "./components/StatsBar";
import SimulationPage from "./pages/SimulationPage";

type View = "scanner" | "simulation";

export default function App() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [view, setView] = useState<View>("scanner");

  return (
    <div className="min-h-screen bg-cyber-bg scanline">
      <Header />
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
        </div>
      </nav>
      <main className="max-w-[1920px] mx-auto px-4 py-4 space-y-4">
        {view === "scanner" && (
          <>
            <StatsBar />
            <TopPerformers onSelectSymbol={setSelectedSymbol} />
            <StockGrid onSelectSymbol={setSelectedSymbol} />
          </>
        )}
        {view === "simulation" && <SimulationPage />}
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
