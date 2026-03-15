import { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, ComposedChart } from "recharts";
import { fetchStocks } from "../lib/api";

interface Holding {
  symbol: string;
  quantity: number;
  avgCost: number;
}

interface PaperTrade {
  id: string;
  date: string;
  symbol: string;
  action: "BUY" | "SELL" | "DEPOSIT";
  quantity: number;
  price: number;
  total: number;
}

interface BalanceSnapshot {
  date: string;
  value: number;
  cash: number;
  holdings: number;
}

interface Portfolio {
  cash: number;
  holdings: Holding[];
  trades: PaperTrade[];
  balanceHistory: BalanceSnapshot[];
}

const STORAGE_KEY = "mateo_paper_portfolio";

function loadPortfolio(): Portfolio {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { cash: 0, holdings: [], trades: [], balanceHistory: [] };
}

function savePortfolio(p: Portfolio) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

interface PriceMap {
  [symbol: string]: { price: number; change: number; signal: string };
}

export default function PaperMoneyPage({ assetType, onSelectSymbol, isPro }: { assetType: string; onSelectSymbol?: (symbol: string) => void; isPro?: boolean }) {
  const [portfolio, setPortfolio] = useState<Portfolio>(loadPortfolio);
  const [prices, setPrices] = useState<PriceMap>({});
  const [addCashAmount, setAddCashAmount] = useState("");
  const [tradeSymbol, setTradeSymbol] = useState("");
  const [tradeQty, setTradeQty] = useState("");
  const [symbolSearch, setSymbolSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ symbol: string; price: number; signal: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAddCash, setShowAddCash] = useState(false);

  useEffect(() => {
    savePortfolio(portfolio);
  }, [portfolio]);

  useEffect(() => {
    const symbols = portfolio.holdings.map(h => h.symbol);
    if (symbols.length === 0) return;

    fetchStocks({ limit: 2000, asset_type: assetType })
      .then(res => {
        const map: PriceMap = {};
        res.data.forEach(s => {
          map[s.symbol] = { price: s.price, change: s.changePercent, signal: s.signal };
        });
        setPrices(map);
      })
      .catch(() => {});
  }, [portfolio.holdings.length, assetType]);

  const searchSymbols = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetchStocks({ search: query, limit: 8 });
      setSearchResults(res.data.map(s => ({ symbol: s.symbol, price: s.price, signal: s.signal })));
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchSymbols(symbolSearch), 300);
    return () => clearTimeout(t);
  }, [symbolSearch, searchSymbols]);

  const addCash = useCallback(() => {
    const amount = parseFloat(addCashAmount);
    if (isNaN(amount) || amount <= 0) return;
    setPortfolio(prev => {
      const trade: PaperTrade = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        symbol: "CASH",
        action: "DEPOSIT",
        quantity: 0,
        price: 0,
        total: amount,
      };
      const snap: BalanceSnapshot = {
        date: new Date().toISOString().split("T")[0],
        value: prev.cash + amount + holdingsValue(prev.holdings, prices),
        cash: prev.cash + amount,
        holdings: holdingsValue(prev.holdings, prices),
      };
      return {
        ...prev,
        cash: prev.cash + amount,
        trades: [trade, ...prev.trades],
        balanceHistory: [...prev.balanceHistory, snap],
      };
    });
    setAddCashAmount("");
    setShowAddCash(false);
  }, [addCashAmount, prices]);

  const executeTrade = useCallback((action: "BUY" | "SELL") => {
    const qty = parseFloat(tradeQty);
    if (!tradeSymbol || isNaN(qty) || qty <= 0) return;

    const symbolPrice = prices[tradeSymbol]?.price;
    if (!symbolPrice) {
      const found = searchResults.find(s => s.symbol === tradeSymbol);
      if (!found) return;
      setPrices(prev => ({ ...prev, [tradeSymbol]: { price: found.price, change: 0, signal: found.signal } }));
      executeTradeWithPrice(action, tradeSymbol, qty, found.price);
    } else {
      executeTradeWithPrice(action, tradeSymbol, qty, symbolPrice);
    }
  }, [tradeSymbol, tradeQty, prices, searchResults]);

  const executeTradeWithPrice = useCallback((action: "BUY" | "SELL", symbol: string, qty: number, price: number) => {
    const total = qty * price;

    setPortfolio(prev => {
      if (action === "BUY" && total > prev.cash) return prev;

      const existing = prev.holdings.find(h => h.symbol === symbol);
      if (action === "SELL") {
        if (!existing || existing.quantity < qty) return prev;
      }

      let newHoldings = [...prev.holdings];
      let newCash = prev.cash;

      if (action === "BUY") {
        newCash -= total;
        if (existing) {
          const newQty = existing.quantity + qty;
          const newAvgCost = (existing.avgCost * existing.quantity + total) / newQty;
          newHoldings = newHoldings.map(h =>
            h.symbol === symbol ? { ...h, quantity: newQty, avgCost: newAvgCost } : h
          );
        } else {
          newHoldings.push({ symbol, quantity: qty, avgCost: price });
        }
      } else {
        newCash += total;
        if (existing!.quantity === qty) {
          newHoldings = newHoldings.filter(h => h.symbol !== symbol);
        } else {
          newHoldings = newHoldings.map(h =>
            h.symbol === symbol ? { ...h, quantity: h.quantity - qty } : h
          );
        }
      }

      const trade: PaperTrade = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        symbol,
        action,
        quantity: qty,
        price,
        total,
      };

      const hv = newHoldings.reduce((sum, h) => {
        const p = prices[h.symbol]?.price || h.avgCost;
        return sum + h.quantity * p;
      }, 0);

      const snap: BalanceSnapshot = {
        date: new Date().toISOString().split("T")[0],
        value: newCash + hv,
        cash: newCash,
        holdings: hv,
      };

      return {
        cash: newCash,
        holdings: newHoldings,
        trades: [trade, ...prev.trades],
        balanceHistory: [...prev.balanceHistory, snap],
      };
    });
    setTradeSymbol("");
    setTradeQty("");
    setSymbolSearch("");
    setSearchResults([]);
  }, [prices]);

  function holdingsValue(holdings: Holding[], priceMap: PriceMap): number {
    return holdings.reduce((sum, h) => {
      const p = priceMap[h.symbol]?.price || h.avgCost;
      return sum + h.quantity * p;
    }, 0);
  }

  const totalHoldingsValue = useMemo(() => holdingsValue(portfolio.holdings, prices), [portfolio.holdings, prices]);
  const totalValue = portfolio.cash + totalHoldingsValue;
  const totalCost = portfolio.holdings.reduce((sum, h) => sum + h.quantity * h.avgCost, 0);
  const totalPnL = totalHoldingsValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  const chartData = useMemo(() => {
    return portfolio.balanceHistory.map(s => ({
      date: s.date,
      value: Math.round(s.value * 100) / 100,
      cash: Math.round(s.cash * 100) / 100,
      holdings: Math.round(s.holdings * 100) / 100,
    }));
  }, [portfolio.balanceHistory]);

  const selectSymbol = useCallback((sym: string, price: number, signal: string) => {
    setTradeSymbol(sym);
    setSymbolSearch(sym);
    setSearchResults([]);
    setPrices(prev => ({ ...prev, [sym]: { price, change: 0, signal } }));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-cyber-green font-mono text-lg uppercase tracking-widest">
          Paper Money Trading
        </h2>
        <button
          onClick={() => setShowAddCash(!showAddCash)}
          className="px-4 py-2 bg-cyber-green/20 border border-cyber-green/40 text-cyber-green text-xs font-mono uppercase tracking-wider hover:bg-cyber-green/30 transition-all"
        >
          + Add Cash
        </button>
      </div>

      {showAddCash && (
        <div className="border border-cyber-green/30 bg-cyber-panel p-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-cyber-muted text-xs font-mono block mb-1">Deposit Amount ($)</label>
            <input
              type="number"
              value={addCashAmount}
              onChange={e => setAddCashAmount(e.target.value)}
              placeholder="10000"
              className="w-full bg-cyber-bg border border-cyber-grid text-cyber-text px-3 py-2 text-sm font-mono focus:border-cyber-green outline-none"
            />
          </div>
          <button
            onClick={addCash}
            className="px-6 py-2 bg-cyber-green text-cyber-bg text-xs font-mono font-bold uppercase tracking-wider hover:bg-cyber-green-dim transition-all"
          >
            Deposit
          </button>
          <button
            onClick={() => setShowAddCash(false)}
            className="px-4 py-2 border border-cyber-grid text-cyber-muted text-xs font-mono uppercase hover:text-cyber-text transition-all"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <div className="border border-cyber-grid bg-cyber-panel p-4">
          <div className="text-cyber-muted text-[10px] font-mono uppercase tracking-wider mb-1">Total Value</div>
          <div className="text-cyber-green text-xl font-mono font-bold">
            ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="border border-cyber-grid bg-cyber-panel p-4">
          <div className="text-cyber-muted text-[10px] font-mono uppercase tracking-wider mb-1">Cash</div>
          <div className="text-cyber-text text-xl font-mono font-bold">
            ${portfolio.cash.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="border border-cyber-grid bg-cyber-panel p-4">
          <div className="text-cyber-muted text-[10px] font-mono uppercase tracking-wider mb-1">Holdings Value</div>
          <div className="text-cyber-blue text-xl font-mono font-bold">
            ${totalHoldingsValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="border border-cyber-grid bg-cyber-panel p-4">
          <div className="text-cyber-muted text-[10px] font-mono uppercase tracking-wider mb-1">Unrealized P&L</div>
          <div className={`text-xl font-mono font-bold ${totalPnL >= 0 ? "text-cyber-green" : "text-cyber-red"}`}>
            {totalPnL >= 0 ? "+" : ""}${totalPnL.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-sm ml-1">({totalPnLPct >= 0 ? "+" : ""}{totalPnLPct.toFixed(2)}%)</span>
          </div>
        </div>
      </div>

      <div className="border border-cyber-grid bg-cyber-panel p-4">
        <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider mb-3">Trade</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <label className="text-cyber-muted text-xs font-mono block mb-1">Symbol</label>
            <input
              type="text"
              value={symbolSearch}
              onChange={e => {
                setSymbolSearch(e.target.value);
                setTradeSymbol("");
              }}
              placeholder="Search symbol..."
              className="w-full bg-cyber-bg border border-cyber-grid text-cyber-text px-3 py-2 text-sm font-mono focus:border-cyber-green outline-none"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#0a0a0a] border border-cyber-grid max-h-[200px] overflow-y-auto">
                {searchResults.map(s => (
                  <button
                    key={s.symbol}
                    onClick={() => selectSymbol(s.symbol, s.price, s.signal)}
                    className="w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-cyber-green/10 flex items-center justify-between text-cyber-text"
                  >
                    <span>{s.symbol}</span>
                    <span className="text-cyber-muted text-xs">${s.price.toFixed(2)} · {s.signal}</span>
                  </button>
                ))}
              </div>
            )}
            {searching && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#0a0a0a] border border-cyber-grid p-2 text-cyber-muted text-xs font-mono">
                Searching...
              </div>
            )}
          </div>
          <div className="w-32">
            <label className="text-cyber-muted text-xs font-mono block mb-1">Quantity</label>
            <input
              type="number"
              value={tradeQty}
              onChange={e => setTradeQty(e.target.value)}
              placeholder="0"
              className="w-full bg-cyber-bg border border-cyber-grid text-cyber-text px-3 py-2 text-sm font-mono focus:border-cyber-green outline-none"
            />
          </div>
          {tradeSymbol && prices[tradeSymbol] && tradeQty && (
            <div className="text-cyber-muted text-xs font-mono pb-2 w-28">
              Total: ${(prices[tradeSymbol].price * parseFloat(tradeQty || "0")).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
          <button
            onClick={() => executeTrade("BUY")}
            disabled={!tradeSymbol || !tradeQty}
            className="px-6 py-2 bg-cyber-green/20 border border-cyber-green/40 text-cyber-green text-xs font-mono font-bold uppercase tracking-wider hover:bg-cyber-green/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Buy
          </button>
          <button
            onClick={() => executeTrade("SELL")}
            disabled={!tradeSymbol || !tradeQty}
            className="px-6 py-2 bg-cyber-red/20 border border-cyber-red/40 text-cyber-red text-xs font-mono font-bold uppercase tracking-wider hover:bg-cyber-red/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Sell
          </button>
        </div>
      </div>

      {portfolio.holdings.length > 0 && (
        <div className="border border-cyber-grid bg-cyber-panel p-4">
          <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider mb-3">Holdings</h3>
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="text-cyber-muted text-[10px] uppercase tracking-wider border-b border-cyber-grid">
                <th className="text-left py-2">Symbol</th>
                <th className="text-right py-2">Qty</th>
                <th className="text-right py-2">Avg Cost</th>
                <th className="text-right py-2">Price</th>
                <th className="text-right py-2">Value</th>
                <th className="text-right py-2">P&L</th>
                <th className="text-right py-2">Signal</th>
                <th className="text-right py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.holdings.map(h => {
                const current = prices[h.symbol]?.price || h.avgCost;
                const signal = prices[h.symbol]?.signal || "—";
                const value = h.quantity * current;
                const pnl = (current - h.avgCost) * h.quantity;
                const pnlPct = ((current - h.avgCost) / h.avgCost) * 100;
                return (
                  <tr key={h.symbol} className="border-b border-cyber-grid/50 hover:bg-cyber-green/5">
                    <td className="py-2 text-cyber-text font-bold">
                      <button onClick={() => onSelectSymbol?.(h.symbol)} className="hover:text-cyber-green hover:underline transition-colors">{h.symbol}</button>
                    </td>
                    <td className="py-2 text-right text-cyber-text">{h.quantity}</td>
                    <td className="py-2 text-right text-cyber-muted">${h.avgCost.toFixed(2)}</td>
                    <td className="py-2 text-right text-cyber-text">${current.toFixed(2)}</td>
                    <td className="py-2 text-right text-cyber-text">${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className={`py-2 text-right ${pnl >= 0 ? "text-cyber-green" : "text-cyber-red"}`}>
                      {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                    </td>
                    <td className="py-2 text-right">
                      <span className={`text-[10px] px-1.5 py-0.5 ${
                        signal === "BUY" ? "text-cyber-green bg-cyber-green/10" :
                        signal === "SELL" ? "text-cyber-red bg-cyber-red/10" :
                        "text-cyber-yellow bg-cyber-yellow/10"
                      }`}>
                        {signal}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => {
                          setTradeSymbol(h.symbol);
                          setSymbolSearch(h.symbol);
                          setTradeQty(String(h.quantity));
                        }}
                        className="text-[10px] text-cyber-red/70 hover:text-cyber-red uppercase tracking-wider"
                      >
                        Sell All
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {chartData.length > 1 && (
        <div className="border border-cyber-grid bg-cyber-panel p-4">
          <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider mb-3">Balance History</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00ff88" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                stroke="#333"
                tick={{ fill: "#666", fontSize: 10, fontFamily: "monospace" }}
                tickFormatter={d => d.slice(5)}
              />
              <YAxis
                stroke="#333"
                tick={{ fill: "#666", fontSize: 10, fontFamily: "monospace" }}
                tickFormatter={v => `$${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0a0f0a",
                  border: "1px solid #1a3a1a",
                  fontFamily: "monospace",
                  fontSize: 11,
                }}
                labelStyle={{ color: "#00ff88" }}
                formatter={(value: number, name: string) => [
                  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  name.charAt(0).toUpperCase() + name.slice(1),
                ]}
              />
              <Area type="monotone" dataKey="value" fill="url(#balanceGrad)" stroke="none" />
              <Line type="monotone" dataKey="value" stroke="#00ff88" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="cash" stroke="#eab308" dot={false} strokeWidth={1} opacity={0.6} />
              <Line type="monotone" dataKey="holdings" stroke="#06b6d4" dot={false} strokeWidth={1} opacity={0.6} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 text-xs font-mono mt-2 justify-end">
            <span className="flex items-center gap-1">
              <span className="w-3 h-[2px] bg-cyber-green inline-block"></span>
              <span className="text-cyber-muted">Total</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-[2px] bg-yellow-500 inline-block"></span>
              <span className="text-cyber-muted">Cash</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-[2px] bg-cyan-500 inline-block"></span>
              <span className="text-cyber-muted">Holdings</span>
            </span>
          </div>
        </div>
      )}

      {portfolio.trades.length > 0 && (
        <div className="border border-cyber-grid bg-cyber-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-cyber-green font-mono text-sm uppercase tracking-wider">Trade History</h3>
            <button
              onClick={() => {
                if (confirm("Reset entire paper portfolio? This cannot be undone.")) {
                  setPortfolio({ cash: 0, holdings: [], trades: [], balanceHistory: [] });
                }
              }}
              className="text-[10px] text-cyber-red/50 hover:text-cyber-red font-mono uppercase tracking-wider"
            >
              Reset Portfolio
            </button>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm font-mono">
              <thead className="sticky top-0 bg-cyber-panel">
                <tr className="text-cyber-muted text-[10px] uppercase tracking-wider border-b border-cyber-grid">
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Action</th>
                  <th className="text-left py-2">Symbol</th>
                  <th className="text-right py-2">Qty</th>
                  <th className="text-right py-2">Price</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.trades.map(t => (
                  <tr key={t.id} className="border-b border-cyber-grid/50">
                    <td className="py-1.5 text-cyber-muted text-xs">
                      {new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 ${
                        t.action === "BUY" ? "text-cyber-green bg-cyber-green/10" :
                        t.action === "SELL" ? "text-cyber-red bg-cyber-red/10" :
                        "text-cyber-yellow bg-cyber-yellow/10"
                      }`}>
                        {t.action}
                      </span>
                    </td>
                    <td className="py-1.5 text-cyber-text">
                      {t.symbol !== "CASH" ? (
                        <button onClick={() => onSelectSymbol?.(t.symbol)} className="hover:text-cyber-green hover:underline transition-colors">{t.symbol}</button>
                      ) : t.symbol}
                    </td>
                    <td className="py-1.5 text-right text-cyber-text">{t.action === "DEPOSIT" ? "—" : t.quantity}</td>
                    <td className="py-1.5 text-right text-cyber-muted">{t.action === "DEPOSIT" ? "—" : `$${t.price.toFixed(2)}`}</td>
                    <td className={`py-1.5 text-right ${
                      t.action === "BUY" ? "text-cyber-red" :
                      t.action === "SELL" ? "text-cyber-green" :
                      "text-cyber-yellow"
                    }`}>
                      {t.action === "BUY" ? "-" : t.action === "SELL" ? "+" : "+"}
                      ${t.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {portfolio.holdings.length === 0 && portfolio.trades.length === 0 && (
        <div className="border border-cyber-grid bg-cyber-panel p-12 text-center">
          <div className="text-cyber-green text-4xl mb-4">$</div>
          <div className="text-cyber-muted text-sm font-mono mb-2">No paper money portfolio yet</div>
          <div className="text-cyber-muted/60 text-xs font-mono">
            Click "Add Cash" to deposit funds, then search for symbols to buy
          </div>
        </div>
      )}
    </div>
  );
}
