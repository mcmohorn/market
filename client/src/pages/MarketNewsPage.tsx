import { useState, useEffect, useCallback } from "react";
import { fetchNews, fetchNewsSummary, refreshNews } from "../lib/api";

interface NewsItem {
  id: number;
  source: string;
  subreddit: string;
  title: string;
  url: string;
  author: string;
  score: number;
  num_comments: number;
  flair: string;
  sector: string;
  asset_type: string;
  mentioned_symbols: string;
  fetched_at: string;
}

interface NewsSummary {
  totalPosts: number;
  topSubreddits: { subreddit: string; count: number }[];
  hotTopics: { title: string; score: number; subreddit: string; url: string }[];
  mentionedSymbols: { symbol: string; count: number }[];
  sentiment: string;
}

const SOURCES = [
  { value: "", label: "All Sources" },
  { value: "wallstreetbets", label: "r/wallstreetbets" },
  { value: "stocks", label: "r/stocks" },
  { value: "cryptocurrency", label: "r/cryptocurrency" },
  { value: "investing", label: "r/investing" },
  { value: "options", label: "r/options" },
];

const ASSET_TYPES = [
  { value: "", label: "All Assets" },
  { value: "stock", label: "Stocks" },
  { value: "crypto", label: "Crypto" },
];

const SECTORS = [
  { value: "", label: "All Sectors" },
  { value: "Technology", label: "Technology" },
  { value: "Healthcare", label: "Healthcare" },
  { value: "Finance", label: "Finance" },
  { value: "Energy", label: "Energy" },
  { value: "Consumer Discretionary", label: "Consumer" },
  { value: "Real Estate", label: "Real Estate" },
];

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function getSentimentColor(sentiment: string): string {
  if (sentiment === "BULLISH") return "text-cyber-green";
  if (sentiment === "BEARISH") return "text-cyber-red";
  return "text-cyber-yellow";
}

function getSentimentGlow(sentiment: string): string {
  if (sentiment === "BULLISH") return "shadow-[0_0_15px_rgba(0,255,136,0.3)]";
  if (sentiment === "BEARISH") return "shadow-[0_0_15px_rgba(255,51,102,0.3)]";
  return "shadow-[0_0_15px_rgba(255,204,0,0.3)]";
}

function getSubredditColor(sub: string): string {
  const colors: Record<string, string> = {
    wallstreetbets: "bg-cyber-yellow/20 text-cyber-yellow border-cyber-yellow/30",
    stocks: "bg-cyber-green/20 text-cyber-green border-cyber-green/30",
    cryptocurrency: "bg-cyber-blue/20 text-cyber-blue border-cyber-blue/30",
    investing: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    options: "bg-cyber-red/20 text-cyber-red border-cyber-red/30",
  };
  return colors[sub] || "bg-cyber-muted/20 text-cyber-muted border-cyber-muted/30";
}

export default function MarketNewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [summary, setSummary] = useState<NewsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState("");
  const [assetFilter, setAssetFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [newsData, summaryData] = await Promise.all([
        fetchNews({
          source: sourceFilter || undefined,
          asset_type: assetFilter || undefined,
          sector: sectorFilter || undefined,
          limit: 100,
        }),
        fetchNewsSummary(),
      ]);
      setNews(newsData);
      setSummary(summaryData);
    } catch (err: any) {
      setError(err.message || "Failed to load news");
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, assetFilter, sectorFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshNews();
      await loadData();
    } catch {
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-4">
      {summary && (
        <div className={`border border-cyber-border rounded-lg bg-cyber-panel/60 p-4 ${getSentimentGlow(summary.sentiment)}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="text-cyber-green text-sm font-mono uppercase tracking-widest">
                &#x2F;&#x2F; Internet Noise Summary
              </div>
              <div className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border ${
                summary.sentiment === "BULLISH"
                  ? "bg-cyber-green/10 text-cyber-green border-cyber-green/30"
                  : summary.sentiment === "BEARISH"
                  ? "bg-cyber-red/10 text-cyber-red border-cyber-red/30"
                  : "bg-cyber-yellow/10 text-cyber-yellow border-cyber-yellow/30"
              }`}>
                {summary.sentiment}
              </div>
            </div>
            <div className="text-cyber-muted text-xs font-mono">
              {summary.totalPosts} posts tracked
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-cyber-border/50 rounded bg-cyber-bg/50 p-3">
              <div className="text-[10px] text-cyber-muted uppercase tracking-widest mb-2">
                Top Subreddits
              </div>
              <div className="space-y-1">
                {summary.topSubreddits.slice(0, 5).map((s) => (
                  <div key={s.subreddit} className="flex items-center justify-between">
                    <span className="text-xs text-cyber-text font-mono">r/{s.subreddit}</span>
                    <span className="text-xs text-cyber-green font-mono">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-cyber-border/50 rounded bg-cyber-bg/50 p-3">
              <div className="text-[10px] text-cyber-muted uppercase tracking-widest mb-2">
                Trending Tickers
              </div>
              <div className="flex flex-wrap gap-1">
                {summary.mentionedSymbols.slice(0, 12).map((s) => (
                  <span
                    key={s.symbol}
                    className="px-2 py-0.5 bg-cyber-green/10 border border-cyber-green/20 rounded text-[11px] text-cyber-green font-mono"
                  >
                    ${s.symbol}
                    <span className="text-cyber-muted ml-1">x{s.count}</span>
                  </span>
                ))}
                {summary.mentionedSymbols.length === 0 && (
                  <span className="text-xs text-cyber-muted">No tickers detected</span>
                )}
              </div>
            </div>

            <div className="border border-cyber-border/50 rounded bg-cyber-bg/50 p-3">
              <div className="text-[10px] text-cyber-muted uppercase tracking-widest mb-2">
                Sentiment Analysis
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-3xl font-bold font-mono ${getSentimentColor(summary.sentiment)}`}>
                  {summary.sentiment}
                </div>
              </div>
              <div className="mt-2 text-[10px] text-cyber-muted">
                Based on keyword analysis of {summary.totalPosts} community posts
              </div>
            </div>
          </div>

          {summary.hotTopics.length > 0 && (
            <div className="mt-4 border border-cyber-border/50 rounded bg-cyber-bg/50 p-3">
              <div className="text-[10px] text-cyber-muted uppercase tracking-widest mb-2">
                Hot Topics
              </div>
              <div className="space-y-1">
                {summary.hotTopics.slice(0, 5).map((topic, i) => (
                  <a
                    key={i}
                    href={topic.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 group"
                  >
                    <span className="text-cyber-green font-mono text-[10px] w-8 text-right">
                      {topic.score}
                    </span>
                    <span className="text-xs text-cyber-text group-hover:text-cyber-green transition-colors truncate flex-1">
                      {topic.title}
                    </span>
                    <span className="text-[10px] text-cyber-muted font-mono">
                      r/{topic.subreddit}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-cyber-bg border border-cyber-border rounded px-3 py-1.5 text-xs text-cyber-text font-mono focus:outline-none focus:border-cyber-green/50"
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className="bg-cyber-bg border border-cyber-border rounded px-3 py-1.5 text-xs text-cyber-text font-mono focus:outline-none focus:border-cyber-green/50"
          >
            {ASSET_TYPES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="bg-cyber-bg border border-cyber-border rounded px-3 py-1.5 text-xs text-cyber-text font-mono focus:outline-none focus:border-cyber-green/50"
          >
            {SECTORS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-1.5 bg-cyber-green/10 border border-cyber-green/30 rounded text-xs text-cyber-green font-mono uppercase tracking-wider hover:bg-cyber-green/20 disabled:opacity-50 transition-all"
        >
          {refreshing ? "Scraping..." : "Refresh Feed"}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-cyber-green font-mono text-sm animate-pulse">
            [ SCANNING COMMUNITY FEEDS... ]
          </div>
        </div>
      )}

      {error && (
        <div className="border border-cyber-red/30 bg-cyber-red/5 rounded-lg p-4 text-center">
          <div className="text-cyber-red text-sm font-mono">{error}</div>
          <button
            onClick={loadData}
            className="mt-2 text-xs text-cyber-muted hover:text-cyber-green font-mono"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && news.length === 0 && (
        <div className="border border-cyber-border rounded-lg bg-cyber-panel/40 p-12 text-center">
          <div className="text-cyber-muted text-sm font-mono mb-2">No news data available</div>
          <div className="text-cyber-muted text-xs font-mono mb-4">
            Click "Refresh Feed" to scrape the latest community posts
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-6 py-2 bg-cyber-green/10 border border-cyber-green/30 rounded text-xs text-cyber-green font-mono uppercase tracking-wider hover:bg-cyber-green/20 disabled:opacity-50"
          >
            {refreshing ? "Scraping..." : "Scrape Now"}
          </button>
        </div>
      )}

      {!loading && news.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {news.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-cyber-border rounded-lg bg-cyber-panel/40 p-4 hover:border-cyber-green/40 hover:bg-cyber-panel/60 transition-all group block"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${getSubredditColor(item.subreddit)}`}
                >
                  r/{item.subreddit}
                </span>
                <span className="text-[10px] text-cyber-muted font-mono whitespace-nowrap">
                  {timeAgo(item.fetched_at)}
                </span>
              </div>

              <h3 className="text-sm text-cyber-text group-hover:text-cyber-green transition-colors mb-3 line-clamp-2 leading-relaxed">
                {item.title}
              </h3>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-cyber-green font-mono flex items-center gap-1">
                    <span className="opacity-60">&#9650;</span> {item.score}
                  </span>
                  <span className="text-[10px] text-cyber-muted font-mono flex items-center gap-1">
                    <span className="opacity-60">&#9776;</span> {item.num_comments}
                  </span>
                  {item.author && (
                    <span className="text-[10px] text-cyber-muted font-mono">
                      u/{item.author}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {item.asset_type && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase ${
                      item.asset_type === "crypto"
                        ? "bg-cyber-blue/10 text-cyber-blue"
                        : "bg-cyber-green/10 text-cyber-green"
                    }`}>
                      {item.asset_type}
                    </span>
                  )}
                  {item.sector && (
                    <span className="px-1.5 py-0.5 rounded bg-cyber-muted/10 text-[9px] text-cyber-muted font-mono">
                      {item.sector}
                    </span>
                  )}
                </div>
              </div>

              {item.mentioned_symbols && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.mentioned_symbols.split(",").filter(Boolean).map((sym) => (
                    <span
                      key={sym}
                      className="px-1.5 py-0.5 bg-cyber-green/5 border border-cyber-green/15 rounded text-[10px] text-cyber-green font-mono"
                    >
                      ${sym}
                    </span>
                  ))}
                </div>
              )}

              {item.flair && (
                <div className="mt-2">
                  <span className="px-2 py-0.5 bg-cyber-panel border border-cyber-border/50 rounded text-[9px] text-cyber-muted font-mono">
                    {item.flair}
                  </span>
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
