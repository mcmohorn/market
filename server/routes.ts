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

router.get("/api/stocks", async (req, res) => {
  try {
    const { signal, sort, order, search, limit, offset } = req.query;

    let query = `SELECT * FROM computed_signals WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (signal && signal !== "ALL") {
      query += ` AND signal = $${paramIdx++}`;
      params.push(signal);
    }

    if (search) {
      query += ` AND (symbol ILIKE $${paramIdx} OR name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const sortCol = (sort as string) || "change_percent";
    const sortOrder = (order as string) === "asc" ? "ASC" : "DESC";
    const validCols = ["symbol", "name", "price", "change_percent", "signal", "rsi", "macd_histogram", "signal_strength", "volume", "macd_histogram_adjusted"];
    const safeSort = validCols.includes(sortCol) ? sortCol : "change_percent";
    query += ` ORDER BY ${safeSort} ${sortOrder}`;

    const lim = Math.min(parseInt(limit as string) || 100, 500);
    const off = parseInt(offset as string) || 0;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(lim, off);

    const result = await pool.query(query, params);

    const countQuery = `SELECT COUNT(*) as total FROM computed_signals WHERE 1=1${signal && signal !== "ALL" ? ` AND signal = '${signal}'` : ""}`;
    const countResult = await pool.query(countQuery);

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
    const gainers = await pool.query(
      `SELECT * FROM computed_signals ORDER BY change_percent DESC LIMIT 10`
    );
    const losers = await pool.query(
      `SELECT * FROM computed_signals ORDER BY change_percent ASC LIMIT 10`
    );
    const strongBuys = await pool.query(
      `SELECT * FROM computed_signals WHERE signal = 'BUY' ORDER BY signal_strength DESC LIMIT 10`
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
    const total = await pool.query(`SELECT COUNT(*) as count FROM computed_signals`);
    const buys = await pool.query(`SELECT COUNT(*) as count FROM computed_signals WHERE signal = 'BUY'`);
    const sells = await pool.query(`SELECT COUNT(*) as count FROM computed_signals WHERE signal = 'SELL'`);
    const holds = await pool.query(`SELECT COUNT(*) as count FROM computed_signals WHERE signal = 'HOLD'`);
    const lastUpdate = await pool.query(`SELECT MAX(computed_at) as last_update FROM computed_signals`);

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
    const result = await pool.query(
      `SELECT DISTINCT symbol FROM price_history ORDER BY symbol`
    );
    res.json(result.rows.map(r => r.symbol));
  } catch (err) {
    console.error("Error fetching symbols:", err);
    res.status(500).json({ error: "Failed to fetch symbols" });
  }
});

router.get("/api/data-range", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(DISTINCT symbol) as symbol_count, COUNT(*) as total_bars FROM price_history`
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
