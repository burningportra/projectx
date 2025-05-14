import pandas as pd
import json

# Load reference data from JSON
with open('data/CON.F.US.MES.M25_1d_trends.json', 'r') as f:
    json_data = json.load(f)

# Create reference DataFrame
ref_df = pd.DataFrame([{
    'timestamp': pd.to_datetime(item['timestamp']),
    'type': item['type'],
    'price': item['price']
} for item in json_data])

# Sort by timestamp
ref_df = ref_df.sort_values('timestamp')

# Load our detection results
results_df = pd.read_csv('results_1d_pattern.csv')
results_df['timestamp'] = pd.to_datetime(results_df['timestamp'])

# Add date column for matching
ref_df['date'] = ref_df['timestamp'].dt.strftime('%Y-%m-%d')
results_df['date'] = results_df['timestamp'].dt.strftime('%Y-%m-%d')

# Create sets of dates with uptrends/downtrends
ref_up_dates = set(ref_df[ref_df['type'] == 'uptrendStart']['date'])
ref_down_dates = set(ref_df[ref_df['type'] == 'downtrendStart']['date'])
detect_up_dates = set(results_df[results_df['uptrendStart']]['date'])
detect_down_dates = set(results_df[results_df['downtrendStart']]['date'])

# Find missed uptrends and downtrends
missed_up = ref_up_dates - detect_up_dates
missed_down = ref_down_dates - detect_down_dates

# Print overall statistics
print(f"1D TIMEFRAME ANALYSIS")
print(f"Reference data: {len(ref_up_dates)} uptrends, {len(ref_down_dates)} downtrends")
print(f"Detected: {len(detect_up_dates)} uptrends, {len(detect_down_dates)} downtrends")
print(f"Matched: {len(ref_up_dates.intersection(detect_up_dates))} uptrends, {len(ref_down_dates.intersection(detect_down_dates))} downtrends")

# Print missed trend dates
print("\nMISSED UPTREND DATES:")
for date in sorted(missed_up):
    idx = ref_df[ref_df['date'] == date].index[0]
    print(f"  {date} - Price: {ref_df.loc[idx, 'price']}")
    
    # Find the corresponding candle in our results
    result_idx = results_df[results_df['date'] == date].index[0]
    candle = results_df.loc[result_idx]
    print(f"  Candle: Open={candle['open']}, Close={candle['close']}, High={candle['high']}, Low={candle['low']}")
    print(f"  Movement: {((candle['close'] - candle['open']) / candle['open'] * 100):.2f}%")
    print()

print("\nMISSED DOWNTREND DATES:")
for date in sorted(missed_down):
    idx = ref_df[ref_df['date'] == date].index[0]
    print(f"  {date} - Price: {ref_df.loc[idx, 'price']}")
    
    # Find the corresponding candle in our results
    result_idx = results_df[results_df['date'] == date].index[0]
    candle = results_df.loc[result_idx]
    print(f"  Candle: Open={candle['open']}, Close={candle['close']}, High={candle['high']}, Low={candle['low']}")
    print(f"  Movement: {((candle['close'] - candle['open']) / candle['open'] * 100):.2f}%")
    print()

# Check the order of reference trends to see if there's perfect alternation
print("\nREFERENCE TREND SEQUENCE:")
for idx, row in ref_df.sort_values('timestamp').iterrows():
    print(f"  {row['date']}: {row['type']}")

# Check our detected trend sequence
print("\nDETECTED TREND SEQUENCE:")
uptrend_dates = set(results_df[results_df['uptrendStart']]['date'])
downtrend_dates = set(results_df[results_df['downtrendStart']]['date'])

for date in sorted(uptrend_dates.union(downtrend_dates)):
    if date in uptrend_dates:
        print(f"  {date}: uptrendStart")
    if date in downtrend_dates:
        print(f"  {date}: downtrendStart") 