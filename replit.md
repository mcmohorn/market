# MATEO - Market Analysis Terminal

## Overview
A full-stack web application for stock and cryptocurrency market analysis. Uses MACD and RSI indicators to analyze market data and provide BUY/SELL/HOLD signals for major US exchanges. Features a dark "cyber-finance-hacker" themed interface with trading simulation capabilities.

## Project Architecture

### Directory Structure
- `server/` - Express.js backend (TypeScript)
  - `dev.ts` - Development server entry point (port 3001)
  - `index.ts` - Production server entry point
  - `routes.ts` - All API endpoints (stocks, simulation, comparison, market conditions)
  - `db.ts` - PostgreSQL connection and schema initialization
  - `bigquery.ts` - Google BigQuery connection, table setup, query helpers
  - `seed.ts` - Data seeding script (pulls from Alpaca/Tiingo, writes to PostgreSQL + BigQuery)
  - `seed-stocks-extend.ts` - Extend stock history year-by-year
  - `seed-crypto-extend.ts` - Extend crypto history back to 2016
  - `simulation.ts` - Trading simulation engine (backtesting, comparison, market conditions)
- `Dockerfile` - Multi-stage Docker build for Cloud Run
- `cloudbuild.yaml` - Google Cloud Build config for CI/CD to Cloud Run
- `client/` - React frontend (Vite, TypeScript)
  - `src/App.tsx` - Main app with navigation (Market Scanner, Simulation Lab)
  - `src/components/` - UI components (Header, StockGrid, TopPerformers, EquityCurve, TradeLog, etc.)
  - `src/pages/SimulationPage.tsx` - Simulation Lab page with parameter controls
  - `src/lib/api.ts` - API client functions
- `shared/` - Shared TypeScript types and indicator calculations
  - `types.ts` - All data types (StockAnalysis, SimulationResult, StrategyParams, etc.)
  - `indicators.ts` - MACD, RSI calculations (ported from Go)
- `go-reference/` - Original Go TUI code (archived for reference)
- `dev.sh` - Development script (starts API + Vite)
- `vite.config.ts` - Vite configuration with proxy to API server

### Key Technologies
- **Language**: TypeScript (Node.js)
- **Frontend**: React 19, Vite, AG Grid Community, Recharts, TailwindCSS
- **Backend**: Express.js
- **Database**: Google BigQuery (GCP project: market-487302) - primary and only runtime data store
- **BigQuery Datasets**: `stocks` (stock data), `crypto` (crypto data)
- **PostgreSQL**: Only used by seeding scripts (optional via ALSO_WRITE_POSTGRES flag), NOT used at runtime
- **APIs**: Alpaca (stocks), Tiingo (crypto data)
- **Analysis**: MACD, RSI technical indicators
- **Theme**: Dark cyber/hacker aesthetic (black bg, green accents)

### Environment Variables Required
- `GOOGLE_CREDENTIALS_JSON` - GCP service account JSON key (for BigQuery access) - **required for runtime**
- `ALPACA_API_KEY_ID` - Alpaca API key (for data seeding only)
- `ALPACA_API_KEY_SECRET` - Alpaca API secret (for data seeding only)
- `TIINGO_API_TOKEN` - Tiingo API token for crypto data (for data seeding only)
- `DATABASE_URL` - PostgreSQL connection (only needed by seeding scripts, auto-provided by Replit)
- `ALSO_WRITE_POSTGRES` - Set to "false" to skip PostgreSQL writes during seeding (default: true)

### BigQuery Schema (project: market-487302)
- `stocks.price_history` - Historical OHLCV data for stocks
- `stocks.metadata` - Stock metadata (symbol, name, exchange, sector)
- `stocks.computed_signals` - Pre-computed MACD/RSI signals for stocks
- `crypto.price_history` - Historical OHLCV data for crypto
- `crypto.metadata` - Crypto metadata
- `crypto.computed_signals` - Pre-computed signals for crypto

### API Endpoints
- `GET /api/stocks` - List stocks with filtering, sorting, search (supports `asset_type`, `as_of_date`)
- `GET /api/stocks/top-performers` - Top gainers, losers, strong buys (supports `asset_type`, `as_of_date`)
- `GET /api/stocks/:symbol` - Stock detail with indicator history
- `GET /api/stats` - Market statistics by asset type (supports `asset_type`)
- `GET /api/symbols` - List all available symbols (supports `asset_type`)
- `GET /api/data-range` - Data date range info (supports `asset_type`)
- `POST /api/simulation/run` - Run trading simulation with strategy params
- `POST /api/simulation/compare` - Compare strategies across time periods
- `POST /api/simulation/market-conditions` - Analyze strategy in bull/bear/sideways markets

### Runtime Data Flow
- All runtime queries go directly to BigQuery (no PostgreSQL dependency)
- `routes.ts` and `simulation.ts` use `queryBigQuery()` with parameterized queries
- Dataset resolved at runtime based on asset_type: "stock" → `stocks`, "crypto" → `crypto`
- Helper functions: `getDataset()`, `tbl()`, `normalizeDate()` in `bigquery.ts`

### Running
Development: `bash dev.sh` (starts API server on 3001 + Vite on 5000)
Seed data: `npx tsx server/seed.ts` (requires API keys + optionally BigQuery credentials)

## User Preferences
- Dark "cyber-finance-hacker" theme with black background and green accents
- Data stored in own database (BigQuery + PostgreSQL) to eliminate reliance on external APIs per request
- Trading simulation with configurable strategy parameters
- Strategy comparison across 10, 20, 30 year periods
- Market conditions analysis (bull vs bear performance)
- BigQuery as primary data warehouse (GCP project: market-487302, datasets: stocks, crypto)
- Crypto and stocks should be separate views with a toggle in the header
- Time navigation buttons to view historical data (back 1 day, 1 week, 1 month, etc.)

## Recent Changes
- 2026-02-13: Added "Prefer New Buys" simulation setting
  - New StrategyParams: preferNewBuys (boolean), newBuyLookbackDays (number, default 5)
  - When enabled, simulation prioritizes buying symbols that recently flipped to BUY
  - Slow movers (symbols that rarely change signal) get higher priority via rarityBoost
  - Scoring: newBuyScore = recencyBoost * rarityBoost (recency decays over lookback window, rarity capped at 5x)
  - Checkbox toggle + lookback days slider in Advanced Settings
  - Trade log shows "New buy score" in reason when feature triggers a buy
- 2026-02-13: Added exchange filter to Simulation Lab
  - Clickable pill buttons for ALL, NYSE, NASDAQ, ARCA, BATS, AMEX (stocks only)
  - Filters simulation data by joining price_history with stocks table on exchange
  - Applied to all three modes: simulate, compare, market conditions
  - Exchange field added to SimulationRequest, CompareRequest, MarketConditionsRequest types
- 2026-02-13: Added clickable symbol filter in Trade Log
  - Click any ticker symbol in trade log to filter by that symbol
  - Green filter pill with X button to clear filter
  - Shows filtered/total count (e.g. "12/340 trades")
- 2026-02-13: Added assetType filtering to Simulation Lab
  - All three simulation modes (run, compare, market conditions) filter by current Stocks/Crypto toggle
  - SymbolPicker reloads and clears selection when asset type changes
  - Market Conditions uses BTC as benchmark for crypto, SPY for stocks
- 2026-02-13: Added HOLD signal with combined multi-indicator rule-set
  - New indicators: ADX (14-period Welles Wilder), 50-period MA, Bollinger Bandwidth (20-period)
  - HOLD triggers when 4 of 5 conditions met: RSI 45-55, MACD histogram <0.1% of price, no crossover in 5 bars, price within 2% of MA50, ADX <20
  - IndicatorData type extended with adx, ma50, bollingerBandwidth fields
  - RSI standardized to Wilder smoothing across both shared indicators and simulation engine
  - HOLD appears in scanner grid (yellow), stats bar, and historical recomputation
- 2026-02-13: Added portfolio symbol picker to Simulation Lab
  - SymbolPicker component with search/type-ahead, selected chips, and clear all
  - Optional multi-select — leave empty to trade all symbols, or pick specific ones
  - Wired to all three simulation modes (simulate, compare, market conditions)
- 2026-02-13: Added Signal Change Alerts section
  - New /api/stocks/signal-alerts endpoint with alertScore ranking (slow movers ranked higher)
  - SignalAlerts component above TopPerformers shows recent BUY↔SELL flips
  - Cards show signal direction, last change date, avg days between flips, total flip count
  - "RARE" badge on stocks averaging 20+ days between signal changes
  - Alert score = avgDaysBetweenChanges / daysSinceChange (higher = more notable)
- 2026-02-13: Added sector filter for stocks
  - Sector backfill script classifies 4374 stocks into sectors (Technology, Healthcare, Energy, etc.)
  - GET /api/sectors endpoint returns available sectors
  - GET /api/stocks supports `sector` query parameter for filtering
  - Sector filter bar in Market Scanner (stocks only) with clickable sector pills
  - SECTOR column added to grid for stocks
  - Sectors: Technology, Healthcare, Financial Services, Energy, Consumer Discretionary, Consumer Staples, Industrials, Real Estate, Communication Services, Materials, Utilities, ETF/Fund, SPAC, Other
- 2026-02-13: Added crypto/stocks toggle and time navigation
  - Header has Stocks/Crypto toggle button next to LIVE indicator
  - All API endpoints filter by asset_type (stock vs crypto)
  - Time navigation buttons (LATEST, -1D, -1W, -1M, -3M, -6M, -1Y) in scanner
  - Historical date queries recompute MACD/RSI signals from price_history on-the-fly
  - TopPerformers and StockGrid both respond to time jumps
  - StatsBar shows "Historical" label when viewing past dates
- 2026-02-13: Added BigQuery integration
  - BigQuery connection module with table auto-creation
  - Seed script writes to both PostgreSQL (runtime) and BigQuery (warehouse)
  - Datasets: stocks (stock data), crypto (crypto data)
  - Tables: price_history, metadata, computed_signals per dataset
- 2026-02-13: Built trading simulation engine
  - runSimulation endpoint with configurable MACD/RSI parameters
  - Strategy comparison across multiple time periods
  - Market conditions analysis (bull/bear/sideways based on SPY 200DMA)
  - Equity curve visualization, trade log, simulation stats
  - Navigation between Market Scanner and Simulation Lab
- 2026-02-14: Added README with local run instructions, Dockerfile, cloudbuild.yaml for Cloud Run
  - Multi-stage Dockerfile (Node 20-slim, build → production)
  - Cloud Build pushes to Artifact Registry and deploys to Cloud Run
  - Production server uses import.meta.url for ESM-compatible path resolution
- 2026-02-14: Added sortable P&L column and equity curve click-to-navigate in trade log
  - Click DATE or P&L headers to sort ascending/descending
  - Click equity curve chart to jump trade log to that date
  - Auto-expands and scrolls to nearest trade with green highlight
- 2026-02-17: Added simulation settings: maxTradesPerDay, minHoldDays, useEndOfDayPrices
  - maxTradesPerDay (default 10): Limits total buys + sells per trading day; 0 = unlimited
  - minHoldDays (default 0): Minimum days to hold a position before selling (stop-loss still triggers)
  - useEndOfDayPrices (default true): When unchecked, uses open prices for trade execution instead of close
  - UI controls: slider for max trades/day (0-50), slider for min hold days (0-90), checkbox for EOD prices
- 2026-02-17: BigQuery table optimization with partitioning and clustering
  - price_history tables: PARTITION BY date, CLUSTER BY symbol (both stocks and crypto datasets)
  - computed_signals tables: PARTITION BY DATE(computed_at), CLUSTER BY symbol
  - Reduces query costs (BigQuery only scans relevant partitions) and improves performance for date-filtered queries
  - optimize-bigquery.ts script for re-partitioning (creates new table, copies, swaps)
- 2026-02-17: Benchmark results - BigQuery vs PostgreSQL
  - PostgreSQL is 10-15x faster for large full-table scans (loading all price data for simulation)
  - BigQuery is comparable for small targeted queries (single symbol, aggregations)
  - For simulation workloads (which do large date-range scans): PostgreSQL wins significantly
  - Recommendation: Use PostgreSQL for simulation queries, BigQuery for analytics/warehouse
  - Single symbol (AAPL 5yr): PG 89ms vs BQ 1337ms
  - 10 symbols (3yr): PG 1224ms vs BQ 1204ms (tie)
  - All symbols (1yr): PG 7984ms vs BQ 90220ms
  - All symbols (6mo): PG 2417ms vs BQ 26663ms
  - Crypto (BTC+ETH): PG 37ms vs BQ 2733ms
  - Aggregation: PG 3085ms vs BQ 1494ms (BQ wins)
- 2026-02-14: Removed PostgreSQL runtime dependency - BigQuery is now the only data store
  - All API endpoints (routes.ts) now query BigQuery directly using parameterized queries
  - Simulation engine (simulation.ts) loads price data from BigQuery
  - dev.ts and index.ts no longer call initDB() or require DATABASE_URL
  - Helper functions: getDataset(), tbl(), normalizeDate() for BigQuery SQL generation
  - BigQuery timestamp objects properly normalized for frontend display
- 2026-02-14: Migrated all data to BigQuery as primary data warehouse
  - Full migration of 8,403 stock symbols (7M+ price rows) and 18 crypto symbols (47K rows)
  - Migration script (migrate-to-bigquery.ts) supports MODE=setup/metadata/prices/signals with OFFSET/LIMIT for resumable batched processing
  - Seed scripts (seed.ts, seed-stocks-extend.ts, seed-crypto-extend.ts) now write to BigQuery as primary, PostgreSQL as optional secondary via ALSO_WRITE_POSTGRES flag
  - BigQuery insertRows function supports both streaming inserts and DML mode with retry logic for 404 errors
  - BigQuery data: stocks.price_history, stocks.metadata, stocks.computed_signals, crypto.price_history, crypto.metadata, crypto.computed_signals
- 2026-02-12: Rebuilt as TypeScript full-stack web app
  - Express backend + React frontend with Vite
  - PostgreSQL database with schema for stocks, price history, signals
  - Dark cyber-themed UI with AG Grid, Recharts
  - MACD/RSI indicators ported from Go to TypeScript
