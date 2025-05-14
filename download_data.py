#!/usr/bin/env python3
"""
Database Extractor for Trend Analysis

This script extracts OHLC bars and trend points from the PostgreSQL database
and saves them to CSV/JSON files for use with the trend analysis workflow.
"""

import os
import pandas as pd
import psycopg2
import json
from datetime import datetime

# Database connection parameters (read from environment variables)
db_url = os.environ.get("TIMESCALE_DB_URL")


if not db_url:
    print("Error: DATABASE_URL environment variable not set")
    print("Example: export DATABASE_URL='postgresql://postgres:password@localhost:5433/projectx'")
    exit(1)

# Output files
ohlc_output = "data/ohlc_data.csv"
trends_output = "data/trend_points.json"

# Create output directory if it doesn't exist
os.makedirs("data", exist_ok=True)

print("Connecting to database...")
try:
    # Connect to the database
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()
    print("Connection successful")
except Exception as e:
    print(f"Error connecting to database: {e}")
    exit(1)

# Function to extract data from the database
def fetch_ohlc_data(contract_id, timeframe_unit, timeframe_value, limit=10000):
    """Fetch OHLC data for specified contract and timeframe"""
    query = """
    SELECT id, contract_id, timestamp, open, high, low, close, volume, 
           timeframe_unit, timeframe_value
    FROM ohlc_bars
    WHERE contract_id = %s AND timeframe_unit = %s AND timeframe_value = %s
    ORDER BY timestamp
    LIMIT %s
    """
    cursor.execute(query, (contract_id, timeframe_unit, timeframe_value, limit))
    columns = [desc[0] for desc in cursor.description]
    data = cursor.fetchall()
    df = pd.DataFrame(data, columns=columns)
    
    # Convert timestamp to the expected format
    if 'timestamp' in df.columns and not df.empty:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    return df

def fetch_trend_points(contract_id, timeframe):
    """Fetch trend points for specified contract and timeframe"""
    query = """
    SELECT id, contract_id, timestamp, price, type, timeframe, created_at, updated_at
    FROM trend_points
    WHERE contract_id = %s AND timeframe = %s
    ORDER BY timestamp
    """
    cursor.execute(query, (contract_id, timeframe))
    columns = [desc[0] for desc in cursor.description]
    data = cursor.fetchall()
    
    # Convert to list of dictionaries
    trend_points = []
    for row in data:
        point = dict(zip(columns, row))
        # Convert datetime objects to ISO format for JSON serialization
        for key, value in point.items():
            if isinstance(value, datetime):
                point[key] = value.isoformat()
        trend_points.append(point)
    
    return trend_points

def list_contracts():
    """List all available contract IDs in the database"""
    query = "SELECT DISTINCT contract_id FROM ohlc_bars ORDER BY contract_id"
    cursor.execute(query)
    contracts = [row[0] for row in cursor.fetchall()]
    return contracts

def get_contract_timeframes(contract_id):
    """Get available timeframes for a specific contract"""
    query = """
    SELECT DISTINCT timeframe_unit, timeframe_value 
    FROM ohlc_bars 
    WHERE contract_id = %s 
    ORDER BY timeframe_unit, timeframe_value
    """
    cursor.execute(query, (contract_id,))
    return cursor.fetchall()

try:
    # List available contracts
    contracts = list_contracts()
    
    if not contracts:
        print("No contracts found in the database")
        exit(0)
    
    print("\nAvailable contracts:")
    for i, contract in enumerate(contracts, 1):
        print(f"{i}. {contract}")
    
    # Get user selection
    contract_choice = int(input("\nSelect contract number: "))
    if contract_choice < 1 or contract_choice > len(contracts):
        print("Invalid contract selection")
        exit(1)
    
    contract_id = contracts[contract_choice - 1]
    print(f"Selected contract: {contract_id}")
    
    # Get timeframes for selected contract
    timeframes = get_contract_timeframes(contract_id)
    
    if not timeframes:
        print(f"No timeframes found for contract {contract_id}")
        exit(0)
    
    print("\nAvailable timeframes:")
    for i, (unit, value) in enumerate(timeframes, 1):
        # Map to human-readable format
        if unit == 2:
            display = f"{value}m"
        elif unit == 3:
            display = f"{value}h"
        elif unit == 4:
            display = f"{value}d"
        elif unit == 5:
            display = f"{value}w"
        else:
            display = f"{value} x {unit}s"
        
        print(f"{i}. {display} (unit={unit}, value={value})")
    
    # Get timeframe selection
    tf_choice = int(input("\nSelect timeframe number: "))
    if tf_choice < 1 or tf_choice > len(timeframes):
        print("Invalid timeframe selection")
        exit(1)
    
    timeframe_unit, timeframe_value = timeframes[tf_choice - 1]
    
    # Map to timeframe string for trend points
    if timeframe_unit == 2:
        timeframe_string = f"{timeframe_value}m"
    elif timeframe_unit == 3:
        timeframe_string = f"{timeframe_value}h"
    elif timeframe_unit == 4:
        timeframe_string = f"{timeframe_value}d"
    elif timeframe_unit == 5:
        timeframe_string = f"{timeframe_value}w"
    else:
        timeframe_string = f"{timeframe_value}_{timeframe_unit}"
    
    print(f"Selected timeframe: {timeframe_string}")
    
    # Ask for data limit
    limit = input("\nEnter maximum number of bars to fetch (default 10000): ")
    limit = int(limit) if limit else 10000
    
    # Fetch data
    print(f"\nFetching OHLC data for {contract_id} with timeframe {timeframe_string}...")
    ohlc_df = fetch_ohlc_data(contract_id, timeframe_unit, timeframe_value, limit)
    
    print(f"Fetching trend points for {contract_id} with timeframe {timeframe_string}...")
    trend_points = fetch_trend_points(contract_id, timeframe_string)
    
    # Save data to files
    if not ohlc_df.empty:
        # Update output filenames to include contract and timeframe
        ohlc_output = f"data/{contract_id}_{timeframe_string}_ohlc.csv"
        trends_output = f"data/{contract_id}_{timeframe_string}_trends.json"
        
        ohlc_df.to_csv(ohlc_output, index=False)
        print(f"Saved {len(ohlc_df)} OHLC bars to {ohlc_output}")
    else:
        print("No OHLC data found")
    
    if trend_points:
        with open(trends_output, 'w') as f:
            json.dump(trend_points, f, indent=2)
        print(f"Saved {len(trend_points)} trend points to {trends_output}")
    else:
        print("No trend points found")
    
    print("\nNext steps:")
    print(f"1. Activate your virtual environment: 'source trend_env/bin/activate'")
    print(f"2. Run trend analysis: 'python -m src.run_trend_pattern_analysis --ohlc {ohlc_output} --trends {trends_output} --timeframe {timeframe_string} --visualize --output results_{contract_id}_{timeframe_string}'")

except Exception as e:
    print(f"Error: {e}")

finally:
    # Close database connection
    if 'cursor' in locals() and cursor:
        cursor.close()
    if 'conn' in locals() and conn:
        conn.close()
    print("Database connection closed") 