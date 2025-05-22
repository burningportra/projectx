import csv
from ..models.bar import Bar

def load_bars_from_alt_csv(filename="trend_analysis/data/CON.F.US.MES.M25_4h_ohlc.csv"):
    """
    Loads bar data from a CSV file into a list of Bar objects.
    The CSV file is expected to have 'timestamp', 'open', 'high', 'low', 'close' columns.
    Bars are assumed to be in chronological order in the CSV.

    Args:
        filename (str): The path to the CSV file.

    Returns:
        list[Bar]: A list of Bar objects.
    """
    bars = []
    with open(filename, 'r', newline='') as f:
        reader = csv.DictReader(f)
        raw_bars = list(reader) # Read all rows into a list of dictionaries

    # Data in file is assumed to be chronological, so no need to reverse.
    # Assign a 1-based chronological index to each bar.
    for i, row in enumerate(raw_bars):
        bars.append(Bar(
            date_str=row['timestamp'],
            o=row['open'],
            h=row['high'],
            l=row['low'],
            c=row['close'],
            original_file_line=i + 2, # +1 for header, +1 because reader is 0-indexed
            chronological_index=i + 1 # 1-based chronological index
        ))
    return bars 