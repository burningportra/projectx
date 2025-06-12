# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ProjectX is a sophisticated automated mechanical trading system built for trend analysis and multi-timeframe trading strategies. The system combines Python backend services with a Next.js frontend featuring advanced backtesting capabilities.

## Technology Stack

**Backend (Python):**
- FastAPI, asyncio, WebSockets for real-time data processing
- TimescaleDB (PostgreSQL extension) for time-series data
- ProjectX Gateway API integration for market data

**Frontend (Next.js):**
- Next.js 15.3.2 with App Router, React 19, TypeScript
- Radix UI components, Tailwind CSS v4
- Multiple charting libraries: Lightweight Charts, Chart.js, Recharts, SciChart
- SWR for data fetching, Immer for immutable state updates
- Prisma ORM for database access

## Common Development Commands

**Environment Setup:**
```bash
# Backend dependencies
pip install -r requirements.txt

# Frontend dependencies  
cd web && npm install

# Environment configuration
cp .env.template .env  # Fill with API keys and DB credentials
```

**Database Setup:**
```bash
# Start local TimescaleDB
./run_timescaledb_docker.sh

# Download historical data for testing
python download_historical.py --contracts "CON.F.US.MES.M25" --start-date "YYYY-MM-DD" --end-date "YYYY-MM-DD"
```

**Running Services:**
```bash
# Backend services (ingester + analyzer + broadcaster)
./run_services.sh

# Frontend development server  
cd web && npm run dev
```

**Build & Test Commands:**
```bash
# Frontend build and test
cd web && npm run build
cd web && npm run lint
cd web && npm test

# Python testing
pytest
```

## System Architecture

### Core Data Flow
```
External Market Data → Live Ingester → TimescaleDB → Analysis Services
                                    ↓
                           WebSocket Broadcaster → Next.js Frontend
                                    ↓
                              Trading Strategies → Order Execution
```

### Key Services

1. **Live Ingester** (`src/data/ingestion/live_ingester.py`)
   - Connects to ProjectX Gateway API via WebSocket
   - Aggregates tick data into OHLC bars (1m, 5m, 15m, 1h, 4h, 1d)
   - Uses PostgreSQL NOTIFY for real-time coordination

2. **Analyzer Service** (`src/analysis/analyzer_service.py`)
   - Listens for PostgreSQL LISTEN notifications
   - Runs trend detection algorithms (CUS/CDS analysis)
   - Stores detected signals in database

3. **Broadcaster Service** (`src/services/broadcaster.py`)
   - WebSocket server at `ws://localhost:8765`
   - Relays real-time data to frontend clients

4. **Strategy Engine** (`src/strategies/`)
   - Trend Start Finder for signal identification
   - Rule-based strategy execution with position management

### Database Schema

**Key Tables:**
- `ohlc_bars`: Time-series OHLC data (TimescaleDB hypertable)
- `detected_signals`: Trading signals from analysis services

**Real-time Communication:**
- PostgreSQL LISTEN/NOTIFY channels: `ohlc_update`, `tick_data_channel`
- WebSocket broadcasting for frontend updates

## Advanced Backtesting System

The frontend features a sophisticated v3 backtesting architecture:

- **Immutable State Management** using Immer for predictable state updates
- **Event-Driven Architecture** with comprehensive event system
- **Pure Strategy Functions** for stateless, testable strategies
- **Realistic Order Matching** with synthetic tick generation
- **Bracket Order System** with OCO (One-Cancels-Other) logic
- **Memoized Technical Indicators** for performance optimization

**Backtesting Components:**
- Event system with immutable state updates
- Order matching engine with realistic fills
- Strategy testing framework with comprehensive metrics
- Multi-timeframe analysis coordination

## Multi-Timeframe Analysis

The system processes multiple timeframes simultaneously:
- **Timeframes**: 1m, 5m, 15m, 30m, 1h, 4h, 1d
- **Coordinated Analysis**: Signals analyzed across timeframes for confluence
- **Real-time Processing**: Live data aggregation with historical context

## Configuration Management

**Environment Variables** (`.env`):
- API keys and database credentials
- Service configuration (ports, hosts)

**Settings File** (`config/settings.yaml`):
- Trading contracts and timeframes
- Analysis parameters and strategy settings
- Service coordination parameters

**Frontend Configuration**:
- Next.js config with TypeScript strict mode
- Prisma schema for type-safe database access
- Tailwind CSS with custom components

## Task Management Integration

This project uses Task Master for development workflow management:
- Use MCP server tools (`get_tasks`, `next_task`, `expand_task`) for integrated development
- CLI fallback: `task-master` commands for direct terminal interaction
- Configuration managed via `.taskmasterconfig` and API keys in `.env`
- Follow iterative subtask implementation process with detailed logging

## Development Patterns

**Event-Driven Architecture:**
- PostgreSQL LISTEN/NOTIFY for service coordination
- WebSocket events for real-time frontend updates
- Immutable state updates with proper event emission

**Clean Architecture Separation:**
- Data Layer: Ingestion, storage, validation
- Analysis Layer: Trend detection, signal generation
- Execution Layer: Order management, position tracking
- Presentation Layer: Web UI, charts, controls

**Testing Strategy:**
- Python: pytest with asyncio support
- Frontend: Jest with TypeScript
- Integration testing capabilities
- Comprehensive backtesting framework for strategies

## File Structure Patterns

**Backend Services**: `src/` directory with modular service organization
**Frontend Components**: `web/src/` with Next.js App Router structure
**Configuration**: Root-level config files with environment-specific overrides
**Database**: Prisma schema in `web/prisma/` with migration support

## Current Development Focus

Based on recent commits, active development areas include:
- Backtesting system refinement (v3 architecture)
- Strategy optimization and trend detection improvements
- Frontend chart enhancements and UI polish
- Comprehensive testing infrastructure expansion