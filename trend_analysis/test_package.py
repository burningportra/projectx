#!/usr/bin/env python3
"""
Test script to verify the trend_analysis package works correctly.
"""

import logging
import os
import sys

# Add the parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from trend_analysis import configure_logging
from trend_analysis.data.loaders import load_bars_from_alt_csv
from trend_analysis.core.engine import process_trend_logic
from trend_analysis.data.exporters import export_confirmed_trend_starts

def main():
    """Run a simple test of the trend analysis package."""
    # Configure logging
    configure_logging(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    # Try to load and process data
    try:
        # Use the default path from load_bars_from_alt_csv
        csv_file_path = "trend_analysis/data/CON.F.US.MES.M25_4h_ohlc.csv"
        
        # Check if file exists, if not, look for the file with different path
        if not os.path.exists(csv_file_path):
            parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            alt_path = os.path.join(parent_dir, "data/CON.F.US.MES.M25_4h_ohlc.csv")
            if os.path.exists(alt_path):
                csv_file_path = alt_path
            else:
                logger.error(f"Could not find the CSV file at {csv_file_path} or {alt_path}")
                return 1
        
        logger.info(f"Loading bars from {csv_file_path}")
        all_bars_chronological = load_bars_from_alt_csv(filename=csv_file_path)
        
        if not all_bars_chronological:
            logger.error(f"No bars were loaded. Check CSV file path '{csv_file_path}' and format.")
            return 1
        
        logger.info(f"Loaded {len(all_bars_chronological)} bars.")
        
        # Process the trend logic
        logger.info("Processing trend logic...")
        output_log = process_trend_logic(all_bars_chronological)
        
        logger.info(f"Processed {len(output_log)} log entries.")
        
        # Export the results
        output_csv = "confirmed_trend_starts.csv"
        export_confirmed_trend_starts(output_log, output_csv=output_csv)
        
        logger.info(f"Test completed successfully. Results written to {output_csv}")
        return 0
        
    except Exception as e:
        logger.error(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main()) 