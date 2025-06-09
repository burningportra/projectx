#!/usr/bin/env python3
"""
Test script to verify the forward testing API produces consistent results.
This compares the API output with direct ForwardTrendAnalyzer usage.
"""

import sys
import os
import json
import requests
from datetime import datetime

# Add project root to path
project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from trend_analysis.trend_start_forward_test import ForwardTrendAnalyzer
from trend_analysis.trend_models import Bar
import trend_analysis.trend_utils as trend_utils

def load_test_data():
    """Load test data from CSV file."""
    csv_file = "trend_analysis/data/CON.F.US.MES.M25_1d_ohlc.csv"
    print(f"Loading test data from: {csv_file}")
    
    all_bars = trend_utils.load_bars_from_alt_csv(filename=csv_file, BarClass=Bar)
    if not all_bars:
        raise Exception(f"Could not load bars from {csv_file}")
    
    print(f"Loaded {len(all_bars)} bars")
    return all_bars

def test_direct_python_analyzer(bars, test_bar_index):
    """Test using ForwardTrendAnalyzer directly."""
    print(f"\n=== Testing Direct Python ForwardTrendAnalyzer up to bar {test_bar_index} ===")
    
    analyzer = ForwardTrendAnalyzer(contract_id="TEST_DIRECT", timeframe_str="1D")
    
    # Process bars up to test_bar_index
    for i in range(test_bar_index + 1):
        signals = analyzer.process_new_bar(bars[i])
        if signals:
            print(f"Direct: Bar {i} produced {len(signals)} signals")
            for signal in signals:
                signal_type = signal['signal_type']
                bar_idx = signal['details']['confirmed_signal_bar_index']
                rule = signal['details']['rule_type']
                price = signal['signal_price']
                print(f"  -> {signal_type} at bar {bar_idx}, price {price}, rule: {rule}")
    
    all_signals = analyzer.get_all_signals()
    print(f"Direct: Total signals up to bar {test_bar_index}: {len(all_signals)}")
    return all_signals

def test_api_forward_testing(bars, test_bar_index):
    """Test using the forward testing API."""
    print(f"\n=== Testing Forward Testing API up to bar {test_bar_index} ===")
    
    # Convert bars to API format
    api_bars = []
    for i in range(test_bar_index + 1):
        bar = bars[i]
        api_bars.append({
            'index': i + 1,
            'timestamp': bar.date,
            'date': bar.date,
            'open': bar.o,
            'high': bar.h,
            'low': bar.l,
            'close': bar.c,
            'volume': bar.volume or 0
        })
    
    # Call API
    api_url = "http://localhost:3000/api/trend-analysis/forward"
    payload = {
        'bars': api_bars,
        'contract_id': 'TEST_API',
        'timeframe': '1D',
        'current_bar_index': test_bar_index + 1,  # API uses 1-based indexing
        'debug': True
    }
    
    try:
        response = requests.post(api_url, json=payload, timeout=30)
        if response.status_code != 200:
            print(f"API Error: {response.status_code} - {response.text}")
            return []
        
        result = response.json()
        if not result.get('success'):
            print(f"API failed: {result.get('error')}")
            return []
        
        all_signals = result.get('all_signals', [])
        new_signals = result.get('new_signals', [])
        
        print(f"API: Total signals up to bar {test_bar_index}: {len(all_signals)}")
        print(f"API: New signals for bar {test_bar_index}: {len(new_signals)}")
        
        for signal in new_signals:
            signal_type = signal.get('signal_type', 'unknown')
            bar_idx = signal.get('details', {}).get('confirmed_signal_bar_index', 'unknown')
            rule = signal.get('details', {}).get('rule_type', 'unknown')
            price = signal.get('signal_price', 'unknown')
            print(f"  -> {signal_type} at bar {bar_idx}, price {price}, rule: {rule}")
        
        return all_signals
        
    except requests.exceptions.RequestException as e:
        print(f"API request failed: {e}")
        return []

def compare_results(direct_signals, api_signals):
    """Compare results from direct and API approaches."""
    print(f"\n=== Comparing Results ===")
    print(f"Direct signals: {len(direct_signals)}")
    print(f"API signals: {len(api_signals)}")
    
    if len(direct_signals) != len(api_signals):
        print("❌ DIFFERENT number of signals!")
        return False
    
    # Compare each signal
    for i, (direct, api) in enumerate(zip(direct_signals, api_signals)):
        direct_type = direct['signal_type']
        api_type = api.get('signal_type', 'unknown')
        
        direct_bar = direct['details']['confirmed_signal_bar_index']
        api_bar = api.get('details', {}).get('confirmed_signal_bar_index', 'unknown')
        
        direct_rule = direct['details']['rule_type']
        api_rule = api.get('details', {}).get('rule_type', 'unknown')
        
        if direct_type != api_type or direct_bar != api_bar or direct_rule != api_rule:
            print(f"❌ Signal {i+1} differs:")
            print(f"  Direct: {direct_type} at bar {direct_bar}, rule: {direct_rule}")
            print(f"  API:    {api_type} at bar {api_bar}, rule: {api_rule}")
            return False
        else:
            print(f"✅ Signal {i+1}: {direct_type} at bar {direct_bar}, rule: {direct_rule}")
    
    print("🎉 All signals match!")
    return True

def main():
    """Main test function."""
    print("=== Forward Testing API Validation ===")
    
    # Load test data
    try:
        bars = load_test_data()
    except Exception as e:
        print(f"Failed to load test data: {e}")
        return
    
    # Test different bar indices
    test_indices = [10, 20, 30, len(bars) - 1]
    
    for test_bar_index in test_indices:
        if test_bar_index >= len(bars):
            continue
            
        print(f"\n{'='*60}")
        print(f"Testing up to bar index {test_bar_index} ({bars[test_bar_index].date})")
        print(f"{'='*60}")
        
        # Test direct Python approach
        direct_signals = test_direct_python_analyzer(bars, test_bar_index)
        
        # Test API approach
        api_signals = test_api_forward_testing(bars, test_bar_index)
        
        # Compare results
        if direct_signals and api_signals:
            success = compare_results(direct_signals, api_signals)
            if not success:
                print(f"❌ Test failed for bar index {test_bar_index}")
                break
        else:
            print(f"⚠️ Skipping comparison for bar index {test_bar_index} - missing data")
    
    print(f"\n{'='*60}")
    print("Forward Testing API Validation Complete")
    print(f"{'='*60}")

if __name__ == "__main__":
    main() 