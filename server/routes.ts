import { Router } from "express";
import { pool } from "./db";
import type { StockBar, SimulationRequest, CompareRequest, MarketConditionsRequest, DEFAULT_STRATEGY } from "../shared/types";
import { analyzeStock, getSignal, getSignalStrength, countSignalChanges, lastSignalChangeDate } from "../shared/indicators";
import { runSimulation, compareStrategies, analyzeMarketConditions } from "./simulation";

const defaultStrategy = {
  macdFastPeriod: 12,
  macdSlowPeriod: 26,
  macdSignalPeriod: 9,
  rsiPeriod: 12,
  rsiOverbought: 70,
  rsiOversold: 30,
  minBuySignal: 4,
  maxSharePrice: 500,
  minCashReserve: 100,
  maxPositionPct: 25,
  stopLossPct: 10,
  takeProfitPct: 20,
};

const router = Router();

function getAssetTypeFilter(assetType: string | undefined): string {
  if (assetType === "crypto") return "crypto";
  return "stock";
}

async function computeSignalsAsOfDate(assetFilter: string, asOfDate: string, signalFilter?: string, searchFilter?: string, sortCol?: string, sortOrder?: string, lim?: number, off?: number, sectorFilter?: string) {
  const symbolsResult = await pool.query(
    `SELECT DISTINCT ph.symbol, s.name, s.exchange, s.sector
     FROM price_history ph
     LEFT JOIN stocks s ON s.symbol = ph.symbol
     WHERE ph.asset_type = $1
     ORDER BY ph.symbol`,
    [assetFilter]
  );

  const allResults: any[] = [];

  for (const row of symbolsResult.rows) {
    const sym = row.symbol;
    const priceResult = await pool.query(
      `SELECT date, open, high, low, close, volume FROM price_history WHERE symbol = $1 AND asset_type = $2 AND date <= $3 ORDER BY date ASC`,
      [sym, assetFilter, asOfDate]
    );

    if (priceResult.rows.length < 2) continue;

    const bars: StockBar[] = priceResult.rows.map((r: any) => ({
      date: r.date.toISOString().split("T")[0],
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }));

    const indicators = analyzeStock(bars);
    if (indicators.length === 0) continue;

    const last = indicators[indicators.length - 1];
    const signal = getSignal(indicators);
    const strength = getSignalStrength(indicators);
    const changes = countSignalChanges(indicators);
    const lastChange = lastSignalChangeDate(indicators);
    const firstBar = bars[0];
    const lastBar = bars[bars.length - 1];
    const change = lastBar.close - firstBar.close;
    const changePercent = firstBar.close !== 0 ? (change / firstBar.close) * 100 : 0;

    if (signalFilter && signalFilter !== "ALL" && signal !== signalFilter) continue;
    if (searchFilter && !sym.toLowerCase().includes(searchFilter.toLowerCase()) &&
        !(row.name || "").toLowerCase().includes(searchFilter.toLowerCase())) continue;
    if (sectorFilter && sectorFilter !== "ALL" && (row.sector || "") !== sectorFilter) continue;

    allResults.push({
      symbol: sym,
      name: row.name || sym,
      exchange: row.exchange || "",
      sector: row.sector || "",
      price: lastBar.close,
      change,
      changePercent,
      signal,
      macdHistogram: last.macdHistogram,
      macdHistogramAdjusted: last.macdHistogramAdjusted,
      rsi: last.rsi,
      signalStrength: strength,
      lastSignalChange: lastChange,
      signalChanges: changes,
      dataPoints: bars.length,
      volume: lastBar.volume,
    });
  }

  const col = sortCol || "change_percent";
  const dir = sortOrder === "asc" ? 1 : -1;
  allResults.sort((a, b) => {
    const va = (a as any)[col === "change_percent" ? "changePercent" : col === "signal_strength" ? "signalStrength" : col === "macd_histogram" ? "macdHistogram" : col] ?? 0;
    const vb = (b as any)[col === "change_percent" ? "changePercent" : col === "signal_strength" ? "signalStrength" : col === "macd_histogram" ? "macdHistogram" : col] ?? 0;
    return (va - vb) * dir;
  });

  const total = allResults.length;
  const sliced = allResults.slice(off || 0, (off || 0) + (lim || 100));

  return { data: sliced, total };
}

router.get("/api/stocks/signal-alerts", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type as string);

    const result = await pool.query(
      `SELECT symbol, name, exchange, sector, signal, price, change_percent,
              last_signal_change, signal_changes, data_points
       FROM computed_signals
       WHERE asset_type = $1
         AND last_signal_change IS NOT NULL
         AND last_signal_change != ''
         AND signal_changes > 0
         AND data_points >= 60
       ORDER BY last_signal_change DESC
       LIMIT 200`,
      [assetFilter]
    );

    const now = new Date();
    const alerts = result.rows
      .map((row: any) => {
        const lastChangeDate = new Date(row.last_signal_change);
        const daysSinceChange = Math.max(1, Math.floor((now.getTime() - lastChangeDate.getTime()) / (1000 * 60 * 60 * 24)));
        const avgDaysBetweenChanges = row.data_points / row.signal_changes;
        const alertScore = avgDaysBetweenChanges / daysSinceChange;

        return {
          symbol: row.symbol,
          name: row.name,
          exchange: row.exchange,
          sector: row.sector,
          signal: row.signal,
          price: row.price,
          changePercent: row.change_percent,
          lastSignalChange: row.last_signal_change,
          daysSinceChange,
          signalChanges: row.signal_changes,
          dataPoints: row.data_points,
          avgDaysBetweenChanges: Math.round(avgDaysBetweenChanges * 10) / 10,
          alertScore: Math.round(alertScore * 100) / 100,
        };
      })
      .filter((a: any) => a.daysSinceChange <= 14)
      .sort((a: any, b: any) => b.alertScore - a.alertScore)
      .slice(0, 20);

    res.json(alerts);
  } catch (err) {
    console.error("Error fetching signal alerts:", err);
    res.status(500).json({ error: "Failed to fetch signal alerts" });
  }
});

router.get("/api/sectors", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type as string);
    const result = await pool.query(
      `SELECT DISTINCT sector FROM stocks WHERE asset_type = $1 AND sector IS NOT NULL AND sector != '' ORDER BY sector`,
      [assetFilter]
    );
    res.json(result.rows.map(r => r.sector));
  } catch (err) {
    console.error("Error fetching sectors:", err);
    res.status(500).json({ error: "Failed to fetch sectors" });
  }
});

router.get("/api/stocks", async (req, res) => {
  try {
    const { signal, sort, order, search, limit, offset, asset_type, as_of_date, sector } = req.query;
    const assetFilter = getAssetTypeFilter(asset_type as string);
    const lim = Math.min(parseInt(limit as string) || 100, 500);
    const off = parseInt(offset as string) || 0;

    if (as_of_date && typeof as_of_date === "string") {
      const result = await computeSignalsAsOfDate(
        assetFilter,
        as_of_date,
        signal as string,
        search as string,
        sort as string,
        order as string,
        lim,
        off,
        sector as string
      );
      return res.json(result);
    }

    let query = `SELECT * FROM computed_signals WHERE asset_type = $1`;
    const params: any[] = [assetFilter];
    let paramIdx = 2;

    if (signal && signal !== "ALL") {
      query += ` AND signal = $${paramIdx++}`;
      params.push(signal);
    }

    if (search) {
      query += ` AND (symbol ILIKE $${paramIdx} OR name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (sector && sector !== "ALL") {
      query += ` AND sector = $${paramIdx++}`;
      params.push(sector);
    }

    const sortCol = (sort as string) || "change_percent";
    const sortOrder = (order as string) === "asc" ? "ASC" : "DESC";
    const validCols = ["symbol", "name", "price", "change_percent", "signal", "rsi", "macd_histogram", "signal_strength", "volume", "macd_histogram_adjusted"];
    const safeSort = validCols.includes(sortCol) ? sortCol : "change_percent";
    query += ` ORDER BY ${safeSort} ${sortOrder}`;

    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(lim, off);

    const result = await pool.query(query, params);

    let countQuery = `SELECT COUNT(*) as total FROM computed_signals WHERE asset_type = $1`;
    const countParams: any[] = [assetFilter];
    if (signal && signal !== "ALL") {
      countQuery += ` AND signal = $${countParams.length + 1}`;
      countParams.push(signal);
    }
    if (search) {
      const searchIdx = countParams.length + 1;
      countQuery += ` AND (symbol ILIKE $${searchIdx} OR name ILIKE $${searchIdx})`;
      countParams.push(`%${search}%`);
    }
    if (sector && sector !== "ALL") {
      countQuery += ` AND sector = $${countParams.length + 1}`;
      countParams.push(sector);
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      data: result.rows.map(row => ({
        symbol: row.symbol,
        name: row.name,
        exchange: row.exchange,
        sector: row.sector,
        price: row.price,
        change: row.change_val,
        changePercent: row.change_percent,
        signal: row.signal,
        macdHistogram: row.macd_histogram,
        macdHistogramAdjusted: row.macd_histogram_adjusted,
        rsi: row.rsi,
        signalStrength: row.signal_strength,
        lastSignalChange: row.last_signal_change,
        signalChanges: row.signal_changes,
        dataPoints: row.data_points,
        volume: row.volume,
      })),
      total: parseInt(countResult.rows[0].total),
    });
  } catch (err) {
    console.error("Error fetching stocks:", err);
    res.status(500).json({ error: "Failed to fetch stocks" });
  }
});

router.get("/api/stocks/top-performers", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type as string);
    const asOfDate = req.query.as_of_date as string | undefined;

    if (asOfDate) {
      const result = await computeSignalsAsOfDate(assetFilter, asOfDate);
      const all = result.data;

      const sorted = [...all].sort((a, b) => b.changePercent - a.changePercent);
      const gainers = sorted.slice(0, 10);
      const losers = [...all].sort((a, b) => a.changePercent - b.changePercent).slice(0, 10);
      const strongBuys = all
        .filter((r: any) => r.signal === "BUY")
        .sort((a: any, b: any) => b.signalStrength - a.signalStrength)
        .slice(0, 10);

      const mapRow = (row: any) => ({
        symbol: row.symbol,
        name: row.name,
        price: row.price,
        changePercent: row.changePercent,
        signal: row.signal,
        rsi: row.rsi,
      });

      return res.json({
        gainers: gainers.map(mapRow),
        losers: losers.map(mapRow),
        strongBuys: strongBuys.map(mapRow),
      });
    }

    const gainers = await pool.query(
      `SELECT * FROM computed_signals WHERE asset_type = $1 ORDER BY change_percent DESC LIMIT 10`,
      [assetFilter]
    );
    const losers = await pool.query(
      `SELECT * FROM computed_signals WHERE asset_type = $1 ORDER BY change_percent ASC LIMIT 10`,
      [assetFilter]
    );
    const strongBuys = await pool.query(
      `SELECT * FROM computed_signals WHERE asset_type = $1 AND signal = 'BUY' ORDER BY signal_strength DESC LIMIT 10`,
      [assetFilter]
    );

    const mapRow = (row: any) => ({
      symbol: row.symbol,
      name: row.name,
      price: row.price,
      changePercent: row.change_percent,
      signal: row.signal,
      rsi: row.rsi,
    });

    res.json({
      gainers: gainers.rows.map(mapRow),
      losers: losers.rows.map(mapRow),
      strongBuys: strongBuys.rows.map(mapRow),
    });
  } catch (err) {
    console.error("Error fetching top performers:", err);
    res.status(500).json({ error: "Failed to fetch top performers" });
  }
});

router.get("/api/stocks/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;

    const stockResult = await pool.query(
      `SELECT * FROM computed_signals WHERE symbol = $1`,
      [symbol.toUpperCase()]
    );

    if (stockResult.rows.length === 0) {
      return res.status(404).json({ error: "Stock not found" });
    }

    const stock = stockResult.rows[0];

    const priceResult = await pool.query(
      `SELECT date, open, high, low, close, volume FROM price_history WHERE symbol = $1 ORDER BY date ASC`,
      [symbol.toUpperCase()]
    );

    const bars: StockBar[] = priceResult.rows.map(row => ({
      date: row.date.toISOString().split("T")[0],
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));

    const indicators = analyzeStock(bars);

    res.json({
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      sector: stock.sector,
      indicators: indicators.slice(-90),
      summary: {
        symbol: stock.symbol,
        name: stock.name,
        exchange: stock.exchange,
        sector: stock.sector,
        price: stock.price,
        change: stock.change_val,
        changePercent: stock.change_percent,
        signal: stock.signal,
        macdHistogram: stock.macd_histogram,
        macdHistogramAdjusted: stock.macd_histogram_adjusted,
        rsi: stock.rsi,
        signalStrength: stock.signal_strength,
        lastSignalChange: stock.last_signal_change,
        signalChanges: stock.signal_changes,
        dataPoints: stock.data_points,
        volume: stock.volume,
      },
    });
  } catch (err) {
    console.error("Error fetching stock detail:", err);
    res.status(500).json({ error: "Failed to fetch stock detail" });
  }
});

router.get("/api/stats", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type as string);

    const total = await pool.query(`SELECT COUNT(*) as count FROM computed_signals WHERE asset_type = $1`, [assetFilter]);
    const buys = await pool.query(`SELECT COUNT(*) as count FROM computed_signals WHERE asset_type = $1 AND signal = 'BUY'`, [assetFilter]);
    const sells = await pool.query(`SELECT COUNT(*) as count FROM computed_signals WHERE asset_type = $1 AND signal = 'SELL'`, [assetFilter]);
    const holds = await pool.query(`SELECT COUNT(*) as count FROM computed_signals WHERE asset_type = $1 AND signal = 'HOLD'`, [assetFilter]);
    const lastUpdate = await pool.query(`SELECT MAX(computed_at) as last_update FROM computed_signals WHERE asset_type = $1`, [assetFilter]);

    res.json({
      total: parseInt(total.rows[0].count),
      buys: parseInt(buys.rows[0].count),
      sells: parseInt(sells.rows[0].count),
      holds: parseInt(holds.rows[0].count),
      lastUpdate: lastUpdate.rows[0].last_update,
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/api/symbols", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type as string);
    const result = await pool.query(
      `SELECT DISTINCT symbol FROM price_history WHERE asset_type = $1 ORDER BY symbol`,
      [assetFilter]
    );
    res.json(result.rows.map(r => r.symbol));
  } catch (err) {
    console.error("Error fetching symbols:", err);
    res.status(500).json({ error: "Failed to fetch symbols" });
  }
});

router.get("/api/data-range", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type as string);
    const result = await pool.query(
      `SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(DISTINCT symbol) as symbol_count, COUNT(*) as total_bars FROM price_history WHERE asset_type = $1`,
      [assetFilter]
    );
    const row = result.rows[0];
    res.json({
      minDate: row.min_date ? row.min_date.toISOString().split("T")[0] : null,
      maxDate: row.max_date ? row.max_date.toISOString().split("T")[0] : null,
      symbolCount: parseInt(row.symbol_count),
      totalBars: parseInt(row.total_bars),
    });
  } catch (err) {
    console.error("Error fetching data range:", err);
    res.status(500).json({ error: "Failed to fetch data range" });
  }
});

router.post("/api/simulation/run", async (req, res) => {
  try {
    const body: SimulationRequest = req.body;

    if (!body.startDate) {
      return res.status(400).json({ error: "startDate is required" });
    }

    const endDate = body.endDate || new Date().toISOString().split("T")[0];
    const initialCapital = body.initialCapital || 10000;
    const params = { ...defaultStrategy, ...body.strategy };

    const result = await runSimulation(
      body.startDate,
      endDate,
      initialCapital,
      params,
      body.symbols
    );

    res.json(result);
  } catch (err: any) {
    console.error("Simulation error:", err);
    res.status(500).json({ error: err.message || "Simulation failed" });
  }
});

router.post("/api/simulation/compare", async (req, res) => {
  try {
    const body: CompareRequest = req.body;

    const strategies = body.strategies.map(s => ({
      name: s.name,
      params: { ...defaultStrategy, ...s.params },
    }));

    const result = await compareStrategies(
      strategies,
      body.periods || [5, 10, 20],
      body.initialCapital || 10000,
      body.iterations || 10,
      body.symbols
    );

    res.json(result);
  } catch (err: any) {
    console.error("Compare error:", err);
    res.status(500).json({ error: err.message || "Comparison failed" });
  }
});

router.post("/api/simulation/market-conditions", async (req, res) => {
  try {
    const body: MarketConditionsRequest = req.body;

    const strategies = body.strategies.map(s => ({
      name: s.name,
      params: { ...defaultStrategy, ...s.params },
    }));

    const result = await analyzeMarketConditions(
      strategies,
      body.initialCapital || 10000,
      body.benchmark || "SPY",
      body.symbols
    );

    res.json(result);
  } catch (err: any) {
    console.error("Market conditions error:", err);
    res.status(500).json({ error: err.message || "Market conditions analysis failed" });
  }
});

export default router;
