#!/usr/bin/env python3
"""
Test script to call the trend analysis API endpoint directly
"""

import requests
import json
from datetime import datetime, timedelta

def test_api_endpoint():
    """Test the /api/trend-analysis endpoint"""
    
    # Create more sophisticated test data that should trigger confirmed signals
    base_time = datetime(2024, 1, 1, 10, 0, 0)
    test_bars = []
    
    # Create a more complex pattern based on real market behavior
    # This should create a downtrend followed by an uptrend reversal
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
    
    payload = {
        "bars": test_bars,
        "contract_id": "TEST.CONTRACT.API",
        "timeframe": "1h",
        "debug": True
    }
    
    print(f"Testing API endpoint with {len(test_bars)} bars...")
    print(f"Pattern: Downtrend (bars 1-5) -> Uptrend (bars 6-10) -> Downtrend (bars 11-15)")
    print(f"First bar: {test_bars[0]}")
    print(f"Potential CUS around bar 6-8: {test_bars[5:8]}")
    print(f"Potential CDS around bar 11-13: {test_bars[10:13]}")
    
    try:
        # Make API call
        url = "http://localhost:3000/api/trend-analysis"
        headers = {"Content-Type": "application/json"}
        
        print(f"\nCalling {url}...")
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        
        print(f"Response status: {response.status_code}")
        print(f"Response headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"\nSuccess! Generated {len(result.get('signals', []))} signals")
            
            if result.get('signals'):
                print("Signals found:")
                for i, signal in enumerate(result['signals']):
                    print(f"  Signal {i+1}: {signal}")
            else:
                print("No signals found in response")
                
            print(f"\nMetadata: {result.get('metadata', {})}")
        else:
            print(f"Error response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to API. Make sure the Next.js dev server is running on localhost:3000")
    except requests.exceptions.Timeout:
        print("Error: API call timed out")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    test_api_endpoint() 