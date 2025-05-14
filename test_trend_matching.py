#!/usr/bin/env python3
"""
Test Trend Matching

This script validates that the LiveHybridDetector can independently identify
trend points that match the reference data without directly referencing them.
"""

import pandas as pd
import numpy as np
from datetime import datetime
import json
import logging
import os
from live_hybrid_detector import LiveHybridDetector
import matplotlib.pyplot as plt
from typing import Dict, List, Set, Tuple

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def load_reference_trends(file_path: str) -> Dict[str, List[Dict]]:
    """
    Load reference trend points from JSON file.
    
    Args:
        file_path: Path to JSON file with trend points
        
    Returns:
        Dictionary with uptrend and downtrend points
    """
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # Separate uptrend and downtrend points
    uptrends = [p for p in data if p['type'] == 'uptrendStart']
    downtrends = [p for p in data if p['type'] == 'downtrendStart']
    
    return {
        'uptrends': uptrends,
        'downtrends': downtrends
    }

def load_ohlc_data(file_path: str) -> pd.DataFrame:
    """
    Load OHLC data from a CSV file.
    
    Args:
        file_path: Path to CSV file with OHLC data
        
    Returns:
        DataFrame with OHLC data
    """
    df = pd.read_csv(file_path)
    
    # Ensure timestamp is in the correct format
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    return df

def compare_trends(detected_df: pd.DataFrame, reference_trends: Dict[str, List[Dict]]) -> Dict:
    """
    Compare detected trends with reference trends.
    
    Args:
        detected_df: DataFrame with detection results
        reference_trends: Dictionary with reference trend points
        
    Returns:
        Dictionary with comparison results
    """
    # Extract reference timestamps
    ref_uptrend_times = {datetime.fromisoformat(p['timestamp'].replace('Z', '+00:00')) 
                        for p in reference_trends['uptrends']}
    ref_downtrend_times = {datetime.fromisoformat(p['timestamp'].replace('Z', '+00:00')) 
                          for p in reference_trends['downtrends']}
    
    # Extract detected timestamps
    detected_uptrends = set(detected_df[detected_df['uptrendStart']]['timestamp'])
    detected_downtrends = set(detected_df[detected_df['downtrendStart']]['timestamp'])
    
    # Find matches, misses, and false positives
    uptrend_matches = detected_uptrends.intersection(ref_uptrend_times)
    downtrend_matches = detected_downtrends.intersection(ref_downtrend_times)
    
    uptrend_misses = ref_uptrend_times - detected_uptrends
    downtrend_misses = ref_downtrend_times - detected_downtrends
    
    uptrend_false_positives = detected_uptrends - ref_uptrend_times
    downtrend_false_positives = detected_downtrends - ref_downtrend_times
    
    # Calculate match rates
    uptrend_match_rate = len(uptrend_matches) / len(ref_uptrend_times) if ref_uptrend_times else 1.0
    downtrend_match_rate = len(downtrend_matches) / len(ref_downtrend_times) if ref_downtrend_times else 1.0
    overall_match_rate = (len(uptrend_matches) + len(downtrend_matches)) / \
                         (len(ref_uptrend_times) + len(ref_downtrend_times)) \
                         if (ref_uptrend_times or ref_downtrend_times) else 1.0
    
    return {
        'uptrend_matches': uptrend_matches,
        'downtrend_matches': downtrend_matches,
        'uptrend_misses': uptrend_misses,
        'downtrend_misses': downtrend_misses,
        'uptrend_false_positives': uptrend_false_positives,
        'downtrend_false_positives': downtrend_false_positives,
        'uptrend_match_rate': uptrend_match_rate,
        'downtrend_match_rate': downtrend_match_rate,
        'overall_match_rate': overall_match_rate
    }

def visualize_comparison(ohlc_df: pd.DataFrame, comparison_results: Dict) -> None:
    """
    Visualize the comparison between detected and reference trend points.
    
    Args:
        ohlc_df: DataFrame with OHLC data
        comparison_results: Dictionary with comparison results
    """
    fig, ax = plt.subplots(figsize=(15, 8))
    
    # Plot OHLC close prices
    ax.plot(ohlc_df['timestamp'], ohlc_df['close'], color='black', alpha=0.5, linewidth=1)
    
    # Plot uptrend matches
    for timestamp in comparison_results['uptrend_matches']:
        idx = ohlc_df[ohlc_df['timestamp'] == timestamp].index
        if len(idx) > 0:
            price = ohlc_df.iloc[idx[0]]['low']
            ax.scatter(timestamp, price, color='green', marker='^', s=100, label='Uptrend Match' if 'Uptrend Match' not in plt.gca().get_legend_handles_labels()[1] else '')
    
    # Plot downtrend matches
    for timestamp in comparison_results['downtrend_matches']:
        idx = ohlc_df[ohlc_df['timestamp'] == timestamp].index
        if len(idx) > 0:
            price = ohlc_df.iloc[idx[0]]['high']
            ax.scatter(timestamp, price, color='red', marker='v', s=100, label='Downtrend Match' if 'Downtrend Match' not in plt.gca().get_legend_handles_labels()[1] else '')
    
    # Plot uptrend misses
    for timestamp in comparison_results['uptrend_misses']:
        idx = ohlc_df[ohlc_df['timestamp'] == timestamp].index
        if len(idx) > 0:
            price = ohlc_df.iloc[idx[0]]['low']
            ax.scatter(timestamp, price, color='lime', marker='o', s=80, label='Missed Uptrend' if 'Missed Uptrend' not in plt.gca().get_legend_handles_labels()[1] else '')
    
    # Plot downtrend misses
    for timestamp in comparison_results['downtrend_misses']:
        idx = ohlc_df[ohlc_df['timestamp'] == timestamp].index
        if len(idx) > 0:
            price = ohlc_df.iloc[idx[0]]['high']
            ax.scatter(timestamp, price, color='orange', marker='o', s=80, label='Missed Downtrend' if 'Missed Downtrend' not in plt.gca().get_legend_handles_labels()[1] else '')
    
    # Plot false positives
    for timestamp in comparison_results['uptrend_false_positives']:
        idx = ohlc_df[ohlc_df['timestamp'] == timestamp].index
        if len(idx) > 0:
            price = ohlc_df.iloc[idx[0]]['low'] 
            ax.scatter(timestamp, price, color='blue', marker='x', s=80, label='False Uptrend' if 'False Uptrend' not in plt.gca().get_legend_handles_labels()[1] else '')
    
    for timestamp in comparison_results['downtrend_false_positives']:
        idx = ohlc_df[ohlc_df['timestamp'] == timestamp].index
        if len(idx) > 0:
            price = ohlc_df.iloc[idx[0]]['high']
            ax.scatter(timestamp, price, color='purple', marker='x', s=80, label='False Downtrend' if 'False Downtrend' not in plt.gca().get_legend_handles_labels()[1] else '')
    
    # Add labels and title
    ax.set_xlabel('Date')
    ax.set_ylabel('Price')
    ax.set_title(f'Trend Detection Comparison - Match Rate: {comparison_results["overall_match_rate"]*100:.1f}%')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # Save the plot
    plt.tight_layout()
    plt.savefig('trend_detection_comparison.png')
    plt.close()

def main():
    """Main function to run the trend matching test"""
    # Define paths
    reference_file = 'data/CON.F.US.MES.M25_1h_trends.json'
    ohlc_file = 'data/CON.F.US.MES.M25_1h_ohlc.csv'
    
    # Check if files exist
    if not os.path.exists(reference_file):
        logger.error(f"Reference file not found: {reference_file}")
        return
    
    if not os.path.exists(ohlc_file):
        logger.error(f"OHLC data file not found: {ohlc_file}")
        return
    
    # Load data
    logger.info("Loading reference trend data...")
    reference_trends = load_reference_trends(reference_file)
    logger.info(f"Loaded {len(reference_trends['uptrends'])} uptrends and {len(reference_trends['downtrends'])} downtrends from reference")
    
    logger.info("Loading OHLC data...")
    ohlc_df = load_ohlc_data(ohlc_file)
    logger.info(f"Loaded {len(ohlc_df)} bars of OHLC data")
    
    # Initialize detector
    logger.info("Initializing trend detector...")
    detector = LiveHybridDetector(lookback_window=100, timeframe="1h")
    
    # Add contract_id to data for MES-specific detection
    ohlc_df['contract_id'] = 'CON.F.US.MES.M25'
    
    # Process data with hybrid detector
    logger.info("Processing data with detector...")
    result_df = detector.process_data(ohlc_df, contract_id='CON.F.US.MES.M25')
    
    # Compare with reference
    logger.info("Comparing detection results with reference...")
    comparison = compare_trends(result_df, reference_trends)
    
    # Print results
    logger.info(f"===== TREND DETECTION RESULTS =====")
    logger.info(f"Uptrend matches: {len(comparison['uptrend_matches'])} / {len(reference_trends['uptrends'])}")
    logger.info(f"Downtrend matches: {len(comparison['downtrend_matches'])} / {len(reference_trends['downtrends'])}")
    logger.info(f"Overall match rate: {comparison['overall_match_rate']*100:.1f}%")
    
    logger.info(f"Uptrend misses: {len(comparison['uptrend_misses'])}")
    logger.info(f"Downtrend misses: {len(comparison['downtrend_misses'])}")
    
    logger.info(f"False uptrends: {len(comparison['uptrend_false_positives'])}")
    logger.info(f"False downtrends: {len(comparison['downtrend_false_positives'])}")
    
    # Visualize results
    logger.info("Generating visualization...")
    visualize_comparison(ohlc_df, comparison)
    logger.info("Visualization saved as trend_detection_comparison.png")

if __name__ == "__main__":
    main() 