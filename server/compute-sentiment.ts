/**
 * Aggregates market_news into per-symbol, per-day sentiment_scores using the
 * keyword-lexicon scorer in server/sentiment.ts. Safe to run with an empty
 * market_news table (just does nothing) — rerun after server/news.ts's scraper
 * has populated news so sentiment stays current.
 *
 * Importable (used by server/update.ts) or runnable directly: `npm run compute-sentiment`.
 */
import { pool } from "./db";
import { aggregateSentiment, type NewsRow } from "./sentiment";

export async function computeSentimentScores(): Promise<{ written: number }> {
  const client = await pool.connect();

  try {
    const { rows } = await client.query<NewsRow>(
      `SELECT title, score, asset_type, mentioned_symbols, fetched_at FROM market_news`
    );

    if (rows.length === 0) {
      console.log("[Sentiment] No market_news rows yet — nothing to aggregate. Run the news scraper first.");
      return { written: 0 };
    }

    const aggregated = aggregateSentiment(rows);
    console.log(`[Sentiment] Aggregated ${rows.length} news rows into ${aggregated.length} symbol/day buckets`);

    let written = 0;
    for (const a of aggregated) {
      await client.query(
        `INSERT INTO sentiment_scores (symbol, asset_type, date, source, sentiment_score, mention_count, sample_headline, computed_at)
         VALUES ($1,$2,$3,'reddit_lexicon',$4,$5,$6,NOW())
         ON CONFLICT (symbol, asset_type, date, source) DO UPDATE SET
           sentiment_score=$4, mention_count=$5, sample_headline=$6, computed_at=NOW()`,
        [a.symbol, a.assetType, a.date, a.sentimentScore, a.mentionCount, a.sampleHeadline]
      );
      written++;
    }

    console.log(`[Sentiment] Done: ${written} sentiment rows written`);
    return { written };
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  import("./db").then(({ initDB }) => initDB())
    .then(() => computeSentimentScores())
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
