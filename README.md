# ProjectX Automated Trading System

An advanced automated trading system for algorithmic trading with the ProjectX Gateway API.

## Key Features

- **Historical Data Management**: Download and store historical OHLC data
- **Real-Time Data Processing**: Stream and process live market data
- **Multi-Timeframe Support**: Handle data across multiple timeframes (1m, 5m, 15m, 1h, 4h, 1d)
- **Flexible Database Options**: Support for both TimescaleDB and SQLite
- **Rule-Based Trading Strategies**: Define and execute trading strategies using price rules
- **Strategy Management**: Create, activate, and monitor trading strategies

## Components

- **Gateway Client**: Connects to the ProjectX Gateway API for market data and trading
- **OHLC Aggregator**: Processes trade ticks into OHLC bars
- **Rule Engine**: Evaluates price-based trading rules for strategy execution
- **Strategy Service**: Manages trading strategies and their lifecycle
- **Database Handler**: Stores and retrieves market data efficiently

## Database Support

### TimescaleDB (Recommended for Production)
- High-performance time-series database based on PostgreSQL
- Optimized for time-series queries and large datasets
- Automatic partitioning by time (hypertables)
- Run using Docker with `./run_timescaledb_docker.sh`

### SQLite (Development/Testing)
- Self-contained file-based database
- No configuration required
- Suitable for smaller datasets and testing

## Strategy Engine

The strategy engine allows you to create rule-based trading strategies:

- Define price comparisons (e.g., close > 4200, volume crosses above 100)
- Support for multiple timeframes and cross-timeframe logic
- Time windows for trading hours
- Risk management settings

Example strategy rule:
```python
# Close crosses above 4200
rule = Rule(
    id="breakout_rule", 
    name="S&P 500 Breakout",
    timeframe="5m",
    contract_id="CON.F.US.MES.M25",
    comparisons=[
        Comparison(
            price_point=PricePoint(reference=PriceReference.CLOSE),
            operator=ComparisonOperator.CROSS_ABOVE,
            target=ComparisonTarget(fixed_value=4200.0)
        )
    ]
)
```

## Getting Started

### Prerequisites
- Python 3.8+
- Docker (for TimescaleDB)
- ProjectX Gateway API credentials

### Installation
1. Clone the repository
2. Install dependencies: `pip install -r requirements.txt`
3. Copy `env.template` to `.env` and set your API credentials
4. Set up your database:
   - For SQLite: No additional setup required
   - For TimescaleDB: Run `./run_timescaledb_docker.sh`

### Usage
1. Download historical data: `python download_historical.py`
2. Create trading strategy: `python src/create_strategy.py`
3. Start the trading system: `python src/main.py`

## Development Status

- [x] Market data ingestion pipeline
- [x] OHLC bar aggregation
- [x] TimescaleDB integration
- [x] Basic rule engine
- [x] Strategy persistence and management
- [ ] Position management
- [ ] Order execution
- [ ] Web interface

## Configuration

Configuration is handled through `config/settings.yaml` and environment variables.

### Example Settings
```yaml
api:
  base_url: https://api.topstepx.com
  market_hub_url: wss://api.topstepx.com/market-hub
  auth_url: https://api.topstepx.com/connect/token

database:
  use_timescale: true
  timescale:
    host: localhost
    port: 5433
    username: postgres
    password: password
    database: projectx
  sqlite:
    path: projectx.db
```

## Project Structure

* `src/core/` - Core components and utilities
* `src/data/` - Market data handling and processing
* `src/strategies/` - Trading strategy implementation
* `src/execution/` - Order execution and position management
* `src/risk/` - Risk management controls
* `src/api/` - API endpoints for UI interaction
* `config/` - Configuration files
* `tests/` - Unit and integration tests

## Documentation

* `docs/automated_trading_prd.md` - Product Requirements Document
* `docs/market_data_pipeline_design.md` - Market Data Pipeline Design
* `docs/project_structure.md` - Project Structure Documentation

## License

This project is licensed under the MIT License - see the LICENSE file for details.

