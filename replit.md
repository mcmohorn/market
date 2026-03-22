# MATEO - Market Analysis Terminal

## Overview
MATEO is a full-stack web application for comprehensive stock and cryptocurrency market analysis. It generates BUY/SELL/HOLD signals using MACD and RSI indicators for major US exchanges. The platform features a dark "cyber-finance-hacker" theme and includes trading simulation for backtesting and strategy comparison, paper money trading, market news aggregation, and prediction tracking with algorithm versioning.

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
The application is a full-stack web application built with TypeScript. The frontend uses React 19, Vite, AG Grid Community, Recharts, and TailwindCSS, styled with a dark cyber/hacker aesthetic. The backend is an Express.js server managing API endpoints, data, and simulation logic. PostgreSQL is the sole data store for all market data, signals, predictions, news, and algorithm versions.

### Project Structure
- `client/`: React frontend (Vite, TailwindCSS, AG Grid, Recharts)
- `server/`: Express.js backend for API, simulation, news, predictions, and database interactions
- `shared/`: Shared TypeScript types and indicator calculations
- `dev.sh`: Development script for starting the API and Vite server

### Key Technologies
- **Language**: TypeScript (Node.js)
- **Frontend**: React 19, Vite, AG Grid Community, Recharts, TailwindCSS
- **Backend**: Express.js
- **Database**: PostgreSQL (Replit's built-in Neon-backed database)
- **APIs**: Alpaca (stocks), Tiingo (crypto data) - for data seeding only; Reddit JSON API - for news
- **Analysis**: MACD, RSI technical indicators
- **Theme**: Dark cyber/hacker aesthetic

### PostgreSQL Schema
The database includes tables for:
- `stocks`: Metadata for stocks and cryptocurrencies.
- `price_history`: Historical OHLCV data.
- `computed_signals`: Pre-computed MACD/RSI signals.
- `predictions`: Daily predictions and outcomes.
- `algorithm_versions`: Tracks algorithm parameters and accuracy.
- `market_news`: Cached Reddit news.
- `daily_recaps`: Generated market summaries.
- `users`: User authentication and account details.
- `watchlist`: User-specific watched symbols.
- `saved_simulations`: User's saved simulation runs.
- `notifications`: User signal change alerts.

### API Endpoints
A comprehensive set of API endpoints manage:
- Stock and crypto data retrieval, filtering, and detailed views.
- Market statistics and sector information.
- Trading simulation and strategy comparison.
- News aggregation and summarization.
- Prediction generation, evaluation, and recap retrieval.
- Algorithm version management.
- User authentication, watchlist management, and notifications.
- Paper money signal retrieval.
- A static market snapshot for anonymous users.

### App Pages
The application features pages for:
- **Market Scanner**: Main dashboard with signals and top performers.
- **Simulation Lab**: Backtesting and strategy comparison.
- **Paper Money**: Simulated trading.
- **Market News**: Aggregated Reddit news.
- **Recaps**: Daily/Weekly/Monthly market summaries.
- **Watchlist**: User-specific watched symbols.
- **Your History**: Saved simulation runs.
- **Notifications**: Signal change alerts.
- **About**: Platform information.

### Firebase Client Config
Firebase public config (apiKey, authDomain, projectId, etc.) is stored in:
- `client/.env` — loaded by Vite in development mode (dev server)
- `client/.env.production` — loaded by Vite for production builds (Cloud Run)
Both files contain the same values. These are safe to commit (Firebase security is enforced via Auth rules, not the API key).

### Auth & Access Tiers
- **Anonymous**: Limited access to scanner preview, news, recaps, and about page.
- **Free**: Full scanner, localStorage-based paper money, news, recaps, and history.
- **Pro**: All features, including Simulation Lab, Watchlist, Notifications, and database-persisted simulations.
- Authentication uses Firebase (Google + Yahoo OAuth), with server-side token verification.

### Features
- **Sell Alert Banner**: Notifies users of SELL signals in paper money holdings.
- **Paper Money**: LocalStorage-based simulated trading.
- **News Scraping**: Aggregates news from various Reddit communities.
- **Prediction Tracking**: Stores and evaluates daily BUY/SELL predictions.
- **Algorithm Versioning**: Tracks accuracy of different algorithm parameters.
- **Watchlist Notifications**: Provides email notifications for signal changes (if SMTP configured).
- **Static Snapshot**: Generates a static market snapshot for anonymous access.
- **Watch Button**: Allows Pro users to add symbols to their watchlist.
- **Save Simulation**: Enables Pro users to save simulation runs.

## External Dependencies
- **Alpaca**: Used for initial stock data seeding.
- **Tiingo**: Used for initial cryptocurrency data seeding.
- **Reddit JSON API**: Used for market news aggregation.
- **Firebase**: For user authentication (Google and Yahoo OAuth).
- **Nodemailer**: (Optional) For sending email notifications.