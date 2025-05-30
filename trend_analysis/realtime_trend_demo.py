#!/usr/bin/env python3
"""
Real-time Trend Analysis Demonstration

This script shows how to use the ForwardTrendAnalyzer for real-time processing
of price bars as they arrive, simulating live trading conditions where you only
have access to historical data up to the current moment.

Key Features:
- Process bars one at a time as they arrive
- Only use historical data (no look-ahead bias)
- Get immediate signal detection on bar close
- Maintain persistent state between bars
- Perfect for integration with live trading systems
"""

import sys
import os
from typing import List

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from trend_analysis.trend_start_forward_test import ForwardTrendAnalyzer
from trend_analysis.trend_models import Bar
import trend_analysis.trend_utils as trend_utils

def simulate_realtime_processing():
    """
    Demonstrates real-time processing of bars using ForwardTrendAnalyzer.
    This simulates how you would process bars in a live trading environment.
    """
    print("=== Real-Time Trend Analysis Demo ===\n")
    
    # Initialize the analyzer for a specific contract and timeframe
    analyzer = ForwardTrendAnalyzer(contract_id="CON.F.US.MES.M25", timeframe_str="1D")
    
    # Load historical data (in real trading, bars would arrive via data feed)
    print("Loading historical bars to simulate real-time arrival...")
    all_bars = trend_utils.load_bars_from_alt_csv(
        filename="trend_analysis/data/CON.F.US.MES.M25_1d_ohlc.csv", 
        BarClass=Bar
    )
    
    if not all_bars:
        print("Error: Could not load bars")
        return
    
    print(f"Simulating real-time processing of {len(all_bars)} bars...\n")
    
    # Process bars one by one as they would arrive in real-time
    total_signals = 0
    
    for i, bar in enumerate(all_bars):
        # This is what you would call when a new bar completes in real trading
        new_signals = analyzer.process_new_bar(bar)
        
        # Log each bar processing
        print(f"Bar {i+1:2d} ({bar.date[:10]}) | OHLC: {bar.o:7.2f} {bar.h:7.2f} {bar.l:7.2f} {bar.c:7.2f}", end="")
        
        if new_signals:
            total_signals += len(new_signals)
            print(f" -> {len(new_signals)} SIGNAL(S) DETECTED!")
            
            for signal in new_signals:
                signal_type = signal['signal_type'].replace('_start', '').upper()
                confirmed_bar = signal['details']['confirmed_signal_bar_index']
                rule = signal['details']['rule_type']
                price = signal['signal_price']
                
                print(f"    📈 {signal_type} START confirmed at Bar {confirmed_bar} | Price: {price} | Rule: {rule}")
                
                # In a real trading system, you would:
                # - Send trade signals to your execution engine
                # - Update position management
                # - Log to your trading database
                # - Send alerts/notifications
                
        else:
            print(" -> No signals")
    
    print(f"\n=== Summary ===")
    print(f"Total bars processed: {len(all_bars)}")
    print(f"Total signals generated: {total_signals}")
    
    # Get final signal summary
    all_signals = analyzer.get_all_signals()
    print(f"Final unique signals: {len(all_signals)}")
    
    print("\n=== All Detected Trend Starts ===")
    for i, signal in enumerate(all_signals, 1):
        signal_type = signal['signal_type'].replace('_start', '').upper()
        bar_idx = signal['details']['confirmed_signal_bar_index']
        date = signal['details']['confirmed_signal_bar_date'][:10]
        price = signal['signal_price']
        rule = signal['details']['rule_type']
        
        print(f"{i:2d}. Bar {bar_idx:2d} ({date}) | {signal_type:8s} | Price: {price:7.2f} | {rule}")

def demonstrate_incremental_analysis():
    """
    Shows how the analyzer can be used incrementally, adding bars over time.
    This is useful for scenarios where you want to analyze data as it becomes available.
    """
    print("\n=== Incremental Analysis Demo ===\n")
    
    analyzer = ForwardTrendAnalyzer(contract_id="DEMO", timeframe_str="1D")
    
    # Load some sample bars
    all_bars = trend_utils.load_bars_from_alt_csv(
        filename="trend_analysis/data/CON.F.US.MES.M25_1d_ohlc.csv", 
        BarClass=Bar
    )
    
    # Process first 10 bars
    print("Processing first 10 bars...")
    for i in range(min(10, len(all_bars))):
        signals = analyzer.process_new_bar(all_bars[i])
        if signals:
            print(f"  Bar {i+1}: {len(signals)} signal(s) detected")
    
    print(f"Signals after 10 bars: {len(analyzer.get_all_signals())}")
    
    # Process next 10 bars
    print("\nProcessing next 10 bars...")
    for i in range(10, min(20, len(all_bars))):
        signals = analyzer.process_new_bar(all_bars[i])
        if signals:
            print(f"  Bar {i+1}: {len(signals)} signal(s) detected")
    
    print(f"Total signals after 20 bars: {len(analyzer.get_all_signals())}")
    
    # Show state persistence
    print(f"\nAnalyzer state:")
    print(f"  - Bars processed: {len(analyzer.historical_bars)}")
    print(f"  - Current trend: {analyzer.state.last_confirmed_trend_type}")
    print(f"  - Last trend bar: {analyzer.state.last_confirmed_trend_bar_index}")

def live_trading_integration_example():
    """
    Example of how to integrate with a live trading system.
    """
    print("\n=== Live Trading Integration Example ===\n")
    
    class LiveTradingSystem:
        def __init__(self):
            self.trend_analyzer = ForwardTrendAnalyzer(contract_id="ES", timeframe_str="1D")
            self.position = None  # None, 'long', or 'short'
            
        def on_bar_complete(self, new_bar: Bar):
            """Called when a new bar completes in live trading."""
            print(f"New bar: {new_bar.date} | Close: {new_bar.c}")
            
            # Process the new bar for trend signals
            signals = self.trend_analyzer.process_new_bar(new_bar)
            
            # Handle any new signals
            for signal in signals:
                self.handle_trend_signal(signal)
        
        def handle_trend_signal(self, signal):
            """Handle a new trend start signal."""
            signal_type = signal['signal_type']
            price = signal['signal_price']
            rule = signal['details']['rule_type']
            
            print(f"🚨 TREND SIGNAL: {signal_type} at {price} (Rule: {rule})")
            
            # Example trading logic
            if signal_type == 'uptrend_start' and self.position != 'long':
                print(f"   -> Entering LONG position at {price}")
                self.position = 'long'
                
            elif signal_type == 'downtrend_start' and self.position != 'short':
                print(f"   -> Entering SHORT position at {price}")
                self.position = 'short'
    
    # Simulate live trading
    trading_system = LiveTradingSystem()
    
    # Simulate a few bars arriving
    sample_bars = trend_utils.load_bars_from_alt_csv(
        filename="trend_analysis/data/CON.F.US.MES.M25_1d_ohlc.csv", 
        BarClass=Bar
    )[:15]  # Just first 15 bars for demo
    
    print("Simulating live bars arriving...")
    for bar in sample_bars:
        trading_system.on_bar_complete(bar)
    
    print(f"\nFinal position: {trading_system.position}")

if __name__ == "__main__":
    # Run all demonstrations
    simulate_realtime_processing()
    demonstrate_incremental_analysis()
    live_trading_integration_example()
    
    print("\n=== Demo Complete ===")
    print("The ForwardTrendAnalyzer is ready for integration with live trading systems!")
    print("Key benefits:")
    print("  ✓ No look-ahead bias")
    print("  ✓ Real-time signal detection")
    print("  ✓ Persistent state management")
    print("  ✓ Identical results to batch processing")
    print("  ✓ Easy integration with trading systems") 