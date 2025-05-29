# Productionizing trend_start_og_fixed.py Logic

## 1. Goal

Integrate the trend detection logic from `trend_analysis/trend_start_og_fixed.py` into the production environment, replacing the current logic in `src/strategies/trend_start_finder.py`. This new logic will be consumed by `src/analysis/analyzer_service.py`.

## 2. Current System Overview (Key Components)

*   **`src/analysis/analyzer_service.py`**: Orchestrates the analysis of OHLC data. It fetches data, invokes strategy logic, stores signals, and manages watermarks. It's designed to be event-driven (via PostgreSQL LISTEN/NOTIFY) for real-time updates and can also perform backlog processing.
*   **`src/strategies/trend_start_finder.py`**: Currently holds the trend detection strategy logic. This is the file to be effectively replaced or refactored.
*   **`trend_analysis/trend_start_og_fixed.py`**: Contains the new, refined trend detection logic that needs to be productionized.
*   **Configuration (`config/settings.yaml`)**: Defines analysis targets (contracts, timeframes), database connections, and other operational parameters.
*   **Database (TimescaleDB/PostgreSQL)**: Stores OHLC bars (`ohlc_bars`), detected signals (`detected_signals`), and watermarks (`analyzer_watermarks`).
*   **Logging**: Centralized logging is configured, and the `analyzer_service.py` already handles writing specific debug logs from strategy functions to CSV files.

## 3. Implementation Task List

### Phase 1: Adapting `trend_start_og_fixed.py` for Production Integration

**Objective**: Modify `trend_start_og_fixed.py` to be callable as a standard strategy module by `analyzer_service.py`, aligning its input/output signatures and internal workings with the production environment.

*   **Task 1.0: Refactor Internal Structure of `trend_start_og_fixed_strategy.py` (New)**
    *   Sub-task 1.0.1: **State Management Consolidation**: Review the `State` class. Ensure all state variables used throughout the trend detection logic are encapsulated within this class. All state modifications (initialization, resets, updates) should be methods of this class.
    *   Sub-task 1.0.2: **Isolate Bar Pattern Functions**: Identify all functions that check for specific single-bar or multi-bar patterns (e.g., `is_lower_ohlc_bar`, `is_hhll_down_close_pattern`, `is_pending_downtrend_start_rule`, specific CUS/CDS confirmation check functions like `check_cus_confirmation_low_undercut_high_respect`). Ensure they are standalone, clearly named, and primarily operate on bar objects passed as arguments.
    *   Sub-task 1.0.3: **Modularize Rule Evaluation**: Review `CUS_RULE_DEFINITIONS`, `CDS_RULE_DEFINITIONS`, and their corresponding wrapper functions (e.g., `_cus_rule_exhaustion_reversal`, `_cds_rule_pattern_A`). Ensure this structure clearly separates rule definition from the main processing loop.
    *   Sub-task 1.0.4: **Clarify Main Logic Flow in `process_trend_logic`**: Refine `process_trend_logic` to clearly show the sequence of operations for each bar: fetching bar data, updating/checking state, evaluating PUS/PDS conditions, evaluating CUS/CDS confirmation rules, and applying consequences.
    *   Sub-task 1.0.5: **Import Management**: Ensure all necessary imports (like `pandas`, `datetime`, `typing`) are at the top of the file and well-organized.
*   **Task 1.1: Rename and Relocate the File**
    *   Sub-task 1.1.1: Copy `trend_analysis/trend_start_og_fixed.py` to `src/strategies/trend_start_og_fixed_strategy.py`.
*   **Task 1.2: Standardize the Main Function Signature**
    *   Sub-task 1.2.1: Define `generate_trend_starts_og_fixed` function in `src/strategies/trend_start_og_fixed_strategy.py` with `bars_df`, `contract_id`, `timeframe_str`, and `config` as input parameters.
    *   Sub-task 1.2.2: Ensure the function returns a tuple: `(List[Dict[str, Any]], List[Dict[str, Any]])` for signals and debug logs respectively.
    *   Sub-task 1.2.3: Adapt `Bar` class initialization if it expects string inputs for OHLC, to handle floats from DataFrame.
*   **Task 1.3: Adapt Data Loading**
    *   Sub-task 1.3.1: Remove direct CSV file loading logic (e.g., `load_bars_from_alt_csv`) from the main execution path of `generate_trend_starts_og_fixed`.
    *   Sub-task 1.3.2: Implement logic to convert rows from the input `bars_df` DataFrame into `Bar` objects.
        *   Map `bars_df.timestamp` to `Bar.date`.
        *   Map `bars_df.open, .high, .low, .close` to `Bar.o, .h, .l, .c`.
        *   Map `bars_df.volume` to `Bar.volume` (update `Bar` class if needed).
        *   Derive `Bar.index` (chronological index) from DataFrame.
        *   Determine handling for `Bar.original_file_line`.
*   **Task 1.4: Output Formatting**
    *   Sub-task 1.4.1: **Signals**:
        *   Modify `process_trend_logic` (or its caller) to accumulate signal dictionaries instead of writing to CSV via `export_trend_start_events`.
        *   Implement or adapt a `_create_signal_dict` helper function to format signals as expected by `analyzer_service.py` (keys: `timestamp`, `signal_type`, `signal_price`, `open`, `high`, `low`, `close`, `volume`, `details`).
        *   Ensure `details` in the signal dictionary include `confirmed_signal_bar_index`, `triggering_bar_index`, `rule_type`, etc.
    *   Sub-task 1.4.2: **Debug Logs**:
        *   Adapt the `log_debug` function to append structured dictionaries to a `debug_log_entries` list instead of printing to console.
        *   Ensure keys in debug log dictionaries align with `DEBUG_LOG_FIELDNAMES` in `analyzer_service.py`. Include `event_timestamp`, `event_type`, `message`, bar details, and relevant state variables.
*   **Task 1.5: Configuration and Constants Review**
    *   Sub-task 1.5.1: Review global constants in the new strategy file (e.g., `CUS_EXHAUSTION_MAX_BARS_FROM_CANDIDATE`).
    *   Sub-task 1.5.2: Decide whether to keep constants hardcoded or make them configurable via the `config` parameter (from `settings.yaml`).
*   **Task 1.6: Remove Command-Line Specific Code**
    *   Sub-task 1.6.1: Remove or guard the `if __name__ == "__main__":` block and `argparse` logic.

### Phase 2: Integrating the Adapted Strategy into `analyzer_service.py`

**Objective**: Modify `analyzer_service.py` to use the new strategy logic from `trend_start_og_fixed_strategy.py`.

*   **Task 2.1: Update Strategy Mapping**
    *   Sub-task 2.1.1: Import `generate_trend_starts_og_fixed` from `src/strategies/trend_start_og_fixed_strategy.py` in `analyzer_service.py`.
    *   Sub-task 2.1.2: Update the `STRATEGY_MAPPING` dictionary to point the relevant strategy key (e.g., `"cus_cds_trend_finder"`) to `generate_trend_starts_og_fixed`.
    *   Sub-task 2.1.3: Verify `config/settings.yaml` uses the correct strategy key for analysis targets.
*   **Task 2.2: Align Debug Log Field Names**
    *   Sub-task 2.2.1: Review `DEBUG_LOG_FIELDNAMES` in `analyzer_service.py`.
    *   Sub-task 2.2.2: Compare with fields produced by the new strategy's debug logs.
    *   Sub-task 2.2.3: Update `DEBUG_LOG_FIELDNAMES` in `analyzer_service.py` to include all new/relevant fields and remove unused ones.
*   **Task 2.3: Test the Integration**
    *   Sub-task 2.3.1: **Backlog Processing Test**:
        *   Configure `ANALYZER_RESET_TARGET_DATA_ON_START: true` in `settings.yaml`.
        *   Clear `detected_signals` and `analyzer_watermarks` for a test contract/timeframe.
        *   Run `analyzer_service.py`.
        *   Verify correct signal generation in `detected_signals` table.
        *   Verify correct population of the debug CSV log.
    *   Sub-task 2.3.2: **Real-time Processing Test (LISTEN/NOTIFY)**:
        *   Ensure `live_ingester.py` is running and populating `ohlc_bars`.
        *   Observe `analyzer_service.py` processing new bars.
        *   Verify signals and debug logs for these incremental updates.

### Phase 3: Production Readiness Checks & Refinements

**Objective**: Ensure the integrated system is robust, performant, and maintainable.

*   **Task 3.1: Performance Profiling**
    *   Sub-task 3.1.1: If latency is a concern, profile `generate_trend_starts_og_fixed` using `cProfile` or `line_profiler`.
    *   Sub-task 3.1.2: Identify and optimize performance bottlenecks if any.
*   **Task 3.2: Error Handling and Logging Review**
    *   Sub-task 3.2.1: Ensure `trend_start_og_fixed_strategy.py` handles potential data inconsistencies gracefully.
    *   Sub-task 3.2.2: Verify logging from the new strategy is clear, sufficient, and uses the provided logger instance.
*   **Task 3.3: Configuration Management Review**
    *   Sub-task 3.3.1: Re-evaluate hardcoded constants in the strategy.
    *   Sub-task 3.3.2: Decide if any more constants should be moved to `config/settings.yaml`.
*   **Task 3.4: Resource Usage Monitoring Plan**
    *   Sub-task 3.4.1: Plan to monitor memory and CPU usage of `analyzer_service.py` post-deployment.
*   **Task 3.5: Code Cleanup and Documentation**
    *   Sub-task 3.5.1: Remove dead or commented-out code from `src/strategies/trend_start_og_fixed_strategy.py`.
    *   Sub-task 3.5.2: Add/update docstrings for the main strategy function and complex helpers.
    *   Sub-task 3.5.3: Update relevant project documentation (READMEs, design docs) to reflect the new strategy module.
*   **Task 3.6: Comparative Analysis (Final Logic Parity Check)**
    *   Sub-task 3.6.1: Perform a final comparison of signals from the integrated system against reference outputs (e.g., from standalone `trend_start_og_fixed.py` runs or golden CSVs).
    *   Sub-task 3.6.2: Use appropriate comparison tools (e.g., `trend_start_comparer.py`).
    *   Sub-task 3.6.3: Document any deliberate deviations or confirm 100% parity.

## 4. Rollout Strategy (Simplified Planning)

*   Task 4.1: Plan for thorough testing in the development environment.
*   Task 4.2: (If applicable) Plan for deployment and monitoring in a staging environment.
*   Task 4.3: Plan for production deployment and initial close monitoring.

## 5. Contingency / Rollback Plan

*   Task 5.1: Ensure the old strategy file (`src/strategies/trend_start_finder.py`) is backed up or version-controlled for easy rollback.
*   Task 5.2: Document the quick rollback procedure (e.g., reverting `STRATEGY_MAPPING` in `analyzer_service.py`).
*   Task 5.3: Understand implications for `analyzer_watermarks` if a rollback and reprocessing are needed.

This task list provides a structured approach to integrating the new trend logic. Each step should be validated before proceeding to the next. 