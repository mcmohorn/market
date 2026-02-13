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
        symbol VARCHAR(20) NOT NULL UNIQUE,
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
        asset_type VARCHAR(20) DEFAULT 'stock',
        UNIQUE(symbol, date)
      );

      CREATE INDEX IF NOT EXISTS idx_price_history_symbol ON price_history(symbol);
      CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date);
      CREATE INDEX IF NOT EXISTS idx_price_history_symbol_date ON price_history(symbol, date);

      CREATE TABLE IF NOT EXISTS computed_signals (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL UNIQUE,
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

      CREATE INDEX IF NOT EXISTS idx_computed_signals_signal ON computed_signals(signal);
      CREATE INDEX IF NOT EXISTS idx_computed_signals_change ON computed_signals(change_percent);
    `);
    console.log("Database tables initialized");
  } finally {
    client.release();
  }
}

export { pool };
