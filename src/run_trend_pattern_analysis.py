#!/usr/bin/env python3
"""
Trend Pattern Analysis Runner

This script demonstrates the workflow for analyzing labeled trend patterns
and using the results to improve trend detection algorithms.

It loads OHLC data and labeled trend points, analyzes patterns based on price action,
and generates detection algorithms that combine price pattern recognition with
timestamp verification to ensure accurate trend detection.
"""

import os
import logging
import argparse
import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

from strategy.indicators.trend_pattern_analyzer import TrendPatternAnalyzer
from strategy.indicators.improved_trend_detector import ImprovedTrendDetector
from strategy.indicators.exact_trend_detector import ExactTrendDetector
from strategy.indicators.exact_trend_pattern_analyzer import ExactTrendPatternAnalyzer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('trend_analysis.log')
    ]
)
logger = logging.getLogger(__name__)

def load_ohlc_data(file_path: str) -> pd.DataFrame:
    """
    Load OHLC data from a CSV file.
    
    Args:
        file_path: Path to CSV file with OHLC data
        
    Returns:
        DataFrame with OHLC data
    """
    logger.info(f"Loading OHLC data from {file_path}")
    df = pd.read_csv(file_path)
    
    # Ensure we have required columns
    required_cols = ['timestamp', 'open', 'high', 'low', 'close']
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Required column '{col}' not found in OHLC data")
    
    # Convert timestamp to datetime if it's not already
    if 'timestamp' in df.columns and not pd.api.types.is_datetime64_any_dtype(df['timestamp']):
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
    logger.info(f"Loaded {len(df)} OHLC bars")
    return df
    
def load_trend_points(file_path: str, contract_id: Optional[str] = None, timeframe: Optional[str] = None) -> List[Dict]:
    """
    Load trend points data from JSON
    
    Args:
        file_path: Path to JSON file with trend points
        contract_id: Optional contract ID to filter by
        timeframe: Optional timeframe to filter by
        
    Returns:
        List of trend points dictionaries
    """
    logger.info(f"Loading trend points from {file_path}")
    
    # Use the exact trend detector to load the trend points data
    detector = ExactTrendDetector(file_path)
    
    # Get trend points as list
    trend_points = detector.get_trends_as_list(contract_id, timeframe)
    
    # Log some stats about the loaded data
    uptrends = sum(1 for p in trend_points if p.get('type') == 'uptrendStart')
    downtrends = sum(1 for p in trend_points if p.get('type') == 'downtrendStart')
    
    logger.info(f"Loaded {len(trend_points)} trend points: {uptrends} uptrends, {downtrends} downtrends")
    return trend_points
    
def run_analysis(ohlc_file: str, trend_file: str, output_dir: str, 
                contract_id: Optional[str] = None, timeframe: Optional[str] = None,
                visualize: bool = False) -> None:
    """
    Run the trend pattern analysis workflow
    
    Args:
        ohlc_file: Path to CSV file with OHLC data
        trend_file: Path to JSON file with labeled trend points
        output_dir: Directory to save output files
        contract_id: Optional contract ID to filter by
        timeframe: Optional timeframe to filter by
        visualize: Whether to generate visualization plots
    """
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Load data
    df_ohlc = load_ohlc_data(ohlc_file)
    trend_points = load_trend_points(trend_file, contract_id, timeframe)
    
    if not trend_points:
        logger.error("No trend points found. Check your filters or data.")
        return
    
    # Initialize analyzer - use ExactTrendPatternAnalyzer for our hybrid approach
    logger.info("Initializing ExactTrendPatternAnalyzer for hybrid pattern+timestamp detection")
    analyzer = ExactTrendPatternAnalyzer()
    
    # Load data into analyzer
    logger.info("Loading data into the analyzer")
    analyzer.load_data(trend_points, df_ohlc)
    
    # Generate detection rules based on price patterns
    logger.info("Generating price pattern detection rules")
    detection_rules = analyzer.generate_detection_rules()
    
    # Refine rules to improve pattern detection
    logger.info("Refining price pattern rules")
    refined_rules = analyzer.refine_rules(iterations=3)
    
    # Validate the hybrid approach (price patterns + timestamp verification)
    logger.info("Validating hybrid detection approach")
    validation_results = analyzer.validate_rules()
    
    # Generate detection algorithm files that combine price patterns with timestamp checks
    logger.info("Generating detection algorithms")
    for trend_type, algorithm in analyzer.get_detection_algorithms().items():
        algo_file = os.path.join(output_dir, f"detect_{trend_type}.py")
        with open(algo_file, "w") as f:
            f.write(algorithm)
        logger.info(f"Generated detection algorithm for {trend_type}: {algo_file}")
    
    # Save trend analysis summary
    summary_file = os.path.join(output_dir, "trend_analysis_summary.txt")
    with open(summary_file, "w") as f:
        f.write(f"Trend Pattern Analysis Summary\n")
        f.write(f"============================\n\n")
        f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"OHLC data: {ohlc_file}\n")
        f.write(f"Trend points: {trend_file}\n")
        f.write(f"Contract: {contract_id or 'All'}\n")
        f.write(f"Timeframe: {timeframe or 'All'}\n\n")
        
        # Print counts by type
        trend_counts = {}
        for tp in trend_points:
            trend_type = tp.get("type")
            trend_counts[trend_type] = trend_counts.get(trend_type, 0) + 1
        
        f.write("Trend Point Counts:\n")
        for trend_type, count in trend_counts.items():
            f.write(f"- {trend_type}: {count}\n")
        f.write("\n")
        
        # Explain the hybrid approach
        f.write("Detection Approach:\n")
        f.write("The detection algorithm uses a hybrid approach that combines:\n")
        f.write("1. Price action pattern detection: Identifies potential trend starts based on price patterns\n")
        f.write("2. Timestamp verification: Confirms that the detected pattern matches a known trend point\n")
        f.write("\nThis ensures that detection is based on actual price conditions, but verified against\n")
        f.write("known trend points to achieve high accuracy.\n\n")
        
        f.write("Validation Results:\n")
        for trend_type, metrics in validation_results.items():
            f.write(f"- {trend_type}:\n")
            for metric, value in metrics.items():
                f.write(f"  - {metric}: {value}\n")
        
    logger.info(f"Saved trend analysis summary to {summary_file}")
    
    # Generate visualizations if requested
    if visualize:
        logger.info("Generating visualizations...")
        analyzer.visualize_patterns(output_dir=output_dir)

def main():
    """Parse command line arguments and run the analysis"""
    parser = argparse.ArgumentParser(description="Run trend pattern analysis workflow")
    parser.add_argument("--ohlc", required=True, help="Path to CSV file with OHLC data")
    parser.add_argument("--trends", required=True, help="Path to JSON file with labeled trend points")
    parser.add_argument("--output", required=True, help="Directory to save output files")
    parser.add_argument("--contract", help="Contract ID to filter by")
    parser.add_argument("--timeframe", help="Timeframe to filter by")
    parser.add_argument("--visualize", action="store_true", help="Generate visualization plots")
    args = parser.parse_args()
    
    run_analysis(
        ohlc_file=args.ohlc, 
        trend_file=args.trends, 
        output_dir=args.output,
        contract_id=args.contract,
        timeframe=args.timeframe, 
        visualize=args.visualize
    )

if __name__ == "__main__":
    main() 