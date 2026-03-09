# MATEO - Market Analysis Terminal

## Overview
MATEO is a full-stack web application designed for comprehensive stock and cryptocurrency market analysis. It leverages MACD and RSI indicators to generate BUY/SELL/HOLD signals for major US exchanges. The platform features a distinctive dark "cyber-finance-hacker" themed interface and includes robust trading simulation capabilities for backtesting and strategy comparison, paper money trading, market news aggregation from Reddit, and prediction tracking with algorithm versioning.

## User Preferences
- Dark "cyber-finance-hacker" theme with black background and green accents
- Data stored in PostgreSQL database to eliminate reliance on external APIs per request
- Trading simulation with configurable strategy parameters
- Strategy comparison across 10, 20, 30 year periods
- Market conditions analysis (bull vs bear performance)
- Crypto and stocks should be separate views with a toggle in the header
- Time navigation buttons to view historical data (back 1 day, 1 week, 1 month, etc.)
- Paper money trading with localStorage persistence
- Market news from Reddit communities (WSB, r/stocks, r/cryptocurrency, etc.)
- Daily/Weekly/Monthly recaps with prediction tracking
- Algorithm versioning to track trading rule effectiveness
- Sell alerts when paper money holdings have SELL signals

## System Architecture
The application is built as a full-stack web application using TypeScript. The frontend is developed with React 19, Vite, AG Grid Community, Recharts, and styled with TailwindCSS, adhering to a dark cyber/hacker aesthetic. The backend is an Express.js server responsible for API endpoints, data management, and simulation logic. PostgreSQL is used as the primary and only data store for all market data, historical prices, computed signals, predictions, news, and algorithm versions.

### Project Structure
- `client/` - React frontend (Vite, TailwindCSS, AG Grid, Recharts)
  - `src/pages/` - Market Scanner, Simulation Lab, Paper Money, Market News, Recaps
  - `src/components/` - Reusable UI components (SellAlertBanner, etc.)
  - `src/lib/api.ts` - Centralized API client functions
- `server/` - Express.js backend
  - `routes.ts` - All API route handlers (PostgreSQL queries)
  - `simulation.ts` - Trading simulation engine
  - `news.ts` - Reddit/community news scraper and classifier
  - `predictions.ts` - Prediction generation, evaluation, and algorithm versioning
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
- **Database**: PostgreSQL (Replit's built-in Neon-backed database) - sole data store
- **APIs**: Alpaca (stocks), Tiingo (crypto data) - for data seeding only; Reddit JSON API - for news
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
- `predictions` - Daily predictions with outcomes (symbol, predicted_signal, predicted_date, actual_signal, correct, algorithm_version)
- `algorithm_versions` - Algorithm version tracking (version_num, params JSONB, accuracy_pct, total_predictions, correct_predictions)
- `market_news` - Cached Reddit/community news (source, subreddit, title, url, score, sector, asset_type, mentioned_symbols)
- `daily_recaps` - Generated recap summaries (recap_date, recap_type, top_movers JSONB, prediction_accuracy JSONB)
- All tables use `asset_type` column ('stock' or 'crypto') to differentiate data

### API Endpoints
- `GET /api/stocks` - List stocks with filtering, sorting, search (supports `asset_type`, `as_of_date`)
- `GET /api/stocks/top-performers` - Top gainers, losers, strong buys
- `GET /api/stocks/signal-alerts` - Recent signal change alerts
- `GET /api/stocks/:symbol` - Detailed stock data with indicators
- `GET /api/stats` - Market statistics (signal counts, last update)
- `GET /api/sectors` - Available sectors
- `GET /api/symbols` - All symbols
- `GET /api/data-range` - Date range and data volume
- `POST /api/simulation/run` - Run trading simulation
- `POST /api/simulation/compare` - Compare strategies
- `POST /api/simulation/market-conditions` - Analyze market conditions
- `GET /api/news` - Get cached news (filters: asset_type, sector, source)
- `POST /api/news/refresh` - Scrape fresh news from Reddit
- `GET /api/news/summary` - Get news summary with sentiment analysis
- `GET /api/predictions/recap/:type` - Get daily/weekly/monthly recap
- `POST /api/predictions/generate` - Generate daily predictions and evaluate past ones
- `GET /api/algorithm/versions` - List algorithm versions with accuracy
- `POST /api/algorithm/version` - Create new algorithm version
- `GET /api/paper-money/signals` - Get signals for paper money holdings

### App Pages
1. **Market Scanner** - Main dashboard with stats, signals, top performers, stock grid
2. **Simulation Lab** - Backtesting with strategy comparison and market conditions
3. **Paper Money** - Simulated trading with localStorage (add cash, buy/sell, balance chart)
4. **Market News** - Reddit news aggregation with filters, sentiment summary, hot topics
5. **Recaps** - Daily/Weekly/Monthly recaps with prediction accuracy, algorithm version tracking

### Features
- **Sell Alert Banner** - Checks paper money holdings against current signals on page load, shows prominent red alert when SELL signal detected
- **Paper Money** - All in localStorage under key `mateo_paper_portfolio`, no server-side state needed
- **News Scraping** - Scrapes r/wallstreetbets, r/stocks, r/cryptocurrency, r/investing, r/options using Reddit JSON API
- **Prediction Tracking** - Stores BUY/SELL predictions, compares to actual price movement next day
- **Algorithm Versioning** - Tracks parameter changes, accuracy per version, helps identify best-performing algorithms

### Seeding Commands
- `yarn seed-db` / `npx tsx server/seed.ts` - Full seed (fetches all stocks from Alpaca + crypto from Tiingo, computes signals)
- `yarn update-db` / `npx tsx server/update.ts` - Incremental update (only fetches bars after each symbol's last date, only recomputes signals for updated symbols)
- `npx tsx server/seed-extend.ts` - Smart incremental extend (skips already-complete symbols, env: BATCH_LIMIT)
- `npx tsx server/seed-stocks-extend.ts` - Stock extension by year (env: START_YEAR, END_YEAR, OFFSET, LIMIT)
- `npx tsx server/seed-crypto-extend.ts` - Crypto extension from Tiingo
- `npx tsx server/backfill-sectors.ts` - Classify stocks into sectors

### Running
Development: `bash dev.sh` (starts API server on 3001 + Vite on 5000)

## Recent Changes
- 2026-03-09: Added Paper Money, Market News, Recaps, Predictions, Algorithm Versioning
  - Paper Money: localStorage-based simulated trading with balance chart and trade history
  - Market News: Reddit scraper for WSB, stocks, crypto, investing, options subs
  - Recaps: Daily/Weekly/Monthly views with prediction accuracy tracking
  - Predictions: Auto-generate from computed_signals, evaluate against actual outcomes
  - Algorithm Versioning: Track parameter versions and their accuracy over time
  - Sell Alert Banner: Prominent red alert when paper money holdings have SELL signals
  - New DB tables: predictions, algorithm_versions, market_news, daily_recaps
  - New server files: news.ts, predictions.ts
  - New API endpoints for news, predictions, recaps, algorithm versions
  - New pages: PaperMoneyPage, MarketNewsPage, RecapsPage
  - client/src/lib/api.ts centralized API client
- 2026-02-17: Fully disconnected BigQuery - PostgreSQL is now sole data store
- 2026-02-17: Migrated runtime from BigQuery to PostgreSQL
- 2026-02-17: Added simulation settings: maxTradesPerDay, minHoldDays, useEndOfDayPrices
- 2026-02-13: Added "Prefer New Buys" simulation setting
