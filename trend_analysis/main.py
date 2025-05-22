from .analyzer import TrendAnalyzer
from .utils.bar_loader import load_bars_from_alt_csv
from .utils.event_exporter import export_trend_start_events

if __name__ == "__main__":
    """
    Main execution block: Loads bar data, processes it for trend start analysis,
    prints the generated log, and exports confirmed trend starts to a CSV.
    Includes basic error handling for file operations.
    """
    try:
        # Define the path to the CSV data file.
        # This path is relative to the workspace root if the script is run from there.
        csv_file_path = "data/CON.F.US.MES.M25_4h_ohlc.csv"
        # NOTE: If running main.py from within trend_analysis folder, the path might need to be "../data/CON.F.US.MES.M25_4h_ohlc.csv"
        # Or, make it an absolute path or use a config file for better path management.
        
        print(f"Attempting to load bars from: {csv_file_path}")
        all_bars_chronological = load_bars_from_alt_csv(filename=csv_file_path)
        
        if not all_bars_chronological:
            print(f"No bars were loaded. Please check the CSV file path '{csv_file_path}' and its format.")
        else:
            print(f"Successfully loaded {len(all_bars_chronological)} bars.")
            
            analyzer = TrendAnalyzer()
            # Process the loaded bars to generate the trend start analysis log.
            print("\nStarting trend start analysis...")
            output_log = analyzer.analyze(all_bars_chronological)
            print("Trend start analysis finished.")

            # Print the full generated log to the console.
            print("\n--- Generated Trend Start Log ---")
            for entry in output_log:
                print(entry)
            print("--- End of Trend Start Log ---")

            # Export the confirmed trend starts extracted from the log to a CSV file.
            output_csv_path = "trend_analysis/confirmed_trend_starts.csv"
            # Similar path consideration as above for csv_file_path
            print(f"\nStarting export of confirmed trend starts to {output_csv_path}...")
            export_trend_start_events(output_log, output_csv=output_csv_path)
            print("Export of confirmed trend starts finished.")

    except FileNotFoundError:
        # Handle the case where the CSV data file is not found.
        # Corrected to refer to csv_file_path variable for the error message.
        print(f"Error: The CSV data file '{csv_file_path}' was not found. ")
        print(f"Please ensure the file exists at the specified path or update the path in the script.")
    except Exception as e:
        # Handle any other unexpected errors during execution.
        print(f"An unexpected error occurred during script execution: {e}")
        import traceback
        traceback.print_exc() # Print the full traceback for detailed error analysis. 