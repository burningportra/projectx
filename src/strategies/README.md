# Trend Start Finder Strategy

This script serves as an entry point to the trend analysis logic, adapting a DataFrame of OHLCV (Open, High, Low, Close, Volume) data into the format expected by the core `trend_analysis` module and invoking its main processing function.

## Purpose

The primary function `generate_trend_starts` orchestrates the trend detection process. It takes historical bar data, converts it into a list of `Bar` objects, and then passes this list along with contract and timeframe identifiers to the `process_trend_logic` function located in the `trend_analysis.trend_start_og_fixed` module. The results, which include a list of identified trend start signals (CUS/CDS) and any collected debug logs, are then returned.

## Key Functionality

-   **Data Transformation**: Converts rows from a pandas DataFrame into `Bar` objects as defined in `trend_analysis.trend_models`. This includes:
    -   Ensuring timestamps are timezone-aware (UTC).
    -   Converting OHLCV data to floats.
    -   Assigning a 1-based chronological index to each bar.
-   **Delegation to Core Logic**: Calls `trend_start_og_fixed.process_trend_logic` to perform the actual trend analysis.
-   **Debug Control**:
    -   The `debug` parameter in `generate_trend_starts` can enable the `trend_utils.DEBUG_MODE_ACTIVE` flag for the duration of its execution. If enabled, it sets the debug range to cover all provided bars.
    -   It's important to note that the `trend_analysis.trend_start_og_fixed` script (when run as `__main__`) also has its own command-line arguments (`--debug-start`, `--debug-end`) to control debug logging. When `generate_trend_starts` is called (e.g., from `analyzer_service.py`), the `debug` parameter here provides a way to activate detailed logging for that specific call, temporarily overriding global settings if necessary.
-   **Error Handling**: Includes basic error handling for missing DataFrame attributes or value conversion errors during bar object creation.
-   **Minimum Bar Requirement**: Enforces a minimum number of bars (`MIN_BARS_FOR_TREND_START`) before attempting analysis.

## Usage

The `generate_trend_starts` function is intended to be called by other services or scripts that have access to OHLCV data in a pandas DataFrame.

```python
import pandas as pd
from src.strategies.trend_start_finder import generate_trend_starts

# Sample DataFrame (replace with actual data loading)
data = {
    'timestamp': pd.to_datetime(['2023-01-01 10:00:00', ...], utc=True),
    'open': [100, ...],
    'high': [105, ...],
    'low': [99, ...],
    'close': [101, ...],
    'volume': [1000, ...]
}
bars_data_df = pd.DataFrame(data)

contract = "MY.CONTRACT.ID"
timeframe = "1h"

# Generate signals (debug mode can be True or False)
# The debug flag here will control trend_utils.DEBUG_MODE_ACTIVE for this specific call
list_of_signals, list_of_debug_logs = generate_trend_starts(
    bars_df=bars_data_df,
    contract_id=contract,
    timeframe_str=timeframe,
    debug=True 
)

# Process signals and logs
# ...
```

## Dependencies

-   `pandas`: For DataFrame manipulation.
-   `trend_analysis` module (and its sub-modules: `trend_models`, `trend_utils`, `trend_start_og_fixed`): This script relies heavily on the refactored trend analysis logic contained within this separate module.

## `__main__` Block

The `if __name__ == '__main__':` block provides a simple example of how to use `generate_trend_starts` with sample data, printing out any generated signals and debug logs. This is primarily for testing or demonstration purposes. 