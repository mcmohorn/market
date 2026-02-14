# MATEO - Market Analysis Terminal

A full-stack web application for stock and cryptocurrency market analysis. Uses MACD, RSI, ADX, and Bollinger Band indicators to analyze market data and provide BUY/SELL/HOLD signals for major US exchanges. Features a dark "cyber-finance-hacker" themed interface with trading simulation capabilities.

## Features

- Real-time BUY/SELL/HOLD signals for 5,000+ stocks and 18 cryptocurrencies
- Technical indicators: MACD, RSI, ADX, 50-period MA, Bollinger Bandwidth
- Signal change alerts with rarity scoring (slow movers ranked higher)
- Sector filtering for stocks (Technology, Healthcare, Energy, etc.)
- Stocks/Crypto toggle with separate views
- Time navigation to view historical data (1 day, 1 week, 1 month, etc.)
- Trading simulation engine with configurable strategy parameters
- Strategy comparison across multiple time periods
- Market conditions analysis (bull/bear/sideways)
- Portfolio symbol picker for targeted backtesting
- Save/load simulation presets
- Sortable trade log with equity curve click-to-navigate
- 5+ years of historical stock data, 10 years of crypto data

## Tech Stack

- **Frontend**: React 19, Vite, TailwindCSS, AG Grid, Recharts
- **Backend**: Express.js (TypeScript)
- **Database**: PostgreSQL (runtime queries) + Google BigQuery (data warehouse)
- **APIs**: Alpaca (stock data), Tiingo (crypto data)
- **Language**: TypeScript throughout

## Prerequisites

- Node.js 20+
- PostgreSQL database
- API keys (for data seeding):
  - [Alpaca](https://alpaca.markets/) - free account for stock data
  - [Tiingo](https://www.tiingo.com/) - free account for crypto data
  - [Google Cloud](https://cloud.google.com/) service account JSON key (optional, for BigQuery warehouse)

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ALPACA_API_KEY_ID` | For seeding | Alpaca API key ID |
| `ALPACA_API_KEY_SECRET` | For seeding | Alpaca API secret key |
| `TIINGO_API_TOKEN` | For seeding | Tiingo API token for crypto data |
| `GOOGLE_CREDENTIALS_JSON` | No | GCP service account JSON for BigQuery |
| `USE_BIGQUERY` | No | Set to `"false"` to disable BigQuery writes (default: enabled) |
| `PORT` | No | Server port (default: `5000`) |

## Running Locally

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd market-analyzer
npm install
```

### 2. Set up environment variables

Create a `.env` file or export the variables:

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/mateo"
export ALPACA_API_KEY_ID="your-alpaca-key"
export ALPACA_API_KEY_SECRET="your-alpaca-secret"
export TIINGO_API_TOKEN="your-tiingo-token"
```

### 3. Initialize the database

The database schema is created automatically on server startup. To seed market data:

```bash
# Seed stocks and crypto data (requires API keys)
npx tsx server/seed.ts

# Extend stock history back to 2020 (run multiple times if needed)
npx tsx server/seed-stocks-extend.ts

# Extend crypto history back to 2016
npx tsx server/seed-crypto-extend.ts

# Backfill sector classifications
npx tsx server/seed-sectors.ts
```

### 4. Start the development server

```bash
bash dev.sh
```

This starts:
- API server on port 3001
- Vite dev server on port 5000 (with proxy to API)

Open http://localhost:5000 in your browser.

### 5. Production build

```bash
npm run build
npm start
```

This builds the Vite frontend into `dist/public/` and bundles the server into `dist/server/`. The production server serves both the API and static frontend on a single port (default 5000).

## Project Structure

```
├── client/                  # React frontend
│   ├── src/
│   │   ├── App.tsx          # Main app with navigation
│   │   ├── components/      # UI components
│   │   │   ├── Header.tsx
│   │   │   ├── StockGrid.tsx
│   │   │   ├── TopPerformers.tsx
│   │   │   ├── EquityCurve.tsx
│   │   │   ├── TradeLog.tsx
│   │   │   ├── SignalAlerts.tsx
│   │   │   ├── SymbolPicker.tsx
│   │   │   └── ...
│   │   ├── pages/
│   │   │   └── SimulationPage.tsx
│   │   └── lib/api.ts       # API client
│   └── index.html
├── server/                  # Express backend
│   ├── index.ts             # Production entry point
│   ├── dev.ts               # Development entry point (port 3001)
│   ├── routes.ts            # API endpoints
│   ├── db.ts                # PostgreSQL connection & schema
│   ├── bigquery.ts          # BigQuery integration
│   ├── simulation.ts        # Trading simulation engine
│   ├── seed.ts              # Data seeding (Alpaca + Tiingo)
│   └── seed-*.ts            # Extension/backfill scripts
├── shared/                  # Shared TypeScript code
│   ├── types.ts             # All data types
│   └── indicators.ts        # MACD, RSI, ADX calculations
├── dev.sh                   # Development startup script
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
└── package.json
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/stocks` | List stocks with filtering, sorting, search |
| GET | `/api/stocks/top-performers` | Top gainers, losers, strong buys |
| GET | `/api/stocks/signal-alerts` | Recent signal change alerts |
| GET | `/api/stocks/:symbol` | Stock detail with indicator history |
| GET | `/api/stats` | Market statistics by asset type |
| GET | `/api/symbols` | List all available symbols |
| GET | `/api/sectors` | Available sector categories |
| GET | `/api/data-range` | Data date range info |
| POST | `/api/simulation/run` | Run trading simulation |
| POST | `/api/simulation/compare` | Compare strategies across periods |
| POST | `/api/simulation/market-conditions` | Analyze strategy in market conditions |

All GET endpoints support `asset_type` (`stock` or `crypto`) and `as_of_date` query parameters.

## Cloud Run Deployment

See `cloudbuild.yaml` for the Cloud Build configuration. The build:

1. Installs dependencies
2. Builds the frontend and server
3. Builds a Docker container
4. Pushes to Artifact Registry
5. Deploys to Cloud Run

Required substitutions in your Cloud Build trigger:
- `_REGION` - GCP region (default: `us-central1`)
- `_SERVICE_NAME` - Cloud Run service name (default: `mateo`)
- `_REPOSITORY` - Artifact Registry repository name (default: `mateo`)

You will need to set the environment variables listed above as Cloud Run environment variables or secrets.
