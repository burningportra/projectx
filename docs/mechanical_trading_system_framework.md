# Mechanical Trading System Framework

This document outlines the steps and considerations for building a mechanical trading system, integrating live data ingestion, TimescaleDB storage, and multi-timeframe signal processing.

## Core Components:

1.  **Live Data Ingestion**: Capturing real-time market data.
2.  **OHLC Aggregation**: Converting raw data into OHLC bars for multiple timeframes.
3.  **TimescaleDB Storage**: Storing OHLC data efficiently.
4.  **Multi-Timeframe Signal Engine**: Running analysis on different timeframes.
5.  **Signal Coordination & Execution Logic**: Combining signals and making trading decisions.

## Guiding Principles:

*   **Event-Driven**: React to new data; avoid polling.
*   **Asynchronous Operations**: Prevent blocking, especially for I/O (network, database).
*   **Data Integrity**: Ensure data is accurate, without gaps or duplication.
*   **Modularity**: Keep components distinct for easier development and maintenance.
*   **Scalability**: Design with future growth in mind (e.g., more symbols, more complex strategies).
*   **Idempotency**: Design operations to be safe if re-executed (e.g., due to restarts).

## Step-by-Step Implementation Plan

### Phase 0: Prerequisites & Setup

- [x] **Environment Setup**: Ensure Python environment has necessary libraries (`signalrcore`, `psycopg2-binary` or `asyncpg`, `python-dotenv`, `pyyaml`).
- [x] **Configuration Files**: Create/update `config/settings.yaml` for API keys, contract IDs, timeframes, database connection details, and any timeframe-specific analyzer parameters.
    *   *Ensured `settings.yaml` includes robust database connection templating (`dsn_template`, `password_env_var`) for `Config` class.*
- [x] **.env File**: Set up `.env` for sensitive credentials (API token, DB password).
    *   *Crucial for `LOCAL_DB_PASSWORD`, `PROJECTX_API_TOKEN`, and `PROJECTX_USERNAME` (for historical data client).*
- [x] **TimescaleDB (Local)**: Successfully run `run_timescaledb_docker.sh` and connect to the local instance using a DB tool (e.g., DBeaver, pgAdmin) to verify.
- [x] **TimescaleDB Schema (Local)**: Apply the `ohlc_bars` table schema (from `docs/market_data_pipeline_design.md`) and ensure it's a hypertable (`SELECT create_hypertable('ohlc_bars', 'timestamp');`). Add unique constraint: `ALTER TABLE ohlc_bars ADD CONSTRAINT ohlc_bars_unique UNIQUE (contract_id, timestamp, timeframe_unit, timeframe_value);`.
    *   *`ohlc_bars` table created by `setup_local_db.py` with composite PRIMARY KEY `(contract_id, timestamp, timeframe_unit, timeframe_value)` and `DECIMAL` types for OHLCV. Hypertable conversion confirmed. This schema was also adopted by `DBHandler` for consistency.*
- [~] **Watermark Tables Schema (Local)**: Design and create tables for storing watermarks, e.g., `analyzer_watermarks (analyzer_id TEXT, contract_id TEXT, timeframe TEXT, last_processed_timestamp TIMESTAMPTZ, PRIMARY KEY (analyzer_id, contract_id, timeframe))` and `coordinator_watermarks (coordinator_id TEXT PRIMARY KEY, last_processed_signal_id BIGINT);`. (Schema defined in setup_local_db.py, but not actively used yet)
    *   *Schema for `analyzer_watermarks` and `coordinator_watermarks` created by `setup_local_db.py`. Tables exist but are not yet actively used by any service.*

### Phase 1: Data Foundation - Live Data to TimescaleDB

1.  **TimescaleDB Setup (Covered in Phase 0 for local, adapt for Railway later)**

2.  **Live Data Ingestion & OHLC Aggregation Service (Python)**
    *   [x] **Base WebSocket Client**: Adapt `test_combined_hubs.py` into a reusable class or module for connecting to SignalR, handling auth, and managing subscriptions (for market data - trades).
        *   *Adapted from `test_combined_hubs.py` into `live_ingester.py`. Handles JWT token generation (via `generate_jwt_token.py`) and SignalR connection parameters (`skip_negotiation: True`, token in URL query string, correct event/method names like `GatewayQuote`, `SubscribeContractQuotes`).*
    *   [x] **Configuration Loading**: Implement logic to load contract IDs and timeframes from `config/settings.yaml`.
        *   *Includes loading multiple timeframes per contract for aggregation.*
    *   [x] **In-Memory Bar Aggregator Class**: Create a Python class (`OHLCBarAggregator`) that:
        *   [x] Initializes pending bars for each (contract, timeframe) pair.
        *   [x] Has a method to process an incoming trade (tick) data.
        *   [x] Updates `high`, `low`, `close`, `volume` for relevant pending bars.
        *   [x] Identifies when a bar period completes for each timeframe.
            *   *Logic refined to correctly handle bar finalization and start of new bars based on `tick_time_utc` vs `expected_bar_end_time`.*
        *   [x] Correctly aligns bar `timestamp` to standard clock intervals (e.g., floor timestamp to start of 1m, 5m, 1h interval).
        *   [x] Returns a list of completed bars.
            *   *Uses a callback mechanism (`on_bar_completed`) to pass completed bars for storage.*
        *   [x] **Initial Bar State Handling**: On service startup, implement logic to fetch the last known bar or align to the next full period to ensure continuity or defined starting behavior.
    *   [x] **DBHandler Integration**: Instantiate `DBHandler` from `src/data/storage/db_handler.py` (Achieved with direct psycopg2 usage in live_ingester.py).
        *   *Achieved with direct `psycopg2` usage in `live_ingester.py` for synchronous writes executed in a separate thread pool to avoid blocking the async SignalR loop. Aligned with `DBHandler` from `download_historical.py` by standardizing on table schema.*
        *   [x] Ensure `DBHandler.store_bars()` method uses an `UPSERT` (`ON CONFLICT (contract_id, timestamp, timeframe_unit, timeframe_value) DO NOTHING`) for `ohlc_bars`.
            *   *`live_ingester.py` uses `INSERT ... ON CONFLICT (contract_id, timestamp, timeframe_unit, timeframe_value) DO NOTHING` with `psycopg2`.*
        *   [x] Ensure `DBHandler` can connect to TimescaleDB using credentials from config.
    *   [x] **Main Ingestion Loop**: Create the main asynchronous loop that:
        *   [x] Connects to WebSocket.
        *   [x] Receives trades for subscribed contracts.
            *   *Refined message parsing for `GatewayQuote` and `GatewayTrade` to handle list-based payloads and correct data extraction (e.g., price, volume, timestamp prioritization from available fields like `timestamp`, `quote.timestamp`, `trade.timestamp`, `lastUpdated`).*
        *   [x] Passes trades to the `OHLCBarAggregator`.
        *   [x] Takes completed bars from the aggregator and uses `DBHandler` to store them.
    *   [x] **Asynchronous Operations**: Ensure all WebSocket interactions and database writes are asynchronous (`asyncio`, `asyncpg` if `DBHandler` is adapted) (SignalR is async, DB is sync psycogp2 but managed not to block).
    *   [x] **Error Handling & Reconnection**: Implement WebSocket auto-reconnection with exponential backoff. Add try-except blocks for data parsing and DB errors, with appropriate logging.
        *   *SignalR client's built-in reconnection used. Debugged various `AttributeError` and `TypeError` issues during data processing (e.g. `connection_alive`, message structure `str` vs `dict`, price/timestamp key access) and SignalR event handling.*
    *   [x] **Logging**: Integrate structured logging throughout this service.
    *   [x] **Historical Data Ingestion (`download_historical.py`)**: Aligned with live data schema. `DBHandler` updated to use `DECIMAL` types, composite PK for table creation if needed, and `INSERT ... ON CONFLICT` for TimescaleDB batch inserts. Resolved authentication issues by ensuring `PROJECTX_USERNAME` is loaded from `.env`. Successfully tested backfill.

### Phase 2: Multi-Timeframe Signal Generation

3.  **Timeframe-Specific Analyzer Instances (Python)**
    *   [ ] **Analyzer Structure**: Design how analyzers will run (e.g., async tasks in one process for now).
    *   [ ] **Analyzer Configuration**: Load timeframe-specific parameters for `trend_analyzer_alt.py` from `config/settings.yaml`.
    *   [ ] **Data Fetching & Watermarking**: Each analyzer task/function retrieves and updates its `last_processed_timestamp` from/to `analyzer_watermarks` and queries new OHLC bars accordingly.
    *   [ ] **Signal Logic Integration**: Refactor `trend_analyzer_alt.py` to be callable with data from DB. Integrate into analyzers.
    *   [ ] **Signal Storage Schema**: Define and create the `detected_signals` table in TimescaleDB (`signal_id SERIAL PRIMARY KEY`, `timestamp TIMESTAMPTZ NOT NULL`, `contract_id TEXT NOT NULL`, `timeframe TEXT NOT NULL`, `signal_type TEXT NOT NULL`, `signal_price REAL`, `details JSONB NULL`).
    *   [ ] **Signal Publication**: Analyzers write detected signals to the `detected_signals` table.

4.  **Signal Coordination Service (Python)**
    *   [ ] **Coordinator Structure**: Design as an async task or separate script.
    *   [ ] **Signal Monitoring & Watermarking**: Coordinator retrieves and updates its `last_processed_signal_id` from/to `coordinator_watermarks` and queries new signals.
    *   [ ] **Initial Coordination Logic**: Start with a very simple rule (e.g., if 1h signal and 15m signal agree for the same contract, log a "Coordinated Signal").
    *   [ ] **State Management (Basic)**: Keep track of the last coordinated signal per contract.
    *   [ ] **Output Logging**: Log the coordinated trading decisions/actions.
    *   [ ] **(Future) Advanced Coordination**: Plan for implementing more complex rules (weighting, strategic/tactical filtering) as an iteration.

### Phase 3: Execution (Conceptual - Lower Priority for Initial Build)

5.  **Order Execution Module (Python)**
    *   [ ] **(Future)** Design how this module will receive actionable decisions.
    *   [ ] **(Future)** Sketch out functions for placing/modifying/canceling orders using `GatewayClient`.

### General & Maintenance

- [ ] **Unit Tests**: Write unit tests for critical components like the OHLC aggregator and signal logic.
- [ ] **Integration Tests (Basic)**: Test the flow from live tick to bar storage, then bar storage to signal generation.
- [ ] **Documentation**: Keep `mechanical_trading_system_framework.md` and other relevant docs updated.

## Deployment to Railway (PostgreSQL/TimescaleDB)

Deploying this system to Railway involves setting up a PostgreSQL database with the TimescaleDB extension and deploying your Python application(s) (Ingestion Service, Analyzer/Coordinator Service).

### 1. Database Setup on Railway

-   [ ] **Provision PostgreSQL**: Add a PostgreSQL service to your Railway project.
-   [ ] **Enable TimescaleDB Extension**:
    *   Connect to your Railway PostgreSQL instance using a DB tool (you can get connection details from Railway dashboard, often including a direct connection string or psql command).
    *   Execute the command to enable the TimescaleDB extension: `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`
    *   Verify it's enabled: `\dx` in `psql` should list `timescaledb`.
-   [ ] **Apply Schema**: Once the extension is enabled, connect to your Railway DB and apply your table schemas:
    *   [ ] Create `ohlc_bars` table.
    *   [ ] Convert `ohlc_bars` to a hypertable: `SELECT create_hypertable('ohlc_bars', 'timestamp');`
    *   [ ] Add the unique constraint to `ohlc_bars`: `ALTER TABLE ohlc_bars ADD CONSTRAINT ohlc_bars_unique UNIQUE (contract_id, timestamp, timeframe_unit, timeframe_value);`
    *   [ ] Create `detected_signals` table.
    *   [ ] Create `analyzer_watermarks` and `coordinator_watermarks` tables.
-   [ ] **Database URL**: Note the `DATABASE_URL` provided by Railway for your PostgreSQL service. This will be used by your Python application. It typically looks like `postgresql://user:password@host:port/database`.
-   [ ] **Security**: Use strong, unique credentials for your Railway PostgreSQL instance. Review Railway's network access controls to limit database access appropriately.

### 2. Python Application Deployment on Railway

Railway can deploy Python applications using a `Dockerfile` or sometimes via buildpacks if your project structure is standard.
A `Dockerfile` offers more control.

-   [ ] **Create `Dockerfile`**: In your project root, create a `Dockerfile` for your Python application(s). You might have one Dockerfile for the combined ingestion/analysis services, or separate ones if you decide to run them as distinct Railway services.

    ```dockerfile
    # Dockerfile Example (adjust as needed)
    FROM python:3.10-slim

    WORKDIR /app

    # Install system dependencies if any (e.g., for psycopg2)
    # RUN apt-get update && apt-get install -y libpq-dev gcc

    COPY requirements.txt .
    RUN pip install --no-cache-dir -r requirements.txt

    COPY . .

    # Command to run your main application script
    # This will depend on how you structure your services.
    # Example for a single script running everything:
    CMD ["python", "src/main_live_trader.py"] 
    # Or if you have separate scripts for ingestion and analysis:
    # CMD ["python", "src/data_ingestion_service.py"]
    ```

-   [ ] **Update `requirements.txt`**: Ensure it includes all necessary packages (`signalrcore`, `psycopg2-binary` (or `asyncpg`), `python-dotenv`, `PyYAML`, etc.).
-   [ ] **Railway Service Configuration**:
    *   In your Railway project, add a new service and point it to your GitHub repository.
    *   Railway should detect the `Dockerfile` and use it for building and deploying.
    *   **Environment Variables**: Configure environment variables in the Railway service settings:
        *   `DATABASE_URL`: Use the connection string from your Railway PostgreSQL service.
        *   `PROJECTX_API_TOKEN`: Your API token.
        *   `USERNAME_FOR_TOKEN_GENERATION`: Your username.
        *   Any other necessary config from your `settings.yaml` or `.env` can be set here. It's good practice to use environment variables for Railway deployments rather than committing config files with secrets.
    *   **Start Command**: Ensure Railway uses the correct `CMD` from your Dockerfile, or override it in Railway's service settings if needed.
-   [ ] **Service Structure (Consideration)**:
    *   **Monolith (Simpler Start)**: Run the Data Ingestion, Analyzers, and Signal Coordinator in a single Python process (using `asyncio` tasks) within one Railway service. This is easier to manage initially.
    *   **Microservices (More Scalable/Complex)**: Deploy the Data Ingestion service as one Railway service and the Analyzers/Coordinator as another. This would require a more robust inter-service communication mechanism than just a shared database (e.g., Redis Pub/Sub also hosted on Railway, or a dedicated message queue service if Railway offers one or allows external connections).
-   [ ] **Historical Data Population Strategy for Railway**: Determine how `download_historical.py` will be used for the Railway DB. Options include modifying it to accept `DATABASE_URL` and run locally targeting Railway, adapting it to run as a one-off job on Railway, or adding a limited historical fetch to the live service's initial startup.

### 3. Logging and Monitoring on Railway

-   [ ] **Standard Output Logging**: Ensure your Python application logs to `stdout` and `stderr`. Railway typically captures these logs and makes them available in its dashboard.
-   [ ] **Railway Metrics**: Utilize Railway's built-in metrics for CPU, memory, and network usage to monitor your service health. Adjust resource allocation as needed.

### 4. Data Retrieval from Railway PostgreSQL/TimescaleDB

Once your data is being stored in the Railway-hosted TimescaleDB instance, you can retrieve it using any standard PostgreSQL client or library:

-   **From your local machine (for analysis/debugging)**:
    *   Use the PostgreSQL connection string provided by Railway in your local DB tool (DBeaver, pgAdmin, `psql`) or Python scripts (`psycopg2`).
    *   Ensure Railway's network settings allow external connections to the database if you need to connect from outside Railway's network (often requires whitelisting your IP or using a private network feature if available).
-   **From other Railway services**: If you have other services (e.g., a web frontend, an analytics service) in the same Railway project, they can typically connect to the PostgreSQL service using its internal Railway network address/hostname and the `DATABASE_URL` environment variable.
-   **Example Python snippet for connection (replace with your actual DB interaction logic)**:

    ```python
    import psycopg2
    import os

    # DATABASE_URL from Railway environment variables
    db_url = os.environ.get('DATABASE_URL')

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        # Example query
        cur.execute("SELECT contract_id, timestamp, close FROM ohlc_bars WHERE contract_id = 'CON.F.US.MES.M25' ORDER BY timestamp DESC LIMIT 10;")
        rows = cur.fetchall()
        for row in rows:
            print(row)
            
        cur.close()
    except (Exception, psycopg2.Error) as error:
        print(f"Error while connecting to PostgreSQL or executing query: {error}")
    finally:
        if conn:
            conn.close()
    ```

### Checklist for Railway Deployment

- [ ] **Database**: PostgreSQL service created on Railway.
- [ ] **Database**: TimescaleDB extension enabled.
- [ ] **Database**: `ohlc_bars`, `detected_signals`, `analyzer_watermarks`, `coordinator_watermarks` tables created; `ohlc_bars` is a hypertable with unique constraint.
- [ ] **Application**: `Dockerfile` created and configured.
- [ ] **Application**: `requirements.txt` is complete.
- [ ] **Application**: Python service(s) deployed to Railway.
- [ ] **Application**: Environment variables (DATABASE_URL, API keys, etc.) set correctly in Railway.
- [ ] **Application**: Services are running and logs are being produced and checked on Railway.
- [ ] **Connectivity**: Python application can successfully connect to and write/read from the Railway PostgreSQL/TimescaleDB.
- [ ] **Data Flow**: Live data is being ingested, aggregated, stored, and signals are being generated and stored (verify by querying the DB on Railway).

## Goals for Phase Completion

These goals define the expected outcomes and verifiable milestones for each phase of development.

### Goals for Phase 0: Prerequisites & Setup

*   [x] **Environment Ready**: Local Python development environment is fully configured with all necessary libraries.
*   [x] **Configuration Managed**: `config/settings.yaml` and `.env` files are correctly set up with necessary configurations and credentials.
*   [x] **Local Database Operational**: Local TimescaleDB instance is running via Docker, accessible, and the `timescaledb` extension is enabled.
*   [x] **Local Database Schema Applied**: All required tables (`ohlc_bars`, `analyzer_watermarks`, `coordinator_watermarks`) are created in the local TimescaleDB, `ohlc_bars` is a hypertable, and unique constraints are applied (ohlc_bars fully, watermarks schema present).
*   [x] **Basic DB Connectivity**: Python scripts can successfully connect to the local TimescaleDB instance and perform basic queries.

### Goals for Phase 1: Data Foundation - Live Data to TimescaleDB

*   [x] **WebSocket Connection Established**: The Live Data Ingestion service can successfully authenticate and connect to the SignalR WebSocket for market data.
*   [x] **Live Data Reception**: The service receives live trade data for all subscribed contracts.
*   [x] **Accurate OHLC Aggregation**: The `OHLCBarAggregator` correctly processes incoming trades and forms accurate OHLC bars for all configured (contract, timeframe) pairs, with proper timestamp alignment.
*   [x] **Reliable Bar Storage**: Completed OHLC bars are consistently and correctly stored in the local TimescaleDB `ohlc_bars` table.
*   [x] **Duplicate Prevention Verified**: The `UPSERT` (or `ON CONFLICT DO NOTHING`) logic for `ohlc_bars` effectively prevents duplicate bar entries during continuous operation or restarts.
*   [x] **Service Resilience**: The ingestion service demonstrates robust error handling, including automatic WebSocket reconnection with backoff, and logs errors appropriately.
*   [x] **Sustained Operation (Local)**: The service can run for an extended period (e.g., several hours) locally, continuously ingesting and storing live data without crashing or significant data loss (barring major external outages).

### Goals for Phase 2: Multi-Timeframe Signal Generation

*   [ ] **Analyzer Data Retrieval**: Timeframe-Specific Analyzers can successfully query new OHLC bars from TimescaleDB for their respective timeframes, using the `analyzer_watermarks` table to avoid reprocessing data.
*   [ ] **`trend_analyzer_alt.py` Integration**: The core logic from `trend_analyzer_alt.py` is successfully refactored and integrated into the analyzer instances, processing dataframes/lists of Bar objects from the database.
*   [ ] **Signal Generation & Storage**: Analyzers correctly identify trend signals based on their logic and reliably store these signals in the `detected_signals` table in TimescaleDB.
*   [ ] **Analyzer Watermark Update**: Analyzers correctly update their `last_processed_timestamp` in the `analyzer_watermarks` table after each processing cycle.
*   [ ] **Coordinator Signal Retrieval**: The Signal Coordination Service can successfully query new signals from the `detected_signals` table, using the `coordinator_watermarks` table.
*   [ ] **Basic Coordination Logic Functional**: The coordinator implements and logs decisions based on its initial, simple coordination rules (e.g., basic confluence).
*   [ ] **Coordinator Watermark Update**: The coordinator correctly updates its `last_processed_signal_id` in the `coordinator_watermarks` table.
*   [ ] **End-to-End Data Flow (Signals)**: A clear data path is observable: Live Tick -> OHLC Bar in DB -> Analyzer Reads Bar -> Analyzer Writes Signal to DB -> Coordinator Reads Signal.

### Goals for Phase 3: Execution (Conceptual Outline)

*   [ ] **Execution Module Design**: A clear design document or detailed specification for the Order Execution Module is created, outlining its responsibilities, inputs, outputs, and interaction with the `GatewayClient` and Signal Coordination Service.
*   [ ] **API Interaction Plan**: Key ProjectX Gateway API endpoints for order placement, modification, cancellation, and position retrieval are identified and their usage within the execution module is planned.
*   [ ] **Risk Management Considerations**: Initial thoughts on how basic risk checks (e.g., max position size per trade) would be incorporated before order placement are documented.

### Goals for Railway Deployment (Post-Local Development & Testing)

*   [ ] **Railway Database Setup**: Railway PostgreSQL service is provisioned, TimescaleDB extension is enabled, and all necessary schemas (`ohlc_bars`, `detected_signals`, watermark tables) are applied correctly.
*   [ ] **Application Dockerized & Deployed**: Python application(s) are successfully containerized using the `Dockerfile` and deployed as a service on Railway.
*   [ ] **Environment Configuration on Railway**: All necessary environment variables (DATABASE_URL, API keys, etc.) are securely configured in the Railway service settings.
*   [ ] **Service Operational on Railway**: Deployed services on Railway are running, connecting to the Railway DB, and processing live data (verifiable through Railway logs and by querying the Railway DB).
*   [ ] **Remote Data Accessibility**: OHLC and signal data stored in the Railway TimescaleDB instance can be accessed remotely (e.g., from a local DB tool or script) for verification and analysis, respecting security configurations.
*   [ ] **Historical Data Population on Railway**: A strategy for populating the Railway DB with historical data is successfully executed.

</rewritten_file> 