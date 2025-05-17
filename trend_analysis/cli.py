#!/usr/bin/env python3
"""
Command-line interface for trend analysis.
"""

import argparse
import logging
import os
import sys

from trend_analysis import configure_logging
from trend_analysis.core.engine import process_trend_logic
from trend_analysis.data.loaders import load_bars_from_csv
from trend_analysis.data.exporters import export_confirmed_trend_starts
from trend_analysis.utils.helpers import validate_bars

logger = logging.getLogger(__name__)

def main():
    """Main entry point for the trend analyzer CLI."""
    parser = argparse.ArgumentParser(description="Trend Analysis Tool")
    parser.add_argument("csv_file", help="Path to the CSV file with OHLC data")
    parser.add_argument("--debug", action="store_true", help="Enable debug output")
    parser.add_argument("--log-file", help="Path to output log file")
    parser.add_argument("--output", default="confirmed_trend_starts.csv", 
                        help="Path to output CSV file (default: confirmed_trend_starts.csv)")
    parser.add_argument("--reverse", action="store_true", 
                        help="Reverse chronological order of input data")
    parser.add_argument("--debug-indices", type=int, nargs="+", 
                        help="Specific bar indices to debug")

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.debug else logging.INFO
    configure_logging(level=log_level, log_file=args.log_file)

    # Validate input file
    if not os.path.exists(args.csv_file):
        logger.error(f"File not found: {args.csv_file}")
        return 1

    try:
        # Load bars from CSV
        logger.info(f"Loading bars from {args.csv_file}")
        bars = load_bars_from_csv(args.csv_file, reverse_chronological=args.reverse)
        
        # Validate bars
        validate_bars(bars)
        logger.info(f"Loaded {len(bars)} valid bars")

        # Process trend logic
        logger.info("Processing trend logic...")
        log_entries = process_trend_logic(
            bars, 
            debug_mode=args.debug, 
            debug_indices=args.debug_indices
        )
        
        # Print log entries
        if args.debug:
            for entry in log_entries:
                print(entry)
        
        # Export results
        if args.output:
            num_trends = export_confirmed_trend_starts(log_entries, output_csv=args.output)
            logger.info(f"Exported {num_trends} confirmed trend starts to {args.output}")
        
        return 0
    
    except Exception as e:
        logger.error(f"Error: {e}")
        if args.debug:
            import traceback
            traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main()) 