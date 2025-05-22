# Refactoring `trend_start_finder.py` to Match `trend_analyzer_alt.py`

## Goal

The primary objective is to refactor `src/strategies/trend_start_finder.py` so that its algorithm for identifying trend starts (CUS/CDS signals) behaves identically to the reference script `trend_analysis/trend_analyzer_alt.py` when processing OHLC bar data.

## Current State

As of 2025-05-21 (afternoon update):

1.  **`src/strategies/trend_start_finder.py` Refactoring:**
    *   Linter errors resolved.
    *   Core PDS/PUS formation, `State` class, helper functions, CUS/CDS structure, and initial bar handling aligned with `trend_analyzer_alt.py`'s principles.
    *   Signal overwrite logic implemented to handle multiple potential signals on the same bar.
    *   Debug logging via `run_specific_trend_finder.py` produces detailed bar-by-bar state.

2.  **Key Discrepancy Identified (REF36 CUS Rule):**
    *   `trend_start_finder.py` (TSF) processes data chronologically. When processing its "Bar 29" (current) and using its "Bar 28" (previous), its `check_custom_cus_confirmation_ref36` rule correctly evaluates `current_bar.c > prev_bar.c` as TRUE for the active PUS@24. This results in TSF generating a **CUS@24** signal. This behavior is internally consistent with the data TSF receives.
    *   `trend_analyzer_alt.py` (TAA - based on latest detailed logs provided 2025-05-21): When TAA processes what it calls its "Bar 29" and "Bar 28" to evaluate REF36 for PUS@24, the `current_bar.c > prev_bar.c` condition evaluates to FALSE. Thus, TAA (latest logs) does **not** confirm PUS@24 at this point.
    *   `confirmed_trend_starts_4h.csv` (Reference Signals CSV): This file lists a **CUS@28**.

3.  **Root of Discrepancy:**
    The fundamental issue is how the "current bar" and "previous bar" used in the critical `current_bar.c > prev_bar.c` part of the REF36 rule map to actual OHLC data points.
    *   TSF uses its chronologically `k`-th bar as current and `k-1`-th bar as previous. For confirming PUS@24, this leads to `Bar29.C (5702.0) > Bar28.C (5670.75)`, which is TRUE.
    *   TAA's logs (for its "Bar 29" processing) show it effectively uses values that correspond to TSF's Bar 28 as "current" (`C=5670.75`) and TSF's Bar 27 as "previous" (`C=5693.25`). For these values, `5670.75 > 5693.25` is FALSE.
    This indicates a difference in how the scripts define or access bar data relative to their processing loops when this specific rule is checked.

4.  **Supporting Scripts:**
    *   `run_specific_trend_finder.py`: Created to run `trend_start_finder.py` for specific timeframes (e.g., 4h) and output compatible signals and debug logs. Data loading fixed to ensure correct chronological bar data is passed to `trend_start_finder.py`.
    *   `trend_start_comparer.py`: Enhanced with CLI arguments to specify input files and skip initial signals for easier focused comparison.

## Next Steps & Decision Points

The immediate mismatch (TSF: CUS@24 vs. Reference CSV: CUS@28) stems from the REF36 rule's behavior due to data interpretation.

1.  **Define the Authoritative Source for REF36 Behavior:**
    *   **Option A: `confirmed_trend_starts_4h.csv` is ground truth.** If CUS@28 is correct, then neither TSF (CUS@24) nor TAA (latest logs, no CUS@28/24 here) currently match. TSF would need to *not* fire CUS@24, and then find a way to fire CUS@28. This would require understanding how CUS@28 was originally generated (likely a different PUS or CUS rule variant in the script version that made the CSV).
    *   **Option B: `trend_analyzer_alt.py` (latest logs) is ground truth for logic.** If TAA's latest logged behavior (no CUS for PUS@24 via REF36 at its "Bar 29") is correct, then TSF needs to be modified. This would likely involve changing how TSF defines/accesses `current_bar` and `prev_bar` specifically for the REF36 check to align with TAA's effective data usage.
    *   **Option C: `trend_start_finder.py`'s current logic is deemed most correct/robust.** If TSF's current data handling and REF36 evaluation (leading to CUS@24) is preferred, then the "reference" (`trend_analyzer_alt.py` logs and/or `confirmed_trend_starts_4h.csv`) needs to be considered outdated or flawed for this specific signal.

2.  **Investigate CUS@28 in `confirmed_trend_starts_4h.csv`:**
    *   If CUS@28 is desired, examine the `trend_analyzer_alt.py` version that *generated* that CSV. What PUS was active, and what rule confirmed it at Bar 28? The latest logs for TAA do not show this.

3.  **Align Data View for REF36 (If Option B is chosen):**
    *   If TSF must match TAA's latest logs (where REF36 for PUS@24 is false), then the data passed to `check_custom_cus_confirmation_ref36` in TSF needs to effectively be "shifted" to match TAA's view of "current" and "previous" bars for that check.

4.  **Proceed with Comparison (Iterative):**
    *   Once a decision on the REF36 discrepancy is made and implemented, re-run comparisons to find the next point of divergence.

## Files

*   **Target Script:** `src/strategies/trend_start_finder.py`
*   **Reference Logic Script:** `trend_analysis/trend_analyzer_alt.py` (latest available logs are key)
*   **Reference Signals:** `trend_analysis/confirmed_trend_starts_4h.csv`
*   **Runner Script:** `run_specific_trend_finder.py`
*   **Comparison Script:** `trend_start_comparer.py`
*   **Generated Signals (TSF):** `logs/detected_signals_history_4h.csv`
*   **Generated Debug Log (TSF):** `logs/trend_finder_debug_4h.csv`

This detailed breakdown should clarify the current complex situation. 