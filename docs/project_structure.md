# Current Project Structure

This document outlines the current implementation structure of the ProjectX trading system, including both the Python backend for data processing and trading, and the Next.js frontend for user interface.

## Backend Structure

```
projectx/
├── src/                       # Main source code directory
│   ├── main.py                # Application entry point & orchestration
│   ├── core/                  # Core components, shared logic, configuration
│   │   ├── __init__.py
│   │   ├── config.py            # Load configuration (env vars, files)
│   │   ├── logging_config.py    # Configure application logging
│   │   ├── exceptions.py        # Custom exception classes
│   │   └── utils.py             # Common utility functions
│   │
│   ├── data/                  # Market data handling module
│   │   ├── __init__.py
│   │   ├── models.py            # Pydantic models for OHLC, Ticks, etc.
│   │   ├── ingestion/           # Data fetching from ProjectX Gateway
│   │   │   ├── __init__.py
│   │   │   └── gateway_client.py  # Client for ProjectX Market Data API/WebSocket
│   │   ├── storage/             # Database interaction (schemas, queries)
│   │   │   ├── __init__.py
│   │   │   ├── db_handler.py      # Generic DB connection/session handler
│   │   │   └── schemas.py         # Database table schemas
│   │   ├── aggregation.py       # Multi-timeframe data aggregation logic
│   │   ├── validation.py        # Data validation rules and implementation
│   │   └── caching.py           # Caching mechanism for time series data
│   │
│   ├── strategies/            # Trading strategies directory
│   │   ├── __init__.py
│   │   └── base_strategy.py     # Base class for strategies
│   │
│   ├── strategy/              # Strategy management and rule engine
│   │   ├── __init__.py
│   │   ├── rule_engine.py       # Core rule evaluation engine
│   │   ├── strategy_service.py  # Strategy management service
│   │
│   ├── execution/             # Order execution and position management module
│   │   ├── __init__.py
│   │   ├── position_manager.py  # Position state tracking and P&L calculation
│   │   └── strategy_executor.py # Strategy execution logic
│   │
│   ├── risk/                  # Risk management module
│   │   ├── __init__.py
│   │   └── risk_manager.py      # Risk limits and monitoring
│   │
│   ├── api/                   # API endpoints for frontend integration
│   │   ├── __init__.py
│   │   └── server.py            # FastAPI server implementation
│   │
│   └── services/              # Higher-level services coordinating components
│       ├── __init__.py
│       └── service_registry.py  # Service discovery and coordination
│
├── tests/                     # Automated tests
│   ├── __init__.py
│   ├── test_auth.py             # Authentication tests
│   ├── test_auth_app.py         # Auth app tests
│   └── test_connection.py       # Connection tests
│
├── docs/                      # Project documentation
│   ├── automated_trading_prd.md  # Product requirements
│   └── project_structure.md     # This file
│
├── config/                    # Configuration files
│   ├── settings.yaml           # Main application settings
│   └── strategies/             # Strategy configurations
│
├── logs/                      # Application logs directory
│
├── timescale_data/            # TimescaleDB data (for Docker deployment)
│
├── venv/                      # Python virtual environment
│
├── download_historical.py     # Script for downloading historical market data
├── start_trading.py           # Script for starting the trading system
├── run_timescaledb_docker.sh  # Script to run TimescaleDB in Docker
│
├── requirements.txt           # Python dependencies
├── Dockerfile                 # Docker configuration
└── README.md                  # Project overview
```

## Frontend Structure

```
projectx/web/
├── src/                       # Source code for the Next.js frontend
│   ├── app/                   # Next.js app directory
│   │   ├── api/               # API route handlers
│   │   │   ├── market-data/   # Market data API endpoints
│   │   │   ├── positions/     # Positions API endpoints
│   │   │   ├── strategies/    # Strategies API endpoints
│   │   │   └── orders/        # Orders API endpoints
│   │   │
│   │   ├── strategies/        # Strategies page
│   │   ├── positions/         # Positions page
│   │   ├── trends/            # Trends analysis page
│   │   │   └── page.tsx       # Trends page component
│   │   │
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout component
│   │   └── page.tsx           # Home page component
│   │
│   ├── components/            # React components
│   │   ├── charts/            # Chart components
│   │   │   └── TrendChartContainer.tsx  # Container for trend charts
│   │   │
│   │   ├── layout/            # Layout components
│   │   │   ├── Header.tsx     # Navigation header component
│   │   │   └── Layout.tsx     # Page layout wrapper
│   │   │
│   │   ├── strategies/        # Strategy-related components
│   │   └── ui/                # UI components (buttons, cards, etc.)
│   │
│   └── hooks/                 # Custom React hooks
│       └── useData.js         # Data fetching hooks
│
├── public/                    # Static assets
├── prisma/                    # Prisma ORM configuration
│
├── .next/                     # Next.js build output
├── node_modules/              # NPM dependencies
│
├── package.json               # NPM package configuration
├── package-lock.json          # NPM lock file
├── next.config.ts             # Next.js configuration
└── tsconfig.json              # TypeScript configuration
```

## System Architecture

The ProjectX trading system is composed of two main parts:

1. **Python Backend**:
   - Handles market data processing, strategy execution, and trading logic
   - Uses TimescaleDB for efficient time-series data storage
   - Provides a REST API using FastAPI for frontend integration
   - Downloads and processes historical data
   - Manages trading strategies and positions

2. **Next.js Frontend**:
   - Provides a modern, responsive user interface
   - Communicates with the backend via REST API
   - Displays real-time market data and positions
   - Visualizes trading data with interactive charts
   - Allows strategy management and monitoring

## Integration Points

The frontend and backend communicate primarily through:

1. **REST API**:
   - The Python backend exposes endpoints at http://127.0.0.1:8000
   - The Next.js frontend makes requests to these endpoints for data
   - Key endpoints include:
     - `/api/strategies` - For strategy management
     - `/api/positions` - For position monitoring
     - `/api/orders` - For order history and management

2. **Database**:
   - The backend writes market data to TimescaleDB
   - The frontend can also directly query the database for certain data needs via Prisma

## Deployment Approach

The system can be deployed in multiple ways:

1. **Local Development**:
   - Python backend runs locally with `python -m src.api.server`
   - Next.js frontend runs with `npm run dev` in the web directory
   - TimescaleDB runs in Docker via `run_timescaledb_docker.sh`

2. **Production**:
   - Python backend can be containerized using the Dockerfile
   - Next.js frontend can be built and deployed to a static hosting service
   - TimescaleDB can be run on a dedicated instance or cloud service 