#!/usr/bin/env python3
"""
Test the Python trend finder directly with complex data
"""

import json
import sys
import os
from datetime import datetime, timedelta

# Add the project root to path
sys.path.insert(0, os.path.dirname(__file__))

from src.strategies.trend_start_finder import generate_trend_starts
import pandas as pd

def test_direct_python():
    """Test the trend finder directly"""
    
    # Create the same complex test data
    base_time = datetime(2024, 1, 1, 10, 0, 0)
    
    # Create a more complex pattern based on real market behavior
    prices = [
        # Establish downtrend
        (5580, 5590, 5560, 5565),  # Bar 1 - Starting high
        (5565, 5570, 5545, 5550),  # Bar 2 - Lower high, lower low
        (5550, 5555, 5530, 5535),  # Bar 3 - Continued downtrend
        (5535, 5540, 5515, 5520),  # Bar 4 - Lower low
        (5520, 5525, 5500, 5505),  # Bar 5 - Even lower
        
        # Create PUS candidates and potential CUS
        (5505, 5530, 5500, 5525),  # Bar 6 - Higher low (500 vs 500), break high
        (5525, 5545, 5520, 5540),  # Bar 7 - Higher low and high
        (5540, 5560, 5535, 5555),  # Bar 8 - Continued uptrend
        (5555, 5575, 5550, 5570),  # Bar 9 - Strong move up
        (5570, 5585, 5565, 5580),  # Bar 10 - Confirmation
        
        # Create downtrend reversal for CDS
        (5580, 5585, 5560, 5565),  # Bar 11 - Lower high
        (5565, 5570, 5545, 5550),  # Bar 12 - Lower high and low
        (5550, 5555, 5530, 5535),  # Bar 13 - Continued down
        (5535, 5540, 5515, 5520),  # Bar 14 - Lower low
        (5520, 5525, 5500, 5505),  # Bar 15 - Confirmation
    ]
    
    test_bars = []
    for i, (open_price, high, low, close) in enumerate(prices):
        timestamp = base_time + timedelta(hours=i)
        test_bars.append({
            "timestamp": timestamp.isoformat() + "Z",
            "open": open_price,
            "high": high,
            "low": low,
            "close": close,
            "volume": 1000 + i * 100
        })
    
    print(f"Testing direct Python with {len(test_bars)} bars...")
    print(f"Pattern: Downtrend (bars 1-5) -> Uptrend (bars 6-10) -> Downtrend (bars 11-15)")
    
    # Convert to DataFrame
    bars_df = pd.DataFrame(test_bars)
    bars_df['timestamp'] = pd.to_datetime(bars_df['timestamp'])
    
    # Test the generate_trend_starts function directly
    signals, debug_logs = generate_trend_starts(
        bars_df, 
        "TEST.CONTRACT.DIRECT",
        "1h",
        debug=True
    )
    
    print(f"\nDirect function call results:")
    print(f"Generated {len(signals)} signals")
    print(f"Generated {len(debug_logs)} debug logs")
    
    if signals:
        print("\n=== SIGNALS FOUND ===")
        for i, signal in enumerate(signals):
            print(f"Signal {i+1}: {signal}")
    else:
        print("\n=== NO SIGNALS FOUND ===")
    
    # Show some key debug logs
    print(f"\n=== SAMPLE DEBUG LOGS ===")
    if len(debug_logs) > 50:
        print("First 10 debug logs:")
        for i in range(10):
            log = debug_logs[i]
            print(f"  {log.get('message', 'N/A')}")
        print("...")
        print("Last 10 debug logs:")
        for i in range(len(debug_logs)-10, len(debug_logs)):
            log = debug_logs[i]
            print(f"  {log.get('message', 'N/A')}")
    else:
        for i, log in enumerate(debug_logs[:20]):  # Show first 20
            print(f"  {log.get('message', 'N/A')}")
    
    print(f"\nTest completed!")

if __name__ == '__main__':
    test_direct_python() 