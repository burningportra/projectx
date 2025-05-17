"""
Functions for exporting analysis results to various formats.
"""

import csv
import logging
import re

logger = logging.getLogger(__name__)

def export_confirmed_trend_starts(log_entries, output_csv="trend_analysis/confirmed_trend_starts.csv"):
    """
    Export confirmed trend starts from analysis log entries to a CSV file.
    
    This function parses the log entries to find confirmed trend starts and exports them
    to a CSV file with the trend type, bar index, and date.
    
    Args:
        log_entries (list): List of log entry strings from trend analysis
        output_csv (str): Path to the output CSV file
        
    Returns:
        int: Number of trend starts exported
    """
    logger.info(f"Exporting confirmed trend starts to {output_csv}")
    rows = []
    
    # Regex to match trend start lines
    downtrend_re = re.compile(r"Downtrend Start Confirmed for Bar (\d+) \(([^)]+)\)")
    uptrend_re = re.compile(r"Uptrend Start Confirmed for Bar (\d+) \(([^)]+)\)")
    
    processed_entries = set()  # To store unique (trend_type, bar_index, date) tuples

    for entry_idx, entry in enumerate(log_entries):
        logger.debug(f"Processing log entry {entry_idx + 1}: {entry}")
        
        # Check for downtrend confirmations
        m_down = downtrend_re.search(entry)
        if m_down:
            bar_idx = int(m_down.group(1))
            date_str = m_down.group(2)
            trend_key = ('downtrend', bar_idx, date_str)
            
            if trend_key not in processed_entries:
                rows.append({
                    'trend_type': 'downtrend',
                    'bar_index': bar_idx, 
                    'date': date_str
                })
                processed_entries.add(trend_key)
                logger.debug(f"Added downtrend at bar {bar_idx}, date {date_str}")
        
        # Check for uptrend confirmations
        m_up = uptrend_re.search(entry)
        if m_up:
            bar_idx = int(m_up.group(1))
            date_str = m_up.group(2)
            trend_key = ('uptrend', bar_idx, date_str)
            
            if trend_key not in processed_entries:
                rows.append({
                    'trend_type': 'uptrend',
                    'bar_index': bar_idx, 
                    'date': date_str
                })
                processed_entries.add(trend_key)
                logger.debug(f"Added uptrend at bar {bar_idx}, date {date_str}")

    # Sort rows by bar_index, then by trend_type if bar_index is same
    rows.sort(key=lambda x: (x['bar_index'], x['trend_type']))
    
    # Write to CSV
    try:
        with open(output_csv, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['trend_type', 'bar_index', 'date'])
            writer.writeheader()
            writer.writerows(rows)
        
        logger.info(f"Exported {len(rows)} confirmed trend starts to {output_csv}")
        return len(rows)
    
    except Exception as e:
        logger.error(f"Error exporting trend starts to {output_csv}: {e}")
        raise 