# Market Data Pipeline Design

## Overview

This document outlines the design of the market data pipeline for the ProjectX automated trading system. The pipeline is responsible for:

1. Ingesting market data from the ProjectX Gateway API
2. Processing and aggregating the data into OHLC bars
3. Storing the data in TimescaleDB or SQLite
4. Providing access to the data for strategy execution

## Components

### Data Ingestion

- **GatewayClient**: Handles API authentication, WebSocket connections, and REST API calls
  - Implemented with robust session management and reconnection logic
  - Supports both historical data retrieval and real-time trade subscriptions
- **Trade Events**: Real-time trade data received via WebSocket
- **Historical Data**: OHLC bars retrieved via REST API for backtesting and analysis

### Data Processing

- **OHLCAggregator**: Aggregates trade events into OHLC bars for various timeframes
  - Supports multiple timeframes (1m, 5m, 15m, 1h, 4h, 1d)
  - Callback system for bar completion events
- **Data Validation**: Validates market data before processing to ensure integrity
  - `validate_bars` and `validate_trade` functions implemented

### Data Storage

#### TimescaleDB (Recommended for Production)

The system uses TimescaleDB, a PostgreSQL extension optimized for time-series data, for storing market data in production environments.

**Features:**
- Optimized for time-series queries
- Automatic partitioning by time (hypertables)
- Superior query performance for historical data
- Scalable for large datasets

**Connection Details:**
- Database URL: `postgresql://postgres:password@localhost:5433/projectx`
- Schema: `ohlc_bars` table with proper indexes

**Setup:**
- Run `./run_timescaledb_docker.sh` to start a Docker container with TimescaleDB
- Configure in `config/settings.yaml` with `use_timescale: true`
- Port 5433 used to avoid conflicts with existing PostgreSQL installations

#### SQLite (Development/Testing)

For development and testing, SQLite provides a simpler alternative without requiring a separate database server.

**Features:**
- Self-contained file-based database
- No configuration required
- Suitable for smaller datasets and testing

**Connection Details:**
- Database file: `projectx.db` in the project root
- Configure in `config/settings.yaml` with `use_timescale: false`

### Prisma ORM Integration

The system integrates with Prisma ORM for database access in Node.js applications.

**Schema:**
```prisma
model OhlcBar {
  id             Int      @id @default(autoincrement())
  contractId     String   @map("contract_id")
  timestamp      DateTime
  open           Float
  high           Float
  low            Float
  close          Float
  volume         Float?
  timeframeUnit  Int      @map("timeframe_unit")
  timeframeValue Int      @map("timeframe_value")

  @@index([contractId, timeframeUnit, timeframeValue])
  @@index([timestamp])
  @@map("ohlc_bars")
}
```

**Usage:**
- Generated Prisma client in `src/generated/prisma`
- Access data with type-safe queries in JavaScript/TypeScript
- JavaScript frontend can query data using the same schema

### Data Access

The Python backend provides access to market data through:

- **DBHandler**: Direct database access from Python
  - Supports both TimescaleDB and SQLite backends
  - Connection pooling for better performance
  - Async operations for non-blocking I/O
- **TimeSeriesCache**: In-memory cache for frequently accessed data
  - TTL-based caching of recent bars
  - Configurable max items and expiration time
- **Data Models**: Pydantic models for type-safe data handling

## Main Application Components

### TradingApp

The `TradingApp` class is the central orchestrator of the trading system:

- **Initialization**:
  - Sets up all components (database, gateway, aggregator, cache)
  - Configures contracts and timeframes
  - Registers callbacks for data processing

- **Historical Data Bootstrap**:
  - Loads historical data for all configured contracts and timeframes
  - Validates and stores data in the database and cache
  - Gracefully handles API authentication failures

- **Real-Time Processing**:
  - Connects to the market hub via WebSocket
  - Subscribes to contract trades
  - Processes incoming trade data into OHLC bars
  - Handles reconnections and errors

- **Event Callbacks**:
  - `on_trade_received`: Processes incoming trade events
  - `on_bar_completed`: Handles completed OHLC bars

## Data Flow

1. **Ingestion**: Trade events are received in real-time from the Gateway API
2. **Aggregation**: The OHLCAggregator processes trades into OHLC bars for multiple timeframes
3. **Storage**: OHLC bars are stored in TimescaleDB or SQLite via the DBHandler
4. **Access**: Strategies and analysis tools retrieve data through the DBHandler or Prisma ORM

## Historical Data Management

The system provides tools for managing historical data:

- **download_historical.py**: Downloads and stores historical data for specified contracts
  - Supports multiple timeframes in a single run
  - Proper retry logic and error handling
- **test_connection.py**: Tests API connectivity and contract format validation

## Data Schema

### OHLC Bar Structure

- `id`: Unique identifier
- `contract_id`: Contract identifier (e.g., "CON.F.US.MES.M25")
- `timestamp`: Bar timestamp (start time of the bar)
- `open`: Opening price
- `high`: Highest price
- `low`: Lowest price
- `close`: Closing price
- `volume`: Trading volume (optional)
- `timeframe_unit`: Unit of the timeframe (1=s, 2=m, 3=h, 4=d, 5=w, 6=mo)
- `timeframe_value`: Value of the timeframe (e.g., 5 for 5-minute bars)

## Performance Considerations

- **Connection Pooling**: Database connections are pooled for better performance
- **Indexing**: Appropriate indexes on contract_id, timestamp, and timeframe fields
- **Caching**: Frequently accessed data is cached in memory
- **Batch Operations**: Bulk inserts are used for efficiency
- **Asynchronous Processing**: All database operations are asynchronous

## Error Handling

The system includes comprehensive error handling:

- **API Errors**: Proper detection and handling of API failures
- **WebSocket Reconnection**: Automatic reconnection on connection loss
- **Validation Errors**: Data validation before processing or storage
- **Database Errors**: Transaction management and connection error handling
- **Graceful Degradation**: System continues with limited functionality when services are unavailable

## Future Improvements

- Implement continuous aggregates in TimescaleDB for faster queries on aggregated data
- Add data compression for long-term storage
- Implement data retention policies for historical data
- Add support for real-time materialized views
- Implement streaming analytics for real-time indicators and signals 