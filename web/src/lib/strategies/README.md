# Strategy Execution and Signal Display System

This document outlines how trading strategies are executed, how orders and trades are managed, and how signals are displayed within the backtesting environment.

## Core Components

1.  **`OrderManager.ts`**:
    *   The central authority for order state, position tracking, and Profit & Loss (P&L) calculation.
    *   Manages `ManagedPosition` objects, which represent actual open positions.
    *   Processes bars to simulate order fills (market, limit, stop-loss, take-profit).
    *   Provides methods to submit orders, cancel orders, and query order/position states.
    *   Generates `CompletedTrade` records with final P&L.

2.  **`BaseStrategy.ts`**:
    *   An abstract base class providing common infrastructure for all strategies.
    *   Maintains a "conceptual trade" (`this.openTrade: SimulatedTrade | null`) representing the strategy's current intended trade. This is distinct from `OrderManager`'s `ManagedPosition` but should be synchronized.
    *   Interfaces with an injected `OrderManager` instance.
    *   Provides helper methods for creating orders (e.g., `createMarketOrder`, `createLimitOrder`, `createStopOrder`, `createTakeProfitOrder`). These helpers now correctly use `parentTradeId` to link orders to the conceptual trade.
    *   Handles the lifecycle of the conceptual trade via `createTrade()` and `closeTrade()`.
    *   The `onOrderFilled(filledOrder, conceptualTrade)` hook is critical:
        *   When an entry order fill matches the current conceptual trade, it calls `placeProtectiveOrders()`.
        *   When an exit order fill (SL, TP, or strategy-initiated exit) linked to the conceptual trade occurs, it calls `closeTrade()` to update `this.openTrade` to `null`.
    *   Records general strategy signals (BUY/SELL actions) via `recordSignal()`, available through `getSignals()`.

3.  **Specific Strategy Implementations (e.g., `EmaStrategy.ts`, `TrendStartStrategy.ts`)**:
    *   Extend `BaseStrategy`.
    *   Implement the core trading logic in their `processBar()` method.
    *   Interact with `OrderManager` (often via `BaseStrategy` helpers) to submit orders.
    *   Call `super.onOrderFilled()` to ensure `BaseStrategy` handles fill processing.
    *   May have their own methods for generating specific types of signals (e.g., `TrendStartStrategy.getTrendSignals()` for raw CUS/CDS signals).

4.  **`BacktesterPage.tsx`**:
    *   The UI component that orchestrates the backtest.
    *   Instantiates strategy objects and the `OrderManager`.
    *   Calls the strategy's `processBar()` method for each bar of data.
    *   Collects signals from the strategy to display markers on the `TradeChart`.

## Order Lifecycle and Trade Management

The key to correct behavior is the synchronization between the strategy's conceptual trade (`BaseStrategy.openTrade`) and the `OrderManager`'s actual positions.

1.  **Entry**:
    *   A specific strategy (e.g., `EmaStrategy.executeEntry` or `TrendStartStrategy._openConceptualPosition`) decides to enter a trade.
    *   It first calls `this.createTrade()` (from `BaseStrategy`) to create a `SimulatedTrade` object. This object gets a unique ID (e.g., `trade-emaname-1`).
    *   The strategy then calls one of `BaseStrategy`'s order creation helpers (e.g., `this.createMarketOrder(...)`). Crucially, it passes the `SimulatedTrade.id` as the `tradeId` argument to this helper.
    *   The `BaseStrategy` helper sets the `parentTradeId` property of the `Order` object to this `SimulatedTrade.id` before submitting it to `OrderManager.submitOrder()`.
    *   The `SimulatedTrade` object in `BaseStrategy` (i.e., `this.openTrade`) is updated to include a reference to this entry `Order`.

2.  **Order Fill (Entry)**:
    *   `OrderManager.processBar()` simulates fills. When the entry order is filled, `OrderManager` creates/updates a `ManagedPosition`. The `id` of this `ManagedPosition` is typically derived from or set to the `parentTradeId` of the order that created it.
    *   The strategy's `processBar()` receives the list of filled orders from `OrderManager.processBar()`.
    *   It iterates these and calls `super.onOrderFilled(filledOrder, this.openTrade)`.
    *   `BaseStrategy.onOrderFilled()` checks if `filledOrder` is the `entryOrder` of `this.openTrade` and if `filledOrder.isEntry` is true.
    *   If so, it calls `this.placeProtectiveOrders(this.openTrade, filledOrder)`.
    *   `placeProtectiveOrders()` creates SL/TP orders, again passing `this.openTrade.id` as the `tradeId` argument, which becomes `parentTradeId` on these protective orders.

3.  **Order Fill (Exit - SL/TP or Strategy-Initiated)**:
    *   `OrderManager.processBar()` fills an SL, TP, or an explicit exit order.
    *   The strategy's `processBar()` calls `super.onOrderFilled(filledOrder, this.openTrade)`.
    *   `BaseStrategy.onOrderFilled()` checks if `filledOrder` is an exit for `this.openTrade` (by checking `filledOrder.isExit`, `isStopLoss`, `isTakeProfit` flags and if `filledOrder.parentTradeId === this.openTrade.id`).
    *   If it's a valid exit fill, it calls `this.closeTrade(this.openTrade, ...)`.
    *   `this.closeTrade()` updates the `SimulatedTrade`'s status to 'CLOSED', records exit details, attempts to fetch P&L from `OrderManager.getCompletedTrades()` (matching by ID), and sets `this.openTrade = null`.

4.  **Reversals (`EmaStrategy` example)**:
    *   `EmaStrategy.executeReversal()` is called when a crossover occurs opposite to an existing `ManagedPosition`.
    *   It first cancels existing SL/TP orders for the current position using `orderManager.cancelOrdersByTradeId(existingManagedPosition.id)`. This works because the SL/TP orders' `parentTradeId` matches the `ManagedPosition.id` (which, due to the entry flow, also matches the conceptual `SimulatedTrade.id`).
    *   It submits a market order to close the current position. This closing order's `parentTradeId` is set to `existingManagedPosition.id`.
    *   It sets a pending reversal flag.
    *   In a subsequent `processBar` call, after the closing order is filled (meaning `OrderManager.getOpenPosition()` is now null and `BaseStrategy.openTrade` is also null due to `onOrderFilled` processing the close), the strategy initiates a new entry for the reversed direction using `executeEntry()`.

## Signal Generation & Display

1.  **General Trade Signals (BUY/SELL arrows for entries/exits)**:
    *   When a strategy decides to enter or exit (by submitting an order that will result in an entry/exit), it can call `this.recordSignal(strategySignal)` (from `BaseStrategy`).
    *   `BaseStrategy` stores these in an array, accessible via `getSignals()`.
    *   `BacktesterPage.processStrategyBars()` retrieves these signals using `currentStrategyInstance.getSignals()`.
    *   It then iterates through these signals and creates markers for the chart if the signal's `barIndex` is within the currently processed range.

2.  **Specific Strategy Signals (e.g., CUS/CDS for `TrendStartStrategy`)**:
    *   `TrendStartStrategy` uses `TrendIdentifier` to get raw CUS/CDS signals.
    *   `TrendIdentifier.getSignalsForRange(allBars, currentBarIndex, ...)` returns all identified CUS/CDS signals from bar 0 up to `currentBarIndex`, each with its original `barIndex` of occurrence.
    *   `TrendStartStrategy._processNewTrendSignals()` accumulates all unique CUS/CDS signals into its internal `this.trackedTrendSignals` list. This list is available via `getTrendSignals()`.
    *   `BacktesterPage.processStrategyBars()`:
        *   After processing the current bar with the strategy (which updates `trackedTrendSignals`), it calls `(currentStrategyInstance as TrendStartStrategy).getTrendSignals()` to get the complete list of all CUS/CDS signals found so far.
        *   It then iterates this list and creates a chart marker for each CUS/CDS signal whose `tsSignal.barIndex` is within the range of bars processed by the page up to `endIndex`.

3.  **Marker Display**:
    *   `BacktesterPage.processStrategyBars()` collects all markers (trade action signals and CUS/CDS signals) into a single array (`allMarkersForChart`).
    *   These markers are deduplicated and sorted by time.
    *   `setLiveTradeMarkers(uniqueMarkers)` updates the state, causing the `TradeChart` to re-render with all relevant markers up to the current point in the backtest.

This system ensures that `OrderManager` remains the source of truth for P&L and positions, while `BaseStrategy` and its derivatives manage the conceptual trade lifecycle and signal generation. The `BacktesterPage` then visualizes these signals and trade actions. The correct use of `parentTradeId` is crucial for linking orders to trades and ensuring SL/TP orders are managed correctly, especially during reversals.
