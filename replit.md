# Market TUI - Stock & Crypto Analysis Tool

## Overview
A terminal-based (TUI) stock and cryptocurrency market analysis application written in Go. Uses MACD and RSI indicators to analyze market data and provide trading signals. Features a terminal UI built with `tview` for interactive stock/crypto analysis.

## Project Architecture

### Directory Structure
- `server/` - Go backend / TUI application
  - `main.go` - Entry point, sets up Alpaca credentials and launches the TUI
  - `app/` - Core application logic (App struct, TUI views, analysis, trading)
  - `config/` - Configuration structs
  - `data/` - Data types and models
  - `db/` - MongoDB database connection and operations
  - `helper/` - Utility functions
  - `indicators/` - Technical indicators (MACD, RSI)
  - `reader/` - File reader for ticker symbol lists
  - `services/` - External service integrations (Robinhood API)
  - `analyzer/` - Analyzer package (placeholder)
- `web/` - React frontend (incomplete - missing src/ and public/ directories)

### Key Technologies
- **Language**: Go 1.16+ (using Go 1.21 module)
- **TUI Framework**: `tview` / `tcell`
- **Database**: MongoDB (external)
- **APIs**: Alpaca (stocks), Robinhood (trading), Coinbase (crypto), Tiingo (crypto data)
- **Analysis**: MACD, RSI technical indicators

### Environment Variables Required
- `ALPACA_API_KEY_ID` - Alpaca API key
- `ALPACA_API_KEY_SECRET` - Alpaca API secret
- `RH_USERNAME` - Robinhood username
- `RH_PASSWORD` - Robinhood password
- `COINBASE_KEY` - Coinbase API key
- `COINBASE_SECRET` - Coinbase API secret
- `TIINGO_API_TOKEN` - Tiingo API token for crypto data
- `MONGO_DB_USERNAME` - MongoDB username
- `MONGO_DB_PASSWORD` - MongoDB password
- `MONGO_DB_HOST` - MongoDB host

### Running
The app runs as a TUI in the console:
```
cd server && go run .
```

## Recent Changes
- 2026-02-12: Initial Replit setup
  - Fixed empty `analyzer/analyzer.go` to include package declaration
  - Made initialization resilient (warnings instead of fatal errors for missing services)
  - Configured workflow for console-based TUI output
