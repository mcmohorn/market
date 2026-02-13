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
  - `seed.ts` - Data seeding script (pulls from Alpaca/Tiingo APIs)
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
- **Database**: PostgreSQL (Replit built-in, Neon-backed)
- **APIs**: Alpaca (stocks), Tiingo (crypto data)
- **Analysis**: MACD, RSI technical indicators
- **Theme**: Dark cyber/hacker aesthetic (black bg, green accents)

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection (auto-provided by Replit)
- `ALPACA_API_KEY_ID` - Alpaca API key (for data seeding)
- `ALPACA_API_KEY_SECRET` - Alpaca API secret (for data seeding)
- `TIINGO_API_TOKEN` - Tiingo API token for crypto data (for data seeding)

### API Endpoints
- `GET /api/stocks` - List stocks with filtering, sorting, search
- `GET /api/stocks/top-performers` - Top gainers, losers, strong buys
- `GET /api/stocks/:symbol` - Stock detail with indicator history
- `GET /api/stats` - Overall market statistics
- `GET /api/symbols` - List all available symbols
- `GET /api/data-range` - Data date range info
- `POST /api/simulation/run` - Run trading simulation with strategy params
- `POST /api/simulation/compare` - Compare strategies across time periods
- `POST /api/simulation/market-conditions` - Analyze strategy in bull/bear/sideways markets

### Database Tables
- `stocks` - Stock metadata (symbol, name, exchange, sector)
- `price_history` - Historical OHLCV data
- `computed_signals` - Pre-computed analysis results (signal, indicators)

### Running
Development: `bash dev.sh` (starts API server on 3001 + Vite on 5000)
Seed data: `npx tsx server/seed.ts` (requires API keys)

## User Preferences
- Dark "cyber-finance-hacker" theme with black background and green accents
- Data stored in own database to eliminate reliance on external APIs per request
- Trading simulation with configurable strategy parameters
- Strategy comparison across 10, 20, 30 year periods
- Market conditions analysis (bull vs bear performance)

## Recent Changes
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
