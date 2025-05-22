# Trend Analysis Module

This module analyzes historical Open-High-Low-Close (OHLC) price data to identify and confirm trend starts, specifically Confirmed Uptrend Starts (CUS) and Confirmed Downtrend Starts (CDS).

## Purpose

The primary goal is to process a sequence of price bars and, based on a set of predefined patterns and rules, determine points in time where a new uptrend or downtrend is confirmed. The analysis includes identifying pending signals and then evaluating them for confirmation.

## Structure

The module is organized into several sub-directories and key files:

```
trend_analysis/
├── models/                # Data structures
│   ├── bar.py             # Defines the Bar class for OHLC data
│   └── state.py           # Defines the State class for tracking analysis state
├── patterns/              # Basic bar pattern recognition functions
│   └── bar_patterns.py    # e.g., is_higher_ohlc_bar, is_lower_ohlc_bar
├── rules/                 # Specific rules for trend confirmation
│   ├── cds_rules.py       # Rules for Confirmed Downtrend Starts (CDS)
│   └── cus_rules.py       # Rules for Confirmed Uptrend Starts (CUS)
├── utils/                 # Utility functions
│   ├── bar_loader.py      # Loads bar data from CSV
│   ├── event_exporter.py  # Exports confirmed trend starts to CSV
│   ├── forced_trend_helper.py # Helper for forced trend alternation logic
│   └── log_utils.py       # Utilities for formatting log messages
├── analyzer.py            # Contains the core TrendAnalyzer class
├── main.py                # Entry point for running the analysis
└── README.md              # This file
```

## Key Components

*   **`models/bar.py`**:
    *   `Bar` class: Represents a single OHLC price bar with its timestamp, open, high, low, close prices, and chronological index.
*   **`models/state.py`**:
    *   `State` class: Holds the current state of the trend analysis algorithm as it processes bars. This includes information about pending uptrend/downtrend signals (PUS/PDS), candidates for confirmation, containment zones, and the last confirmed trend type.
*   **`patterns/bar_patterns.py`**:
    *   Contains functions that define basic relationships between two bars (e.g., `is_lower_ohlc_bar`, `is_higher_ohlc_bar`) and simple signal rules (e.g., `is_pending_downtrend_start_rule`).
*   **`rules/cus_rules.py` & `rules/cds_rules.py`**:
    *   These files contain more complex rule functions that define the specific conditions under which a Pending Uptrend Start (PUS) becomes a Confirmed Uptrend Start (CUS), or a Pending Downtrend Start (PDS) becomes a Confirmed Downtrend Start (CDS).
    *   They include collections of rule definitions (`CUS_RULE_DEFINITIONS`, `CDS_RULE_DEFINITIONS`) and functions to evaluate these rules.
*   **`utils/`**:
    *   `bar_loader.py`: `load_bars_from_alt_csv` function to read OHLC data from a CSV file.
    *   `event_exporter.py`: `export_trend_start_events` function to parse the analysis log and write confirmed trend starts to a CSV.
    *   `log_utils.py`: `get_unique_sorted_events` to help in creating clean log entries.
    *   `forced_trend_helper.py`: `find_intervening_bar_for_forced_trend` for the logic ensuring alternating up and down trends.
*   **`analyzer.py`**:
    *   `TrendAnalyzer` class: This is the core of the system. Its `analyze` method iterates through the loaded bars, utilizing the `State` object, patterns, and rules to identify and log trend signals and confirmations.
*   **`main.py`**:
    *   The main script to execute the trend analysis. It handles loading data, initializing the `TrendAnalyzer`, running the analysis, printing the log, and exporting the results.

## How to Run

1.  **Prerequisites**: Ensure you have Python installed. No external libraries beyond standard Python are strictly required for the core logic, but the data loading and export use the `csv` module.
2.  **Input Data**: The analysis expects a CSV file containing OHLC data. By default, `main.py` looks for `data/CON.F.US.MES.M25_4h_ohlc.csv` (relative to the project root). The CSV should have columns like `timestamp`, `open`, `high`, `low`, `close`.
3.  **Execution**:
    *   Navigate to the root directory of the project (e.g., `/Users/kevtrinh/Code/projectx/`).
    *   Run the `main.py` script as a module using the following command:
        ```bash
        python -m trend_analysis.main
        ```
4.  **Output**:
    *   The script will print a detailed log of events for each bar to the console.
    *   A CSV file named `confirmed_trend_starts.csv` will be created in the `trend_analysis` directory, listing all Confirmed Uptrend Starts (CUS) and Confirmed Downtrend Starts (CDS) with their bar index and date.

## Workflow Overview

1.  **Load Data**: `main.py` uses `load_bars_from_alt_csv` (from `utils.bar_loader`) to read OHLC data into a list of `Bar` objects.
2.  **Initialize Analyzer**: An instance of `TrendAnalyzer` is created. This also initializes a `State` object.
3.  **Process Bars**: The `TrendAnalyzer.analyze()` method iterates through each `Bar`:
    *   For each bar (except the first), it compares the `current_bar` with the `prev_bar`.
    *   It retrieves the current PUS and PDS candidates from the `State`.
    *   **Containment Logic**: Checks if the current bar is within a previously established containment zone or if a new containment zone starts.
    *   **CUS/CDS Evaluation**: It calls `_evaluate_cus_rules` and `_evaluate_cds_rules` which iterate through predefined rule functions (from `rules/cus_rules.py` and `rules/cds_rules.py`) to see if the current bar's action confirms an existing PUS or PDS candidate.
    *   **Apply Confirmations**: If a CUS or CDS is confirmed:
        *   The `State` is updated (e.g., `confirm_uptrend`, `confirm_downtrend`).
        *   Relevant pending signal states are reset.
        *   Logic for generating new PDS/PUS signals immediately after a confirmation is applied.
    *   **New Pending Signals**: Checks for new PUS or PDS signals based on `bar_patterns` and updates the `State`.
    *   **Logging**: Descriptions of all significant events for the current bar are collected, sorted uniquely, and added to the `State`'s log.
4.  **Export Results**: After processing all bars, `main.py` uses `export_trend_start_events` (from `utils.event_exporter`) to parse the log entries and save the confirmed trend starts into `trend_analysis/confirmed_trend_starts.csv`.

## Customization & Extension

*   **Adding New Patterns**: New functions can be added to `patterns/bar_patterns.py` to identify different basic bar relationships.
*   **Adding New Rules**:
    *   To introduce new CUS or CDS confirmation logic, define new rule functions (similar to `check_cus_confirmation_...` or `check_cds_confirmation_...`) in the respective `cus_rules.py` or `cds_rules.py` files.
    *   Create corresponding wrapper functions (like `_cus_rule_...` or `_cds_rule_...`).
    *   Add these new rule wrappers to the `CUS_RULE_DEFINITIONS` or `CDS_RULE_DEFINITIONS` lists. The `TrendAnalyzer` will then automatically pick them up during evaluation.
*   **Modifying State**: If more complex state tracking is needed, the `State` class in `models/state.py` can be extended. 