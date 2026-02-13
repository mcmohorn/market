import type { StockAnalysis, StockDetail, TopPerformer, SimulationResult, SimulationRequest, CompareRequest, MarketConditionsRequest, StrategyComparison, MarketConditionResult } from "../../../shared/types";

const BASE = "";

export async function fetchStocks(params: {
  signal?: string;
  sort?: string;
  order?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: StockAnalysis[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.signal) qs.set("signal", params.signal);
  if (params.sort) qs.set("sort", params.sort);
  if (params.order) qs.set("order", params.order);
  if (params.search) qs.set("search", params.search);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));

  const res = await fetch(`${BASE}/api/stocks?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch stocks");
  return res.json();
}

export async function fetchTopPerformers(): Promise<{
  gainers: TopPerformer[];
  losers: TopPerformer[];
  strongBuys: TopPerformer[];
}> {
  const res = await fetch(`${BASE}/api/stocks/top-performers`);
  if (!res.ok) throw new Error("Failed to fetch top performers");
  return res.json();
}

export async function fetchStockDetail(symbol: string): Promise<StockDetail> {
  const res = await fetch(`${BASE}/api/stocks/${symbol}`);
  if (!res.ok) throw new Error("Failed to fetch stock detail");
  return res.json();
}

export async function fetchStats(): Promise<{
  total: number;
  buys: number;
  sells: number;
  holds: number;
  lastUpdate: string | null;
}> {
  const res = await fetch(`${BASE}/api/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchSymbols(): Promise<string[]> {
  const res = await fetch(`${BASE}/api/symbols`);
  if (!res.ok) throw new Error("Failed to fetch symbols");
  return res.json();
}

export async function fetchDataRange(): Promise<{
  minDate: string | null;
  maxDate: string | null;
  symbolCount: number;
  totalBars: number;
}> {
  const res = await fetch(`${BASE}/api/data-range`);
  if (!res.ok) throw new Error("Failed to fetch data range");
  return res.json();
}

export async function runSimulation(request: SimulationRequest): Promise<SimulationResult> {
  const res = await fetch(`${BASE}/api/simulation/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Simulation failed" }));
    throw new Error(err.error || "Simulation failed");
  }
  return res.json();
}

export async function compareStrategies(request: CompareRequest): Promise<StrategyComparison> {
  const res = await fetch(`${BASE}/api/simulation/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Comparison failed" }));
    throw new Error(err.error || "Comparison failed");
  }
  return res.json();
}

export async function analyzeMarketConditions(request: MarketConditionsRequest): Promise<MarketConditionResult[]> {
  const res = await fetch(`${BASE}/api/simulation/market-conditions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Analysis failed" }));
    throw new Error(err.error || "Analysis failed");
  }
  return res.json();
}
