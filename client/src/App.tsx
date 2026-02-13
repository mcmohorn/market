import { useState } from "react";
import Header from "./components/Header";
import TopPerformers from "./components/TopPerformers";
import StockGrid from "./components/StockGrid";
import StockDetailModal from "./components/StockDetailModal";
import StatsBar from "./components/StatsBar";

export default function App() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-cyber-bg scanline">
      <Header />
      <main className="max-w-[1920px] mx-auto px-4 py-4 space-y-4">
        <StatsBar />
        <TopPerformers onSelectSymbol={setSelectedSymbol} />
        <StockGrid onSelectSymbol={setSelectedSymbol} />
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
