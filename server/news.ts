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

async function fetchSubredditPullPush(subreddit: string, limit: number = 50): Promise<any[]> {
  try {
    const url = `https://api.pullpush.io/reddit/search/submission/?subreddit=${subreddit}&sort=score&sort_type=desc&size=${limit}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      headers: { "User-Agent": "MATEO-MarketTerminal/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`PullPush returned ${res.status} for r/${subreddit}`);
      return [];
    }
    const data = await res.json();
    return data?.data || [];
  } catch (err: any) {
    console.log(`PullPush fetch failed for r/${subreddit}: ${err.message}`);
    return [];
  }
}

async function fetchSubredditReddit(subreddit: string, limit: number = 25): Promise<any[]> {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}&raw_json=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      headers: { "User-Agent": "MATEO-MarketTerminal/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data?.children || []).map((c: any) => ({
      ...c.data,
      num_comments: c.data.num_comments || 0,
      score: c.data.score || 0,
    }));
  } catch {
    return [];
  }
}

export async function scrapeAndCacheNews(): Promise<number> {
  let totalInserted = 0;

  for (const sub of SUBREDDITS) {
    let posts = await fetchSubredditReddit(sub.name, 25);

    if (posts.length === 0) {
      console.log(`Reddit blocked for r/${sub.name}, falling back to PullPush...`);
      posts = await fetchSubredditPullPush(sub.name, 50);
    }

    console.log(`r/${sub.name}: fetched ${posts.length} posts`);

    for (const post of posts) {
      if (post.stickied) continue;
      const title = post.title;
      if (!title) continue;

      const { sector, assetType, symbols } = classifyPost(title, sub.name);
      const permalink = post.permalink || "";
      const url = permalink.startsWith("http")
        ? permalink
        : permalink
          ? `https://reddit.com${permalink}`
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
            title.slice(0, 500),
            url,
            post.author || "",
            post.score || 0,
            post.num_comments || 0,
            post.link_flair_text || post.link_flair_richtext?.[0]?.t || "",
            sector,
            assetType,
            symbols.join(","),
          ]
        );
        if (insertResult.rowCount && insertResult.rowCount > 0) totalInserted++;
      } catch (err: any) {
        console.log(`Insert error for "${title.slice(0, 40)}": ${err.message}`);
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
  const allNews = await pool.query(
    `SELECT * FROM market_news ORDER BY score DESC LIMIT 200`
  );

  const posts = allNews.rows;
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
    return t.includes("bull") || t.includes("moon") || t.includes("buy") || t.includes("calls") || t.includes("rocket") || t.includes("squeeze") || t.includes("yolo") || t.includes("to the moon") || t.includes("gain");
  }).length;
  const bearish = posts.filter(p => {
    const t = p.title.toLowerCase();
    return t.includes("bear") || t.includes("crash") || t.includes("sell") || t.includes("puts") || t.includes("short") || t.includes("dump") || t.includes("loss") || t.includes("recession");
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
