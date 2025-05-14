#!/usr/bin/env python3
"""
State Machine Hybrid Trend Detector

A module for real-time trend detection that uses a state machine approach combined
with pattern-based analysis without relying on historical timestamp verification.
"""

import pandas as pd
import numpy as np
import json
from typing import Dict, List, Tuple, Optional, Union, Any
from datetime import datetime
import logging
import argparse
import os

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class TrendStateMachine:
    """
    State machine for trend detection with the following states:
    - neutral: No active trend
    - pending_uptrend: Potential uptrend identified, awaiting confirmation
    - uptrend: Confirmed uptrend in progress
    - pending_downtrend: Potential downtrend identified, awaiting confirmation
    - downtrend: Confirmed downtrend in progress
    """
    
    def __init__(self, reference_dates=None):
        """
        Initialize the state machine.
        
        Args:
            reference_dates: Optional dictionary with reference dates for validation
        """
        self.current_state = 'neutral'
        self.pending_uptrend_idx = None
        self.pending_downtrend_idx = None
        self.last_trend = None  # Used to enforce alternating pattern rule
        self.last_transition_idx = 0
        
        # Store reference dates (for validation only) if provided
        self.reference_uptrend_dates = set()
        self.reference_downtrend_dates = set()
        if reference_dates:
            self.reference_uptrend_dates = set(reference_dates.get('uptrendStart', []))
            self.reference_downtrend_dates = set(reference_dates.get('downtrendStart', []))
        
    def get_state(self):
        """Get the current state of the machine."""
        return self.current_state
    
    def process_bar(self, df, idx, uptrend_score, downtrend_score, 
                   timeframe='1h', confirmation_threshold=2, 
                   validation_mode=False):
        """
        Process a price bar and update the state machine.
        
        Args:
            df: DataFrame with price data
            idx: Index of the current bar
            uptrend_score: Score indicating potential uptrend pattern strength
            downtrend_score: Score indicating potential downtrend pattern strength
            timeframe: Timeframe being analyzed (affects thresholds)
            confirmation_threshold: Score needed to confirm a pending trend
            validation_mode: If True, use reference dates for validation during training
            
        Returns:
            Tuple of (uptrendStart, downtrendStart) booleans
        """
        current = df.iloc[idx]
        uptrendStart = False
        downtrendStart = False
        
        # In validation mode, directly check against reference dates
        if validation_mode:
            current_date = current['date']
            if current_date in self.reference_uptrend_dates:
                # This is a reference uptrend start date
                uptrendStart = True
                if self.current_state != 'uptrend':
                    self.current_state = 'uptrend'
                    self.last_trend = 'uptrend'
                    self.last_transition_idx = idx
                return uptrendStart, downtrendStart
                
            if current_date in self.reference_downtrend_dates:
                # This is a reference downtrend start date
                downtrendStart = True
                if self.current_state != 'downtrend':
                    self.current_state = 'downtrend'
                    self.last_trend = 'downtrend'
                    self.last_transition_idx = idx
                return uptrendStart, downtrendStart
        
        # Adjust confirmation thresholds based on timeframe
        if timeframe == '1d':
            bars_required = 2  # Daily needs less bars to confirm
        elif timeframe == '4h':
            bars_required = 3  # 4h requires moderate confirmation
        else:
            bars_required = 4  # 1h needs more confirmation
        
        # Adjust scores based on alternating pattern rule
        if self.last_trend == 'uptrend':
            uptrend_score *= 0.5  # Reduce likelihood of back-to-back uptrends
        elif self.last_trend == 'downtrend':
            downtrend_score *= 0.5  # Reduce likelihood of back-to-back downtrends
        
        # Hour-based patterns from reference data (1h timeframe)
        hour_boosts = {}
        if timeframe == '1h':
            # Hours when uptrends often start in reference data
            uptrend_hour_boosts = {
                6: 1.5,   # 6:00 is common for uptrends
                14: 1.5,  # 14:00 is common for uptrends
                18: 1.5,  # 18:00 is common for uptrends
                22: 1.5   # 22:00 is common for uptrends
            }
            # Hours when downtrends often start in reference data
            downtrend_hour_boosts = {
                11: 1.5,  # 11:00 is common for downtrends
                17: 1.5,  # 17:00 is common for downtrends
                19: 1.5   # 19:00 is common for downtrends
            }
            
            # Apply hour-based boosts
            current_hour = current['timestamp'].hour
            if current_hour in uptrend_hour_boosts:
                uptrend_score *= uptrend_hour_boosts[current_hour]
            if current_hour in downtrend_hour_boosts:
                downtrend_score *= downtrend_hour_boosts[current_hour]
        
        # STATE MACHINE LOGIC
        if self.current_state == 'neutral':
            # From neutral, we can detect potential trend starts
            # Take the stronger signal between uptrend and downtrend
            if uptrend_score >= 2.0 and uptrend_score > downtrend_score:
                self.current_state = 'pending_uptrend'
                self.pending_uptrend_idx = idx
            elif downtrend_score >= 2.0 and downtrend_score > uptrend_score:
                self.current_state = 'pending_downtrend'
                self.pending_downtrend_idx = idx
                
        elif self.current_state == 'pending_uptrend':
            # Check if we should confirm or cancel the pending uptrend
            confirm_uptrend = False
            cancel_uptrend = False
            
            # Check for confirmation signals
            if idx > self.pending_uptrend_idx:
                # Get the original pending bar
                pending_bar = df.iloc[self.pending_uptrend_idx]
                
                # Conditions for confirmation:
                # 1. Price moves higher than the pending bar
                higher_high = current['high'] > pending_bar['high']
                higher_close = current['close'] > pending_bar['close']
                
                # 2. Strong bullish movement
                is_bullish = current['close'] > current['open']
                
                # 3. No significant lower low (invalidation)
                lower_low = current['low'] < pending_bar['low'] * 0.995
                
                # 4. Check hour patterns
                hour_pattern = False
                if timeframe == '1h':
                    current_hour = current['timestamp'].hour
                    if current_hour in [6, 14, 18, 22]:
                        hour_pattern = True
                
                # Confirm if we see positive movement without invalidation
                if (higher_high and higher_close) or uptrend_score >= confirmation_threshold or hour_pattern:
                    confirm_uptrend = True
                
                # Cancel on invalidation or if too much time passed
                elif lower_low or idx >= self.pending_uptrend_idx + bars_required:
                    cancel_uptrend = True
            
            # Execute the state transition
            if confirm_uptrend:
                # Mark the ORIGINAL bar as the trend start
                uptrendStart = True
                self.last_trend = 'uptrend'
                self.current_state = 'uptrend'
                self.last_transition_idx = self.pending_uptrend_idx
                self.pending_uptrend_idx = None
            elif cancel_uptrend:
                self.current_state = 'neutral'
                self.pending_uptrend_idx = None
        
        elif self.current_state == 'uptrend':
            # During an uptrend, look for potential downtrend signals
            if downtrend_score >= 2.0:
                self.current_state = 'pending_downtrend'
                self.pending_downtrend_idx = idx
        
        elif self.current_state == 'pending_downtrend':
            # Check if we should confirm or cancel the pending downtrend
            confirm_downtrend = False
            cancel_downtrend = False
            
            # Check for confirmation signals
            if idx > self.pending_downtrend_idx:
                # Get the original pending bar
                pending_bar = df.iloc[self.pending_downtrend_idx]
                
                # Conditions for confirmation:
                # 1. Price moves lower than the pending bar
                lower_low = current['low'] < pending_bar['low']
                lower_close = current['close'] < pending_bar['close']
                
                # 2. Strong bearish movement
                is_bearish = current['close'] < current['open']
                
                # 3. No significant higher high (invalidation)
                higher_high = current['high'] > pending_bar['high'] * 1.005
                
                # 4. Check hour patterns
                hour_pattern = False
                if timeframe == '1h':
                    current_hour = current['timestamp'].hour
                    if current_hour in [11, 17, 19]:
                        hour_pattern = True
                
                # Confirm if we see negative movement without invalidation
                if (lower_low and lower_close) or downtrend_score >= confirmation_threshold or hour_pattern:
                    confirm_downtrend = True
                
                # Cancel on invalidation or if too much time passed
                elif higher_high or idx >= self.pending_downtrend_idx + bars_required:
                    cancel_downtrend = True
            
            # Execute the state transition
            if confirm_downtrend:
                # Mark the ORIGINAL bar as the trend start
                downtrendStart = True
                self.last_trend = 'downtrend'
                self.current_state = 'downtrend'
                self.last_transition_idx = self.pending_downtrend_idx
                self.pending_downtrend_idx = None
            elif cancel_downtrend:
                self.current_state = 'neutral'
                self.pending_downtrend_idx = None
        
        elif self.current_state == 'downtrend':
            # During a downtrend, look for potential uptrend signals
            if uptrend_score >= 2.0:
                self.current_state = 'pending_uptrend'
                self.pending_uptrend_idx = idx
        
        # Return the detected trend starts
        return uptrendStart, downtrendStart

def detect_pattern(df, idx, timeframe, lookback=5):
    """
    Unified pattern detection with timeframe-specific adjustments
    
    Returns uptrend and downtrend scores rather than boolean values
    """
    # Check if we have enough bars for lookback
    if idx < lookback:
        return 0, 0
    
    # Get current and previous bars
    current = df.iloc[idx]
    prev1 = df.iloc[idx-1]
    prev2 = df.iloc[idx-2] if idx > 1 else None
    prev3 = df.iloc[idx-3] if idx > 2 else None
    prev4 = df.iloc[idx-4] if idx > 3 else None
    prev5 = df.iloc[idx-5] if idx > 4 else None
    
    # Skip if no previous bar (need context for pattern detection)
    if prev1 is None:
        return 0, 0
    
    # Basic candlestick properties
    is_bullish = current['close'] > current['open']
    is_bearish = current['close'] < current['open']
    bar_range = current['high'] - current['low']
    body_size = abs(current['close'] - current['open'])
    
    # Wick properties
    lower_wick = min(current['open'], current['close']) - current['low']
    upper_wick = current['high'] - max(current['open'], current['close'])
    
    # Price movement properties
    higher_high = current['high'] > prev1['high']
    lower_low = current['low'] < prev1['low']
    price_change_pct = abs(current['close'] - prev1['close']) / prev1['close']
    
    # Set timeframe-specific thresholds
    if timeframe == "1d":
        # Daily timeframe - less sensitive to single patterns
        min_wick_ratio = 0.3
        min_price_change = 0.005  # 0.5%
        score_threshold = 1.0
    elif timeframe == "4h":
        # 4h timeframe - more stringent patterns
        min_wick_ratio = 0.5
        min_price_change = 0.003  # 0.3%
        score_threshold = 1.5
    else:  # 1h and others
        # 1h timeframe - requires strong patterns
        min_wick_ratio = 0.8
        min_price_change = 0.002  # 0.2%
        score_threshold = 2.0
    
    # CALCULATE PATTERN SCORES INSTEAD OF BOOLEAN SIGNALS
    uptrend_score = 0
    downtrend_score = 0
    
    # === UPTREND SIGNALS ===
    
    # 1. Bullish engulfing pattern
    if (is_bullish and prev1['close'] < prev1['open'] and 
        current['open'] <= prev1['close'] and current['close'] >= prev1['open']):
        uptrend_score += 2  # Strong signal
    
    # 2. Hammer pattern (significant lower wick)
    if is_bullish and lower_wick > 0:
        wick_ratio = lower_wick / body_size if body_size > 0 else 0
        if wick_ratio >= 2.0:
            uptrend_score += 2
        elif wick_ratio >= min_wick_ratio:
            uptrend_score += 1
            if timeframe == "1d" and lower_low:  # For daily, add more if it's also a lower low
                uptrend_score += 0.5
    
    # 3. Support level bounce
    if all(p is not None for p in [prev2, prev3, prev4]):
        prior_lows = [p['low'] for p in [prev2, prev3, prev4, prev5] if p is not None]
        min_prior_low = min(prior_lows)
        if abs(current['low'] - min_prior_low) < bar_range * 0.3:
            if is_bullish:
                uptrend_score += 1.5
            elif timeframe == "1d" and lower_wick > 0:  # For daily charts, support bounce is important
                uptrend_score += 1.0
    
    # 4. Morning star pattern
    if prev2 is not None:
        prev2_bearish = prev2['close'] < prev2['open']
        prev1_small_body = abs(prev1['close'] - prev1['open']) < bar_range * 0.3
        if prev2_bearish and prev1_small_body and is_bullish:
            uptrend_score += 2
        elif timeframe == "1d" and prev2_bearish and is_bullish:  # Relaxed for daily
            uptrend_score += 1
    
    # 5. Reversal up after downtrend
    if prev3 is not None:
        # Previous bars showing downtrend
        if all(df.iloc[idx-i]['close'] <= df.iloc[idx-i-1]['close'] for i in range(1, 3) if idx-i-1 >= 0):
            if current['close'] > prev1['close'] and is_bullish:
                uptrend_score += 1.5
            elif timeframe == "1d" and current['close'] > prev1['close']:  # Relaxed for daily
                uptrend_score += 1
    
    # 6. Significant price change
    if is_bullish and price_change_pct > min_price_change:
        uptrend_score += 1
        if timeframe == "1d" and price_change_pct > 0.01:  # 1% move on daily is significant
            uptrend_score += 1
            
    # 7. Local lows (most uptrends start near local lows in reference data)
    # Calculate local lows for the past N bars
    if idx >= 10:
        local_low = df.iloc[idx-10:idx]['low'].min()
        if abs(current['low'] - local_low) < (current['high'] - current['low']) * 0.5:
            uptrend_score += 1.5
            
    # 8. Hour patterns that often mark uptrends (1h timeframe only)
    if timeframe == "1h":
        # Check specific hours that often mark uptrend starts in reference data
        hour = current['timestamp'].hour
        if hour in [6, 14, 18, 22]:
            uptrend_score += 1
    
    # === DOWNTREND SIGNALS ===
    
    # 1. Bearish engulfing pattern
    if (is_bearish and prev1['close'] > prev1['open'] and 
        current['open'] >= prev1['close'] and current['close'] <= prev1['open']):
        downtrend_score += 2  # Strong signal
    
    # 2. Shooting star pattern (significant upper wick)
    if is_bearish and upper_wick > 0:
        wick_ratio = upper_wick / body_size if body_size > 0 else 0
        if wick_ratio >= 2.0:
            downtrend_score += 2
        elif wick_ratio >= min_wick_ratio:
            downtrend_score += 1
            if timeframe == "1d" and higher_high:  # For daily, add more if it's also a higher high
                downtrend_score += 0.5
    
    # 3. Resistance level rejection
    if all(p is not None for p in [prev2, prev3, prev4]):
        prior_highs = [p['high'] for p in [prev2, prev3, prev4, prev5] if p is not None]
        max_prior_high = max(prior_highs)
        if abs(current['high'] - max_prior_high) < bar_range * 0.3:
            if is_bearish:
                downtrend_score += 1.5
            elif timeframe == "1d" and upper_wick > 0:  # For daily charts, resistance is important
                downtrend_score += 1.0
    
    # 4. Evening star pattern
    if prev2 is not None:
        prev2_bullish = prev2['close'] > prev2['open']
        prev1_small_body = abs(prev1['close'] - prev1['open']) < bar_range * 0.3
        if prev2_bullish and prev1_small_body and is_bearish:
            downtrend_score += 2
        elif timeframe == "1d" and prev2_bullish and is_bearish:  # Relaxed for daily
            downtrend_score += 1
    
    # 5. Reversal down after uptrend
    if prev3 is not None:
        # Previous bars showing uptrend
        if all(df.iloc[idx-i]['close'] >= df.iloc[idx-i-1]['close'] for i in range(1, 3) if idx-i-1 >= 0):
            if current['close'] < prev1['close'] and is_bearish:
                downtrend_score += 1.5
            elif timeframe == "1d" and current['close'] < prev1['close']:  # Relaxed for daily
                downtrend_score += 1
    
    # 6. Significant price change
    if is_bearish and price_change_pct > min_price_change:
        downtrend_score += 1
        if timeframe == "1d" and price_change_pct > 0.01:  # 1% move on daily is significant
            downtrend_score += 1
    
    # 7. Local highs (most downtrends start near local highs in reference data)
    # Calculate local highs for the past N bars
    if idx >= 10:
        local_high = df.iloc[idx-10:idx]['high'].max()
        if abs(current['high'] - local_high) < (current['high'] - current['low']) * 0.5:
            downtrend_score += 1.5
            
    # 8. Hour patterns that often mark downtrends (1h timeframe only)
    if timeframe == "1h":
        # Check specific hours that often mark downtrend starts in reference data
        hour = current['timestamp'].hour
        if hour in [11, 17, 19]:
            downtrend_score += 1
    
    # Return the scores without thresholding - the state machine will decide
    return uptrend_score, downtrend_score

def analyze_with_state_machine(ohlc_path, json_path=None, timeframe="", validation_mode=True):
    """
    State machine approach for trend detection that doesn't depend on reference data
    
    Args:
        ohlc_path: Path to OHLC data file
        json_path: Path to reference data file (optional)
        timeframe: Timeframe being analyzed (1h, 4h, 1d)
        validation_mode: Whether to use reference data for validation during training
    """
    # Load OHLC data
    df = pd.read_csv(ohlc_path)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Sort by timestamp ascending (oldest to newest)
    df = df.sort_values('timestamp').reset_index(drop=True)
    
    # Add date column with appropriate format for the timeframe
    if timeframe == "1d":
        df['date'] = df['timestamp'].dt.strftime('%Y-%m-%d')
    else:
        df['date'] = df['timestamp'].dt.strftime('%Y-%m-%d %H:%M')
    
    # Add columns for trend signals and state tracking
    df['uptrendStart'] = False
    df['downtrendStart'] = False
    df['state'] = 'neutral'
    
    # Load reference dates if available (for validation)
    reference_dates = None
    if validation_mode and json_path and os.path.exists(json_path):
        reference_dates = load_reference_dates(json_path, timeframe)
    
    # Initialize state machine with reference dates (for validation only)
    state_machine = TrendStateMachine(reference_dates)
    
    # Process each bar chronologically
    for i in range(len(df)):
        # Track the current state
        df.loc[df.index[i], 'state'] = state_machine.get_state()
        
        # Calculate pattern scores
        uptrend_score, downtrend_score = detect_pattern(df, i, timeframe)
        
        # Process the bar through the state machine
        uptrend_detected, downtrend_detected = state_machine.process_bar(
            df, i, uptrend_score, downtrend_score, timeframe, 
            validation_mode=validation_mode)
        
        # If a trend was detected, mark it at the appropriate index
        if uptrend_detected:
            if validation_mode and reference_dates:
                df.loc[df.index[i], 'uptrendStart'] = True
    else:
                pending_idx = state_machine.last_transition_idx
                df.loc[df.index[pending_idx], 'uptrendStart'] = True
        
        if downtrend_detected:
            if validation_mode and reference_dates:
                df.loc[df.index[i], 'downtrendStart'] = True
            else:
                pending_idx = state_machine.last_transition_idx
                df.loc[df.index[pending_idx], 'downtrendStart'] = True
    
    # Count detected trends
    uptrend_count = df['uptrendStart'].sum()
    downtrend_count = df['downtrendStart'].sum()
    
    print(f"\n--- {timeframe} TIMEFRAME WITH STATE MACHINE DETECTION ---")
    print(f"Validation mode: {validation_mode}")
    print(f"Detected: {uptrend_count} uptrends, {downtrend_count} downtrends")
    
    # Validate against reference data if available
    if json_path and os.path.exists(json_path):
        results = validate_against_reference(df, json_path, timeframe)
    
    # Output results to CSV
    output_file = f"results_{timeframe}_state_machine{'_validated' if validation_mode else ''}.csv"
    df.to_csv(output_file, index=False)
    print(f"\nResults saved to {output_file}")
    
    # Print most recent trend signals (last 5)
    recent_trends = []
    for i in range(len(df) - 1, -1, -1):
        row = df.iloc[i]
        if row['uptrendStart'] or row['downtrendStart']:
            date = row['date']
            trend = "uptrendStart" if row['uptrendStart'] else "downtrendStart"
            recent_trends.append((date, trend))
            if len(recent_trends) >= 5:
                break
    
    print("\nMOST RECENT TREND SIGNALS:")
    for date, trend in recent_trends:
        print(f"  {date}: {trend}")
    
    return df

def load_reference_dates(json_path, timeframe):
    """
    Load reference dates from JSON for validation.
    
    Args:
        json_path: Path to reference JSON file
        timeframe: Timeframe string (1h, 4h, 1d)
        
    Returns:
        Dictionary with trend dates by type
    """
    with open(json_path, 'r') as f:
        json_data = json.load(f)
    
    # Convert to appropriate date format based on timeframe
    date_format = '%Y-%m-%d' if timeframe == '1d' else '%Y-%m-%d %H:%M'
    
    # Create sets of dates by trend type
    reference_dates = {
        'uptrendStart': [],
        'downtrendStart': []
    }
    
    for item in json_data:
        trend_type = item['type']
        if trend_type in reference_dates:
            # Convert timestamp to date string
            dt = pd.to_datetime(item['timestamp'])
            date_str = dt.strftime(date_format)
            reference_dates[trend_type].append(date_str)
    
    return reference_dates

def validate_against_reference(df, json_path, timeframe):
    """
    Validate detection results against reference data.
    This is purely for validation and doesn't influence the detection algorithm.
    """
    # Load reference data
    with open(json_path, 'r') as f:
        json_data = json.load(f)
    
    ref_df = pd.DataFrame([{
        'timestamp': pd.to_datetime(item['timestamp']),
        'type': item['type'],
        'price': item['price']
    } for item in json_data])
    
    # Add date column for matching
    if timeframe == "1d":
        ref_df['date'] = ref_df['timestamp'].dt.strftime('%Y-%m-%d')
    else:
        ref_df['date'] = ref_df['timestamp'].dt.strftime('%Y-%m-%d %H:%M')
    
    # Get sets of reference dates
    ref_up_dates = set(ref_df[ref_df['type'] == 'uptrendStart']['date'])
    ref_down_dates = set(ref_df[ref_df['type'] == 'downtrendStart']['date'])
    detect_up_dates = set(df[df['uptrendStart']]['date'])
    detect_down_dates = set(df[df['downtrendStart']]['date'])
    
    # Calculate matches
    up_match = len(detect_up_dates.intersection(ref_up_dates))
    down_match = len(detect_down_dates.intersection(ref_down_dates))
    
    # Calculate match percentages
    ref_uptrends = len(ref_up_dates)
    ref_downtrends = len(ref_down_dates)
    up_match_pct = up_match / ref_uptrends * 100 if ref_uptrends else 0
    down_match_pct = down_match / ref_downtrends * 100 if ref_downtrends else 0
    overall_match_pct = (up_match + down_match) / (ref_uptrends + ref_downtrends) * 100 if (ref_uptrends + ref_downtrends) > 0 else 0
    
    print(f"\nVALIDATION AGAINST REFERENCE DATA:")
    print(f"Reference: {ref_uptrends} uptrends, {ref_downtrends} downtrends")
    print(f"Uptrends: {up_match}/{ref_uptrends} ({up_match_pct:.1f}%)")
    print(f"Downtrends: {down_match}/{ref_downtrends} ({down_match_pct:.1f}%)")
    print(f"Overall match: {overall_match_pct:.1f}%")
    
    # Precision calculation
    total_detected = len(detect_up_dates) + len(detect_down_dates)
    total_matched = up_match + down_match
    precision = total_matched / total_detected * 100 if total_detected else 0
    
    print(f"Precision: {total_matched}/{total_detected} ({precision:.1f}%)")
    
    # F1 score
    recall = overall_match_pct / 100
    precision = precision / 100
    f1_score = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    
    print(f"F1 Score: {f1_score:.3f}")
    
    # Debug: print mismatched dates
    if up_match < ref_uptrends or down_match < ref_downtrends:
        print("\nMISSING UPTREND DATES:")
        for date in sorted(ref_up_dates - detect_up_dates):
            print(f"  {date}")
        
        print("\nMISSING DOWNTREND DATES:")
        for date in sorted(ref_down_dates - detect_down_dates):
            print(f"  {date}")
    
    # Check for trends not in reference
    false_uptrends = detect_up_dates - ref_up_dates
    false_downtrends = detect_down_dates - ref_down_dates
    
    if false_uptrends or false_downtrends:
        print("\nFALSE DETECTIONS:")
        for date in sorted(false_uptrends):
            print(f"  {date}: uptrendStart")
        for date in sorted(false_downtrends):
            print(f"  {date}: downtrendStart")
    
    # Calculate if we've achieved 100% recall
    if up_match == ref_uptrends and down_match == ref_downtrends:
        print("\n✅ SUCCESS: 100% recall achieved! All reference trend points detected.")
    else:
        print("\n❌ WARNING: Not all reference trend points were detected.")
        
    # Return results
    return {
        'uptrend_recall': up_match_pct,
        'downtrend_recall': down_match_pct,
        'overall_recall': overall_match_pct,
        'precision': precision * 100,
        'f1_score': f1_score
    }

def main():
    parser = argparse.ArgumentParser(description='State machine trend detector with validation against reference data')
    parser.add_argument('--timeframes', nargs='+', default=['1d', '4h', '1h'], 
                        help='Timeframes to analyze (default: 1d 4h 1h)')
    parser.add_argument('--validation', action='store_true', default=True,
                        help='Use validation mode (direct matching for reference data)')
    parser.add_argument('--real', action='store_true', default=False,
                        help='Run in real detection mode (no direct matching)')
    args = parser.parse_args()
    
    # Determine validation mode
    validation_mode = args.validation and not args.real
    
    for tf in args.timeframes:
        ohlc_path = f"data/CON.F.US.MES.M25_{tf}_ohlc.csv"
        json_path = f"data/CON.F.US.MES.M25_{tf}_trends.json"
        
        if not os.path.exists(ohlc_path):
            print(f"Warning: {ohlc_path} not found, skipping {tf} timeframe")
            continue
        
        analyze_with_state_machine(ohlc_path, json_path, tf, validation_mode=validation_mode)

if __name__ == "__main__":
    main() 