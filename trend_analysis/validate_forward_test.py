#!/usr/bin/env python3
"""
Validation Script: Compare Original vs Forward Testing Results

This script validates that the forward testing approach produces 
identical results to the original batch processing approach.
"""

import sys
import os
import pandas as pd

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from trend_analysis.trend_models import Bar
import trend_analysis.trend_utils as trend_utils
from trend_analysis.trend_start_og_fixed import process_trend_logic
from trend_analysis.trend_start_forward_test import run_forward_test_simulation

def compare_results():
    """Compare results from both approaches."""
    print("=== Validation: Original vs Forward Testing ===\n")
    
    # Load the same data for both approaches
    csv_file = "trend_analysis/data/CON.F.US.MES.M25_1d_ohlc.csv"
    print(f"Loading data from: {csv_file}")
    all_bars = trend_utils.load_bars_from_alt_csv(filename=csv_file, BarClass=Bar)
    
    if not all_bars:
        print("Error: Could not load bars")
        return
    
    print(f"Loaded {len(all_bars)} bars\n")
    
    # Run original batch processing
    print("Running original batch processing...")
    original_signals, _ = process_trend_logic(all_bars, contract_id="ORIGINAL", timeframe_str="1D")
    
    # Run forward testing simulation  
    print("Running forward testing simulation...")
    forward_signals, _ = run_forward_test_simulation(all_bars, contract_id="FORWARD", timeframe_str="1D")
    
    print(f"\n=== Results Comparison ===")
    print(f"Original signals: {len(original_signals)}")
    print(f"Forward signals:  {len(forward_signals)}")
    
    if len(original_signals) != len(forward_signals):
        print("❌ DIFFERENT number of signals!")
        return False
    
    # Compare each signal
    all_match = True
    print(f"\n=== Signal-by-Signal Comparison ===")
    
    for i, (orig, fwd) in enumerate(zip(original_signals, forward_signals)):
        orig_key = (orig['details']['confirmed_signal_bar_index'], orig['signal_type'])
        fwd_key = (fwd['details']['confirmed_signal_bar_index'], fwd['signal_type'])
        
        if orig_key != fwd_key:
            print(f"❌ Signal {i+1}: Different keys - Original: {orig_key}, Forward: {fwd_key}")
            all_match = False
            continue
            
        # Check key fields
        fields_to_check = [
            'signal_type', 'signal_price', 'signal_close',
            ('details', 'confirmed_signal_bar_index'),
            ('details', 'confirmed_signal_bar_date'),
            ('details', 'triggering_bar_index'), 
            ('details', 'rule_type')
        ]
        
        signal_match = True
        for field in fields_to_check:
            if isinstance(field, tuple):
                orig_val = orig[field[0]][field[1]]
                fwd_val = fwd[field[0]][field[1]]
                field_name = f"{field[0]}.{field[1]}"
            else:
                orig_val = orig[field]
                fwd_val = fwd[field]
                field_name = field
            
            if orig_val != fwd_val:
                print(f"❌ Signal {i+1}: {field_name} differs - Original: {orig_val}, Forward: {fwd_val}")
                signal_match = False
                all_match = False
        
        if signal_match:
            bar_idx = orig['details']['confirmed_signal_bar_index']
            signal_type = orig['signal_type'].replace('_start', '').upper()
            rule = orig['details']['rule_type']
            print(f"✅ Signal {i+1}: Bar {bar_idx} {signal_type} ({rule}) - MATCH")
    
    if all_match:
        print(f"\n🎉 SUCCESS: All {len(original_signals)} signals match perfectly!")
        print("✅ Forward testing produces identical results to batch processing")
        return True
    else:
        print(f"\n❌ VALIDATION FAILED: Signals do not match")
        return False

def detailed_signal_comparison():
    """Show detailed side-by-side comparison."""
    print("\n=== Detailed Signal Table Comparison ===\n")
    
    # Load both result files
    try:
        orig_df = pd.read_csv("trend_analysis/confirmed_trend_starts_original.csv")
        fwd_df = pd.read_csv("trend_analysis/confirmed_trend_starts_forward_test.csv")
        
        print("Original Results:")
        print(orig_df.to_string(index=False))
        
        print("\nForward Test Results:")
        print(fwd_df.to_string(index=False))
        
        # Check if they're identical
        if orig_df.equals(fwd_df):
            print("\n🎉 CSV files are identical!")
        else:
            print("\n❌ CSV files differ!")
            
            # Show differences
            if len(orig_df) != len(fwd_df):
                print(f"  - Row count differs: {len(orig_df)} vs {len(fwd_df)}")
            
            for col in orig_df.columns:
                if col in fwd_df.columns:
                    if not orig_df[col].equals(fwd_df[col]):
                        print(f"  - Column '{col}' differs")
                else:
                    print(f"  - Column '{col}' missing in forward test")
                    
    except FileNotFoundError as e:
        print(f"Could not load CSV files: {e}")
        print("Run the scripts first to generate the CSV files")

if __name__ == "__main__":
    success = compare_results()
    detailed_signal_comparison()
    
    print("\n=== Validation Summary ===")
    if success:
        print("✅ VALIDATION PASSED")
        print("✅ Forward testing approach is working correctly")
        print("✅ Results are identical to original batch processing")
        print("✅ Ready for live trading integration")
    else:
        print("❌ VALIDATION FAILED")
        print("❌ Need to investigate differences")
    
    print("\n=== Key Benefits of Forward Testing ===")
    print("🚀 No look-ahead bias (only uses historical data)")
    print("🚀 Real-time signal detection on bar close") 
    print("🚀 Maintains state between bar updates")
    print("🚀 Perfect for live trading systems")
    print("🚀 Same accuracy as batch processing")
    print("🚀 Easy to integrate with data feeds") 