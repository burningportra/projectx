import pandas as pd
from typing import List, Dict, Any, Callable, Tuple
import itertools

def load_ohlc_data(filepath: str) -> pd.DataFrame:
    """Loads OHLC data from a CSV file and preprocesses it."""
    try:
        df = pd.read_csv(filepath)
        if 'timestamp' not in df.columns:
            raise ValueError("OHLC data must contain a 'timestamp' column.")
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('timestamp').reset_index(drop=True)
        # Ensure essential columns are present
        for col in ['open', 'high', 'low', 'close']:
            if col not in df.columns:
                raise ValueError(f"OHLC data missing essential column: {col}")
        return df
    except FileNotFoundError:
        print(f"Error: OHLC file not found at {filepath}")
        return pd.DataFrame()
    except Exception as e:
        print(f"Error loading OHLC data: {e}")
        return pd.DataFrame()

def load_trend_data(filepath: str) -> pd.DataFrame:
    """Loads trend data from a JSON file and preprocesses it."""
    try:
        df = pd.read_json(filepath)
        if 'timestamp' not in df.columns:
            raise ValueError("Trend data must contain a 'timestamp' column.")
        if 'type' not in df.columns:
            raise ValueError("Trend data must contain a 'type' column (e.g., uptrendStart, downtrendStart).")
        if 'price' not in df.columns: # Though not used in discovery, good to check for completeness
            print("Warning: Trend data missing 'price' column. It's not used for discovery but often present.")

        df['timestamp'] = pd.to_datetime(df['timestamp'])
        # Normalize trend types for easier comparison if needed later
        # df['type'] = df['type'].str.lower() 
        df = df.sort_values('timestamp').reset_index(drop=True)
        return df
    except FileNotFoundError:
        print(f"Error: Trend file not found at {filepath}")
        return pd.DataFrame()
    except Exception as e:
        print(f"Error loading trend data: {e}")
        return pd.DataFrame()

# --- Atomic OHLC Condition Functions --- 
# Each function takes current_bar, prev1_bar (and optionally prev2_bar, etc.)
# and returns True or False.

# Helper to safely get a bar, returning None if out of bounds
def get_bar(ohlc_df: pd.DataFrame, idx: int):
    if 0 <= idx < len(ohlc_df):
        return ohlc_df.iloc[idx]
    return None

# --- Uptrend Atomic Conditions ---
def cond_uptrend_current_is_bullish(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    return current['close'] > current['open']

def cond_uptrend_low_lt_prev_low(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    return prev1 is not None and current['low'] < prev1['low']

def cond_uptrend_prev_is_bearish(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    return prev1 is not None and prev1['close'] < prev1['open']

def cond_uptrend_close_gt_prev_high(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    return prev1 is not None and current['close'] > prev1['high']

def cond_uptrend_bullish_engulfing(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None: return False
    return (
        (current['close'] > current['open']) and 
        (prev1['close'] < prev1['open']) and 
        (current['open'] <= prev1['close']) and 
        (current['close'] >= prev1['open'])
    )

# --- New Uptrend Atomic Conditions (requiring up to prev2) ---
def cond_uptrend_higher_high_higher_low(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None: return False
    return current['high'] > prev1['high'] and current['low'] > prev1['low']

def cond_uptrend_long_lower_wick_bullish(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if not cond_uptrend_current_is_bullish(current, prev1, prev2, prev3): return False # Must be bullish
    body_size = abs(current['close'] - current['open'])
    lower_wick = current['open'] - current['low'] if current['open'] < current['close'] else current['close'] - current['low'] # min(open,close) - low
    # Ensure body_size is not zero to avoid division by zero or extreme ratios
    if body_size < 1e-9 * current['close']: # Effectively zero or very small body
        return lower_wick > 0.0001 # Arbitrary small value if body is tiny, just check for some wick
    return lower_wick > body_size * 1.5 # Lower wick is 1.5x body size

def cond_uptrend_two_bar_reversal_bullish(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None: return False
    prev_is_bearish = prev1['close'] < prev1['open']
    current_is_bullish = current['close'] > current['open']
    return prev_is_bearish and current_is_bullish and current['close'] > prev1['open']

def cond_uptrend_three_white_soldiers_simple(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None or prev2 is None: return False
    c_bull = current['close'] > current['open']
    p1_bull = prev1['close'] > prev1['open']
    p2_bull = prev2['close'] > prev2['open']
    if not (c_bull and p1_bull and p2_bull): return False
    # Each opens within previous body (simplified)
    c_opens_in_p1_body = current['open'] > prev1['open'] and current['open'] < prev1['close']
    p1_opens_in_p2_body = prev1['open'] > prev2['open'] and prev1['open'] < prev2['close']
    # Each closes higher than previous close
    c_closes_higher = current['close'] > prev1['close']
    p1_closes_higher = prev1['close'] > prev2['close']
    return c_opens_in_p1_body and p1_opens_in_p2_body and c_closes_higher and p1_closes_higher

def cond_uptrend_morning_star_simple(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None or prev2 is None: return False
    p2_bearish_body = prev2['open'] > prev2['close'] and (prev2['open'] - prev2['close']) > (prev2['high'] - prev2['low']) * 0.3 # prev2 is reasonably bearish
    p1_small_body = abs(prev1['open'] - prev1['close']) < (prev1['high'] - prev1['low']) * 0.3 # prev1 has small body
    # prev1 gapped down or opened below prev2 close
    p1_gap_or_low_open = prev1['open'] < prev2['close'] 
    c_bullish = current['close'] > current['open']
    # current closes well into prev2's body
    c_closes_in_p2_body = current['close'] > (prev2['open'] + prev2['close']) / 2 
    return p2_bearish_body and p1_small_body and p1_gap_or_low_open and c_bullish and c_closes_in_p2_body

# --- USER LOGIC V1 UPTREND (Granular Components) ---
# cond_uptrend_prev_is_bearish (prev1['close'] < prev1['open']) already exists and covers UserA_UT

def cond_uptrend_user_B(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None or prev2 is None or prev3 is None: return False
    condB_part1 = prev1['low'] < prev2['low']
    condB_part2 = prev1['low'] < prev2['close']
    condB_part3 = prev1['low'] < prev3['low']
    condB_part4 = prev1['low'] < prev3['close']
    return condB_part1 or condB_part2 or condB_part3 or condB_part4

def cond_uptrend_user_C(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None or current is None: return False # current is always available, but good practice
    condC_part1 = prev1['low'] < current['low']
    condC_part2 = prev1['low'] < current['close']
    return condC_part1 or condC_part2

def cond_uptrend_user_D(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None or current is None: return False
    return current['close'] > prev1['close']

# --- Downtrend Atomic Conditions (lookback 1 bar for now) ---
def cond_downtrend_current_is_bearish(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    return current['close'] < current['open']

def cond_downtrend_high_gt_prev_high(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    return prev1 is not None and current['high'] > prev1['high']

def cond_downtrend_prev_is_bullish(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    return prev1 is not None and prev1['close'] > prev1['open']

def cond_downtrend_close_lt_prev_low(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    return prev1 is not None and current['close'] < prev1['low']

def cond_downtrend_bearish_engulfing(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None: return False
    return (
        (current['close'] < current['open']) and 
        (prev1['close'] > prev1['open']) and 
        (current['open'] >= prev1['close']) and 
        (current['close'] <= prev1['open'])
    )

# --- New Downtrend Atomic Conditions (requiring up to prev2) ---
def cond_downtrend_lower_high_lower_low(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None: return False
    return current['high'] < prev1['high'] and current['low'] < prev1['low']

def cond_downtrend_long_upper_wick_bearish(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if not cond_downtrend_current_is_bearish(current, prev1, prev2, prev3): return False # Must be bearish
    body_size = abs(current['close'] - current['open'])
    upper_wick = current['high'] - (current['open'] if current['open'] > current['close'] else current['close']) # high - max(open,close)
    if body_size < 1e-9 * current['close']:
        return upper_wick > 0.0001
    return upper_wick > body_size * 1.5 # Upper wick is 1.5x body size

def cond_downtrend_two_bar_reversal_bearish(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None: return False
    prev_is_bullish = prev1['close'] > prev1['open']
    current_is_bearish = current['close'] < current['open']
    return prev_is_bullish and current_is_bearish and current['close'] < prev1['open']

def cond_downtrend_three_black_crows_simple(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None or prev2 is None: return False
    c_bear = current['close'] < current['open']
    p1_bear = prev1['close'] < prev1['open']
    p2_bear = prev2['close'] < prev2['open']
    if not (c_bear and p1_bear and p2_bear): return False
    # Each opens within previous body (simplified)
    c_opens_in_p1_body = current['open'] < prev1['open'] and current['open'] > prev1['close'] 
    p1_opens_in_p2_body = prev1['open'] < prev2['open'] and prev1['open'] > prev2['close']
    # Each closes lower than previous close
    c_closes_lower = current['close'] < prev1['close']
    p1_closes_lower = prev1['close'] < prev2['close']
    return c_opens_in_p1_body and p1_opens_in_p2_body and c_closes_lower and p1_closes_lower

def cond_downtrend_evening_star_simple(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None or prev2 is None: return False
    p2_bullish_body = prev2['close'] > prev2['open'] and (prev2['close'] - prev2['open']) > (prev2['high'] - prev2['low']) * 0.3 # prev2 is reasonably bullish
    p1_small_body = abs(prev1['open'] - prev1['close']) < (prev1['high'] - prev1['low']) * 0.3 # prev1 has small body
    # prev1 gapped up or opened above prev2 close
    p1_gap_or_high_open = prev1['open'] > prev2['close']
    c_bearish = current['close'] < current['open']
    # current closes well into prev2's body
    c_closes_in_p2_body = current['close'] < (prev2['open'] + prev2['close']) / 2
    return p2_bullish_body and p1_small_body and p1_gap_or_high_open and c_bearish and c_closes_in_p2_body

# --- USER LOGIC V1 DOWNTREND (Granular Components) ---
# cond_downtrend_prev_is_bullish (prev1['close'] > prev1['open']) already exists and covers UserA_DT

def cond_downtrend_user_B(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None or prev2 is None or prev3 is None: return False
    condB_dt_part1 = prev1['high'] > prev2['high']
    condB_dt_part2 = prev1['high'] > prev2['close']
    condB_dt_part3 = prev1['high'] > prev3['high']
    condB_dt_part4 = prev1['high'] > prev3['close']
    return condB_dt_part1 or condB_dt_part2 or condB_dt_part3 or condB_dt_part4

def cond_downtrend_user_C(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None or current is None: return False
    condC_dt_part1 = prev1['high'] > current['high']
    condC_dt_part2 = prev1['high'] > current['close']
    return condC_dt_part1 or condC_dt_part2

def cond_downtrend_user_D(current: pd.Series, prev1: pd.Series = None, prev2: pd.Series = None, prev3: pd.Series = None) -> bool:
    if prev1 is None or current is None: return False
    return current['close'] < prev1['close']

# List of atomic conditions
UPTREND_ATOMIC_CONDITIONS = [
    cond_uptrend_current_is_bullish,
    cond_uptrend_low_lt_prev_low,
    cond_uptrend_prev_is_bearish, # UserA_UT equivalent
    cond_uptrend_close_gt_prev_high,
    cond_uptrend_bullish_engulfing,
    cond_uptrend_higher_high_higher_low,
    cond_uptrend_long_lower_wick_bullish,
    cond_uptrend_two_bar_reversal_bullish,
    cond_uptrend_three_white_soldiers_simple,
    cond_uptrend_morning_star_simple,
    # cond_uptrend_user_logic_v1, # REMOVED
    cond_uptrend_user_B, # ADDED Granular
    cond_uptrend_user_C, # ADDED Granular
    cond_uptrend_user_D, # ADDED Granular
]

DOWNTREND_ATOMIC_CONDITIONS = [
    cond_downtrend_current_is_bearish,
    cond_downtrend_high_gt_prev_high,
    cond_downtrend_prev_is_bullish, # UserA_DT equivalent
    cond_downtrend_close_lt_prev_low,
    cond_downtrend_bearish_engulfing,
    cond_downtrend_lower_high_lower_low,
    cond_downtrend_long_upper_wick_bearish,
    cond_downtrend_two_bar_reversal_bearish,
    cond_downtrend_three_black_crows_simple,
    cond_downtrend_evening_star_simple,
    # cond_downtrend_user_logic_v1, # REMOVED
    cond_downtrend_user_B, # ADDED Granular
    cond_downtrend_user_C, # ADDED Granular
    cond_downtrend_user_D, # ADDED Granular
]

# --- Rule Generation & Callback --- 
Rule = List[Callable[[pd.Series, pd.Series, pd.Series, pd.Series], bool]] # Updated signature
RuleCallback = Callable[[int, pd.DataFrame], List[str]]

def create_rules_callback(uptrend_rule: Rule, downtrend_rule: Rule, lookback_needed: int) -> RuleCallback:
    def rules_callback(idx: int, ohlc_df: pd.DataFrame) -> List[str]:
        identified_types = []
        if idx < lookback_needed: 
            return []

        current = get_bar(ohlc_df, idx)
        prev1 = get_bar(ohlc_df, idx - 1)
        prev2 = get_bar(ohlc_df, idx - 2)
        prev3 = None # Initialize prev3
        if lookback_needed >=3: # Fetch prev3 only if actually needed
            prev3 = get_bar(ohlc_df, idx - 3)
            # It's possible that even if lookback_needed is 3, for a specific idx, prev3 might not exist
            # (e.g. idx=2 when lookback_needed=3). The condition functions must handle prev3 being None.

        if current is None: 
            return []

        # Check uptrend rule
        if uptrend_rule:
            uptrend_signal = True
            for condition_func in uptrend_rule:
                if not condition_func(current, prev1, prev2, prev3): # Pass prev3
                    uptrend_signal = False
                    break
            if uptrend_signal:
                identified_types.append('uptrendStart')
        
        # Check downtrend rule
        if downtrend_rule:
            downtrend_signal = True
            for condition_func in downtrend_rule:
                if not condition_func(current, prev1, prev2, prev3): # Pass prev3
                    downtrend_signal = False
                    break
            if downtrend_signal:
                identified_types.append('downtrendStart')
                
        return identified_types
    return rules_callback

# --- Trend Identification & Comparison (largely unchanged, but using new callback structure) ---
def identify_trends_from_ohlc(ohlc_df: pd.DataFrame, rules_callback: RuleCallback) -> pd.DataFrame:
    if ohlc_df.empty:
        return pd.DataFrame(columns=['timestamp', 'type', 'price_at_start'])

    identified_trends = []
    last_trend_type = None 

    for i in range(len(ohlc_df)):
        current_bar = ohlc_df.iloc[i]
        potential_trend_types = rules_callback(i, ohlc_df)
        actual_trends_for_this_bar = []

        for trend_type in potential_trend_types:
            if trend_type == 'uptrendStart':
                if last_trend_type != 'uptrendStart':
                    actual_trends_for_this_bar.append(trend_type)
            elif trend_type == 'downtrendStart':
                if last_trend_type != 'downtrendStart':
                    actual_trends_for_this_bar.append(trend_type)
        
        if not actual_trends_for_this_bar:
            continue

        if 'uptrendStart' in actual_trends_for_this_bar and 'downtrendStart' in actual_trends_for_this_bar:
            identified_trends.append({'timestamp': current_bar['timestamp'], 'type': 'uptrendStart', 'price_at_start': current_bar['close']})
            identified_trends.append({'timestamp': current_bar['timestamp'], 'type': 'downtrendStart', 'price_at_start': current_bar['close']})
            if i + 1 < len(ohlc_df):
                next_bar = ohlc_df.iloc[i+1]
                last_trend_type = 'uptrendStart' if next_bar['close'] > current_bar['close'] else 'downtrendStart'
            else:
                last_trend_type = 'uptrendStart' if current_bar['close'] > current_bar['open'] else 'downtrendStart'
        elif 'uptrendStart' in actual_trends_for_this_bar:
            identified_trends.append({'timestamp': current_bar['timestamp'], 'type': 'uptrendStart', 'price_at_start': current_bar['close'] })
            last_trend_type = 'uptrendStart'
        elif 'downtrendStart' in actual_trends_for_this_bar:
            identified_trends.append({'timestamp': current_bar['timestamp'], 'type': 'downtrendStart', 'price_at_start': current_bar['close']})
            last_trend_type = 'downtrendStart'
            
    return pd.DataFrame(identified_trends)

def compare_trends(generated_trends_df: pd.DataFrame, ground_truth_df: pd.DataFrame) -> Dict[str, Any]:
    if generated_trends_df.empty and ground_truth_df.empty:
        return {"matches": 0, "false_positives": 0, "false_negatives": 0, "total_ground_truth": 0, "total_generated": 0, "accuracy": 100.0}
    if ground_truth_df.empty:
        return {"matches": 0, "false_positives": len(generated_trends_df), "false_negatives": 0, "total_ground_truth": 0, "total_generated": len(generated_trends_df), "accuracy": 0.0}
    if generated_trends_df.empty:
        return {"matches": 0, "false_positives": 0, "false_negatives": len(ground_truth_df), "total_ground_truth": len(ground_truth_df), "total_generated": 0, "accuracy": 0.0}

    generated_trends_df['timestamp'] = pd.to_datetime(generated_trends_df['timestamp'])
    ground_truth_df['timestamp'] = pd.to_datetime(ground_truth_df['timestamp'])
    generated_trends_df['key'] = generated_trends_df['timestamp'].astype(str) + "_" + generated_trends_df['type']
    ground_truth_df['key'] = ground_truth_df['timestamp'].astype(str) + "_" + ground_truth_df['type']
    gen_keys = set(generated_trends_df['key'])
    truth_keys = set(ground_truth_df['key'])
    matches = len(gen_keys.intersection(truth_keys))
    false_positives = len(gen_keys.difference(truth_keys))
    false_negatives = len(truth_keys.difference(gen_keys))
    total_truth_signals = len(truth_keys)
    accuracy = (matches / total_truth_signals) * 100 if total_truth_signals > 0 else 0.0
    if not gen_keys and not truth_keys:
        accuracy = 100.0
    return {
        "matches": matches, "false_positives": false_positives, "false_negatives": false_negatives,
        "total_ground_truth": total_truth_signals, "total_generated": len(gen_keys), "accuracy": accuracy,
        "false_positives_details": generated_trends_df[~generated_trends_df['key'].isin(truth_keys)][['timestamp', 'type']].to_dict(orient='records'),
        "false_negatives_details": ground_truth_df[~ground_truth_df['key'].isin(gen_keys)][['timestamp', 'type']].to_dict(orient='records')
    }


def generate_rule_combinations(atomic_conditions: List[Callable], max_conditions: int) -> List[Rule]:
    """Generates combinations of atomic conditions (ANDed)."""
    all_rule_combos = []
    for i in range(1, max_conditions + 1):
        for combo in itertools.combinations(atomic_conditions, i):
            all_rule_combos.append(list(combo))
    return all_rule_combos

def main():
    """Main function to orchestrate the trend discovery and validation."""
    ohlc_filepath = 'data/CON.F.US.MES.M25_1h_ohlc.csv'
    trend_filepath = 'data/CON.F.US.MES.M25_1h_trends.json'

    ohlc_df = load_ohlc_data(ohlc_filepath)
    ground_truth_trends_df = load_trend_data(trend_filepath)

    if ohlc_df.empty or ground_truth_trends_df.empty:
        print("Exiting due to data loading errors.")
        return

    # --- Automated Rule Discovery --- 
    MAX_CONDITIONS_PER_RULE = 3 # Kept at 3
    best_accuracy = -1.0
    best_uptrend_rule_names = []
    best_downtrend_rule_names = []

    # If we add rules with more lookback, this needs to be dynamic or a max value.
    fixed_lookback_needed = 3 # Stays 3 as new user granular conditions require prev3

    uptrend_rule_combos = generate_rule_combinations(UPTREND_ATOMIC_CONDITIONS, MAX_CONDITIONS_PER_RULE)
    downtrend_rule_combos = generate_rule_combinations(DOWNTREND_ATOMIC_CONDITIONS, MAX_CONDITIONS_PER_RULE)
    
    print(f"Starting rule discovery. Total uptrend rule combinations: {len(uptrend_rule_combos)}")
    print(f"Total downtrend rule combinations: {len(downtrend_rule_combos)}")
    
    # Calculate total iterations considering the 'None' rule option
    total_iterations_up = len(uptrend_rule_combos) + 1 
    total_iterations_down = len(downtrend_rule_combos) + 1
    total_iterations = total_iterations_up * total_iterations_down
    print(f"Max iterations (including 'None' rule option): {total_iterations}") # Corrected calculation
    
    iteration_count = 0

    uptrend_rule_combos_with_none = [[]] + uptrend_rule_combos 
    downtrend_rule_combos_with_none = [[]] + downtrend_rule_combos

    for up_rule_combo in uptrend_rule_combos_with_none:
        for down_rule_combo in downtrend_rule_combos_with_none:
            iteration_count += 1
            if iteration_count % 500 == 0: # Print progress less frequently for longer runs
                 print(f"Iteration {iteration_count}/{total_iterations}...")

            if not up_rule_combo and not down_rule_combo: 
                continue

            current_rules_callback = create_rules_callback(up_rule_combo, down_rule_combo, fixed_lookback_needed)
            
            generated_trends_df = identify_trends_from_ohlc(ohlc_df, current_rules_callback)
            results = compare_trends(generated_trends_df, ground_truth_trends_df)

            if results['accuracy'] > best_accuracy:
                best_accuracy = results['accuracy']
                best_uptrend_rule_names = [f.__name__ for f in up_rule_combo]
                best_downtrend_rule_names = [f.__name__ for f in down_rule_combo]
                # To keep output cleaner during long runs, only print names, not full details initially
                print(f"\nNew Best Accuracy: {best_accuracy:.2f}%")
                print(f"  Uptrend Rule: {' AND '.join(best_uptrend_rule_names) if best_uptrend_rule_names else 'None'}")
                print(f"  Downtrend Rule: {' AND '.join(best_downtrend_rule_names) if best_downtrend_rule_names else 'None'}")
                print(f"  Matches: {results['matches']}, FP: {results['false_positives']}, FN: {results['false_negatives']}\n")
                # Detailed false positives/negatives can be logged to a file if needed, or printed less often.
                # For now, keeping the detailed dictionary for the final best.
                if results['accuracy'] == 100.0: # Only print full details if 100%
                    print(f"FP Details: {results.get('false_positives_details')}")
                    print(f"FN Details: {results.get('false_negatives_details')}")


            if results['accuracy'] == 100.0:
                print("\n--- !!! 100% ACCURACY ACHIEVED !!! ---")
                # (print details as above)
                return 

    print("\n--- Discovery Complete ---")
    print(f"Best accuracy achieved: {best_accuracy:.2f}%")
    print(f"Best Uptrend Rule: {' AND '.join(best_uptrend_rule_names) if best_uptrend_rule_names else 'None'}")
    print(f"Best Downtrend Rule: {' AND '.join(best_downtrend_rule_names) if best_downtrend_rule_names else 'None'}")
    # Here you might want to re-run with the best rules to get detailed FP/FN for the final best.
    # For now, the last results dictionary for the best accuracy will have them if uncommented in compare_trends.

if __name__ == '__main__':
    main() 