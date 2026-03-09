import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS stocks (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        name VARCHAR(255) DEFAULT '',
        exchange VARCHAR(50) DEFAULT '',
        sector VARCHAR(100) DEFAULT '',
        asset_type VARCHAR(20) DEFAULT 'stock',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        date DATE NOT NULL,
        open DOUBLE PRECISION,
        high DOUBLE PRECISION,
        low DOUBLE PRECISION,
        close DOUBLE PRECISION,
        volume BIGINT,
        asset_type VARCHAR(20) DEFAULT 'stock'
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_symbol_asset ON stocks(symbol, asset_type);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_price_history_symbol_date_asset ON price_history(symbol, date, asset_type);
      CREATE INDEX IF NOT EXISTS idx_price_history_symbol ON price_history(symbol);
      CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date);
      CREATE INDEX IF NOT EXISTS idx_price_history_asset ON price_history(asset_type);

      CREATE TABLE IF NOT EXISTS computed_signals (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        name VARCHAR(255) DEFAULT '',
        exchange VARCHAR(50) DEFAULT '',
        sector VARCHAR(100) DEFAULT '',
        asset_type VARCHAR(20) DEFAULT 'stock',
        price DOUBLE PRECISION,
        change_val DOUBLE PRECISION DEFAULT 0,
        change_percent DOUBLE PRECISION DEFAULT 0,
        signal VARCHAR(10) DEFAULT 'HOLD',
        macd_histogram DOUBLE PRECISION DEFAULT 0,
        macd_histogram_adjusted DOUBLE PRECISION DEFAULT 0,
        rsi DOUBLE PRECISION DEFAULT 0,
        signal_strength DOUBLE PRECISION DEFAULT 0,
        last_signal_change VARCHAR(20) DEFAULT '',
        signal_changes INT DEFAULT 0,
        data_points INT DEFAULT 0,
        volume BIGINT DEFAULT 0,
        computed_at TIMESTAMP DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_computed_signals_symbol_asset ON computed_signals(symbol, asset_type);
      CREATE INDEX IF NOT EXISTS idx_computed_signals_signal ON computed_signals(signal);
      CREATE INDEX IF NOT EXISTS idx_computed_signals_change ON computed_signals(change_percent);
      CREATE INDEX IF NOT EXISTS idx_computed_signals_asset ON computed_signals(asset_type);
      CREATE INDEX IF NOT EXISTS idx_price_history_asset_date ON price_history(asset_type, date);
      CREATE INDEX IF NOT EXISTS idx_price_history_symbol_asset_date ON price_history(symbol, asset_type, date);

      CREATE TABLE IF NOT EXISTS predictions (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        asset_type VARCHAR(20) DEFAULT 'stock',
        predicted_signal VARCHAR(10) NOT NULL,
        predicted_date DATE NOT NULL,
        predicted_price DOUBLE PRECISION,
        actual_signal VARCHAR(10),
        actual_price DOUBLE PRECISION,
        correct BOOLEAN,
        algorithm_version INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(predicted_date);
      CREATE INDEX IF NOT EXISTS idx_predictions_version ON predictions(algorithm_version);
      CREATE INDEX IF NOT EXISTS idx_predictions_symbol ON predictions(symbol);

      CREATE TABLE IF NOT EXISTS algorithm_versions (
        id SERIAL PRIMARY KEY,
        version_num INT NOT NULL UNIQUE,
        params JSONB NOT NULL,
        accuracy_pct DOUBLE PRECISION DEFAULT 0,
        total_predictions INT DEFAULT 0,
        correct_predictions INT DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS market_news (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50) NOT NULL,
        subreddit VARCHAR(50) DEFAULT '',
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        author VARCHAR(100) DEFAULT '',
        score INT DEFAULT 0,
        num_comments INT DEFAULT 0,
        flair VARCHAR(100) DEFAULT '',
        sector VARCHAR(100) DEFAULT '',
        asset_type VARCHAR(20) DEFAULT '',
        mentioned_symbols TEXT DEFAULT '',
        fetched_at TIMESTAMP DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_market_news_unique ON market_news(subreddit, title, author);
      CREATE INDEX IF NOT EXISTS idx_market_news_fetched ON market_news(fetched_at);
      CREATE INDEX IF NOT EXISTS idx_market_news_source ON market_news(source);

      CREATE TABLE IF NOT EXISTS daily_recaps (
        id SERIAL PRIMARY KEY,
        recap_date DATE NOT NULL,
        recap_type VARCHAR(20) NOT NULL,
        top_movers JSONB DEFAULT '[]',
        signal_changes JSONB DEFAULT '[]',
        prediction_accuracy JSONB DEFAULT '{}',
        algorithm_version INT DEFAULT 1,
        summary TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_daily_recaps_date ON daily_recaps(recap_date);
      CREATE INDEX IF NOT EXISTS idx_daily_recaps_type ON daily_recaps(recap_type);
    `);
    console.log("Database tables initialized");
  } finally {
    client.release();
  }
}

export { pool };
