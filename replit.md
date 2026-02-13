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
  - `simulation.ts` - Trading simulation engine (backtesting, comparison, market conditions)
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
- **Database**: PostgreSQL (Replit built-in) + Google BigQuery (GCP project: market-487302)
- **BigQuery Datasets**: `stocks` (stock data), `crypto` (crypto data)
- **APIs**: Alpaca (stocks), Tiingo (crypto data)
- **Analysis**: MACD, RSI technical indicators
- **Theme**: Dark cyber/hacker aesthetic (black bg, green accents)

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection (auto-provided by Replit)
- `ALPACA_API_KEY_ID` - Alpaca API key (for data seeding)
- `ALPACA_API_KEY_SECRET` - Alpaca API secret (for data seeding)
- `TIINGO_API_TOKEN` - Tiingo API token for crypto data (for data seeding)
- `GOOGLE_CREDENTIALS_JSON` - GCP service account JSON key (for BigQuery access)
- `USE_BIGQUERY` - Set to "false" to disable BigQuery writes (default: enabled)

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

### Database Tables (PostgreSQL - runtime queries)
- `stocks` - Stock metadata (symbol, name, exchange, sector)
- `price_history` - Historical OHLCV data
- `computed_signals` - Pre-computed analysis results (signal, indicators)

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
- 2026-02-12: Rebuilt as TypeScript full-stack web app
  - Express backend + React frontend with Vite
  - PostgreSQL database with schema for stocks, price history, signals
  - Dark cyber-themed UI with AG Grid, Recharts
  - MACD/RSI indicators ported from Go to TypeScript
