import type { StockAnalysis, StockDetail, TopPerformer, SimulationResult, SimulationRequest, CompareRequest, MarketConditionsRequest, StrategyComparison, MarketConditionResult } from "../../../shared/types";

const BASE = "";

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

export interface SignalAlert {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  signal: "BUY" | "SELL" | "HOLD";
  price: number;
  changePercent: number;
  lastSignalChange: string;
  daysSinceChange: number;
  signalChanges: number;
  dataPoints: number;
  avgDaysBetweenChanges: number;
  alertScore: number;
}

export async function fetchSignalAlerts(assetType?: string): Promise<SignalAlert[]> {
  const qs = new URLSearchParams();
  if (assetType) qs.set("asset_type", assetType);
  const res = await fetch(`${BASE}/api/stocks/signal-alerts?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch signal alerts");
  return res.json();
}

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

export async function fetchRecap(type: "daily" | "weekly" | "monthly"): Promise<any> {
  const res = await fetch(`${BASE}/api/predictions/recap/${type}`);
  if (!res.ok) throw new Error("Failed to fetch recap");
  return res.json();
}

export async function fetchAlgorithmVersions(): Promise<any[]> {
  const res = await fetch(`${BASE}/api/algorithm/versions`);
  if (!res.ok) throw new Error("Failed to fetch algorithm versions");
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

export async function fetchNews(filters?: {
  asset_type?: string;
  sector?: string;
  source?: string;
  limit?: number;
}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (filters?.asset_type) qs.set("asset_type", filters.asset_type);
  if (filters?.sector) qs.set("sector", filters.sector);
  if (filters?.source) qs.set("source", filters.source);
  if (filters?.limit) qs.set("limit", String(filters.limit));
  const res = await fetch(`${BASE}/api/news?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch news");
  return res.json();
}

export async function fetchNewsSummary(): Promise<{
  totalPosts: number;
  topSubreddits: { subreddit: string; count: number }[];
  hotTopics: { title: string; score: number; subreddit: string; url: string }[];
  mentionedSymbols: { symbol: string; count: number }[];
  sentiment: string;
}> {
  const res = await fetch(`${BASE}/api/news/summary`);
  if (!res.ok) throw new Error("Failed to fetch news summary");
  return res.json();
}

export async function refreshNews(): Promise<{ inserted: number; message: string }> {
  const res = await fetch(`${BASE}/api/news/refresh`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to refresh news");
  return res.json();
}

export async function generatePredictions(): Promise<{ generated: number }> {
  const res = await fetch(`${BASE}/api/predictions/generate`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to generate predictions");
  return res.json();
}

export async function fetchPaperMoneySignals(symbols: string[]): Promise<{
  symbol: string;
  signal: string;
  price: number;
  change_percent: number;
  rsi: number;
  macd_histogram: number;
}[]> {
  if (symbols.length === 0) return [];
  const res = await fetch(`${BASE}/api/paper-money/signals?symbols=${symbols.join(",")}`);
  if (!res.ok) throw new Error("Failed to fetch paper money signals");
  return res.json();
}
