import pandas as pd
import sys
from results_1d_100recall.detect_uptrendstart import detect_uptrendstart
from results_1d_100recall.detect_downtrendstart import detect_downtrendstart

# Load OHLC data
df = pd.read_csv('data/CON.F.US.MES.M25_4h_ohlc.csv')
df['timestamp'] = pd.to_datetime(df['timestamp'])

# Add columns for trend starts
df['uptrendStart'] = False
df['downtrendStart'] = False

# Detect trends
for i in range(len(df)):
    df.loc[df.index[i], 'uptrendStart'] = detect_uptrendstart(df, i)
    df.loc[df.index[i], 'downtrendStart'] = detect_downtrendstart(df, i)

# Count detected trends
uptrend_count = df['uptrendStart'].sum()
downtrend_count = df['downtrendStart'].sum()

print(f"100recall mode - Detected {uptrend_count} uptrend starts and {downtrend_count} downtrend starts")

# Load reference data
ref = pd.read_csv('reference_results.csv')
ref['date'] = pd.to_datetime(ref['timestamp']).dt.strftime('%Y-%m-%d')
df['date'] = pd.to_datetime(df['timestamp']).dt.strftime('%Y-%m-%d')

# Find matching days
ref_up = set(ref[ref['uptrendStart']]['date'])
ref_down = set(ref[ref['downtrendStart']]['date'])
detect_up = set(df[df['uptrendStart']]['date'])
detect_down = set(df[df['downtrendStart']]['date'])

up_match = len(detect_up.intersection(ref_up))
down_match = len(detect_down.intersection(ref_down))

print(f"MATCH RATE - Uptrends: {up_match}/{len(ref_up)} ({up_match/len(ref_up)*100:.1f}%)")
print(f"MATCH RATE - Downtrends: {down_match}/{len(ref_down)} ({down_match/len(ref_down)*100:.1f}%)")
print(f"OVERALL MATCH: {(up_match+down_match)/(len(ref_up)+len(ref_down))*100:.1f}%")

print("MATCHING UPTRENDS:", sorted(detect_up.intersection(ref_up)))
print("MATCHING DOWNTRENDS:", sorted(detect_down.intersection(ref_down)))

# Save results
df.to_csv('100recall_results.csv', index=False) 