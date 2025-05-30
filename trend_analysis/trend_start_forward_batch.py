#!/usr/bin/env python3
"""
Batch Trend Start Detection Script for Forward Testing
Processes multiple bars efficiently to reduce API call overhead.
"""

import sys
import json
import pandas as pd
from pathlib import Path
from typing import Dict, List, Any, Optional
import warnings
warnings.filterwarnings('ignore')

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from trend_analysis.rules.rule_engine import RuleEngine

def prepare_bars_dataframe(bars_data: List[Dict]) -> pd.DataFrame:
    """Convert bars data to pandas DataFrame with proper types and indexing."""
    df = pd.DataFrame(bars_data)
    
    # Ensure proper column names and types
    required_columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
    for col in required_columns:
        if col not in df.columns:
            if col == 'volume':
                df[col] = 0  # Default volume if not provided
            else:
                raise ValueError(f"Missing required column: {col}")
    
    # Convert timestamp to datetime and set as index
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df.set_index('timestamp', inplace=True)
    
    # Ensure numeric types
    numeric_columns = ['open', 'high', 'low', 'close', 'volume']
    for col in numeric_columns:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # Sort by timestamp to ensure proper order
    df.sort_index(inplace=True)
    
    return df

def detect_batch_signals(
    df: pd.DataFrame, 
    start_bar_index: int, 
    end_bar_index: int,
    contract_id: str,
    timeframe: str
) -> List[Dict]:
    """
    Detect trend start signals for a batch of bars efficiently.
    
    Args:
        df: DataFrame with OHLCV data
        start_bar_index: Starting bar index (1-based)
        end_bar_index: Ending bar index (1-based)
        contract_id: Contract identifier
        timeframe: Timeframe string
    
    Returns:
        List of signal dictionaries
    """
    signals = []
    
    try:
        # Initialize rule engine
        rule_engine = RuleEngine()
        
        # Process each bar in the batch
        for bar_index in range(start_bar_index, end_bar_index + 1):
            # Get data up to current bar (1-based indexing)
            current_data = df.iloc[:bar_index].copy()
            
            if len(current_data) < 3:  # Need minimum data for analysis
                continue
            
            # Detect signals for this specific bar
            try:
                # Check for uptrend start signals
                uptrend_signals = rule_engine.detect_uptrend_start(
                    current_data, 
                    current_bar_index=bar_index
                )
                
                for signal in uptrend_signals:
                    signals.append({
                        'signal_type': 'uptrend_start',
                        'bar_index': bar_index,
                        'signal_price': signal.get('price', current_data.iloc[-1]['close']),
                        'confidence': signal.get('confidence', 0.8),
                        'rule_type': signal.get('rule', 'Batch_UP'),
                        'details': {
                            'timeframe': timeframe,
                            'contract_id': contract_id,
                            'confirmed_signal_bar_index': bar_index
                        }
                    })
                
                # Check for downtrend start signals
                downtrend_signals = rule_engine.detect_downtrend_start(
                    current_data, 
                    current_bar_index=bar_index
                )
                
                for signal in downtrend_signals:
                    signals.append({
                        'signal_type': 'downtrend_start',
                        'bar_index': bar_index,
                        'signal_price': signal.get('price', current_data.iloc[-1]['close']),
                        'confidence': signal.get('confidence', 0.8),
                        'rule_type': signal.get('rule', 'Batch_DN'),
                        'details': {
                            'timeframe': timeframe,
                            'contract_id': contract_id,
                            'confirmed_signal_bar_index': bar_index
                        }
                    })
                    
            except Exception as e:
                # Log error but continue processing other bars
                print(f"Error processing bar {bar_index}: {e}", file=sys.stderr)
                continue
                
    except Exception as e:
        print(f"Error in batch signal detection: {e}", file=sys.stderr)
    
    return signals

def main():
    """Main batch processing function."""
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python trend_start_forward_batch.py '<json_input>'")
        
        # Parse input JSON
        input_data = json.loads(sys.argv[1])
        bars = input_data.get('bars', [])
        contract_id = input_data.get('contract_id', '')
        timeframe = input_data.get('timeframe', '')
        start_bar_index = input_data.get('start_bar_index', 1)
        end_bar_index = input_data.get('end_bar_index', len(bars))
        debug = input_data.get('debug', False)
        
        if not bars:
            raise ValueError("No bars data provided")
        
        if debug:
            print(f"Processing batch: bars={len(bars)}, range={start_bar_index}-{end_bar_index}", 
                  file=sys.stderr)
        
        # Prepare data
        df = prepare_bars_dataframe(bars)
        
        # Detect signals for the batch
        batch_signals = detect_batch_signals(
            df, start_bar_index, end_bar_index, contract_id, timeframe
        )
        
        # Prepare response
        response = {
            'success': True,
            'batch_signals': batch_signals,
            'total_signals': len(batch_signals),
            'start_bar_index': start_bar_index,
            'end_bar_index': end_bar_index,
            'bars_processed': end_bar_index - start_bar_index + 1
        }
        
        if debug:
            print(f"Batch processing complete: {len(batch_signals)} signals found", file=sys.stderr)
        
        # Output JSON response
        print(json.dumps(response))
        
    except Exception as e:
        error_response = {
            'success': False,
            'error': str(e),
            'batch_signals': [],
            'total_signals': 0
        }
        print(json.dumps(error_response))
        sys.exit(1)

if __name__ == "__main__":
    main() 