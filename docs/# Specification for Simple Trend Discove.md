# Specification for Simple Trend Discoverer Script

The primary goal of this script is to discover a new, simpler set of rules based *only* on OHLC data (Open, High, Low, Close prices and their relationships over a few bars) that can accurately reproduce the "uptrendStart" and "downtrendStart" signals found in `data/CON.F.US.MES.M25_1h_trends.json`.

The script should:

1.  **Discover Simpler OHLC Conditions**:
    *   Identify rules based *solely* on OHLC data.
    *   The complex state machine and scoring from `docs/core_trend_detection_algorithm.md` are explicitly *not* to be used as the basis for the new logic. The approach is to start from a "blank slate" for rule definition.

2.  **Process OHLC Data**:
    *   Read `data/CON.F.US.MES.M25_1h_ohlc.csv` chronologically.
    *   The script will act as a simulator to apply candidate rules.

3.  **Iterative Rule Refinement Process**:
    *   The script will apply a candidate set of simple OHLC rules (defined and evolved iteratively through user instruction).
    *   It will compare trends identified by its current rules against the ground truth in `data/CON.F.US.MES.M25_1h_trends.json`.
    *   Discrepancies (false positives, false negatives) will guide the modification of these rules in subsequent iterations.
    *   The process continues until the rules achieve 100% accuracy in matching the provided JSON trend data.

4.  **Output Human-Readable Rules**:
    *   The ultimate output of the overall *process* (not necessarily a direct script output in each run, but the goal of the iterations) is a clear, human-readable description of the OHLC conditions that define uptrend and downtrend starts.
    *   During development, the script will primarily output comparison metrics (matches, false positives, false negatives).

5.  **Adhere to Specific Trend Constraints**:
    *   Trend start identification is based *only* on OHLC price conditions.
    *   Trend starts are identified by looking at past data (minimum 1 bar lookback; simpler rules usually imply shorter lookbacks).
    *   Trends *must* alternate (e.g., an uptrend must be followed by a downtrend, and vice-versa). The script must manage the state of the last identified trend type.
    *   A single OHLC bar can potentially signify both an uptrend start and a downtrend start (immediate reversal).
        *   If a bar is identified as both an uptrend and downtrend start, the *next* effective trend direction (for alternation purposes) is determined by whether the *following* candle's close is above or below the price of the trend start bar where the dual start occurred.

6.  **Validation Standard**:
    *   "100% validates" means the script's identified trends (based on timestamp and type - `uptrendStart` or `downtrendStart`) perfectly match all entries in `data/CON.F.US.MES.M25_1h_trends.json`, with no extra identified trends (false positives) and no missed trends (false negatives).

**Development Workflow:**

The script will be developed iteratively:
1.  Initial script structure for data loading, a placeholder rule engine, simulation loop, and comparison logic.
2.  User provides a candidate set of simple OHLC rules.
3.  These rules are implemented in the script's rule engine.
4.  The script is run, and its output is compared to the ground truth.
5.  Based on the comparison (discrepancies), the user provides refined/new rules.
6.  Steps 3-5 are repeated until 100% validation is achieved.
