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
- `users` - Authenticated users (email, display_name, account_type free/pro, firebase_uid, notification_email_enabled)
- `watchlist` - Per-user watched symbols (user_id, symbol, asset_type, last_known_signal)
- `saved_simulations` - Per-user saved simulation runs (user_id, name, params JSONB, result_summary JSONB, start/end date)
- `notifications` - Per-user signal change alerts (user_id, symbol, message, signal_from, signal_to, read)
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
- `POST /api/auth/login` - Verify Firebase ID token, upsert user, return AppUser
- `GET /api/auth/me` - Return current user from token
- `GET /api/watchlist` - Get user's watchlist with current signals
- `POST /api/watchlist` - Add symbol to watchlist
- `DELETE /api/watchlist/:symbol` - Remove from watchlist
- `GET /api/simulations` - Get user's saved simulations
- `POST /api/simulations` - Save simulation (pro only)
- `DELETE /api/simulations/:id` - Delete saved simulation
- `GET /api/notifications` - Get user's notifications (unread first)
- `POST /api/notifications/read` - Mark all notifications read
- `GET /api/snapshot` - Static market snapshot (no auth — used by anonymous users)

### App Pages
1. **Market Scanner** - Main dashboard with stats, signals, top performers, stock grid (anonymous: top 5 preview)
2. **Simulation Lab** - Backtesting with strategy comparison and market conditions (pro only)
3. **Paper Money** - Simulated trading with localStorage (free users) or DB-persisted (pro)
4. **Market News** - Reddit news aggregation with filters, sentiment summary, hot topics
5. **Recaps** - Daily/Weekly/Monthly recaps with prediction accuracy, algorithm version tracking
6. **Watchlist** - Per-user watched symbols with current signals; add/remove (pro only)
7. **Your History** - Saved simulations (pro) + "what if" default preset runners from join date
8. **Notifications** - Signal change alerts for watchlist symbols (pro only)
9. **About** - Platform description, features, not-financial-advice disclaimer

### Auth & Access Tiers
- **Anonymous**: Market Scanner top 5 preview, News, Recaps, About — no stock detail modal
- **Free**: Full scanner, Paper Money (localStorage), News, Recaps, About, History
- **Pro** (mcmohorn@gmail.com, pbretts@yahoo.com): All tabs + Simulation Lab, Watchlist, Notifications, save simulations to DB
- Auth via Firebase (Google + Yahoo OAuth); server verifies ID tokens with firebase-admin
- Pro whitelist pre-inserted in DB via ON CONFLICT upsert in server/db.ts

### Features
- **Sell Alert Banner** - Checks paper money holdings against current signals on page load, shows prominent red alert when SELL signal detected
- **Paper Money** - All in localStorage under key `mateo_paper_portfolio`, no server-side state needed
- **News Scraping** - Scrapes r/wallstreetbets, r/stocks, r/cryptocurrency, r/investing, r/options using Reddit JSON API
- **Prediction Tracking** - Stores BUY/SELL predictions, compares to actual price movement next day
- **Algorithm Versioning** - Tracks parameter changes, accuracy per version, helps identify best-performing algorithms
- **Watchlist Notifications** - update.ts checks watchlist after recomputing signals; inserts notifications; sends email via nodemailer if SMTP configured
- **Static Snapshot** - server/generate-snapshot.ts writes client/public/snapshot.json; called at end of update run; served via /api/snapshot for anonymous clients
- **Watch Button** - StockDetailModal shows "+ Watch" button for pro users to add to watchlist directly
- **Save Simulation** - SimulationPage shows "Save to History" panel for pro users after running a sim

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
- 2026-03-15: Firebase auth, tiered access (anon/free/pro), watchlist, notifications, history
  - Firebase Google + Yahoo OAuth login with server-side token verification (firebase-admin)
  - DB tables: users, watchlist, saved_simulations, notifications
  - Pro whitelist: mcmohorn@gmail.com, pbretts@yahoo.com (pre-inserted via ON CONFLICT upsert)
  - Anonymous: top 5 preview in scanner, no stock detail modal, Sign In CTA
  - Free: full scanner, paper money (localStorage), news, recaps, about, history
  - Pro: + simulation lab, watchlist, notifications, save simulations to DB
  - StockDetailModal: "+ Watch" button for pro users (adds to watchlist via API)
  - SimulationPage: "Save to History" panel for pro users after running simulation
  - WatchlistPage, NotificationsPage, HistoryPage, LoginPage, AboutPage
  - update.ts: after signal recompute, checks watchlist for signal changes, inserts notifications, sends emails via nodemailer (requires SMTP_USER/SMTP_PASS env vars)
  - server/generate-snapshot.ts: generates client/public/snapshot.json after each update run
  - server/auth.ts: verifyFirebaseToken, upsertUser, requireAuth, requirePro middleware
- 2026-03-10: Simulation duration buttons + clickable ticker symbols everywhere
  - Quick duration buttons (1M, 3M, 6M, 1Y) in Simulation Lab set end date from start date
  - All ticker symbols across all pages now open StockDetailModal on click
  - TradeLog: symbol click opens detail modal, pushpin icon (📌) for filter/pin functionality
  - PaperMoney: holdings + trade history symbols clickable for detail
  - MarketNews: trending tickers + mentioned symbols in cards clickable (with event propagation fix)
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
