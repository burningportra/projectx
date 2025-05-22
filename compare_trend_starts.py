import csv
import os

# Define file paths - adjust if your script is not in the workspace root
# or if the CSV files are located elsewhere.
DETECTED_SIGNALS_FILE = os.path.join('logs', 'detected_signals_history_4h.csv')
CONFIRMED_TRENDS_FILE = os.path.join('trend_analysis', 'confirmed_trend_starts.csv')

def parse_detected_signals(file_path):
    """
    Parses the detected_signals_history_4h.csv file.
    Extracts timestamp and normalizes signal_type.
    """
    signals = set()
    try:
        with open(file_path, 'r', newline='') as csvfile:
            reader = csv.reader(csvfile)
            header = next(reader)  # Skip header
            for row in reader:
                if len(row) < 6:
                    print(f"Warning: Skipping malformed row in {file_path}: {row}")
                    continue
                timestamp_str = row[1]  # Column 2: timestamp
                signal_type = row[5]    # Column 6: signal_type

                trend_type = ""
                if signal_type == "uptrend_start":
                    trend_type = "uptrend"
                elif signal_type == "downtrend_start":
                    trend_type = "downtrend"
                else:
                    print(f"Warning: Unknown signal type '{signal_type}' in {file_path} at {timestamp_str}")
                    continue
                
                signals.add((timestamp_str, trend_type))
    except FileNotFoundError:
        print(f"Error: File not found - {file_path}")
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
    return signals

def parse_confirmed_trends(file_path):
    """
    Parses the confirmed_trend_starts.csv file.
    Extracts and normalizes date, and extracts trend_type.
    """
    trends = set()
    try:
        with open(file_path, 'r', newline='') as csvfile:
            reader = csv.reader(csvfile)
            header = next(reader)  # Skip header
            for row in reader:
                if len(row) < 3:
                    print(f"Warning: Skipping malformed row in {file_path}: {row}")
                    continue
                trend_type = row[0]    # Column 1: trend_type
                date_str = row[2]      # Column 3: date

                # Normalize timestamp by replacing space with 'T'
                normalized_date_str = date_str.replace(" ", "T")
                
                if trend_type not in ["uptrend", "downtrend"]:
                    print(f"Warning: Unknown trend type '{trend_type}' in {file_path} at {date_str}")
                    continue

                trends.add((normalized_date_str, trend_type))
    except FileNotFoundError:
        print(f"Error: File not found - {file_path}")
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
    return trends

def main():
    print(f"Comparing trend starts from:\n1. {DETECTED_SIGNALS_FILE}\n2. {CONFIRMED_TRENDS_FILE}\n")

    detected_set = parse_detected_signals(DETECTED_SIGNALS_FILE)
    confirmed_set = parse_confirmed_trends(CONFIRMED_TRENDS_FILE)

    if not detected_set and not os.path.exists(DETECTED_SIGNALS_FILE):
        print(f"Skipping comparison as {DETECTED_SIGNALS_FILE} was not found or is empty.")
        return
    if not confirmed_set and not os.path.exists(CONFIRMED_TRENDS_FILE):
        print(f"Skipping comparison as {CONFIRMED_TRENDS_FILE} was not found or is empty.")
        return

    print(f"Total trend signals in '{DETECTED_SIGNALS_FILE}': {len(detected_set)}")
    print(f"Total trend starts in '{CONFIRMED_TRENDS_FILE}': {len(confirmed_set)}")

    # Compare the sets
    confirmed_only = confirmed_set - detected_set
    detected_only = detected_set - confirmed_set

    if not confirmed_only and not detected_only:
        print("\nThe trend starts in both files match perfectly.")
    else:
        print("\nThe trend starts do NOT match.")
        if confirmed_only:
            print(f"\nTrend starts in '{CONFIRMED_TRENDS_FILE}' but NOT in '{DETECTED_SIGNALS_FILE}' ({len(confirmed_only)}):")
            for item in sorted(list(confirmed_only)):
                print(item)
        if detected_only:
            print(f"\nTrend signals in '{DETECTED_SIGNALS_FILE}' but NOT in '{CONFIRMED_TRENDS_FILE}' ({len(detected_only)}):")
            for item in sorted(list(detected_only)):
                print(item)

if __name__ == "__main__":
    main() 