import "dotenv/config";
import { pool, initDB } from "./db";
import { analyzeStock, getSignal, getSignalStrength, countSignalChanges, lastSignalChangeDate } from "../shared/indicators";
import type { StockBar } from "../shared/types";
import { generateSnapshot } from "./generate-snapshot";

const ALPACA_KEY = process.env.ALPACA_API_KEY_ID || "";
const ALPACA_SECRET = process.env.ALPACA_API_KEY_SECRET || "";
const TIINGO_TOKEN = process.env.TIINGO_API_TOKEN || "";

const ALPACA_DATA_URL = "https://data.alpaca.markets/v2";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getLastDates(): Promise<Map<string, string>> {
  const result = await pool.query(
    `SELECT symbol, asset_type, MAX(date) as last_date FROM price_history GROUP BY symbol, asset_type`
  );
  const map = new Map<string, string>();
  for (const row of result.rows) {
    map.set(`${row.symbol}:${row.asset_type}`, row.last_date.toISOString().split("T")[0]);
  }
  return map;
}

async function fetchAlpacaBarsIncremental(
  symbols: string[],
  lastDates: Map<string, string>,
  endDate: string
): Promise<Record<string, StockBar[]>> {
  const results: Record<string, StockBar[]> = {};
  const batchSize = 20;

  const symbolsByStartDate = new Map<string, string[]>();
  for (const sym of symbols) {
    const lastDate = lastDates.get(`${sym}:stock`);
    const nextDay = lastDate ? nextBusinessDay(lastDate) : "2016-01-01";
    if (nextDay > endDate) continue;
    if (!symbolsByStartDate.has(nextDay)) symbolsByStartDate.set(nextDay, []);
    symbolsByStartDate.get(nextDay)!.push(sym);
  }

  let totalFetched = 0;
  for (const [startDate, syms] of symbolsByStartDate.entries()) {
    for (let i = 0; i < syms.length; i += batchSize) {
      const batch = syms.slice(i, i + batchSize);
      const symbolsParam = batch.join(",");

      let pageToken: string | null = null;
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
            "APCA-API-SECRET-KEY": ALPACA_SECRET,
          },
        });

        if (!res.ok) {
          const text = await res.text();
          console.error(`  Alpaca error: ${res.status} ${text}`);
          break;
        }

        const data = await res.json();
        if (data.bars) {
          for (const [sym, bars] of Object.entries(data.bars as Record<string, any[]>)) {
            if (!results[sym]) results[sym] = [];
            for (const bar of bars) {
              results[sym].push({
                date: bar.t.split("T")[0],
                open: bar.o,
                high: bar.h,
                low: bar.l,
                close: bar.c,
                volume: bar.v,
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

async function fetchTiingoCryptoIncremental(
  symbolsToUpdate: string[],
  lastDates: Map<string, string>,
  endDate: string
): Promise<Record<string, StockBar[]>> {
  if (!TIINGO_TOKEN) return {};

  const symbolToTicker: Record<string, string> = {
    BTC: "btcusd", ETH: "ethusd", BNB: "bnbusd", XRP: "xrpusd", ADA: "adausd", DOGE: "dogeusd",
    SOL: "solusd", DOT: "dotusd", MATIC: "maticusd", LTC: "ltcusd", LINK: "linkusd", AVAX: "avaxusd",
    UNI: "uniusd", ATOM: "atomusd", XLM: "xlmusd", NEAR: "nearusd", ALGO: "algousd", FTM: "ftmusd",
  };

  const results: Record<string, StockBar[]> = {};

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
        results[displaySymbol] = data[0].priceData.map((d: any) => ({
          date: d.date.split("T")[0],
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volumeNotional || 0,
        }));
      }

      await sleep(200);
    } catch (err) {
      console.log(`  Error fetching ${sym}:`, err);
    }
  }

  return results;
}

async function storeNewBars(allBars: Record<string, StockBar[]>, assetType: string): Promise<string[]> {
  const updatedSymbols: string[] = [];
  const client = await pool.connect();
  try {
    for (const [symbol, bars] of Object.entries(allBars)) {
      if (bars.length === 0) continue;

      const batchSize = 500;
      for (let i = 0; i < bars.length; i += batchSize) {
        const batch = bars.slice(i, i + batchSize);
        const params: any[] = [];
        const placeholders: string[] = [];
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

async function recomputeSignals(updates: { symbol: string; assetType: string }[]) {
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

      const bars: StockBar[] = barsResult.rows.map(r => ({
        date: r.date.toISOString().split("T")[0],
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      }));

      if (bars.length < 30) continue;

      const indicators = analyzeStock(bars);
      if (indicators.length === 0) continue;

      const last = indicators[indicators.length - 1];
      const prevClose = bars.length > 1 ? bars[bars.length - 2].close : bars[bars.length - 1].close;
      const changeVal = last.price - prevClose;
      const changePct = prevClose !== 0 ? (changeVal / prevClose) * 100 : 0;

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
          symbol, meta.name, meta.exchange, meta.sector || "", meta.asset_type,
          last.price, changeVal, changePct,
          signal, last.macdHistogram, last.macdHistogramAdjusted,
          last.rsi, signalStrengthVal,
          lastChange, signalChangesVal,
          bars.length, bars[bars.length - 1].volume,
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

function nextBusinessDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

async function main() {
  const start = Date.now();
  console.log("=== MATEO Incremental Update ===");
  await initDB();

  const lastDates = await getLastDates();
  const endDate = new Date().toISOString().split("T")[0];
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

  const allUpdated: { symbol: string; assetType: string }[] = [];

  if (ALPACA_KEY && ALPACA_SECRET) {
    const stockSymbols = (await pool.query(
      `SELECT symbol FROM stocks WHERE asset_type = 'stock'`
    )).rows.map(r => r.symbol);

    const needsUpdate = stockSymbols.filter(s => {
      const last = lastDates.get(`${s}:stock`);
      return !last || last < endDate;
    });

    if (needsUpdate.length > 0) {
      console.log(`\nStocks: ${needsUpdate.length} symbols need updates`);
      const newBars = await fetchAlpacaBarsIncremental(needsUpdate, lastDates, endDate);
      const withData = Object.keys(newBars).filter(s => newBars[s].length > 0);
      const totalBars = Object.values(newBars).reduce((s, b) => s + b.length, 0);
      console.log(`  Fetched ${totalBars} new bars for ${withData.length} stocks`);

      if (withData.length > 0) {
        const stored = await storeNewBars(newBars, "stock");
        allUpdated.push(...stored.map(s => ({ symbol: s, assetType: "stock" })));
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
    )).rows.map(r => r.symbol);

    const needsUpdate = cryptoSymbols.filter(s => {
      const last = lastDates.get(`${s}:crypto`);
      return !last || last < endDate;
    });

    if (needsUpdate.length > 0) {
      console.log(`\nCrypto: ${needsUpdate.length} symbols need updates`);
      const newBars = await fetchTiingoCryptoIncremental(needsUpdate, lastDates, endDate);
      const withData = Object.keys(newBars).filter(s => newBars[s].length > 0);
      const totalBars = Object.values(newBars).reduce((s, b) => s + b.length, 0);
      console.log(`  Fetched ${totalBars} new bars for ${withData.length} crypto symbols`);

      if (withData.length > 0) {
        const stored = await storeNewBars(newBars, "crypto");
        allUpdated.push(...stored.map(s => ({ symbol: s, assetType: "crypto" })));
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
    await checkWatchlistSignals(allUpdated.map(x => x.symbol));
  } else {
    console.log("\nNo new data - signals are current");
  }

  await generateSnapshot();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== Update complete in ${elapsed}s (${allUpdated.length} symbols updated) ===`);
  process.exit(0);
}

async function checkWatchlistSignals(updatedSymbols: string[]) {
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

      const message = `${row.symbol} signal changed: ${row.last_known_signal || "?"} → ${row.new_signal}`;
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

    console.log(`\n[Watchlist] Checked ${watchlistResult.rows.length} watchlist entries`);
  } catch (err) {
    console.error("[Watchlist] Error checking signals:", err);
  }
}

async function sendSignalEmail(email: string, symbol: string, from: string, to: string) {
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
    });
    if (!process.env.SMTP_USER) {
      console.log(`[Email] SMTP not configured — would email ${email}: ${symbol} ${from}→${to}`);
      return;
    }
    await transporter.sendMail({
      from: `MATEO <${process.env.SMTP_USER}>`,
      to: email,
      subject: `MATEO Signal Alert: ${symbol} changed to ${to}`,
      text: `Your watched symbol ${symbol} has changed signal from ${from} to ${to}.\n\nThis is not financial advice — for research purposes only.\n\nMATEO Market Analysis Terminal`,
      html: `<p>Your watched symbol <strong>${symbol}</strong> has changed signal from <strong>${from}</strong> to <strong>${to}</strong>.</p><p style="color:#888;font-size:12px;">This is not financial advice — for research purposes only.</p><p>MATEO Market Analysis Terminal</p>`,
    });
    console.log(`[Email] Sent signal alert to ${email} for ${symbol}`);
  } catch (err) {
    console.error(`[Email] Failed to send to ${email}:`, err);
  }
}

main().catch(err => {
  console.error("Update failed:", err);
  process.exit(1);
});
