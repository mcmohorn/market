# MATEO - Market Analysis Terminal

## Overview
MATEO is a full-stack web application designed for comprehensive stock and cryptocurrency market analysis. It leverages MACD and RSI indicators to generate BUY/SELL/HOLD signals for major US exchanges. The platform features a distinctive dark "cyber-finance-hacker" themed interface and includes robust trading simulation capabilities for backtesting and strategy comparison. The project aims to provide users with a powerful tool for market insights, strategic planning, and performance evaluation in a secure and self-contained environment.

## User Preferences
- Dark "cyber-finance-hacker" theme with black background and green accents
- Data stored in PostgreSQL database to eliminate reliance on external APIs per request
- Trading simulation with configurable strategy parameters
- Strategy comparison across 10, 20, 30 year periods
- Market conditions analysis (bull vs bear performance)
- Crypto and stocks should be separate views with a toggle in the header
- Time navigation buttons to view historical data (back 1 day, 1 week, 1 month, etc.)

## System Architecture
The application is built as a full-stack web application using TypeScript. The frontend is developed with React 19, Vite, AG Grid Community, Recharts, and styled with TailwindCSS, adhering to a dark cyber/hacker aesthetic. The backend is an Express.js server responsible for API endpoints, data management, and simulation logic. PostgreSQL is used as the primary and only data store for all market data, historical prices, and computed signals. The system supports detailed stock and crypto analysis, trading simulations, and strategy comparisons, including market condition analysis (bull/bear/sideways markets).

### Project Structure
- `client/` - React frontend (Vite, TailwindCSS, AG Grid, Recharts)
  - `src/pages/` - Market Scanner, Simulation Lab pages
  - `src/components/` - Reusable UI components
- `server/` - Express.js backend
  - `routes.ts` - All API route handlers (PostgreSQL queries)
  - `simulation.ts` - Trading simulation engine
  - `db.ts` - PostgreSQL pool and initDB()
  - `seed.ts` - Full data seed from Alpaca/Tiingo → PostgreSQL
  - `seed-extend.ts` - Incremental data extension (smart, skips already-seeded symbols)
  - `seed-stocks-extend.ts` - Stock-only extension for specific year ranges
  - `seed-crypto-extend.ts` - Crypto-only extension from Tiingo
  - `backfill-sectors.ts` - Classifies stocks into sectors
- `shared/` - Shared TypeScript types
  - `indicators.ts` - MACD, RSI calculations
  - `types.ts` - All shared type definitions
- `dev.sh` - Development script (starts API + Vite)
- `vite.config.ts` - Vite configuration with proxy to API server

### Key Technologies
- **Language**: TypeScript (Node.js)
- **Frontend**: React 19, Vite, AG Grid Community, Recharts, TailwindCSS
- **Backend**: Express.js
- **Database**: PostgreSQL (Replit's built-in Neon-backed database) - sole data store for runtime AND seeding
- **APIs**: Alpaca (stocks), Tiingo (crypto data) - for data seeding only
- **Analysis**: MACD, RSI technical indicators
- **Theme**: Dark cyber/hacker aesthetic (black bg, green accents)

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection (auto-provided by Replit) - **required for runtime**
- `ALPACA_API_KEY_ID` - Alpaca API key (for data seeding only)
- `ALPACA_API_KEY_SECRET` - Alpaca API secret (for data seeding only)
- `TIINGO_API_TOKEN` - Tiingo API token for crypto data (for data seeding only)

### PostgreSQL Schema
- `stocks` - Stock/crypto metadata (symbol, name, exchange, sector, asset_type)
- `price_history` - Historical OHLCV data (symbol, date, open, high, low, close, volume, asset_type)
- `computed_signals` - Pre-computed MACD/RSI signals (symbol, signal, price, etc., asset_type)
- All tables use `asset_type` column ('stock' or 'crypto') to differentiate data
- Unique constraints: `stocks(symbol, asset_type)`, `price_history(symbol, date, asset_type)`, `computed_signals(symbol, asset_type)`
- Indexes: price_history(asset_type, date), price_history(symbol, asset_type, date), computed_signals(asset_type, signal, change_percent)

### API Endpoints
- `GET /api/stocks` - List stocks with filtering, sorting, search (supports `asset_type`, `as_of_date`)
- `GET /api/stocks/top-performers` - Top gainers, losers, strong buys (supports `asset_type`, `as_of_date`)
- `GET /api/stocks/signal-alerts` - Recent signal change alerts
- `GET /api/stocks/:symbol` - Detailed stock data with indicators
- `GET /api/stats` - Market statistics (signal counts, last update)
- `GET /api/sectors` - Available sectors
- `GET /api/symbols` - All symbols
- `GET /api/data-range` - Date range and data volume
- `POST /api/simulation/run` - Run trading simulation with strategy params
- `POST /api/simulation/compare` - Compare strategies across time periods
- `POST /api/simulation/market-conditions` - Analyze strategy in bull/bear/sideways markets

### Runtime Data Flow
- All runtime queries go directly to PostgreSQL via `pool.query()` with parameterized queries ($1, $2, etc.)
- `routes.ts` and `simulation.ts` import `pool` from `./db`
- Asset type filtering via `asset_type` column in WHERE clauses ('stock' or 'crypto')
- Database initialized on server startup via `initDB()` which creates tables if they don't exist

### Seeding Commands
- `npx tsx server/seed.ts` - Full seed (fetches all stocks from Alpaca + crypto from Tiingo, computes signals)
- `npx tsx server/seed-extend.ts` - Smart incremental extend (skips already-complete symbols, env: BATCH_LIMIT)
- `npx tsx server/seed-stocks-extend.ts` - Stock extension by year (env: START_YEAR, END_YEAR, OFFSET, LIMIT)
- `npx tsx server/seed-crypto-extend.ts` - Crypto extension from Tiingo
- `npx tsx server/backfill-sectors.ts` - Classify stocks into sectors

### Running
Development: `bash dev.sh` (starts API server on 3001 + Vite on 5000)

## Recent Changes
- 2026-02-17: Fully disconnected BigQuery - PostgreSQL is now sole data store
  - Removed @google-cloud/bigquery dependency and all BigQuery-related files
  - Rewrote all seed scripts (seed.ts, seed-stocks-extend.ts, seed-crypto-extend.ts) to write only to PostgreSQL
  - All runtime routes and simulation use PostgreSQL pool.query()
  - GOOGLE_CREDENTIALS_JSON no longer needed
- 2026-02-17: Migrated runtime from BigQuery to PostgreSQL
  - All routes.ts endpoints rewritten for PostgreSQL ($1 params, ILIKE, = ANY())
  - simulation.ts loadPriceData rewritten for PostgreSQL
  - Added composite indexes for performance
  - PostgreSQL benchmarked 10-15x faster than BigQuery for simulation workloads
- 2026-02-17: Added simulation settings: maxTradesPerDay, minHoldDays, useEndOfDayPrices
- 2026-02-13: Added "Prefer New Buys" simulation setting
