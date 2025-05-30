#!/usr/bin/env python3
"""
Debug script to compare 1d trend starts from trend_start_finder.py
with the reference CSV file.
"""

import sys
import os
import pandas as pd
import json
from datetime import datetime, timezone
import logging

# Add project root to path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

# Import trend start logic
from src.strategies.trend_start_finder import generate_trend_starts

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def load_reference_csv(csv_path):
    """Load the reference trend starts CSV."""
    try:
        df = pd.read_csv(csv_path)
        df['date'] = pd.to_datetime(df['date'])
        return df
    except Exception as e:
        logger.error(f"Failed to load reference CSV: {e}")
        return None

def create_sample_1d_bars():
    """Create sample 1d bars for testing - this should be replaced with actual data."""
    # This is just sample data - you'll need to replace with actual 1d bars
    dates = pd.date_range('2025-03-17', periods=50, freq='D')
    
    bars = []
    base_price = 100.0
    for i, date in enumerate(dates):
        # Simple price progression for testing
        price_change = (i % 5 - 2) * 0.5  # Creates some up/down movement
        open_price = base_price + price_change
        high_price = open_price + abs(price_change) + 0.2
        low_price = open_price - abs(price_change) - 0.2
        close_price = open_price + price_change * 0.8
        
        bars.append({
            'timestamp': date.isoformat(),
            'open': open_price,
            'high': high_price,
            'low': low_price,
            'close': close_price,
            'volume': 1000 + i * 10
        })
        
        base_price = close_price
    
    return pd.DataFrame(bars)

def get_actual_1d_bars_from_api():
    """
    Load actual 1d bars from the CSV file that was used to generate the reference trend starts.
    """
    csv_path = "trend_analysis/data/CON.F.US.MES.M25_1d_ohlc.csv"
    try:
        df = pd.read_csv(csv_path)
        logger.info(f"Loaded actual 1d data from {csv_path} with {len(df)} bars")
        
        # Convert to the format expected by generate_trend_starts
        bars = []
        for _, row in df.iterrows():
            bars.append({
                'timestamp': row['timestamp'],
                'open': float(row['open']),
                'high': float(row['high']),
                'low': float(row['low']),
                'close': float(row['close']),
                'volume': float(row['volume'])
            })
        
        result_df = pd.DataFrame(bars)
        logger.info(f"Converted to DataFrame with columns: {list(result_df.columns)}")
        logger.info(f"Date range: {result_df['timestamp'].iloc[0]} to {result_df['timestamp'].iloc[-1]}")
        
        return result_df
        
    except Exception as e:
        logger.error(f"Failed to load actual 1d data: {e}")
        logger.warning("Falling back to sample data")
        return create_sample_1d_bars()

def compare_signals_to_reference(generated_signals, reference_df):
    """Compare generated signals to reference CSV."""
    logger.info("===== SIGNAL COMPARISON =====")
    
    # Convert generated signals to comparable format
    generated_df = pd.DataFrame(generated_signals)
    if generated_df.empty:
        logger.warning("No signals generated!")
        return
    
    logger.info(f"Generated {len(generated_signals)} signals")
    logger.info(f"Reference has {len(reference_df)} signals")
    
    # Print generated signals with correct bar indices
    logger.info("Generated signals:")
    for i, signal in enumerate(generated_signals):
        # Extract correct bar index - try details first, then top-level
        bar_index = signal.get('details', {}).get('confirmed_signal_bar_index', signal.get('bar_index', 0))
        signal_type = signal.get('signal_type', '')
        timestamp = signal.get('timestamp', 'N/A')
        logger.info(f"  Signal {i+1}: {signal_type} at bar {bar_index} on {timestamp}")
    
    # Print reference signals
    logger.info("Reference signals:")
    for i, row in reference_df.iterrows():
        logger.info(f"  Reference {i+1}: {row['trend_start_type']} at bar {row['bar_index']} on {row['date']}")
    
    # Try to match signals with detailed comparison
    matches = 0
    for i, signal in enumerate(generated_signals):
        # Look for matching signal in reference
        signal_type = signal.get('signal_type', '')
        # Get correct bar index from details or top-level
        bar_index = signal.get('details', {}).get('confirmed_signal_bar_index', signal.get('bar_index', 0))
        
        # Convert signal type to reference format
        ref_type = None
        if signal_type in ['CUS', 'uptrend_start']:
            ref_type = 'uptrend'
        elif signal_type in ['CDS', 'downtrend_start']:
            ref_type = 'downtrend'
        
        if ref_type:
            matching_ref = reference_df[
                (reference_df['trend_start_type'] == ref_type) & 
                (reference_df['bar_index'] == bar_index)
            ]
            if not matching_ref.empty:
                matches += 1
                logger.info(f"✓ Match found: {signal_type} at bar {bar_index}")
            else:
                logger.warning(f"✗ No match for: {signal_type} at bar {bar_index}")
                # Find closest matches by type
                same_type_refs = reference_df[reference_df['trend_start_type'] == ref_type]
                if not same_type_refs.empty:
                    closest_bars = same_type_refs['bar_index'].tolist()
                    logger.info(f"    Reference {ref_type} signals at bars: {closest_bars}")
    
    logger.info(f"Matches: {matches}/{len(generated_signals)} ({matches/len(generated_signals)*100:.1f}%)")
    
    # Additional analysis - show which reference signals don't have matches
    logger.info("===== MISSING FROM GENERATED =====")
    for i, ref_row in reference_df.iterrows():
        ref_type = ref_row['trend_start_type']
        ref_bar = ref_row['bar_index']
        
        # Convert to signal type format
        gen_signal_type = 'uptrend_start' if ref_type == 'uptrend' else 'downtrend_start'
        
        # Look for this in generated signals
        found = False
        for signal in generated_signals:
            signal_type = signal.get('signal_type', '')
            bar_index = signal.get('details', {}).get('confirmed_signal_bar_index', signal.get('bar_index', 0))
            if signal_type == gen_signal_type and bar_index == ref_bar:
                found = True
                break
        
        if not found:
            logger.warning(f"✗ Reference signal missing: {ref_type} at bar {ref_bar} on {ref_row['date']}")
    
    # Show difference in bar indices for same type signals
    logger.info("===== BAR INDEX COMPARISON =====")
    gen_uptrends = []
    gen_downtrends = []
    
    for signal in generated_signals:
        signal_type = signal.get('signal_type', '')
        bar_index = signal.get('details', {}).get('confirmed_signal_bar_index', signal.get('bar_index', 0))
        
        if signal_type == 'uptrend_start':
            gen_uptrends.append(bar_index)
        elif signal_type == 'downtrend_start':
            gen_downtrends.append(bar_index)
    
    ref_uptrends = reference_df[reference_df['trend_start_type'] == 'uptrend']['bar_index'].tolist()
    ref_downtrends = reference_df[reference_df['trend_start_type'] == 'downtrend']['bar_index'].tolist()
    
    logger.info(f"Generated uptrend bars: {sorted(gen_uptrends)}")
    logger.info(f"Reference uptrend bars: {sorted(ref_uptrends)}")
    logger.info(f"Generated downtrend bars: {sorted(gen_downtrends)}")
    logger.info(f"Reference downtrend bars: {sorted(ref_downtrends)}")

def main():
    logger.info("===== 1D TREND START DEBUG SCRIPT =====")
    
    # Load reference CSV
    reference_csv_path = "trend_analysis/confirmed_trend_starts_og_fixed_1d.csv"
    reference_df = load_reference_csv(reference_csv_path)
    
    if reference_df is None:
        logger.error("Could not load reference CSV. Exiting.")
        return
    
    logger.info(f"Loaded reference CSV with {len(reference_df)} trend starts")
    
    # Get 1d bars (this should match what the frontend sends)
    bars_df = get_actual_1d_bars_from_api()
    logger.info(f"Got {len(bars_df)} 1d bars for analysis")
    
    # Run trend start analysis
    logger.info("Running trend start analysis...")
    try:
        signals, debug_logs = generate_trend_starts(
            bars_df=bars_df,
            contract_id='CON.F.US.MES.M25',  # Match the contract from frontend
            timeframe_str='1d',
            debug=True
        )
        
        logger.info(f"Analysis complete. Generated {len(signals)} signals, {len(debug_logs)} debug logs.")
        
        # Compare results
        compare_signals_to_reference(signals, reference_df)
        
        # Print debug logs if available
        if debug_logs:
            logger.info("Debug logs (first 10):")
            for i, log_entry in enumerate(debug_logs[:10]):
                logger.info(f"  Debug {i+1}: {log_entry}")
        
    except Exception as e:
        logger.error(f"Error running trend analysis: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main() 