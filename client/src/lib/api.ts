import type { StockAnalysis, StockDetail, TopPerformer } from "../../src/lib/types";

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
