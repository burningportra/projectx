#!/usr/bin/env python3

import pandas as pd
from datetime import datetime

# Load both datasets
generated = pd.read_csv('confirmed_trend_starts.csv')
truth = pd.read_csv('trend_analysis/confirmed_trend_starts_4h_truth.csv')

print(f"Generated trends: {len(generated)}")
print(f"Truth trends: {len(truth)}")
print(f"Difference: +{len(generated) - len(truth)} excess trends\n")

# Convert to comparable format
generated['key'] = generated['trend_start_type'] + '_' + generated['bar_index'].astype(str)
truth['key'] = truth['trend_type'] + '_' + truth['bar_index'].astype(str)

# Find differences
generated_keys = set(generated['key'])
truth_keys = set(truth['key'])

false_positives = generated_keys - truth_keys
false_negatives = truth_keys - generated_keys

print(f"FALSE POSITIVES (generated but not in truth): {len(false_positives)}")
for fp in sorted(false_positives):
    row = generated[generated['key'] == fp].iloc[0]
    print(f"  {fp} -> {row['date']}")

print(f"\nFALSE NEGATIVES (in truth but not generated): {len(false_negatives)}")
for fn in sorted(false_negatives):
    row = truth[truth['key'] == fn].iloc[0]
    print(f"  {fn} -> {row['date']}")

# Look for patterns in false positives
print(f"\nPATTERN ANALYSIS:")
fp_data = generated[generated['key'].isin(false_positives)].copy()
fp_data['hour'] = pd.to_datetime(fp_data['date']).dt.hour

print(f"False positive trends by type:")
print(fp_data['trend_start_type'].value_counts())

print(f"\nFalse positive trends by hour:")
print(fp_data['hour'].value_counts().sort_index())

# Check for rapid oscillations (same bar_index, different types)
print(f"\nRAPID OSCILLATIONS (same bar, different trend):")
duplicated_bars = generated['bar_index'].duplicated(keep=False)
if duplicated_bars.any():
    dupes = generated[duplicated_bars].sort_values('bar_index')
    print(dupes[['trend_start_type', 'bar_index', 'date']])
else:
    print("None found")

# Time-based clustering analysis
print(f"\nTIME CLUSTERING ANALYSIS:")
generated['datetime'] = pd.to_datetime(generated['date'])
truth['datetime'] = pd.to_datetime(truth['date'])

# Look for trends generated within 1-2 bars of each other
generated_sorted = generated.sort_values('bar_index')
prev_bar = None
rapid_sequences = []

for idx, row in generated_sorted.iterrows():
    if prev_bar is not None and row['bar_index'] - prev_bar <= 2:
        rapid_sequences.append((prev_bar, row['bar_index'], row['trend_start_type']))
    prev_bar = row['bar_index']

print(f"Rapid trend sequences (≤2 bars apart): {len(rapid_sequences)}")
for seq in rapid_sequences[:10]:  # Show first 10
    print(f"  Bar {seq[0]} -> Bar {seq[1]} ({seq[2]})") 