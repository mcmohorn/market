import { Router } from "express";
import { queryBigQuery, getDataset, tbl, normalizeDate } from "./bigquery";
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
  preferNewBuys: false,
  newBuyLookbackDays: 5,
  maxTradesPerDay: 10,
  minHoldDays: 0,
  useEndOfDayPrices: true,
};

const router = Router();

function getAssetTypeFilter(assetType: string | undefined): string {
  if (assetType === "crypto") return "crypto";
  return "stock";
}

async function computeSignalsAsOfDate(assetFilter: string, asOfDate: string, signalFilter?: string, searchFilter?: string, sortCol?: string, sortOrder?: string, lim?: number, off?: number, sectorFilter?: string) {
  const ds = getDataset(assetFilter);
  const priceTable = tbl(ds, "price_history");
  const metaTable = tbl(ds, "metadata");

  const symbolsRows = await queryBigQuery(
    `SELECT DISTINCT ph.symbol, m.name, m.exchange, m.sector
     FROM ${priceTable} ph
     LEFT JOIN ${metaTable} m ON m.symbol = ph.symbol
     ORDER BY ph.symbol`
  );

  const allResults: any[] = [];

  const allPriceRows = await queryBigQuery(
    `SELECT symbol, date, open, high, low, close, volume
     FROM ${priceTable}
     WHERE date <= @asOfDate
     ORDER BY symbol, date ASC`,
    { asOfDate }
  );

  const bySymbol = new Map<string, any[]>();
  for (const r of allPriceRows) {
    const sym = r.symbol;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(r);
  }

  const metaMap = new Map<string, any>();
  for (const row of symbolsRows) {
    metaMap.set(row.symbol, row);
  }

  for (const [sym, priceRows] of bySymbol.entries()) {
    if (priceRows.length < 2) continue;

    const meta = metaMap.get(sym) || { name: sym, exchange: "", sector: "" };

    if (sectorFilter && sectorFilter !== "ALL" && (meta.sector || "") !== sectorFilter) continue;
    if (searchFilter && !sym.toLowerCase().includes(searchFilter.toLowerCase()) &&
        !(meta.name || "").toLowerCase().includes(searchFilter.toLowerCase())) continue;

    const bars: StockBar[] = priceRows.map((r: any) => ({
      date: normalizeDate(r.date),
      open: parseFloat(r.open),
      high: parseFloat(r.high),
      low: parseFloat(r.low),
      close: parseFloat(r.close),
      volume: parseInt(r.volume),
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

    allResults.push({
      symbol: sym,
      name: meta.name || sym,
      exchange: meta.exchange || "",
      sector: meta.sector || "",
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
    const ds = getDataset(assetFilter);
    const signalsTable = tbl(ds, "computed_signals");

    const rows = await queryBigQuery(
      `SELECT symbol, name, exchange, sector, signal, price, change_percent,
              last_signal_change, signal_changes, data_points
       FROM ${signalsTable}
       WHERE last_signal_change IS NOT NULL
         AND last_signal_change != ''
         AND signal_changes > 0
         AND data_points >= 60
       ORDER BY last_signal_change DESC
       LIMIT 200`
    );

    const now = new Date();
    const alerts = rows
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
    const ds = getDataset(assetFilter);
    const metaTable = tbl(ds, "metadata");

    const rows = await queryBigQuery(
      `SELECT DISTINCT sector FROM ${metaTable}
       WHERE sector IS NOT NULL AND sector != ''
       ORDER BY sector`
    );
    res.json(rows.map(r => r.sector));
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

    const ds = getDataset(assetFilter);
    const signalsTable = tbl(ds, "computed_signals");

    let whereClauses: string[] = [];
    const params: any = {};

    if (signal && signal !== "ALL") {
      whereClauses.push(`signal = @signal`);
      params.signal = signal;
    }

    if (search) {
      whereClauses.push(`(LOWER(symbol) LIKE LOWER(@search) OR LOWER(name) LIKE LOWER(@search))`);
      params.search = `%${search}%`;
    }

    if (sector && sector !== "ALL") {
      whereClauses.push(`sector = @sector`);
      params.sector = sector;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const sortColMap: Record<string, string> = {
      symbol: "symbol", name: "name", price: "price",
      change_percent: "change_percent", signal: "signal",
      rsi: "rsi", macd_histogram: "macd_histogram",
      signal_strength: "signal_strength", volume: "volume",
      macd_histogram_adjusted: "macd_histogram_adjusted",
    };
    const safeSort = sortColMap[(sort as string) || "change_percent"] || "change_percent";
    const sortOrder = (order as string) === "asc" ? "ASC" : "DESC";

    const dataRows = await queryBigQuery(
      `SELECT * FROM ${signalsTable} ${whereStr} ORDER BY ${safeSort} ${sortOrder} LIMIT @lim OFFSET @off`,
      { ...params, lim, off }
    );

    const countRows = await queryBigQuery(
      `SELECT COUNT(*) as total FROM ${signalsTable} ${whereStr}`,
      params
    );

    res.json({
      data: dataRows.map(row => ({
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
      total: parseInt(countRows[0].total),
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

    const ds = getDataset(assetFilter);
    const signalsTable = tbl(ds, "computed_signals");

    const gainers = await queryBigQuery(
      `SELECT * FROM ${signalsTable} ORDER BY change_percent DESC LIMIT 10`
    );
    const losers = await queryBigQuery(
      `SELECT * FROM ${signalsTable} ORDER BY change_percent ASC LIMIT 10`
    );
    const strongBuys = await queryBigQuery(
      `SELECT * FROM ${signalsTable} WHERE signal = 'BUY' ORDER BY signal_strength DESC LIMIT 10`
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
      gainers: gainers.map(mapRow),
      losers: losers.map(mapRow),
      strongBuys: strongBuys.map(mapRow),
    });
  } catch (err) {
    console.error("Error fetching top performers:", err);
    res.status(500).json({ error: "Failed to fetch top performers" });
  }
});

router.get("/api/stocks/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();

    const stockRows = await queryBigQuery(
      `SELECT * FROM ${tbl("stocks", "computed_signals")} WHERE symbol = @symbol
       UNION ALL
       SELECT * FROM ${tbl("crypto", "computed_signals")} WHERE symbol = @symbol
       LIMIT 1`,
      { symbol: upperSymbol }
    );

    if (stockRows.length === 0) {
      return res.status(404).json({ error: "Stock not found" });
    }

    const stock = stockRows[0];
    const ds = stock.asset_type === "crypto" ? "crypto" : "stocks";

    const priceRows = await queryBigQuery(
      `SELECT date, open, high, low, close, volume
       FROM ${tbl(ds, "price_history")}
       WHERE symbol = @symbol
       ORDER BY date ASC`,
      { symbol: upperSymbol }
    );

    const bars: StockBar[] = priceRows.map(row => ({
      date: normalizeDate(row.date),
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseInt(row.volume),
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
    const ds = getDataset(assetFilter);
    const signalsTable = tbl(ds, "computed_signals");

    const rows = await queryBigQuery(
      `SELECT
        COUNT(*) as total,
        COUNTIF(signal = 'BUY') as buys,
        COUNTIF(signal = 'SELL') as sells,
        COUNTIF(signal = 'HOLD') as holds,
        MAX(computed_at) as last_update
       FROM ${signalsTable}`
    );

    const row = rows[0];
    res.json({
      total: parseInt(row.total),
      buys: parseInt(row.buys),
      sells: parseInt(row.sells),
      holds: parseInt(row.holds),
      lastUpdate: row.last_update?.value || row.last_update || null,
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/api/symbols", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type as string);
    const ds = getDataset(assetFilter);

    const rows = await queryBigQuery(
      `SELECT DISTINCT symbol FROM ${tbl(ds, "price_history")} ORDER BY symbol`
    );
    res.json(rows.map(r => r.symbol));
  } catch (err) {
    console.error("Error fetching symbols:", err);
    res.status(500).json({ error: "Failed to fetch symbols" });
  }
});

router.get("/api/data-range", async (req, res) => {
  try {
    const assetFilter = getAssetTypeFilter(req.query.asset_type as string);
    const ds = getDataset(assetFilter);

    const rows = await queryBigQuery(
      `SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(DISTINCT symbol) as symbol_count, COUNT(*) as total_bars
       FROM ${tbl(ds, "price_history")}`
    );
    const row = rows[0];
    res.json({
      minDate: normalizeDate(row.min_date),
      maxDate: normalizeDate(row.max_date),
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
      body.symbols,
      body.assetType,
      body.exchange
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
      body.symbols,
      body.assetType,
      body.exchange
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
      body.symbols,
      body.assetType,
      body.exchange
    );

    res.json(result);
  } catch (err: any) {
    console.error("Market conditions error:", err);
    res.status(500).json({ error: err.message || "Market conditions analysis failed" });
  }
});

export default router;
