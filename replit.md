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
The application is built as a full-stack web application using TypeScript. The frontend is developed with React 19, Vite, AG Grid Community, Recharts, and styled with TailwindCSS, adhering to a dark cyber/hacker aesthetic. The backend is an Express.js server responsible for API endpoints, data management, and simulation logic. PostgreSQL is used as the primary and only runtime data store for all market data, historical prices, and computed signals, emphasizing data independence and performance. The system supports detailed stock and crypto analysis, trading simulations, and strategy comparisons, including market condition analysis (bull/bear/sideways markets).

### Core Features:
- **Market Scanner**: Displays real-time and historical market data with filtering, sorting, and search capabilities for stocks and cryptocurrencies. Includes top performers, signal alerts, and sector-based filtering.
- **Simulation Lab**: Offers configurable trading strategy parameters for MACD/RSI, backtesting, strategy comparison across various time periods, and analysis under different market conditions. Includes equity curve visualization and detailed trade logs.
- **Data Management**: Stores all necessary market data (metadata, OHLCV, computed signals) locally in PostgreSQL.
- **UI/UX**: Dark theme, intuitive navigation, interactive grids (AG Grid), and data visualization (Recharts).

### Technical Implementations:
- **API Endpoints**: Comprehensive RESTful API for fetching stock/crypto data, market statistics, running simulations, and retrieving signal alerts.
- **Simulation Engine**: Robust backend logic for executing trading simulations, managing trade execution, and calculating performance metrics based on user-defined strategies.
- **Indicator Calculations**: MACD and RSI technical indicators are calculated server-side.
- **Database Schema**: Dedicated tables for `stocks`, `price_history`, and `computed_signals`, utilizing `asset_type` for differentiation between stocks and cryptocurrencies.

## External Dependencies
- **Data Providers (for seeding only)**:
    - Alpaca (stock data)
    - Tiingo (cryptocurrency data)
- **Database**:
    - PostgreSQL (Replit's built-in Neon-backed database)