// Lightweight bullish/bearish keyword-lexicon sentiment scorer over market_news.
// No external API key required — reuses the Reddit scraping already done by
// news.ts. Scores are intentionally simple (word-count based) so they're easy to
// reason about; source is tagged 'reddit_lexicon' in sentiment_scores so a real
// NLP/sentiment API can be added alongside later without a schema change.

const BULLISH_WORDS = [
  "bull", "bullish", "moon", "mooning", "buy", "buying", "calls", "rocket", "squeeze",
  "yolo", "to the moon", "gain", "gains", "rally", "breakout", "upgrade", "beat",
  "beats", "surge", "soar", "outperform", "strong buy", "long",
];

const BEARISH_WORDS = [
  "bear", "bearish", "crash", "crashing", "sell", "selling", "puts", "short", "shorting",
  "dump", "dumping", "loss", "losses", "recession", "downgrade", "miss", "misses",
  "plunge", "tank", "tanking", "underperform", "strong sell", "bankruptcy",
];

/** Returns a score in [-1, 1]: positive = bullish, negative = bearish, 0 = neutral. */
export function scoreHeadline(title: string): number {
  const lower = title.toLowerCase();
  let bullishHits = 0;
  let bearishHits = 0;
  for (const w of BULLISH_WORDS) if (lower.includes(w)) bullishHits++;
  for (const w of BEARISH_WORDS) if (lower.includes(w)) bearishHits++;
  const total = bullishHits + bearishHits;
  if (total === 0) return 0;
  return (bullishHits - bearishHits) / total;
}

export interface NewsRow {
  title: string;
  score: number;
  asset_type: string;
  mentioned_symbols: string;
  fetched_at: Date | string;
}

export interface AggregatedSentiment {
  symbol: string;
  assetType: string;
  date: string;
  sentimentScore: number;
  mentionCount: number;
  sampleHeadline: string;
}

/** Aggregates per (symbol, asset_type, date): mention-weighted average sentiment,
 *  using each post's Reddit score as a naive confidence weight (a post with more
 *  upvotes counts for more), with the top-scoring post's title kept as the
 *  representative sample for tooltips. */
export function aggregateSentiment(rows: NewsRow[]): AggregatedSentiment[] {
  interface Bucket {
    symbol: string;
    assetType: string;
    date: string;
    weightedSum: number;
    weightTotal: number;
    mentionCount: number;
    topScore: number;
    sampleHeadline: string;
  }
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    if (!row.mentioned_symbols) continue;
    const date = (row.fetched_at instanceof Date ? row.fetched_at : new Date(row.fetched_at))
      .toISOString().split("T")[0];
    const symbols = row.mentioned_symbols.split(",").map(s => s.trim()).filter(Boolean);
    if (symbols.length === 0) continue;

    const postScore = scoreHeadline(row.title);
    const weight = Math.max(1, row.score || 1);

    for (const symbol of symbols) {
      const key = `${symbol}:${row.asset_type || "stock"}:${date}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          symbol, assetType: row.asset_type || "stock", date,
          weightedSum: 0, weightTotal: 0, mentionCount: 0, topScore: -Infinity, sampleHeadline: "",
        };
        buckets.set(key, bucket);
      }
      bucket.weightedSum += postScore * weight;
      bucket.weightTotal += weight;
      bucket.mentionCount++;
      if ((row.score || 0) > bucket.topScore) {
        bucket.topScore = row.score || 0;
        bucket.sampleHeadline = row.title;
      }
    }
  }

  return Array.from(buckets.values()).map(b => ({
    symbol: b.symbol,
    assetType: b.assetType,
    date: b.date,
    sentimentScore: b.weightTotal > 0 ? b.weightedSum / b.weightTotal : 0,
    mentionCount: b.mentionCount,
    sampleHeadline: b.sampleHeadline,
  }));
}
