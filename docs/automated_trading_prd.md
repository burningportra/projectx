# Automated Trading Web Application PRD

## Overview
A web-based automated trading platform that executes trades based on multi-timeframe OHLC price analysis, integrating with ProjectX Gateway API and existing TradingView charts.

## Core Features

### 1. Strategy Configuration
- Multi-timeframe OHLC rule configuration:
  - Primary timeframe selection (1m, 5m, 15m, 1h, 4h, 1d)
  - Secondary timeframe selection for confirmation
  - OHLC price comparison rules
  - Time window definitions
- Strategy status controls:
  - Activate/Deactivate
  - Emergency stop
  - Position exit rules
- Position sizing configuration
- Risk parameters setup

### 2. Order Management Dashboard
- Active orders table with status
- Position summary
- Quick actions:
  - Cancel order
  - Close position
  - Modify order
- Order history with execution details
- P&L tracking per position

### 3. Strategy Monitoring
- Current strategy status
- Active rules status
- Recent signals log
- Position status
- Performance metrics:
  - Current P&L
  - Win/Loss count
  - Average win/loss
  - Maximum drawdown

### 4. Risk Controls
- Per-strategy limits:
  - Maximum position size
  - Stop loss levels
  - Daily loss limit
  - Maximum concurrent positions
- Emergency stop button
- Auto-shutdown on limit breach

## Technical Architecture

### Frontend
- React/Next.js single page application
- WebSocket for real-time updates
- TypeScript for type safety
- Minimal UI components (Tailwind)

### Backend
- Node.js/Express for API
- TimescaleDB (PostgreSQL with time-series extensions) for market data
- Prisma ORM for database access
- Redis for real-time data
- WebSocket server for updates

### Integration Points
1. ProjectX Gateway API:
   - Authentication
   - Market data streaming
   - Order execution
   - Account management
   - Contract format: "CON.F.US.MES.M25" (Micro E-mini S&P 500)

## Data Models

### Database Schema
The application uses TimescaleDB for efficient storage and querying of time-series market data:
- High-performance time-based queries
- Automatic partitioning by time chunks
- Data retention policies
- Advanced time-series aggregation functions

#### OHLC Data Model
```typescript
// Prisma schema for market data
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
  @@map("ohlc_bars")
}
```

### Strategy
```typescript
interface Strategy {
  id: string;
  userId: string;
  name: string;
  status: 'active' | 'paused' | 'stopped';
  timeframes: {
    primary: TimeFrame;
    secondary?: TimeFrame;
  };
  rules: {
    entryConditions: OHLCRule[];
    exitConditions: OHLCRule[];
    timeWindows?: TimeWindow[];
  };
  riskSettings: {
    positionSize: number;
    maxLoss: number;
    dailyLossLimit: number;
    maxPositions: number;
  };
}

interface OHLCRule {
  id: string;
  timeframe: TimeFrame;
  comparison: {
    type: 'cross' | 'above' | 'below';
    pricePoints: {
      reference: 'open' | 'high' | 'low' | 'close';
      lookback: number;
      operator: '>' | '<' | '==' | '>=' | '<=';
      value: number | {
        reference: 'open' | 'high' | 'low' | 'close';
        lookback: number;
      };
    }[];
  };
}

type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
```

### Position
```typescript
interface Position {
  id: string;
  strategyId: string;
  contractId: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  status: 'open' | 'closing' | 'closed';
  openTime: Date;
  closeTime?: Date;
}
```

## API Endpoints

### Strategy Management
```typescript
POST /api/strategies
GET /api/strategies
PUT /api/strategies/:id
POST /api/strategies/:id/activate
POST /api/strategies/:id/deactivate
POST /api/strategies/:id/emergency-stop
```

### Position Management
```typescript
GET /api/positions
GET /api/positions/:id
POST /api/positions/:id/close
GET /api/positions/performance
```

## WebSocket Events

### Strategy Updates
```typescript
interface StrategyEvent {
  type: 'signal' | 'rule_triggered' | 'error';
  strategyId: string;
  data: {
    ruleId?: string;
    action?: 'buy' | 'sell';
    price?: number;
    timestamp: Date;
    message: string;
  };
}
```

### Position Updates
```typescript
interface PositionEvent {
  type: 'open' | 'update' | 'close';
  positionId: string;
  data: {
    price: number;
    size: number;
    pnl: number;
    timestamp: Date;
  };
}
```

## UI Components

### Strategy Control Panel
```typescript
interface StrategyControlProps {
  strategy: Strategy;
  onActivate: () => void;
  onDeactivate: () => void;
  onEmergencyStop: () => void;
  status: {
    active: boolean;
    lastSignal: Date;
    currentPositions: number;
    dailyPnl: number;
  };
}
```

### Position Monitor
```typescript
interface PositionMonitorProps {
  positions: Position[];
  onClose: (positionId: string) => void;
  onModify: (positionId: string, size: number) => void;
  performance: {
    totalPnl: number;
    winCount: number;
    lossCount: number;
    averageWin: number;
    averageLoss: number;
  };
}
```

## Development Phases

### Phase 1: MVP
- Basic strategy configuration
- Real-time position monitoring
- Manual override controls
- Basic performance tracking

### Phase 2: Enhanced Features
- Multi-timeframe rule builder
- Advanced risk controls
- Performance analytics
- Email alerts

### Phase 3: Optimization
- Strategy performance optimization
- Advanced monitoring
- Mobile responsive design

## Success Metrics
- Strategy execution accuracy
- System latency
- Order execution success rate
- P&L tracking accuracy
- System uptime

## Error Handling
- Strategy validation errors
- Order execution failures
- Connection loss handling
- Data stream interruptions
- Risk limit breaches

## Compliance & Regulations
- Trading hours enforcement
- Position limits compliance
- Risk disclosure
- Data retention policies
- Audit trail maintenance

## Development Todo List

### Core Market Data Processing
- [x] Implement OHLC data models and storage
  - [x] Define OHLC data structure
  - [x] Set up database schema for OHLC data
  - [x] Implement data storage logic
- [x] Build efficient data ingestion pipeline from ProjectX Gateway
  - [x] Establish connection to ProjectX Gateway
  - [x] Implement data fetching logic
  - [x] Handle data parsing and validation
- [x] Create multi-timeframe data aggregation system
  - [x] Define aggregation logic for different timeframes
  - [x] Implement aggregation functions
  - [x] Test aggregation accuracy
- [x] Implement market data caching for performance optimization
  - [x] Design caching strategy
  - [x] Implement caching mechanism
  - [x] Integrate caching with data pipeline
- [x] Implement market data validation and error handling
- [x] Build historical data download functionality
  - [x] Create API client for historical data retrieval
  - [x] Implement robust error handling
  - [x] Support configurable timeframes and contracts

### Rule Engine Development
- [ ] Design core rule evaluation engine
  - [ ] Define rule evaluation criteria
  - [ ] Implement rule evaluation logic
  - [ ] Test rule evaluation with sample data
- [ ] Implement basic comparison operators
  - [ ] Define comparison operator types
  - [ ] Implement operator logic
  - [ ] Validate operator functionality
- [ ] Add support for time-based filters
  - [ ] Define time-based filter criteria
  - [ ] Implement filter logic
  - [ ] Test filter integration
- [ ] Build cross-timeframe rule validation
  - [ ] Define cross-timeframe validation rules
  - [ ] Implement validation logic
  - [ ] Test validation with multi-timeframe data
- [ ] Create rule conflict detection system
  - [ ] Define conflict detection criteria
  - [ ] Implement conflict detection logic
  - [ ] Test conflict detection accuracy

### Position Management
- [ ] Develop order submission and tracking
  - [ ] Define order submission process
  - [ ] Implement order tracking logic
  - [ ] Test order submission and tracking
- [ ] Implement position state management
  - [ ] Define position states
  - [ ] Implement state transition logic
  - [ ] Test state management
- [ ] Create position monitoring and update system
  - [ ] Define monitoring criteria
  - [ ] Implement monitoring logic
  - [ ] Test monitoring and update functionality
- [ ] Build manual override functionality
  - [ ] Define override scenarios
  - [ ] Implement override logic
  - [ ] Test manual override
- [ ] Add position modification capabilities
  - [ ] Define modification criteria
  - [ ] Implement modification logic
  - [ ] Test position modification

### Risk Control System
- [ ] Implement per-strategy risk limits
  - [ ] Define risk limit criteria per strategy (e.g., max position size, stop loss)
  - [ ] Implement enforcement logic within strategy execution
  - [ ] Test specific strategy risk limits
- [ ] Create global risk monitoring service
  - [ ] Define global exposure limits (e.g., total capital at risk, sector exposure)
  - [ ] Implement monitoring service for overall portfolio risk
  - [ ] Test global risk monitoring and alerting
- [ ] Build emergency stop functionality
  - [ ] Define emergency stop scenarios
  - [ ] Implement stop logic
  - [ ] Test emergency stop
- [ ] Add daily/session loss limits
  - [ ] Define loss limit criteria
  - [ ] Implement loss limit enforcement
  - [ ] Test loss limit functionality
- [ ] Implement position size restrictions
  - [ ] Define size restriction criteria
  - [ ] Implement restriction logic
  - [ ] Test size restrictions

### Integration & Testing
- [x] Complete ProjectX Gateway API integration
  - [x] Define API integration points
  - [x] Implement API connection logic
  - [x] Implement robust WebSocket reconnection and failover logic
  - [x] Test API integration and connection stability
- [ ] Build comprehensive test suite for strategy execution
  - [ ] Define test cases (unit, integration, end-to-end)
  - [ ] Implement test logic using frameworks like pytest
  - [ ] Run test suite automatically in CI/CD pipeline
- [ ] Implement stress testing for high-frequency trading scenarios
- [ ] Implement performance benchmarking tools
  - [ ] Define benchmarking criteria (latency, throughput)
  - [ ] Implement benchmarking tools
  - [ ] Test performance benchmarks under load
- [ ] Define and track key performance metrics (latency, execution speed, success rate)
- [ ] Create system monitoring and alerting
  - [ ] Define monitoring criteria (system health, resource usage, errors)
  - [ ] Implement alerting logic (e.g., PagerDuty, Slack)
  - [ ] Test monitoring and alerts
- [ ] Document API endpoints, data models, and deployment process

### Web Application Development
- [x] Create Next.js project structure
  - [x] Set up basic project architecture
  - [x] Configure TypeScript and linting
  - [x] Set up Tailwind CSS
- [ ] Implement authentication system
  - [ ] Create user login/registration
  - [ ] Implement JWT-based auth flow
  - [ ] Set up protected routes
- [ ] Build strategy configuration UI
  - [ ] Create strategy form components
  - [ ] Implement rule builder interface
  - [ ] Add validation for strategy settings
- [ ] Develop position monitoring dashboard
  - [ ] Create real-time position display
  - [ ] Implement position actions (close, modify)
  - [ ] Design performance metrics visualization
- [x] Create API endpoints for strategy management
  - [x] Implement strategy CRUD operations
  - [x] Create endpoints for strategy activation/deactivation
  - [x] Add endpoints for emergency actions
- [x] Create API endpoints for position management
  - [x] Implement position retrieval operations
  - [x] Create endpoint for position closing
- [x] Create API endpoints for order management
  - [x] Implement order CRUD operations
  - [x] Set up order status tracking
- [ ] Set up WebSocket server for real-time updates
  - [ ] Implement WebSocket event handlers
  - [ ] Create subscription management
  - [ ] Integrate with frontend for real-time updates

### Advanced Considerations

#### Latency Optimization
- [x] Profile and optimize data processing pipelines for low-latency execution
- [x] Implement asynchronous processing for non-blocking operations
- [x] Use efficient data structures for real-time data handling

#### Scalability Considerations
- [x] Design system architecture to support horizontal scaling
- [ ] Implement load balancing for WebSocket connections
- [x] Optimize database queries for high-frequency trading

#### Security Enhancements
- [ ] Implement secure authentication and authorization mechanisms
- [ ] Encrypt sensitive data in transit and at rest
- [ ] Regularly audit code for security vulnerabilities

#### Advanced Risk Management
- [ ] Develop dynamic risk assessment models based on market conditions
- [ ] Implement real-time risk exposure monitoring
- [ ] Automate risk mitigation strategies

#### Algorithmic Strategy Optimization
- [ ] Implement backtesting framework for strategy validation
- [ ] Implement strategy versioning and change tracking
- [ ] Continuously monitor and adjust strategies based on performance metrics

#### Comprehensive Logging and Monitoring
- [x] Implement detailed logging for all trading activities
- [ ] Define and implement data retention policies
- [ ] Set up real-time monitoring dashboards for system health
- [ ] Use anomaly detection to identify unusual trading patterns 

### Next Steps (Current Priority)
- [x] Set up TimescaleDB for market data storage
  - [x] Create Docker configuration for local development
  - [x] Implement data models and schemas
  - [x] Build efficient data access layer
- [x] Download and store historical price data
  - [x] Implement API connection to fetch data
  - [x] Create data transformation pipeline
  - [x] Store data in optimized time-series format
- [x] Set up Prisma ORM integration
  - [x] Create schema mapping to database structure
  - [x] Set up connection configuration
- [ ] Run backtesting on historical data
  - [ ] Create basic strategy evaluation framework
  - [ ] Implement performance metrics calculation
  - [ ] Visualize strategy results
- [ ] Implement basic rule engine components
  - [ ] Create rule class structure
  - [ ] Implement basic price comparison logic
  - [ ] Add timeframe-specific rule evaluation
- [ ] Develop strategy management service
  - [ ] Create strategy data model
  - [ ] Implement strategy storage and retrieval
  - [ ] Add strategy activation/deactivation logic
- [ ] Begin web frontend development
  - [ ] Set up Next.js project with TypeScript
  - [x] Create database connection with Prisma ORM
  - [ ] Implement basic UI for strategy management 