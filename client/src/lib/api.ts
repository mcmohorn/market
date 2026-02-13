import type { StockAnalysis, StockDetail, TopPerformer, SimulationResult, SimulationRequest, CompareRequest, MarketConditionsRequest, StrategyComparison, MarketConditionResult } from "../../../shared/types";

const BASE = "";

export async function fetchSectors(assetType?: string): Promise<string[]> {
  const qs = new URLSearchParams();
  if (assetType) qs.set("asset_type", assetType);
  const res = await fetch(`${BASE}/api/sectors?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch sectors");
  return res.json();
}

export async function fetchStocks(params: {
  signal?: string;
  sort?: string;
  order?: string;
  search?: string;
  limit?: number;
  offset?: number;
  asset_type?: string;
  as_of_date?: string;
  sector?: string;
}): Promise<{ data: StockAnalysis[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.signal) qs.set("signal", params.signal);
  if (params.sort) qs.set("sort", params.sort);
  if (params.order) qs.set("order", params.order);
  if (params.search) qs.set("search", params.search);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  if (params.asset_type) qs.set("asset_type", params.asset_type);
  if (params.as_of_date) qs.set("as_of_date", params.as_of_date);
  if (params.sector && params.sector !== "ALL") qs.set("sector", params.sector);

  const res = await fetch(`${BASE}/api/stocks?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch stocks");
  return res.json();
}

export async function fetchTopPerformers(assetType?: string, asOfDate?: string): Promise<{
  gainers: TopPerformer[];
  losers: TopPerformer[];
  strongBuys: TopPerformer[];
}> {
  const qs = new URLSearchParams();
  if (assetType) qs.set("asset_type", assetType);
  if (asOfDate) qs.set("as_of_date", asOfDate);
  const res = await fetch(`${BASE}/api/stocks/top-performers?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch top performers");
  return res.json();
}

export async function fetchStockDetail(symbol: string): Promise<StockDetail> {
  const res = await fetch(`${BASE}/api/stocks/${symbol}`);
  if (!res.ok) throw new Error("Failed to fetch stock detail");
  return res.json();
}

export async function fetchStats(assetType?: string): Promise<{
  total: number;
  buys: number;
  sells: number;
  holds: number;
  lastUpdate: string | null;
}> {
  const qs = new URLSearchParams();
  if (assetType) qs.set("asset_type", assetType);
  const res = await fetch(`${BASE}/api/stats?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchSymbols(assetType?: string): Promise<string[]> {
  const qs = new URLSearchParams();
  if (assetType) qs.set("asset_type", assetType);
  const res = await fetch(`${BASE}/api/symbols?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch symbols");
  return res.json();
}

export async function fetchDataRange(assetType?: string): Promise<{
  minDate: string | null;
  maxDate: string | null;
  symbolCount: number;
  totalBars: number;
}> {
  const qs = new URLSearchParams();
  if (assetType) qs.set("asset_type", assetType);
  const res = await fetch(`${BASE}/api/data-range?${qs.toString()}`);
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
