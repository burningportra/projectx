#!/usr/bin/env python3
"""
Test with real market data from CSV
"""

import pandas as pd
import requests
import json
import sys
import os

# Add the project root to path
sys.path.insert(0, os.path.dirname(__file__))

def test_with_real_csv_data():
    """Test using the real CSV market data"""
    
    # Load the real market data
    csv_path = "trend_analysis/data/CON.F.US.MES.M25_1d_ohlc.csv"
    
    if not os.path.exists(csv_path):
        print(f"Error: CSV file not found at {csv_path}")
        return
    
    print(f"Loading real market data from {csv_path}...")
    df = pd.read_csv(csv_path)
    
    print(f"Loaded {len(df)} rows of market data")
    print(f"Date range: {df['timestamp'].iloc[0]} to {df['timestamp'].iloc[-1]}")
    print(f"Price range: ${df['low'].min():.2f} - ${df['high'].max():.2f}")
    
    # Show first few rows
    print("\nFirst 5 rows:")
    print(df.head().to_string())
    
    # Convert to API format
    bars = []
    for _, row in df.iterrows():
        bars.append({
            "timestamp": row['timestamp'],
            "open": float(row['open']),
            "high": float(row['high']),
            "low": float(row['low']),
            "close": float(row['close']),
            "volume": int(row['volume']) if pd.notna(row['volume']) else 1000
        })
    
    contract_id = df['contract_id'].iloc[0]
    
    print(f"\nPrepared {len(bars)} bars for analysis")
    print(f"Contract: {contract_id}")
    
    # Test 1: Direct Python call
    print("\n" + "="*50)
    print("TEST 1: Direct Python Function Call")
    print("="*50)
    
    try:
        from src.strategies.trend_start_finder import generate_trend_starts
        
        bars_df = pd.DataFrame(bars)
        bars_df['timestamp'] = pd.to_datetime(bars_df['timestamp'])
        
        signals, debug_logs = generate_trend_starts(
            bars_df, 
            contract_id,
            "1d",
            debug=True
        )
        
        print(f"Direct call: Generated {len(signals)} signals")
        print(f"Direct call: Generated {len(debug_logs)} debug logs")
        
        if signals:
            print("\n=== DIRECT CALL SIGNALS ===")
            for i, signal in enumerate(signals):
                print(f"Signal {i+1}: {signal}")
        else:
            print("Direct call: No signals found")
        
        # Show some debug logs
        print(f"\nSample debug logs (showing last 10 of {len(debug_logs)}):")
        for log in debug_logs[-10:]:
            print(f"  {log.get('message', 'N/A')}")
            
    except Exception as e:
        print(f"Error in direct Python call: {e}")
    
    # Test 2: API call
    print("\n" + "="*50)
    print("TEST 2: HTTP API Call")
    print("="*50)
    
    payload = {
        "bars": bars,
        "contract_id": contract_id,
        "timeframe": "1d",
        "debug": True
    }
    
    try:
        url = "http://localhost:3000/api/trend-analysis"
        headers = {"Content-Type": "application/json"}
        
        print(f"Calling {url} with {len(bars)} bars...")
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        
        print(f"API Response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"API call: Generated {len(result.get('signals', []))} signals")
            
            if result.get('signals'):
                print("\n=== API CALL SIGNALS ===")
                for i, signal in enumerate(result['signals']):
                    print(f"Signal {i+1}: {signal}")
            else:
                print("API call: No signals found")
                
            print(f"\nAPI Metadata: {result.get('metadata', {})}")
        else:
            print(f"API Error: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to API. Make sure the Next.js dev server is running on localhost:3000")
    except Exception as e:
        print(f"Error in API call: {e}")
    
    print(f"\nTest completed!")

if __name__ == '__main__':
    test_with_real_csv_data() 