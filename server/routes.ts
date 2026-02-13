import { Router } from "express";
import { pool } from "./db";
import type { StockBar } from "../shared/types";
import { analyzeStock, getSignal, getSignalStrength, countSignalChanges, lastSignalChangeDate } from "../shared/indicators";

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

export default router;
