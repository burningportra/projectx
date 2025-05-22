import pandas as pd
import logging
import json # For writing debug logs if they are complex structures, otherwise csv module
from src.strategies import trend_start_finder # Assuming src is in PYTHONPATH or script is run from project root

# Configure basic logging for the script itself
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
INPUT_OHLC_FILE = 'data/CON.F.US.MES.M25_4h_ohlc.csv'
OUTPUT_SIGNALS_FILE = 'logs/detected_signals_history_4h.csv'
OUTPUT_DEBUG_LOG_FILE = 'logs/trend_finder_debug_4h.csv' # CSV for debug logs
CONTRACT_ID = "CON.F.US.MES.M25"
TIMEFRAME_STR = "4h"
DEBUG_MODE_FOR_GENERATOR = True # To get debug logs from generate_trend_starts

def main():
    logging.info(f"Starting trend start generation for {CONTRACT_ID} ({TIMEFRAME_STR}).")
    logging.info(f"Reading OHLC data from: {INPUT_OHLC_FILE}")

    try:
        bars_df = pd.read_csv(INPUT_OHLC_FILE)
    except FileNotFoundError:
        logging.error(f"Input OHLC file not found: {INPUT_OHLC_FILE}")
        return
    except Exception as e:
        logging.error(f"Error reading OHLC file: {e}")
        return

    if 'timestamp' not in bars_df.columns:
        logging.error("OHLC data must contain a 'timestamp' column.")
        return
    
    bars_df['timestamp'] = pd.to_datetime(bars_df['timestamp'])
    
    # Ensure columns are lowercase as expected by the Bar class and processing
    bars_df.columns = [col.lower() for col in bars_df.columns]

    all_bars = []
    logging.info(f"Populating Bar objects. First few entries from sorted DataFrame:")
    for idx, row in bars_df.iterrows(): # idx should now be 0, 1, 2... for sorted data
        bar_time = pd.to_datetime(row['timestamp'])
        # Ensure Bar.index is the 1-based chronological index
        bar_chronological_index = idx + 1
        
        bar_object = trend_start_finder.Bar(
            timestamp=bar_time, 
            o=row['open'], 
            h=row['high'], 
            l=row['low'], 
            c=row['close'], 
            volume=row['volume'],
            index=bar_chronological_index 
        )
        all_bars.append(bar_object)

        if idx < 3 or idx in [27, 28, 29]: # Print for first 3 and specific indices of interest
            logging.info(f"DataFrame idx: {idx}, Timestamp: {row['timestamp']}, DF_Close: {row['close']}, BarObj_idx: {bar_object.index}, BarObj_Close: {bar_object.c}, Orig_bar_num: {row.get('bar_num', 'N/A')}")

    logging.info(f"Loaded {len(all_bars)} bars. Generating trend starts...")

    # Call the trend start generator
    # The trend_start_finder's own logger is configured within that module
    signals, debug_logs = trend_start_finder.generate_trend_starts(
        bars_df=bars_df,
        contract_id=CONTRACT_ID,
        timeframe_str=TIMEFRAME_STR,
        debug=DEBUG_MODE_FOR_GENERATOR
    )

    logging.info(f"Generated {len(signals)} signals and {len(debug_logs)} debug log entries.")

    # --- Save Signals ---
    if signals:
        signals_df = pd.DataFrame(signals)
        # Reconstruct the details column to be a JSON string if it's not already
        if 'details' in signals_df.columns and not isinstance(signals_df['details'].iloc[0], str):
             signals_df['details'] = signals_df['details'].apply(json.dumps)
        
        # Define the header for the signals CSV to match the format used by trend_start_comparer.py
        # This format seems to be: generator_id,timestamp,event_timestamp,contract_id,timeframe,signal_type,signal_price,signal_open,signal_high,signal_low,signal_close,signal_volume,details
        # We need to add/map columns accordingly.
        # For simplicity, using a subset that trend_start_comparer can parse based on its logic.
        
        # Create a dataframe for export that somewhat mimics the expected detected_signals_history.csv
        # The critical fields for parsing in trend_start_comparer are:
        # parts[1] -> timestamp_str
        # parts[5] -> signal_type_str
        # parts[potential_json_start_col:] -> details_str (JSON)
        
        # Let's prepare a DataFrame that will produce a CSV parsable by the current trend_start_comparer.
        # We'll add some dummy columns to match the expected structure if necessary.
        
        output_df_data = []
        generator_id = "cus_cds_trend_finder" # Matches the example
        event_timestamp = pd.Timestamp.now(tz='UTC').isoformat() # A generic event timestamp
        
        for sig in signals:
            output_df_data.append({
                'analyzer_id': generator_id, # Changed from generator_id to analyzer_id
                'timestamp': sig.get('timestamp').isoformat() if sig.get('timestamp') else None,
                'trigger_timestamp': event_timestamp, # Placeholder
                'contract_id': sig.get('contract_id'),
                'timeframe': sig.get('timeframe'),
                'signal_type': sig.get('signal_type'),
                'signal_price': sig.get('signal_price'),
                'signal_open': sig.get('signal_open'),
                'signal_high': sig.get('signal_high'),
                'signal_low': sig.get('signal_low'),
                'signal_close': sig.get('signal_close'),
                'signal_volume': sig.get('signal_volume'),
                'details': json.dumps(sig.get('details')) if sig.get('details') else '{}'
            })
        
        if output_df_data:
            signals_export_df = pd.DataFrame(output_df_data)
            try:
                signals_export_df.to_csv(OUTPUT_SIGNALS_FILE, index=False, header=True) # Include header
                logging.info(f"Signals saved to: {OUTPUT_SIGNALS_FILE}")
            except Exception as e:
                logging.error(f"Error saving signals to CSV: {e}")
        else:
            logging.info("No signals to save.")
            # Create an empty file with header if no signals
            try:
                pd.DataFrame(columns=['analyzer_id', 'timestamp', 'trigger_timestamp', 'contract_id', 'timeframe', 'signal_type', 'signal_price', 'signal_open', 'signal_high', 'signal_low', 'signal_close', 'signal_volume', 'details']).to_csv(OUTPUT_SIGNALS_FILE, index=False)
                logging.info(f"Empty signals file with header saved to: {OUTPUT_SIGNALS_FILE}")
            except Exception as e:
                logging.error(f"Error saving empty signals CSV: {e}")


    # --- Save Debug Logs ---
    if DEBUG_MODE_FOR_GENERATOR and debug_logs:
        debug_logs_df = pd.DataFrame(debug_logs)
        try:
            debug_logs_df.to_csv(OUTPUT_DEBUG_LOG_FILE, index=False)
            logging.info(f"Debug logs saved to: {OUTPUT_DEBUG_LOG_FILE}")
        except Exception as e:
            logging.error(f"Error saving debug logs to CSV: {e}")
    elif DEBUG_MODE_FOR_GENERATOR:
        logging.info("No debug logs to save (debug mode was on but no logs produced).")


    logging.info("Trend start generation process finished.")

if __name__ == '__main__':
    # This assumes that src.strategies.trend_start_finder can be imported.
    # If you run this script from the project root, Python should be able to find `src`.
    # e.g., python run_specific_trend_finder.py
    main() 