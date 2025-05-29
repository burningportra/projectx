# Trend Analysis Module

This module is responsible for analyzing financial market data (OHLC bars) to identify and confirm trend starts, specifically Confirmed Uptrend Starts (CUS) and Confirmed Downtrend Starts (CDS).

## Purpose

The core logic processes a sequence of price bars to detect patterns and conditions that signify a potential shift in trend direction. It uses a stateful approach to track pending signals and apply confirmation rules. The output includes a list of identified trend start signals and detailed debug logs.

## Module Structure

The module has been refactored into several Python files for better organization and maintainability:

-   `trend_start_og_fixed.py`:
    -   The main executable script.
    -   Handles loading data, orchestrating the analysis process using `process_trend_logic`, and exporting results (trend signals and debug logs to CSV).
    -   Contains the primary `process_trend_logic` function which implements the core trend detection algorithm.
    -   Defines `_create_signal_dict` for standardizing signal output and `export_trend_start_events_to_csv` for writing signals to a CSV file.
-   `trend_models.py`:
    -   Defines the core data structures:
        -   `Bar`: Represents a single OHLC price bar with associated metadata (timestamp, o, h, l, c, volume, index).
        -   `State`: Manages the evolving state of the trend analysis (pending signals, confirmed trends, containment zones, last confirmed trend type/index, etc.).
-   `trend_utils.py`:
    -   Provides utility functions used across the module:
        -   `log_debug`: Conditional debug logging, creating structured log entries.
        -   `get_and_clear_debug_logs`: Retrieves and clears collected debug messages.
        -   `load_bars_from_alt_csv`: Loads and parses bar data from CSV files into `Bar` objects.
        -   `get_unique_sorted_events`: Helper for formatting log messages (currently used for bar summaries).
        -   `find_intervening_bar_for_forced_trend`: Locates specific bars (lowest low or highest high in a range) for the forced trend alternation logic.
-   `trend_patterns.py`:
    -   Contains helper functions to identify various bar patterns (e.g., `is_lower_ohlc_bar`, `is_higher_ohlc_bar`, `is_hhll_down_close_pattern`, `is_pending_downtrend_start_rule`). These patterns are fundamental building blocks for identifying PUS/PDS and confirming CUS/CDS.
-   `cus_rules.py`:
    -   Encapsulates all logic related to Confirmed Uptrend Starts (CUS).
    -   Defines specific CUS confirmation rule functions (e.g., `_cus_rule_exhaustion_reversal`, `_cus_rule_low_undercut_high_respect`).
    -   Contains `_evaluate_cus_rules` to check all CUS rules against a PUS candidate and `_apply_cus_confirmation` to handle the consequences of a CUS (updating state, potentially setting up a PDS).
-   `cds_rules.py`:
    -   Encapsulates all logic related to Confirmed Downtrend Starts (CDS).
    -   Defines specific CDS confirmation rule functions (e.g., `_cds_rule_pattern_A`, `_cds_rule_failed_rally`).
    -   Contains `_evaluate_cds_rules` to check all CDS rules against a PDS candidate and `_apply_cds_confirmation` to handle the consequences of a CDS (updating state, potentially invalidating a PUS).
-   `signal_logic.py`:
    -   Manages the generation of new Pending Uptrend Starts (PUS) and Pending Downtrend Starts (PDS).
    -   Includes `_handle_containment_logic` to identify and track periods where price action is contained within a prior significant bar's range, potentially suppressing signal confirmations.
    -   Contains `_check_and_set_new_pending_signals` for evaluating bar patterns and setting new PUS/PDS candidates in the `State` object.

## How to Run

1.  **Navigate to the Parent Directory**:
    Open your terminal and ensure your current working directory is the parent of `trend_analysis` (e.g., `projectx`).

2.  **Execute as a Module**:
    Run the main script using the following command structure:
    ```bash
    python3 -m trend_analysis.trend_start_og_fixed [OPTIONS]
    ```

3.  **Command-Line Options**:
    The script accepts several command-line arguments to customize its behavior:
    -   `--input-csv <FILE_PATH>`: Specifies the path to the input CSV file containing OHLCV data.
        -   Default: `data/CON.F.US.MES.M25_1d_ohlc.csv` (relative to `projectx` if not an absolute path).
        -   The CSV file must contain columns: `timestamp`, `open`, `high`, `low`, `close`, and `volume`.
        -   Bars are assumed to be in chronological order.
    -   `--output-csv <FILE_PATH>`: Specifies the path for the output CSV file where confirmed trend start signals will be saved.
        -   Default: `trend_analysis/confirmed_trend_starts_output.csv`.
    -   `--debug-log-csv <FILE_PATH>`: Specifies the path for the output CSV file where detailed debug logs will be saved (if debug mode is active).
        -   Default: `trend_analysis/debug_log_output.csv`.
    -   `--debug-start <BAR_INDEX>`: Activates detailed debug logging starting from the specified 1-based bar index. Must be used with `--debug-end`.
    -   `--debug-end <BAR_INDEX>`: Activates detailed debug logging up to the specified 1-based bar index. Must be used with `--debug-start`.

    Example:
    ```bash
    python3 -m trend_analysis.trend_start_og_fixed --input-csv data/my_data.csv --output-csv trend_analysis/my_signals.csv --debug-start 100 --debug-end 200 --debug-log-csv trend_analysis/my_debug_logs.csv
    ```

4.  **Output**:
    -   **Console Log**: General progress messages will be printed to the console. If debug mode is active for a bar range, detailed logs for those bars will also appear if not redirected.
    -   **Signals CSV Export**: The file specified by `--output-csv` will contain the list of confirmed CUS and CDS events with their bar index, date, triggering rule, and trigger bar index.
    -   **Debug Log CSV Export**: If debug mode is active and `--debug-log-csv` is specified, a CSV file will be generated containing detailed, structured log entries for each processed bar within the debug range. This includes state information at each step.

## Key Concepts

-   **PUS (Pending Uptrend Start)**: An initial signal based on bar patterns indicating a potential uptrend might be forming. The system tracks the "best" PUS candidate (lowest low).
-   **PDS (Pending Downtrend Start)**: An initial signal based on bar patterns indicating a potential downtrend might be forming. The system tracks the "best" PDS candidate (highest high).
-   **CUS (Confirmed Uptrend Start)**: A PUS that has met specific confirmation criteria (defined in `cus_rules.py`), officially marking an uptrend start.
-   **CDS (Confirmed Downtrend Start)**: A PDS that has met specific confirmation criteria (defined in `cds_rules.py`), officially marking a downtrend start.
-   **Containment Logic**: Identifies periods where price action is confined within the high and low of a previous significant PUS or PDS candidate bar. Confirmations might be suppressed or handled differently during containment to avoid premature signals in choppy markets.
-   **Forced Alternation**: The logic attempts to enforce that confirmed uptrends and downtrends alternate strictly. If a CUS is confirmed while the last trend was also an uptrend (or CDS after CDS), a "forced" opposing trend start might be inserted based on the most extreme intervening price action (highest high for forced CDS, lowest low for forced CUS).
-   **Signal Dictionary**: A standardized dictionary format (created by `_create_signal_dict`) used to represent trend start signals, including timestamp, price details, and rule information.

## Dependencies

-   `pandas`: Used internally by `trend_utils.load_bars_from_alt_csv` for reading CSV data. Ensure it is installed in your Python environment.
    ```bash
    pip install pandas
    ``` 