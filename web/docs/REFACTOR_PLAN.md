# Backtesting System Refactor: Detailed Implementation Plan v3

This document provides a detailed, phased implementation plan for refactoring the backtesting system. **Version 3 is an AI-Execution-Ready blueprint, adding granular detail, explicit API designs, file structure guidance, and implementation notes to each task.**

---

### Guiding Principles for AI Implementation

*   **Clarity and Simplicity Above All:** Code must be clean, easy to understand, and simple to maintain. Avoid clever, obscure, or overly complex solutions. Prioritize readability for future developers (both human and AI) over micro-optimizations. If a choice exists between a "smart" one-liner and a more verbose but obvious multi-line block, choose the latter.
*   **File Structure:** Create new files and directories as specified. All core logic should reside in `lib/`.
*   **Immutability:** Use `immer` for all state updates within the `BacktestEngine`. Never mutate state directly.
*   **Testing:** Each new class or significant function should have a corresponding Jest/Vitest spec file (`*.test.ts`).
*   **Error Handling:** Use specific error classes (e.g., `OrderValidationError`) instead of generic `Error`.
*   **Cleanup:** As new components are built, the old components they replace **must** be deprecated and then removed in Phase 6.

---

## Phase 1: Core Engine & Data Foundation

**Goal:** Establish a robust foundation with a central engine, clean data handling, and efficient indicator calculations.

### Task 1.1: `BacktestEngine` Scaffolding & State
- **Action:** Create `lib/engine/BacktestEngine.ts` and `lib/engine/types.ts`.
- **API Design (`types.ts`):**
  ```typescript
  // lib/engine/types.ts
  export type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED';
  export interface Order { readonly id: string; readonly tradeId: string; readonly status: OrderStatus; /* ... */ }
  export interface Position { readonly id: string; readonly entryPrice: number; /* ... */ }
  export interface BacktestState {
    readonly config: Readonly<BacktestConfig>;
    readonly orders: ReadonlyMap<string, Order>;
    readonly positions: ReadonlyMap<string, Position>;
    readonly bars: readonly BacktestBarData[];
    readonly barIndex: number;
  }
  ```
- **Implementation (`BacktestEngine.ts`):**
    - The constructor should accept a `BacktestConfig` object (for commission, slippage, etc.).
    - Use `immer`'s `produce` function for all methods that modify state.
    - The `subscribe` method is key for UI reactivity and should return an `unsubscribe` function.

### Task 1.2: Data Abstraction & Validation
- **Action:** Create `lib/data/DataSource.ts` and `lib/data/validator.ts`.
- **API Design (`DataSource.ts`):**
  ```typescript
  // lib/data/DataSource.ts
  export interface DataSource {
    // Returns a clean, validated set of bars.
    getBars(symbol: string, timeframe: string): Promise<BacktestBarData[]>;
  }
  ```
- **Implementation (`validator.ts`):**
    - Create a `DataValidator` static class.
    - `validate(bars)` method should check for:
        1.  Chronological order.
        2.  Gaps in time series based on the timeframe.
        3.  OHLC consistency (`high` >= `open`/`close`, `low` <= `open`/`close`).
    - It should return `{ cleanBars: BacktestBarData[], errors: DataError[] }`.

### Task 1.3: Memoized Indicator Service
- **Action:** Create `lib/indicators/IndicatorService.ts` and individual indicator files (e.g., `lib/indicators/ema.ts`).
- **Implementation:**
    - The `IndicatorService` is instantiated by the `BacktestEngine` with the bar data.
    - Indicator calculation functions (e.g., `calculateEma`) should be pure functions that accept an array of numbers and return an array of numbers.
    - The service's `getEMA` (or similar) methods act as a caching layer on top of these pure functions.

---

## Phase 2: Advanced Execution & Strategy Logic

### Task 2.1: Synthetic Tick Order Matching
- **Action:** Implement a private `_processFills(bar, draftState)` method inside `BacktestEngine`.
- **Implementation Details:**
  1.  Generate the synthetic price path array: `const path = bar.close >= bar.open ? [bar.open, bar.high, bar.low, bar.close] : [bar.open, bar.low, bar.high, bar.close];`
  2.  Loop through this `path`. For each `price` in the path, loop through all `PENDING` orders.
  3.  Call a `_checkFill(order, price)` helper. If it returns true, fill the order and **importantly, process the consequences** (e.g., creating a position) before checking the next order at that same price point. This correctly models fills that might trigger other actions immediately.

### Task 2.2: First-Class Bracket Orders
- **Action:** Implement `submitBracketOrder` in `BacktestEngine`.
- **API Design (`types.ts`):**
  ```typescript
  export interface BracketOrderRequest {
    entry: Omit<Order, 'id' | 'status' | 'ocoId'>;
    stopLoss: Omit<Order, 'id' | 'status' | 'side' | 'ocoId'>; // Side is inferred
    takeProfit: Omit<Order, 'id' | 'status' | 'side' | 'ocoId'>;
  }
  ```
- **Implementation:** The `submitBracketOrder` method must assign a shared `ocoId` to the stop-loss and take-profit orders. The `_processFills` logic must be updated: when an order with an `ocoId` is filled, it must find and cancel all other pending orders with the same `ocoId`.

### Task 2.3: Pure Function Strategies
- **Action:** Define `lib/engine/strategy.ts` and refactor `TrendStartStrategy`.
- **API Design (`strategy.ts`):**
  ```typescript
  export type Signal = { type: 'SUBMIT_BRACKET_ORDER'; request: BracketOrderRequest } | { type: 'CLOSE_POSITION'; positionId: string };

  export interface Strategy {
    analyze: (
      state: BacktestState,
      indicators: IndicatorService
    ) => Signal[];
  }
  ```
- **Implementation:** The `BacktestEngine`'s main `processBar` loop will:
  1.  Call `strategy.analyze(...)`.
  2.  Loop through the returned `Signal[]` array.
  3.  Execute actions based on the signal type (e.g., `engine.submitBracketOrder(...)`).

---

## Phase 3: UI/DX and Live Trading Abstraction ✅

### Task 3.1: React Context for State
- **Action:** Create `components/engine/BacktestProvider.tsx`.
- **Implementation:** Use `React.useRef` inside the provider to hold the `BacktestEngine` instance. This is critical to prevent it from being re-created on every render. The `useEffect` hook in `useBacktestState` must return the `unsubscribe` function for proper cleanup.

### Task 3.2: Full TypeScript Type Safety
- **Action:** Enable `strict: true` in `tsconfig.json` and fix all resulting errors.
- **Implementation:** This task is about discipline. Search the codebase for `any` and replace it. Pay close attention to third-party libraries that may not have perfect types and create local type declarations if necessary.

### Task 3.3: Live Trading Portability
- **Action:** Define `lib/engine/IExecutionEngine.ts`.
- **API Design (`IExecutionEngine.ts`):**
  ```typescript
  export interface IExecutionEngine {
    // All methods must be async for live network calls
    submitOrder(order: OrderRequest): Promise<Order>;
    cancelOrder(id: string): Promise<boolean>;
    getPositions(): Promise<Position[]>;
    // ...
  }
  ```
- **Implementation:** The `BacktestEngine` will implement this interface with synchronous `Promise.resolve()` for immediate results. A future `AlpacaLiveEngine` would use `fetch` to interact with a real broker's API.

---

## Phase 4: Advanced Capabilities & Finalization

### Task 4.1: Parameter Optimization Runner
- **Action:** Create `lib/runners/BacktestRunner.ts`.
- **Implementation:** This class is an orchestrator. Its `runOptimization` method should generate a list of all parameter combinations from the input `paramGrid`. It will then loop through this list, and for each combination, it will:
    1.  Instantiate a new `BacktestEngine`.
    2.  Instantiate a new `Strategy` with the current parameter combination.
    3.  Run the full backtest loop.
    4.  Store the final `BacktestResult`.
    5.  Return an array of all results, likely sorted by a target metric like Sharpe Ratio or PnL.

### Task 4.2: Time-Travel Debugging
- **Action:** Add state snapshotting to `BacktestEngine`.
- **Memory Optimization Note:** Storing a full state snapshot on every bar can be memory-intensive. A more advanced v2 of this feature could store only the *events* or *state deltas* for each bar. When `getStateAt(barIndex)` is called, it would start from the nearest full snapshot and replay the deltas forward to reconstruct the state on demand. For the initial implementation, full snapshots are acceptable.

---

## Phase 5: Trader-Friendly Strategy Layer

### Task 5.1 & 5.2: Declarative Schema & Condition Evaluator
- **Action:** Create `lib/templates/schema.ts` and `lib/templates/evaluator.ts`.
- **Implementation Note:** The `evaluator.ts` is the core. It needs a `resolveValue` helper that can dynamically call the correct method on the `IndicatorService` based on the condition's `indicator` string (e.g., if `indicator === 'EMA'`, call `indicators.getEMA(...)`). This makes the system extensible to new indicators.

### Task 5.3: Generic Strategy Executor
- **Action:** Create `lib/templates/GenericStrategyExecutor.ts`.
- **Implementation:** This is an adapter. It implements the `Strategy` interface from Phase 2. Its constructor accepts a `TraderFriendlyStrategyTemplate`. Its `analyze` method iterates through the template's rules, uses the `evaluateCondition` function, and translates a successful rule evaluation into a `Signal` object (like `SUBMIT_BRACKET_ORDER`) that the `BacktestEngine` can understand.

### Task 5.4: Strategy Builder UI
- **Action:** Create `components/builder/StrategyBuilder.tsx`.
- **Implementation:** Use a state management library like `zustand` or React's `useReducer` to manage the complex form state of the strategy template. Each UI component (e.g., a `ConditionEditor`) should modify a part of this global form state. The final "Save" button would serialize this state object to JSON.

---

## Phase 6: Code Cleanup & Deprecation

**Goal:** Ensure the final codebase is clean, lean, and free of obsolete components by removing all code made redundant by the refactor.

### Task 6.1: Remove `OrderManager`
- **Status:** **New Task**
- **Trigger:** This task can be started after **Task 1.2** is complete and all direct references to `OrderManager` have been replaced with `BacktestEngine`.
- **Action:**
    1.  Search the entire codebase for any remaining imports or instances of `OrderManager`.
    2.  Ensure all such references are replaced by the `BacktestEngine` instance (likely passed via React Context).
    3.  Delete the file `lib/OrderManager.ts`.
- **Outcome:** All order logic is centralized in the `BacktestEngine`, removing a major source of state fragmentation.

### Task 6.2: Remove `BaseStrategy` and Stateful Strategy Classes
- **Status:** **New Task**
- **Trigger:** This task can be started after **Task 2.3** is complete.
- **Action:**
    1.  Confirm that all existing strategies (like `TrendStartStrategyRefactored`) have been converted to the new pure-function `Strategy` interface.
    2.  Delete the `lib/strategies/BaseStrategy.ts` file.
    3.  Delete the old stateful strategy class files (e.g., `lib/strategies/TrendStartStrategyRefactored.ts`). The new pure-function versions should live in a different directory, like `lib/strategies/pure/`.
- **Outcome:** The strategy implementation is now fully aligned with the new, simpler, stateless paradigm.

### Task 6.3: Remove Manual UI State Synchronization
- **Status:** **New Task**
- **Trigger:** This task can be started after **Task 3.1** and **Task 3.2** are complete.
- **Action:**
    1.  In `app/backtester/page.tsx`, identify all `useEffect` hooks that were previously used to sync `OrderManager` state to the component's state.
    2.  These hooks are now redundant because of the `useBacktestState` hook. Remove them entirely.
    3.  Also remove any `useState` calls that were holding temporary copies of orders, positions, or results.
- **Outcome:** The main UI component becomes dramatically simpler, relying entirely on the reactive context for its data.

### Task 6.4: Deprecate Backtesting Event Bus
- **Status:** **New Task**
- **Trigger:** After all other phases are complete.
- **Action:**
    1.  Analyze the usage of `messageBus.ts`.
    2.  Identify any events that are now handled by the `BacktestEngine`'s direct subscription model (e.g., `ORDER_FILLED`, `POSITION_CLOSED`).
    3.  Refactor any remaining essential listeners to use the `engine.subscribe()` method instead.
    4.  If the event bus is no longer used by any part of the backtester, it can be safely removed or refactored out.
- **Outcome:** A single, clear data flow model (engine state subscription) replaces the hybrid event/direct call model. 