import { pool } from "./db";

const SUBREDDITS = [
  { name: "wallstreetbets", label: "WSB" },
  { name: "stocks", label: "Stocks" },
  { name: "cryptocurrency", label: "Crypto" },
  { name: "investing", label: "Investing" },
  { name: "options", label: "Options" },
];

const CRYPTO_SYMBOLS = new Set([
  "BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "DOT", "AVAX", "MATIC", "LINK",
  "UNI", "AAVE", "ATOM", "NEAR", "FTM", "ALGO", "LTC", "BCH", "SHIB", "PEPE",
]);

const SECTOR_KEYWORDS: Record<string, string[]> = {
  Technology: ["tech", "software", "ai", "semiconductor", "chip", "cloud", "saas", "nvidia", "nvda", "aapl", "apple", "msft", "microsoft", "google", "goog", "meta", "amzn", "amazon", "tsla", "tesla"],
  Healthcare: ["pharma", "biotech", "drug", "fda", "health", "medical", "vaccine"],
  Finance: ["bank", "jpmorgan", "goldman", "finance", "interest rate", "fed", "treasury"],
  Energy: ["oil", "gas", "energy", "solar", "wind", "renewable", "opec"],
  "Consumer Discretionary": ["retail", "consumer", "shopping", "e-commerce"],
  "Real Estate": ["real estate", "housing", "mortgage", "reit"],
};

function classifyPost(title: string, subreddit: string): { sector: string; assetType: string; symbols: string[] } {
  const lower = title.toLowerCase();
  const symbols: string[] = [];
  const tickerRegex = /\$([A-Z]{1,5})\b/g;
  let match;
  while ((match = tickerRegex.exec(title)) !== null) {
    symbols.push(match[1]);
  }

  let assetType = "";
  if (subreddit === "cryptocurrency" || symbols.some(s => CRYPTO_SYMBOLS.has(s))) {
    assetType = "crypto";
  } else if (symbols.length > 0 || subreddit === "stocks" || subreddit === "options") {
    assetType = "stock";
  }

  let sector = "";
  for (const [sectorName, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      sector = sectorName;
      break;
    }
  }

  return { sector, assetType, symbols };
}

async function fetchSubreddit(subreddit: string, sort: string = "hot", limit: number = 25): Promise<any[]> {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&raw_json=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "MATEO-MarketTerminal/1.0",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data?.children?.map((c: any) => c.data) || [];
  } catch {
    return [];
  }
}

export async function scrapeAndCacheNews(): Promise<number> {
  let totalInserted = 0;

  for (const sub of SUBREDDITS) {
    const posts = await fetchSubreddit(sub.name, "hot", 25);

    for (const post of posts) {
      if (post.stickied || post.is_self === false && !post.url) continue;

      const { sector, assetType, symbols } = classifyPost(post.title, sub.name);
      const url = post.permalink
        ? `https://reddit.com${post.permalink}`
        : post.url || "";

      try {
        const insertResult = await pool.query(
          `INSERT INTO market_news (source, subreddit, title, url, author, score, num_comments, flair, sector, asset_type, mentioned_symbols)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (subreddit, title, author) DO UPDATE SET score = EXCLUDED.score, num_comments = EXCLUDED.num_comments, fetched_at = NOW()
           RETURNING id`,
          [
            "reddit",
            sub.name,
            post.title,
            url,
            post.author || "",
            post.score || 0,
            post.num_comments || 0,
            post.link_flair_text || "",
            sector,
            assetType,
            symbols.join(","),
          ]
        );
        if (insertResult.rowCount && insertResult.rowCount > 0) totalInserted++;
      } catch {
      }
    }
  }

  return totalInserted;
}

export async function getNews(filters: {
  assetType?: string;
  sector?: string;
  source?: string;
  limit?: number;
  hoursAgo?: number;
}): Promise<any[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters.assetType) {
    conditions.push(`asset_type = $${idx++}`);
    params.push(filters.assetType);
  }
  if (filters.sector) {
    conditions.push(`sector ILIKE $${idx++}`);
    params.push(`%${filters.sector}%`);
  }
  if (filters.source) {
    conditions.push(`subreddit = $${idx++}`);
    params.push(filters.source);
  }
  if (filters.hoursAgo) {
    conditions.push(`fetched_at > NOW() - INTERVAL '${filters.hoursAgo} hours'`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit || 50;

  const result = await pool.query(
    `SELECT * FROM market_news ${where} ORDER BY score DESC, fetched_at DESC LIMIT $${idx}`,
    [...params, limit]
  );
  return result.rows;
}

export async function getNewsSummary(): Promise<{
  totalPosts: number;
  topSubreddits: { subreddit: string; count: number }[];
  hotTopics: { title: string; score: number; subreddit: string; url: string }[];
  mentionedSymbols: { symbol: string; count: number }[];
  sentiment: string;
}> {
  const last24h = await pool.query(
    `SELECT * FROM market_news WHERE fetched_at > NOW() - INTERVAL '24 hours' ORDER BY score DESC`
  );

  const posts = last24h.rows;
  const subCounts: Record<string, number> = {};
  const symbolCounts: Record<string, number> = {};

  for (const post of posts) {
    subCounts[post.subreddit] = (subCounts[post.subreddit] || 0) + 1;
    if (post.mentioned_symbols) {
      for (const sym of post.mentioned_symbols.split(",")) {
        if (sym) symbolCounts[sym] = (symbolCounts[sym] || 0) + 1;
      }
    }
  }

  const topSubreddits = Object.entries(subCounts)
    .map(([subreddit, count]) => ({ subreddit, count }))
    .sort((a, b) => b.count - a.count);

  const hotTopics = posts.slice(0, 10).map(p => ({
    title: p.title,
    score: p.score,
    subreddit: p.subreddit,
    url: p.url,
  }));

  const mentionedSymbols = Object.entries(symbolCounts)
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const bullish = posts.filter(p => {
    const t = p.title.toLowerCase();
    return t.includes("bull") || t.includes("moon") || t.includes("buy") || t.includes("calls") || t.includes("rocket") || t.includes("squeeze");
  }).length;
  const bearish = posts.filter(p => {
    const t = p.title.toLowerCase();
    return t.includes("bear") || t.includes("crash") || t.includes("sell") || t.includes("puts") || t.includes("short") || t.includes("dump");
  }).length;

  let sentiment = "NEUTRAL";
  if (bullish > bearish * 1.5) sentiment = "BULLISH";
  else if (bearish > bullish * 1.5) sentiment = "BEARISH";

  return {
    totalPosts: posts.length,
    topSubreddits,
    hotTopics,
    mentionedSymbols,
    sentiment,
  };
}
