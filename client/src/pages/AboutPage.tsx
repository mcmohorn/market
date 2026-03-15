export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 py-4">
      <div className="border border-cyber-green/40 p-6 space-y-4">
        <h2 className="text-cyber-green font-mono text-xl uppercase tracking-widest">About MATEO</h2>
        <p className="text-cyber-text font-mono text-sm leading-relaxed">
          MATEO (Market Analysis Terminal &amp; Execution Observer) is a research tool for analyzing stock and cryptocurrency market data using technical indicators including MACD (Moving Average Convergence Divergence) and RSI (Relative Strength Index).
        </p>
        <p className="text-cyber-text font-mono text-sm leading-relaxed">
          The platform ingests historical price data, computes BUY / SELL / HOLD signals based on configurable algorithm parameters, and provides backtesting simulations for educational exploration of trading strategies.
        </p>
      </div>

      <div className="border border-red-500/50 bg-red-500/5 p-6 space-y-3">
        <h3 className="text-red-400 font-mono text-sm uppercase tracking-widest flex items-center gap-2">
          <span className="text-red-400">⚠</span> Important Disclaimer
        </h3>
        <p className="text-red-300/80 font-mono text-sm leading-relaxed font-bold">
          MATEO IS NOT FINANCIAL ADVICE.
        </p>
        <p className="text-cyber-muted font-mono text-xs leading-relaxed">
          This tool is provided strictly for educational and research purposes only. Nothing presented on this platform constitutes financial advice, investment recommendations, or trading guidance of any kind. All signals, simulations, and analysis are generated algorithmically and do not account for individual financial circumstances, risk tolerance, tax implications, or market conditions beyond the data available.
        </p>
        <p className="text-cyber-muted font-mono text-xs leading-relaxed">
          Past performance of any simulated strategy is not indicative of future results. Markets are inherently unpredictable. Unexplained anomalies, data gaps, and inaccuracies can and do exist in the underlying data. You should not make real financial decisions based on any output from this system.
        </p>
        <p className="text-cyber-muted font-mono text-xs leading-relaxed">
          Always consult a licensed financial advisor before making any investment decisions. Trading stocks, options, cryptocurrencies, or other financial instruments involves substantial risk of loss.
        </p>
      </div>

      <div className="border border-cyber-grid p-6 space-y-4">
        <h3 className="text-cyber-green font-mono text-sm uppercase tracking-widest">Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { title: "Market Scanner", desc: "Browse 4,000+ stocks and crypto with computed MACD/RSI signals." },
            { title: "Simulation Lab (Pro)", desc: "Backtest configurable strategies across historical date ranges." },
            { title: "Paper Money", desc: "Simulate trades with virtual money, no real capital at risk." },
            { title: "Market News", desc: "Aggregated community posts from Reddit financial communities." },
            { title: "Watchlist (Pro)", desc: "Track specific symbols and receive signal change alerts." },
            { title: "Your History (Pro)", desc: "See how saved strategies would have performed since joining." },
            { title: "Recaps", desc: "Daily, weekly, and monthly market summaries and prediction accuracy." },
            { title: "Algorithm Versioning", desc: "Track and compare different indicator parameter configurations." },
          ].map(f => (
            <div key={f.title} className="border border-cyber-grid/50 p-3 space-y-1">
              <div className="text-cyber-green font-mono text-xs uppercase tracking-wider">{f.title}</div>
              <div className="text-cyber-muted font-mono text-[11px] leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-cyber-grid p-6 space-y-3">
        <h3 className="text-cyber-green font-mono text-sm uppercase tracking-widest">Data Sources</h3>
        <p className="text-cyber-muted font-mono text-xs leading-relaxed">
          Historical price data is sourced from Alpaca Markets (equities) and Tiingo (cryptocurrency). All data is cached in a PostgreSQL database and refreshed periodically. Data accuracy cannot be guaranteed. Reddit community news is aggregated via the Reddit JSON API and PullPush.io.
        </p>
        <p className="text-cyber-muted font-mono text-xs leading-relaxed">
          Signal computation uses standard MACD and RSI formulas applied to closing prices. Results may differ from other platforms due to different lookback periods, data sources, or computation methods.
        </p>
      </div>
    </div>
  );
}
