import{createRequire}from'module';const require=createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/db.ts
var db_exports = {};
__export(db_exports, {
  initDB: () => initDB,
  pool: () => pool
});
import pg from "pg";
async function initDB() {
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

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        display_name VARCHAR(255) DEFAULT '',
        account_type VARCHAR(20) DEFAULT 'free',
        notification_email_enabled BOOLEAN DEFAULT false,
        firebase_uid VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);

      CREATE TABLE IF NOT EXISTS watchlist (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        asset_type VARCHAR(20) DEFAULT 'stock',
        last_known_signal VARCHAR(10) DEFAULT '',
        added_at TIMESTAMP DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_user_symbol ON watchlist(user_id, symbol, asset_type);
      CREATE INDEX IF NOT EXISTS idx_watchlist_symbol ON watchlist(symbol);

      CREATE TABLE IF NOT EXISTS saved_simulations (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) DEFAULT '',
        asset_type VARCHAR(20) DEFAULT 'stock',
        params JSONB NOT NULL,
        result_summary JSONB DEFAULT '{}',
        start_date DATE,
        end_date DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_saved_sims_user ON saved_simulations(user_id);

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        asset_type VARCHAR(20) DEFAULT 'stock',
        message TEXT NOT NULL,
        signal_from VARCHAR(10) DEFAULT '',
        signal_to VARCHAR(10) DEFAULT '',
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);

      INSERT INTO users (email, display_name, account_type) VALUES
        ('mcmohorn@gmail.com', 'MC Mohorn', 'pro'),
        ('pbretts@yahoo.com', 'P Bretts', 'pro')
      ON CONFLICT (email) DO UPDATE SET account_type = 'pro';
    `);
    console.log("Database tables initialized");
  } finally {
    client.release();
  }
}
var pool;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
    });
  }
});

// server/update.ts
init_db();
import "dotenv/config";

// shared/indicators.ts
function calculateMACD(bars) {
  const m1 = 12;
  const m2 = 26;
  const m3 = 9;
  const a1 = 2 / (m1 + 1);
  const a2 = 2 / (m2 + 1);
  const a3 = 2 / (m3 + 1);
  const minDataPointsToBuy = 10;
  const results = [];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (i === 0) {
      results.push({
        emaFast: bar.close,
        emaSlow: bar.close,
        macdFast: 0,
        macdSlow: 0,
        macdHistogram: 0,
        macdHistogramAdjusted: 0,
        buySignal: false,
        rsi: 50,
        adx: 0,
        ma50: bar.close,
        bollingerBandwidth: 0,
        price: bar.close,
        date: bar.date
      });
    } else {
      const prev = results[i - 1];
      const emaFast = a1 * bar.close + (1 - a1) * prev.emaFast;
      const emaSlow = a2 * bar.close + (1 - a2) * prev.emaSlow;
      const macdFast = emaFast - emaSlow;
      const macdSlow = a3 * macdFast + (1 - a3) * prev.macdSlow;
      const diff = macdFast - macdSlow;
      const diffAdjusted = bar.close !== 0 ? diff / bar.close : 0;
      let buySignal = false;
      if (i > minDataPointsToBuy) {
        buySignal = macdFast > macdSlow;
      }
      results.push({
        emaFast,
        emaSlow,
        macdFast,
        macdSlow,
        macdHistogram: diff,
        macdHistogramAdjusted: diffAdjusted,
        buySignal,
        rsi: 50,
        adx: 0,
        ma50: bar.close,
        bollingerBandwidth: 0,
        price: bar.close,
        date: bar.date
      });
    }
  }
  return results;
}
function calculateRSI(indicators, bars) {
  const period = 14;
  if (bars.length < period + 1) return indicators;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  if (avgLoss === 0) {
    indicators[period].rsi = 100;
  } else {
    const rs = avgGain / avgLoss;
    indicators[period].rsi = 100 - 100 / (1 + rs);
  }
  for (let i = period + 1; i < bars.length; i++) {
    const change = bars[i].close - bars[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) {
      indicators[i].rsi = 100;
    } else {
      const rs = avgGain / avgLoss;
      indicators[i].rsi = 100 - 100 / (1 + rs);
    }
  }
  return indicators;
}
function calculateADX(indicators, bars) {
  const period = 14;
  if (bars.length < period * 2 + 1) return indicators;
  const trueRanges = [0];
  const plusDMs = [0];
  const minusDMs = [0];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const prevHigh = bars[i - 1].high;
    const prevLow = bars[i - 1].low;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    smoothTR += trueRanges[i];
    smoothPlusDM += plusDMs[i];
    smoothMinusDM += minusDMs[i];
  }
  const dxValues = [];
  const computeDX = (sTR, sPDM, sMDM) => {
    const plusDI = sTR > 0 ? sPDM / sTR * 100 : 0;
    const minusDI = sTR > 0 ? sMDM / sTR * 100 : 0;
    const diSum = plusDI + minusDI;
    return diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0;
  };
  dxValues.push(computeDX(smoothTR, smoothPlusDM, smoothMinusDM));
  for (let i = period + 1; i < bars.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trueRanges[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDMs[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDMs[i];
    dxValues.push(computeDX(smoothTR, smoothPlusDM, smoothMinusDM));
    if (dxValues.length === period) {
      const adx = dxValues.reduce((s, v) => s + v, 0) / period;
      indicators[i].adx = adx;
    } else if (dxValues.length > period) {
      const prevADX = indicators[i - 1].adx;
      indicators[i].adx = (prevADX * (period - 1) + dxValues[dxValues.length - 1]) / period;
    }
  }
  return indicators;
}
function calculateMA50AndBollinger(indicators, bars) {
  const maPeriod = 50;
  const bbPeriod = 20;
  for (let i = 0; i < bars.length; i++) {
    const maStart = Math.max(0, i - maPeriod + 1);
    const maSlice = bars.slice(maStart, i + 1);
    indicators[i].ma50 = maSlice.reduce((s, b) => s + b.close, 0) / maSlice.length;
    const bbStart = Math.max(0, i - bbPeriod + 1);
    const bbSlice = bars.slice(bbStart, i + 1);
    const bbMean = bbSlice.reduce((s, b) => s + b.close, 0) / bbSlice.length;
    const variance = bbSlice.reduce((s, b) => s + Math.pow(b.close - bbMean, 2), 0) / bbSlice.length;
    const stdDev = Math.sqrt(variance);
    const upperBand = bbMean + 2 * stdDev;
    const lowerBand = bbMean - 2 * stdDev;
    indicators[i].bollingerBandwidth = bbMean > 0 ? (upperBand - lowerBand) / bbMean * 100 : 0;
  }
  return indicators;
}
function analyzeStock(bars) {
  if (bars.length < 2) return [];
  let indicators = calculateMACD(bars);
  indicators = calculateRSI(indicators, bars);
  indicators = calculateADX(indicators, bars);
  indicators = calculateMA50AndBollinger(indicators, bars);
  return indicators;
}
function getSignal(indicators) {
  if (indicators.length === 0) return "HOLD";
  const last = indicators[indicators.length - 1];
  const rsiNeutral = last.rsi >= 45 && last.rsi <= 55;
  const macdHistNearZero = last.price > 0 && Math.abs(last.macdHistogram) < 1e-3 * last.price;
  const priceNearMA50 = last.ma50 > 0 && Math.abs(last.price - last.ma50) / last.ma50 <= 0.02;
  const weakTrend = last.adx > 0 ? last.adx < 20 : false;
  let noRecentCrossover = true;
  const lookback = Math.min(5, indicators.length - 1);
  for (let j = indicators.length - lookback; j < indicators.length; j++) {
    if (j > 0 && indicators[j].buySignal !== indicators[j - 1].buySignal) {
      noRecentCrossover = false;
      break;
    }
  }
  const holdConditionsMet = [rsiNeutral, macdHistNearZero, noRecentCrossover, priceNearMA50, weakTrend].filter(Boolean).length;
  if (holdConditionsMet >= 4) return "HOLD";
  if (last.rsi > 70 && !last.buySignal) return "SELL";
  if (last.rsi < 30 && last.buySignal) return "BUY";
  if (last.buySignal) return "BUY";
  return "SELL";
}
function getSignalStrength(indicators) {
  if (indicators.length === 0) return 0;
  const last = indicators[indicators.length - 1];
  return Math.abs(last.macdHistogramAdjusted) * 1e4;
}
function countSignalChanges(indicators) {
  let changes = 0;
  for (let i = 1; i < indicators.length; i++) {
    if (indicators[i].buySignal !== indicators[i - 1].buySignal) {
      changes++;
    }
  }
  return changes;
}
function lastSignalChangeDate(indicators) {
  for (let i = indicators.length - 1; i > 0; i--) {
    if (indicators[i].buySignal !== indicators[i - 1].buySignal) {
      return indicators[i].date;
    }
  }
  return indicators.length > 0 ? indicators[indicators.length - 1].date : "";
}

// server/generate-snapshot.ts
init_db();
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
async function generateSnapshot() {
  try {
    const [stocksResult, cryptoResult, statsResult] = await Promise.all([
      pool.query(
        `SELECT symbol, name, exchange, sector, price, change_percent, signal, signal_strength, rsi, macd_histogram, volume
         FROM computed_signals WHERE asset_type = 'stock' ORDER BY ABS(change_percent) DESC LIMIT 5`
      ),
      pool.query(
        `SELECT symbol, name, exchange, sector, price, change_percent, signal, signal_strength, rsi, macd_histogram, volume
         FROM computed_signals WHERE asset_type = 'crypto' ORDER BY ABS(change_percent) DESC LIMIT 5`
      ),
      pool.query(
        `SELECT asset_type,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE signal='BUY') as buy_count,
           COUNT(*) FILTER (WHERE signal='SELL') as sell_count,
           COUNT(*) FILTER (WHERE signal='HOLD') as hold_count
         FROM computed_signals GROUP BY asset_type`
      )
    ]);
    const snapshot = {
      stocks: stocksResult.rows,
      crypto: cryptoResult.rows,
      stats: statsResult.rows,
      generated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const outDir = join(process.cwd(), "client", "public");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "snapshot.json"), JSON.stringify(snapshot, null, 2));
    console.log("[Snapshot] Generated client/public/snapshot.json");
    return snapshot;
  } catch (err) {
    console.error("[Snapshot] Failed to generate snapshot:", err);
    return null;
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  Promise.resolve().then(() => (init_db(), db_exports)).then(({ initDB: initDB2 }) => initDB2()).then(() => generateSnapshot()).then(() => process.exit(0));
}

// server/update.ts
var ALPACA_KEY = process.env.ALPACA_API_KEY_ID || "";
var ALPACA_SECRET = process.env.ALPACA_API_KEY_SECRET || "";
var TIINGO_TOKEN = process.env.TIINGO_API_TOKEN || "";
var ALPACA_DATA_URL = "https://data.alpaca.markets/v2";
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function getLastDates() {
  const result = await pool.query(
    `SELECT symbol, asset_type, MAX(date) as last_date FROM price_history GROUP BY symbol, asset_type`
  );
  const map = /* @__PURE__ */ new Map();
  for (const row of result.rows) {
    map.set(`${row.symbol}:${row.asset_type}`, row.last_date.toISOString().split("T")[0]);
  }
  return map;
}
async function fetchAlpacaBarsIncremental(symbols, lastDates, endDate) {
  const results = {};
  const batchSize = 20;
  const symbolsByStartDate = /* @__PURE__ */ new Map();
  for (const sym of symbols) {
    const lastDate = lastDates.get(`${sym}:stock`);
    const nextDay = lastDate ? nextBusinessDay(lastDate) : "2016-01-01";
    if (nextDay > endDate) continue;
    if (!symbolsByStartDate.has(nextDay)) symbolsByStartDate.set(nextDay, []);
    symbolsByStartDate.get(nextDay).push(sym);
  }
  let totalFetched = 0;
  for (const [startDate, syms] of symbolsByStartDate.entries()) {
    for (let i = 0; i < syms.length; i += batchSize) {
      const batch = syms.slice(i, i + batchSize);
      const symbolsParam = batch.join(",");
      let pageToken = null;
      do {
        const url = new URL(`${ALPACA_DATA_URL}/stocks/bars`);
        url.searchParams.set("symbols", symbolsParam);
        url.searchParams.set("timeframe", "1Day");
        url.searchParams.set("start", startDate);
        url.searchParams.set("end", endDate);
        url.searchParams.set("limit", "10000");
        url.searchParams.set("adjustment", "split");
        url.searchParams.set("feed", "iex");
        if (pageToken) url.searchParams.set("page_token", pageToken);
        const res = await fetch(url.toString(), {
          headers: {
            "APCA-API-KEY-ID": ALPACA_KEY,
            "APCA-API-SECRET-KEY": ALPACA_SECRET
          }
        });
        if (!res.ok) {
          const text = await res.text();
          console.error(`  Alpaca error: ${res.status} ${text}`);
          break;
        }
        const data = await res.json();
        if (data.bars) {
          for (const [sym, bars] of Object.entries(data.bars)) {
            if (!results[sym]) results[sym] = [];
            for (const bar of bars) {
              results[sym].push({
                date: bar.t.split("T")[0],
                open: bar.o,
                high: bar.h,
                low: bar.l,
                close: bar.c,
                volume: bar.v
              });
            }
          }
        }
        pageToken = data.next_page_token || null;
      } while (pageToken);
      totalFetched += batch.length;
      if (totalFetched % 100 === 0) {
        console.log(`  Queried ${totalFetched} stock symbols...`);
      }
      await sleep(200);
    }
  }
  return results;
}
async function fetchTiingoCryptoIncremental(symbolsToUpdate, lastDates, endDate) {
  if (!TIINGO_TOKEN) return {};
  const symbolToTicker = {
    BTC: "btcusd",
    ETH: "ethusd",
    BNB: "bnbusd",
    XRP: "xrpusd",
    ADA: "adausd",
    DOGE: "dogeusd",
    SOL: "solusd",
    DOT: "dotusd",
    MATIC: "maticusd",
    LTC: "ltcusd",
    LINK: "linkusd",
    AVAX: "avaxusd",
    UNI: "uniusd",
    ATOM: "atomusd",
    XLM: "xlmusd",
    NEAR: "nearusd",
    ALGO: "algousd",
    FTM: "ftmusd"
  };
  const results = {};
  for (const displaySymbol of symbolsToUpdate) {
    const sym = symbolToTicker[displaySymbol];
    if (!sym) continue;
    const lastDate = lastDates.get(`${displaySymbol}:crypto`);
    const startDate = lastDate ? nextBusinessDay(lastDate) : "2016-01-01";
    if (startDate > endDate) continue;
    try {
      const url = `https://api.tiingo.com/tiingo/crypto/prices?tickers=${sym}&startDate=${startDate}&endDate=${endDate}&resampleFreq=1day&token=${TIINGO_TOKEN}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`  Tiingo error for ${sym}: ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data && data.length > 0 && data[0].priceData && data[0].priceData.length > 0) {
        results[displaySymbol] = data[0].priceData.map((d) => ({
          date: d.date.split("T")[0],
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volumeNotional || 0
        }));
      }
      await sleep(200);
    } catch (err) {
      console.log(`  Error fetching ${sym}:`, err);
    }
  }
  return results;
}
async function storeNewBars(allBars, assetType) {
  const updatedSymbols = [];
  const client = await pool.connect();
  try {
    for (const [symbol, bars] of Object.entries(allBars)) {
      if (bars.length === 0) continue;
      const batchSize = 500;
      for (let i = 0; i < bars.length; i += batchSize) {
        const batch = bars.slice(i, i + batchSize);
        const params = [];
        const placeholders = [];
        let idx = 1;
        for (const bar of batch) {
          placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
          params.push(symbol, bar.date, bar.open, bar.high, bar.low, bar.close, Math.round(bar.volume), assetType);
        }
        await client.query(
          `INSERT INTO price_history (symbol, date, open, high, low, close, volume, asset_type)
           VALUES ${placeholders.join(",")}
           ON CONFLICT (symbol, date, asset_type) DO UPDATE SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume`,
          params
        );
      }
      updatedSymbols.push(symbol);
    }
  } finally {
    client.release();
  }
  return updatedSymbols;
}
async function recomputeSignals(updates) {
  if (updates.length === 0) return;
  console.log(`Recomputing signals for ${updates.length} updated symbols...`);
  const client = await pool.connect();
  try {
    let processed = 0;
    for (const { symbol, assetType } of updates) {
      const barsResult = await client.query(
        `SELECT date, open, high, low, close, volume FROM price_history WHERE symbol = $1 AND asset_type = $2 ORDER BY date ASC`,
        [symbol, assetType]
      );
      const bars = barsResult.rows.map((r) => ({
        date: r.date.toISOString().split("T")[0],
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume
      }));
      if (bars.length < 30) continue;
      const indicators = analyzeStock(bars);
      if (indicators.length === 0) continue;
      const last = indicators[indicators.length - 1];
      const prevClose = bars.length > 1 ? bars[bars.length - 2].close : bars[bars.length - 1].close;
      const changeVal = last.price - prevClose;
      const changePct = prevClose !== 0 ? changeVal / prevClose * 100 : 0;
      const stockInfo = await client.query(`SELECT name, exchange, sector, asset_type FROM stocks WHERE symbol = $1`, [symbol]);
      const meta = stockInfo.rows[0] || { name: symbol, exchange: "", sector: "", asset_type: "stock" };
      const signal = getSignal(indicators);
      const signalStrengthVal = getSignalStrength(indicators);
      const lastChange = lastSignalChangeDate(indicators);
      const signalChangesVal = countSignalChanges(indicators);
      await client.query(
        `INSERT INTO computed_signals (symbol, name, exchange, sector, asset_type, price, change_val, change_percent, signal, macd_histogram, macd_histogram_adjusted, rsi, signal_strength, last_signal_change, signal_changes, data_points, volume, computed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
         ON CONFLICT (symbol, asset_type) DO UPDATE SET
           name=$2, exchange=$3, sector=$4, price=$6, change_val=$7, change_percent=$8, signal=$9, macd_histogram=$10, macd_histogram_adjusted=$11, rsi=$12, signal_strength=$13, last_signal_change=$14, signal_changes=$15, data_points=$16, volume=$17, computed_at=NOW()`,
        [
          symbol,
          meta.name,
          meta.exchange,
          meta.sector || "",
          meta.asset_type,
          last.price,
          changeVal,
          changePct,
          signal,
          last.macdHistogram,
          last.macdHistogramAdjusted,
          last.rsi,
          signalStrengthVal,
          lastChange,
          signalChangesVal,
          bars.length,
          bars[bars.length - 1].volume
        ]
      );
      processed++;
      if (processed % 100 === 0) {
        console.log(`  Recomputed ${processed}/${updates.length}...`);
      }
    }
    console.log(`  Recomputed signals for ${processed} symbols`);
  } finally {
    client.release();
  }
}
function nextBusinessDay(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}
async function main() {
  const start = Date.now();
  console.log("=== MATEO Incremental Update ===");
  await initDB();
  const lastDates = await getLastDates();
  const endDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const symbolCount = lastDates.size;
  if (symbolCount === 0) {
    console.log("No existing data found. Run 'yarn seed-db' for initial seed.");
    process.exit(0);
  }
  console.log(`Found ${symbolCount} symbols in database`);
  const oldestLast = [...lastDates.values()].sort()[0];
  const newestLast = [...lastDates.values()].sort().reverse()[0];
  console.log(`Last data ranges from ${oldestLast} to ${newestLast}`);
  console.log(`Fetching new bars through ${endDate}`);
  const allUpdated = [];
  if (ALPACA_KEY && ALPACA_SECRET) {
    const stockSymbols = (await pool.query(
      `SELECT symbol FROM stocks WHERE asset_type = 'stock'`
    )).rows.map((r) => r.symbol);
    const needsUpdate = stockSymbols.filter((s) => {
      const last = lastDates.get(`${s}:stock`);
      return !last || last < endDate;
    });
    if (needsUpdate.length > 0) {
      console.log(`
Stocks: ${needsUpdate.length} symbols need updates`);
      const newBars = await fetchAlpacaBarsIncremental(needsUpdate, lastDates, endDate);
      const withData = Object.keys(newBars).filter((s) => newBars[s].length > 0);
      const totalBars = Object.values(newBars).reduce((s, b) => s + b.length, 0);
      console.log(`  Fetched ${totalBars} new bars for ${withData.length} stocks`);
      if (withData.length > 0) {
        const stored = await storeNewBars(newBars, "stock");
        allUpdated.push(...stored.map((s) => ({ symbol: s, assetType: "stock" })));
        console.log(`  Stored new data for ${stored.length} stocks`);
      }
    } else {
      console.log("\nStocks: all up to date");
    }
  } else {
    console.log("\nNo Alpaca keys - skipping stocks");
  }
  if (TIINGO_TOKEN) {
    const cryptoSymbols = (await pool.query(
      `SELECT symbol FROM stocks WHERE asset_type = 'crypto'`
    )).rows.map((r) => r.symbol);
    const needsUpdate = cryptoSymbols.filter((s) => {
      const last = lastDates.get(`${s}:crypto`);
      return !last || last < endDate;
    });
    if (needsUpdate.length > 0) {
      console.log(`
Crypto: ${needsUpdate.length} symbols need updates`);
      const newBars = await fetchTiingoCryptoIncremental(needsUpdate, lastDates, endDate);
      const withData = Object.keys(newBars).filter((s) => newBars[s].length > 0);
      const totalBars = Object.values(newBars).reduce((s, b) => s + b.length, 0);
      console.log(`  Fetched ${totalBars} new bars for ${withData.length} crypto symbols`);
      if (withData.length > 0) {
        const stored = await storeNewBars(newBars, "crypto");
        allUpdated.push(...stored.map((s) => ({ symbol: s, assetType: "crypto" })));
        console.log(`  Stored new data for ${stored.length} crypto symbols`);
      }
    } else {
      console.log("\nCrypto: all up to date");
    }
  } else {
    console.log("\nNo Tiingo token - skipping crypto");
  }
  if (allUpdated.length > 0) {
    await recomputeSignals(allUpdated);
    await checkWatchlistSignals(allUpdated);
  } else {
    console.log("\nNo new data - signals are current");
  }
  await generateSnapshot();
  const elapsed = ((Date.now() - start) / 1e3).toFixed(1);
  console.log(`
=== Update complete in ${elapsed}s (${allUpdated.length} symbols updated) ===`);
  process.exit(0);
}
async function checkWatchlistSignals(updatedSymbols) {
  if (updatedSymbols.length === 0) return;
  try {
    const watchlistResult = await pool.query(
      `SELECT w.id, w.user_id, w.symbol, w.asset_type, w.last_known_signal,
              u.email, u.notification_email_enabled,
              cs.signal as new_signal
       FROM watchlist w
       JOIN users u ON u.id = w.user_id
       LEFT JOIN computed_signals cs ON cs.symbol = w.symbol AND cs.asset_type = w.asset_type
       WHERE w.symbol = ANY($1)`,
      [updatedSymbols]
    );
    for (const row of watchlistResult.rows) {
      if (!row.new_signal || row.new_signal === row.last_known_signal) continue;
      const message = `${row.symbol} signal changed: ${row.last_known_signal || "?"} \u2192 ${row.new_signal}`;
      console.log(`[Watchlist] ${message} (user: ${row.email})`);
      await pool.query(
        `INSERT INTO notifications (user_id, symbol, asset_type, message, signal_from, signal_to)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.user_id, row.symbol, row.asset_type, message, row.last_known_signal || "", row.new_signal]
      );
      await pool.query(
        `UPDATE watchlist SET last_known_signal = $1 WHERE id = $2`,
        [row.new_signal, row.id]
      );
      if (row.notification_email_enabled && row.email) {
        await sendSignalEmail(row.email, row.symbol, row.last_known_signal || "?", row.new_signal);
      }
    }
    console.log(`
[Watchlist] Checked ${watchlistResult.rows.length} watchlist entries`);
  } catch (err) {
    console.error("[Watchlist] Error checking signals:", err);
  }
}
async function sendSignalEmail(email, symbol, from, to) {
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || ""
      }
    });
    if (!process.env.SMTP_USER) {
      console.log(`[Email] SMTP not configured \u2014 would email ${email}: ${symbol} ${from}\u2192${to}`);
      return;
    }
    await transporter.sendMail({
      from: `MATEO <${process.env.SMTP_USER}>`,
      to: email,
      subject: `MATEO Signal Alert: ${symbol} changed to ${to}`,
      text: `Your watched symbol ${symbol} has changed signal from ${from} to ${to}.

This is not financial advice \u2014 for research purposes only.

MATEO Market Analysis Terminal`,
      html: `<p>Your watched symbol <strong>${symbol}</strong> has changed signal from <strong>${from}</strong> to <strong>${to}</strong>.</p><p style="color:#888;font-size:12px;">This is not financial advice \u2014 for research purposes only.</p><p>MATEO Market Analysis Terminal</p>`
    });
    console.log(`[Email] Sent signal alert to ${email} for ${symbol}`);
  } catch (err) {
    console.error(`[Email] Failed to send to ${email}:`, err);
  }
}
main().catch((err) => {
  console.error("Update failed:", err);
  process.exit(1);
});
