"""
Functions for loading price data from various sources.
"""

import csv
import logging
import os

from trend_analysis.core.models import Bar

logger = logging.getLogger(__name__)

def load_bars_from_csv(filename, reverse_chronological=False):
    """
    Load OHLC bars from a CSV file.
    
    Args:
        filename (str): Path to the CSV file
        reverse_chronological (bool): Whether the data is in reverse chronological order
        
    Returns:
        list: List of Bar objects in chronological order
        
    Raises:
        FileNotFoundError: If the CSV file doesn't exist
        ValueError: If the CSV file is empty or has invalid data format
    """
    logger.info(f"Loading bars from {filename}")
    bars = []
    
    try:
        with open(filename, 'r', newline='') as f:
            reader = csv.DictReader(f)
            raw_bars = list(reader)
        
        if not raw_bars:
            logger.warning(f"No data found in {filename}")
            return []
        
        # Check if we need to reverse the data to get chronological order
        if reverse_chronological:
            raw_bars.reverse()
        
        # Determine expected column names based on first row
        first_row = raw_bars[0]
        # Try different column name possibilities
        if 'timestamp' in first_row:
            date_col = 'timestamp'
        elif 'Date' in first_row:
            date_col = 'Date'
        else:
            # Default to first column
            date_col = list(first_row.keys())[0]
            logger.warning(f"No explicit date column found, using {date_col}")
        
        if 'open' in first_row:
            o_col, h_col, l_col, c_col = 'open', 'high', 'low', 'close'
        elif 'Open' in first_row:
            o_col, h_col, l_col, c_col = 'Open', 'High', 'Low', 'Close'
        else:
            # Try to guess column indices based on convention
            cols = list(first_row.keys())
            o_col, h_col, l_col, c_col = cols[1], cols[2], cols[3], cols[4]
            logger.warning(f"No explicit OHLC columns found, using {o_col}, {h_col}, {l_col}, {c_col}")
        
        # Create Bar objects
        for i, row in enumerate(raw_bars):
            try:
                bars.append(Bar(
                    date_str=row[date_col],
                    o=row[o_col],
                    h=row[h_col],
                    l=row[l_col],
                    c=row[c_col],
                    original_file_line=i + 2,  # +2 to account for header and 0-index
                    chronological_index=i + 1  # 1-based chronological index
                ))
            except (KeyError, ValueError) as e:
                logger.error(f"Error processing row {i}: {e}")
                logger.debug(f"Row data: {row}")
                continue
        
        logger.info(f"Loaded {len(bars)} bars from {filename}")
        return bars
    
    except FileNotFoundError:
        logger.error(f"File not found: {filename}")
        raise
    except Exception as e:
        logger.error(f"Error loading bars from {filename}: {e}")
        raise


def load_bars_from_alt_csv(filename="trend_analysis/data/CON.F.US.MES.M25_4h_ohlc.csv"):
    """
    Load OHLC bars from a specific format CSV file.
    
    This function is tailored for the specific CSV format used in the trend analysis project.
    
    Args:
        filename (str): Path to the CSV file
        
    Returns:
        list: List of Bar objects in chronological order
        
    Raises:
        FileNotFoundError: If the CSV file doesn't exist
    """
    logger.info(f"Loading bars from {filename}")
    bars = []
    
    try:
        with open(filename, 'r', newline='') as f:
            reader = csv.DictReader(f)
            raw_bars = list(reader)

        # Data in file is chronological, so no need to reverse
        for i, row in enumerate(raw_bars):
            bars.append(Bar(
                date_str=row['timestamp'],
                o=row['open'],
                h=row['high'],
                l=row['low'],
                c=row['close'],
                original_file_line=i + 2,  # +2 to account for header and 0-index
                chronological_index=i + 1  # 1-based chronological index
            ))
        
        logger.info(f"Loaded {len(bars)} bars from {filename}")
        return bars
    
    except FileNotFoundError:
        logger.error(f"File not found: {filename}")
        raise
    except Exception as e:
        logger.error(f"Error loading bars from {filename}: {e}")
        raise 