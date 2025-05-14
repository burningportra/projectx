#!/usr/bin/env python3
import json
import pandas as pd

# Load trend points
print("Loading trend points...")
try:
    with open('data/CON.F.US.MES.M25_4h_trends.json', 'r') as f:
        trend_data = json.load(f)
        print(f"Successfully loaded {len(trend_data)} trend points")

    # Print the actual timeframe values in the data
    print("\nChecking trend point timeframe values:")
    timeframes = set()
    for point in trend_data:
        timeframe = point.get('timeframe')
        timeframes.add(timeframe)
    
    print(f"Unique timeframe values in trend points: {timeframes}")

    # Simulate the filtering done by the main script
    print("\nTrying to filter with timeframe='4h':")
    filtered_points = [tp for tp in trend_data if tp.get('timeframe') == '4h']
    print(f"After filtering: {len(filtered_points)} trend points")

    # Check if there's a case sensitivity issue
    print("\nTrying other possible timeframe values:")
    for possible in ['4h', '4H', '4hr', '4 h', '4 hours', '4']:
        filtered = [tp for tp in trend_data if tp.get('timeframe') == possible]
        print(f"  - '{possible}': {len(filtered)} trend points")

    # Try to filter using a flexible matching approach
    print("\nTrying flexible matching:")
    import re
    flexible_filtered = [tp for tp in trend_data 
                        if tp.get('timeframe') and 
                           re.search(r'4\s*h', tp.get('timeframe'), re.IGNORECASE)]
    print(f"Flexible '4h' matching: {len(flexible_filtered)} trend points")
    
    # Inspect the structure of a trend point
    if trend_data:
        print("\nInspecting trend point structure:")
        sample_point = trend_data[0]
        for key, value in sample_point.items():
            print(f"  {key}: {value} ({type(value).__name__})")

except Exception as e:
    print(f"Error analyzing trend points: {e}") 