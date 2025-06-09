#!/usr/bin/env python3
"""
Test script to verify the trend_start_finder.py works with the API interface
"""

import json
import sys
import os

# Add the project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.strategies.trend_start_finder import process_api_input, generate_trend_starts
import pandas as pd

def test_trend_finder():
    """Test the trend finder with sample data"""
    
    # Sample test data
    test_data = {
        "bars": [
            {"timestamp": "2023-01-01T10:00:00Z", "open": 100, "high": 105, "low": 99, "close": 101, "volume": 1000},
            {"timestamp": "2023-01-01T11:00:00Z", "open": 101, "high": 106, "low": 100, "close": 102, "volume": 1100},
            {"timestamp": "2023-01-01T12:00:00Z", "open": 102, "high": 107, "low": 101, "close": 103, "volume": 1200},
            {"timestamp": "2023-01-01T13:00:00Z", "open": 103, "high": 108, "low": 102, "close": 104, "volume": 1300},
            {"timestamp": "2023-01-01T14:00:00Z", "open": 104, "high": 109, "low": 103, "close": 105, "volume": 1400},
            {"timestamp": "2023-01-01T15:00:00Z", "open": 105, "high": 110, "low": 104, "close": 106, "volume": 1500},
        ],
        "contract_id": "TEST.CONTRACT",
        "timeframe": "1h",
        "debug": True
    }
    
    print("Testing trend_start_finder.py with API interface...")
    print(f"Input data: {len(test_data['bars'])} bars")
    
    # Convert to DataFrame for direct testing
    bars_df = pd.DataFrame(test_data['bars'])
    bars_df['timestamp'] = pd.to_datetime(bars_df['timestamp'])
    
    # Test the generate_trend_starts function directly
    signals, debug_logs = generate_trend_starts(
        bars_df, 
        test_data['contract_id'], 
        test_data['timeframe'],
        debug=test_data['debug']
    )
    
    print(f"\nDirect function call results:")
    print(f"Generated {len(signals)} signals")
    print(f"Generated {len(debug_logs)} debug logs")
    
    if signals:
        for i, signal in enumerate(signals):
            print(f"Signal {i+1}: {signal}")
    
    # Test via stdin simulation
    print(f"\nTesting via stdin simulation...")
    
    # Save original stdin
    original_stdin = sys.stdin
    
    try:
        # Create a mock stdin with JSON data
        from io import StringIO
        mock_stdin = StringIO(json.dumps(test_data))
        sys.stdin = mock_stdin
        
        # Capture stdout
        from io import StringIO
        import contextlib
        
        stdout_capture = StringIO()
        with contextlib.redirect_stdout(stdout_capture):
            try:
                process_api_input()
            except SystemExit:
                pass  # Expected for error cases
        
        output = stdout_capture.getvalue()
        print("API interface output:")
        print(output)
        
    finally:
        # Restore original stdin
        sys.stdin = original_stdin
    
    print("\nTest completed!")

if __name__ == '__main__':
    test_trend_finder() 