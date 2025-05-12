# Proposed Project Structure

This document outlines the recommended file and directory structure for the automated trading system, based on the requirements and todos defined in `automated_trading_prd.md`.

```
projectx/
├── src/                       # Main source code directory
│   ├── main.py                # Application entry point & orchestration
│   ├── core/                  # Core components, shared logic, configuration
│   │   ├── __init__.py
│   │   ├── config.py            # Load configuration (env vars, files)
│   │   ├── logging_config.py    # Configure application logging
│   │   └── exceptions.py        # Custom exception classes
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
│   │   │   └── schemas.py         # Database table schemas (e.g., SQLAlchemy models)
│   │   ├── aggregation.py       # Multi-timeframe data aggregation logic
│   │   ├── validation.py        # Data validation rules and implementation
│   │   └── caching.py           # Caching mechanism (e.g., Redis integration)
│   │
│   ├── strategies/            # Trading strategies and rule engine module
│   │   ├── __init__.py
│   │   ├── models.py            # Pydantic models for Strategy, Rule definitions
│   │   ├── engine.py            # Core rule evaluation engine
│   │   ├── rules/               # Directory for individual rule implementations
│   │   │   ├── __init__.py
│   │   │   └── base_rule.py       # Base class for rules
│   │   ├── versioning.py        # Strategy version control logic
│   │   └── backtesting/         # Backtesting framework components (Advanced)
│   │       ├── __init__.py
│   │       └── engine.py          # Backtesting engine logic
│   │
│   ├── execution/             # Order execution and position management module
│   │   ├── __init__.py
│   │   ├── models.py            # Pydantic models for Order, Position, Fill
│   │   ├── gateway_interface.py # Interface to ProjectX Trading API
│   │   ├── position_manager.py  # Position state tracking and P&L calculation
│   │   ├── order_handler.py     # Order submission, modification, cancellation logic
│   │   └── state_manager.py     # Handles overall trading state persistence
│   │
│   ├── risk/                  # Risk management module
│   │   ├── __init__.py
│   │   ├── models.py            # Pydantic models for Risk Limits
│   │   ├── strategy_limits.py   # Per-strategy limit checking logic
│   │   ├── global_monitor.py    # Global risk exposure monitoring
│   │   └── emergency_stop.py    # Emergency stop mechanism
│   │
│   ├── api/                   # Optional: API endpoints if exposing functionality externally
│   │   ├── __init__.py
│   │   ├── routes/              # API route definitions (e.g., FastAPI routers)
│   │   │   ├── __init__.py
│   │   │   ├── strategies.py
│   │   │   └── positions.py
│   │   └── ws_handler.py        # WebSocket handling for real-time updates to UI
│   │
│   └── services/              # Higher-level services coordinating components
│       ├── __init__.py
│       ├── trading_service.py   # Orchestrates data -> strategy -> execution flow
│       ├── monitoring_service.py # System health/performance monitoring service
│       └── alert_service.py     # Handles sending alerts
│
├── tests/                   # Automated tests
│   ├── __init__.py
│   ├── conftest.py            # Pytest fixtures and configuration
│   ├── data/                  # Fixtures for test data
│   ├── unit/                  # Unit tests per module
│   │   ├── test_data.py
│   │   ├── test_strategies.py
│   │   ├── test_execution.py
│   │   └── test_risk.py
│   ├── integration/           # Integration tests (module interactions)
│   │   └── test_trading_flow.py
│   └── stress/                # Stress and performance tests
│       └── test_high_frequency.py
│
├── docs/                    # Project documentation
│   ├── automated_trading_prd.md
│   └── project_structure.md   # This file
│
├── config/                  # Configuration files
│   ├── settings.yaml          # Main application settings
│   ├── strategies/            # Directory for strategy configurations
│   │   └── example_strategy.yaml
│   └── risk_limits.yaml       # Risk limit configurations
│
├── scripts/                 # Utility and maintenance scripts
│   ├── run_backtest.py
│   ├── db_migrate.py          # Database migration scripts
│   └── deploy.sh              # Deployment script example
│
├── .env.example             # Example environment variables
├── .gitignore               # Git ignore file
├── requirements.txt         # Python dependencies
└── README.md                # Project overview, setup, and usage instructions
```

## Rationale

*   **`src/` Directory:** Contains all the application's source code, keeping the root directory clean.
*   **Modularity:** Code is broken down into distinct modules (`data`, `strategies`, `execution`, `risk`, `api`, `services`) based on functionality. This improves organization and allows for independent development and testing.
*   **Separation of Concerns:** Each module has a clear responsibility (e.g., `data` handles market data, `execution` handles orders).
*   **Core Components:** The `core/` directory holds shared logic like configuration loading, logging setup, and custom exceptions, reducing redundancy.
*   **Models:** Pydantic models (`models.py` in each module) provide data validation and structure.
*   **Clear Interfaces:** Modules like `gateway_client.py` and `gateway_interface.py` define clear boundaries for interacting with external APIs.
*   **Testing:** A dedicated `tests/` directory mirrors the `src/` structure, making it easy to locate tests for specific modules. Includes unit, integration, and stress test categories.
*   **Configuration:** A `config/` directory keeps configuration files separate from the code, allowing for easier management across different environments.
*   **Scripts:** A `scripts/` directory for operational tasks like database migrations, backtesting runs, or deployment.
*   **Documentation:** `docs/` contains high-level project documentation. Code-level documentation should reside within the source files as docstrings.

This structure provides a solid foundation for building a complex, maintainable, and testable automated trading system. 

## Interfacing with a Next.js Frontend

A Next.js frontend application can interact with this Python backend primarily through two mechanisms:

1.  **REST API (via `src/api/`)**:
    *   The Next.js app will make standard HTTP requests (GET, POST, PUT, etc.) to the API endpoints defined in `src/api/routes/` (e.g., `/api/strategies`, `/api/positions`).
    *   This is suitable for actions initiated by the user, such as:
        *   Loading initial data (list of strategies, positions).
        *   Creating or modifying strategy configurations.
        *   Manually closing positions or triggering emergency stops.
        *   Fetching historical data or performance reports.
    *   The Python backend (likely using a framework like FastAPI or Flask) will handle these requests, interact with the relevant service layers (`src/services/`), and return JSON responses.

2.  **WebSockets (via `src/api/ws_handler.py`)**:
    *   The Next.js app will establish a WebSocket connection to the endpoint managed by `src/api/ws_handler.py`.
    *   This connection is used for pushing real-time updates *from* the backend *to* the frontend, enabling a dynamic user experience. Examples include:
        *   Live market data updates (if needed directly in the UI).
        *   Real-time position updates (current price, P&L).
        *   Notifications about strategy signals or rule triggers.
        *   System status alerts or error messages.
    *   The Python backend will push relevant events (e.g., strategy updates, position changes sourced from `src/services/`) through the WebSocket connection to all connected frontend clients.

**Typical Workflow:**

*   The Next.js app loads initial state via REST API calls upon page load.
*   It establishes a WebSocket connection to receive continuous real-time updates.
*   User actions in the Next.js UI trigger further REST API calls to the backend.
*   The backend processes actions, potentially updates its state, and pushes relevant real-time changes back to the frontend via WebSockets. 