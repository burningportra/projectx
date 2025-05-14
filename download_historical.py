#!/usr/bin/env python3
"""
Enhanced script to download historical data for all configured contracts.
Supports downloading extensive historical data with customizable date ranges.
Includes support for all standard timeframes including 30m, 4h, and 1w.
Prevents duplicate entries by checking if bars already exist in database before insertion.
Downloads from current time to as far back as possible for each timeframe.
"""

import os
import sys
import asyncio
import logging
import argparse
from datetime import datetime, timezone, timedelta

# Add the project root to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.core.config import Config
from src.core.logging_config import setup_logging
from src.data.ingestion.gateway_client import GatewayClient
from src.data.storage.db_handler import DBHandler
from src.data.validation import validate_bars


# Default timeframes to download if none specified
# These are string representations that map to the database as follows:
# - "Xm" = timeframe_unit=2 (minute), timeframe_value=X
# - "Xh" = timeframe_unit=3 (hour), timeframe_value=X
# - "Xd" = timeframe_unit=4 (day), timeframe_value=X
# - "Xw" = timeframe_unit=5 (week), timeframe_value=X
DEFAULT_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]


async def download_historical_data(
    start_date=None, 
    end_date=None, 
    batch_size=1000,
    max_requests=200,
    contracts=None,
    timeframes=None,
):
    """
    Download historical data for all configured contracts and timeframes.
    
    Args:
        start_date: Start date for historical data (default: depends on timeframe)
        end_date: End date for historical data (default: current time)
        batch_size: Number of bars per request (max 1000)
        max_requests: Maximum number of requests per contract/timeframe (default: 200)
        contracts: List of contracts to download (default: from config)
        timeframes: List of timeframes to download (default: from config)
    """
    logger = setup_logging(log_level="INFO")
    logger.info("Starting enhanced historical data download (with duplicate prevention)...")
    logger.info("Will attempt to download as far back as possible for each timeframe")
    
    # Create config and check for API token
    config = Config()
    if not config.validate_api_token():
        logger.error("No valid API token found. Please set the PROJECTX_API_TOKEN environment variable.")
        logger.info("Create a .env file with your token or add it to config/settings.yaml")
        return 1
    
    # Log database type
    db_type = "TimescaleDB" if config.use_timescale() else "SQLite"
    logger.info(f"Using {db_type} for data storage")
    
    # Create database handler
    db_handler = DBHandler(config)
    await db_handler.setup()
    
    # Create gateway client
    gateway_client = GatewayClient(config)
    
    # Set end date to current time if not provided
    if end_date is None:
        end_date = datetime.now(timezone.utc)
        logger.info(f"End date set to current time: {end_date.isoformat()}")
    
    # Contract IDs to download - using the full qualified name format
    if contracts is None:
        contracts = [
            "CON.F.US.MES.H25",  # Micro E-mini S&P 500 June 2025
        ]
    
    # Use default timeframes if not specified
    if timeframes is None:
        # Try to get from config, fall back to defaults if not present
        try:
            timeframes = config.get_timeframes()
            logger.info(f"Using timeframes from config: {timeframes}")
        except Exception:
            timeframes = DEFAULT_TIMEFRAMES
            logger.info(f"Using default timeframes: {timeframes}")
    
    try:
        # Initialize gateway session
        await gateway_client._ensure_session()
        
        # Login
        try:
            await gateway_client._login()
            logger.info("Authentication successful")
            
            # Track total downloaded bars
            total_bars = 0
            
            # Download data for each contract and timeframe
            for contract_id in contracts:
                for timeframe in timeframes:
                    logger.info(f"Downloading {contract_id} {timeframe} data...")
                    
                    # Calculate appropriate start date if not specified
                    current_start_date = start_date
                    if current_start_date is None:
                        # Calculate start date based on timeframe to get a reasonable amount of history
                        from src.core.utils import parse_timeframe
                        unit, unit_number = parse_timeframe(timeframe)
                        
                        # Default lookback periods based on timeframe - set to longer periods
                        if unit == 2:  # Minutes
                            if unit_number <= 5:  # 1m, 5m bars - 60 days
                                days_back = 60
                            elif unit_number <= 15:  # 15m bars - 120 days
                                days_back = 120
                            else:  # 30m bars - 180 days
                                days_back = 180
                        elif unit == 3:  # Hours
                            if unit_number == 1:  # 1h bars - 365 days
                                days_back = 365
                            else:  # 4h bars - 730 days
                                days_back = 730
                        elif unit == 4:  # Days
                            days_back = 1095  # 1d bars - 3 years
                        elif unit == 5:  # Weeks
                            days_back = 1825  # 1w bars - 5 years
                        else:
                            days_back = 60  # Default
                            
                        current_start_date = end_date - timedelta(days=days_back)
                        logger.info(f"Initial start date for {timeframe}: {current_start_date.isoformat()} ({days_back} days back)")
                    
                    # Download data in batches to get more history
                    batch_end_date = end_date
                    requests_made = 0
                    bars_downloaded = 0
                    consecutive_empty_batches = 0
                    
                    while requests_made < max_requests and consecutive_empty_batches < 3:
                        try:
                            # Get historical bars from current period
                            logger.info(f"Requesting batch {requests_made+1}/{max_requests}: {current_start_date.isoformat()} to {batch_end_date.isoformat()}")
                            
                            bars = await gateway_client.retrieve_bars(
                                contract_id=contract_id,
                                timeframe=timeframe,
                                start_time=current_start_date,
                                end_time=batch_end_date,
                                limit=batch_size,
                                include_partial_bar=False
                            )
                            
                            # Validate bars
                            valid_bars = validate_bars(bars)
                            
                            if not valid_bars:
                                logger.warning(f"No valid bars retrieved in this batch")
                                consecutive_empty_batches += 1
                                
                                # If first request has no data, break early
                                if requests_made == 0:
                                    logger.info(f"No data available for {contract_id} {timeframe}")
                                    break
                                    
                                # Adjust dates and continue
                                batch_end_date = current_start_date
                                current_start_date = batch_end_date - timedelta(days=30)
                                requests_made += 1
                                await asyncio.sleep(1)  # Wait 1 second between empty requests
                                continue
                            
                            # If we got data, reset empty batch counter
                            consecutive_empty_batches = 0
                            
                            # Store in database
                            num_stored = await db_handler.store_bars(valid_bars)
                            logger.info(f"✓ Downloaded and stored {num_stored} new bars out of {len(valid_bars)} retrieved for {contract_id} {timeframe}")
                            bars_downloaded += num_stored
                            total_bars += num_stored
                            
                            # Check if we've reached the beginning of available data
                            if len(valid_bars) < batch_size / 2:
                                logger.info(f"Reached likely beginning of available data for {contract_id} {timeframe}")
                                break
                            
                            # Update date range for next batch
                            # Find earliest timestamp and use it as the new end date
                            timestamps = [bar.t for bar in valid_bars]
                            if timestamps:
                                batch_end_date = min(timestamps) - timedelta(seconds=1)
                                # Move start date back proportionally
                                time_span = end_date - current_start_date
                                current_start_date = batch_end_date - time_span
                                logger.info(f"New date range: {current_start_date.isoformat()} to {batch_end_date.isoformat()}")
                            else:
                                # If no timestamps, just shift back by the original window
                                window_size = batch_end_date - current_start_date
                                batch_end_date = current_start_date
                                current_start_date = batch_end_date - window_size
                            
                            requests_made += 1
                            
                            # Apply rate limiting
                            await asyncio.sleep(1)  # Wait 1 second between requests
                            
                        except Exception as e:
                            logger.error(f"Error downloading batch for {contract_id} {timeframe}: {str(e)}")
                            # Try to continue with next timeframe
                            break
                    
                    if consecutive_empty_batches >= 3:
                        logger.info(f"Stopping after {consecutive_empty_batches} consecutive empty batches")
                        
                    logger.info(f"Completed {contract_id} {timeframe}: {bars_downloaded} new bars with {requests_made} requests")
                    
                    # Avoid hitting rate limits between timeframes
                    await asyncio.sleep(2)
            
            logger.info(f"Historical data download complete - {total_bars} total new bars stored in {db_type}")
            
        except Exception as e:
            logger.error(f"Authentication failed: {str(e)}")
            return 1
            
    except Exception as e:
        logger.error(f"Error during historical download: {str(e)}", exc_info=True)
        return 1
        
    finally:
        # Clean up
        if gateway_client.session:
            await gateway_client.session.close()
        
        if db_handler:
            await db_handler.close()
    
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download historical data for trading")
    
    parser.add_argument("--start-date", type=str, help="Start date in ISO format (YYYY-MM-DD)")
    parser.add_argument("--end-date", type=str, help="End date in ISO format (YYYY-MM-DD)")
    parser.add_argument("--batch-size", type=int, default=1000, help="Number of bars per request (max 1000)")
    parser.add_argument("--max-requests", type=int, default=200, help="Maximum number of requests per contract/timeframe")
    parser.add_argument("--contracts", type=str, help="Comma-separated list of contract IDs")
    parser.add_argument("--timeframes", type=str, help="Comma-separated list of timeframes (e.g. 1m,5m,30m,1h,4h,1d,1w)")
    
    args = parser.parse_args()
    
    # Parse dates
    start_date = None
    if args.start_date:
        start_date = datetime.fromisoformat(args.start_date).replace(tzinfo=timezone.utc)
        
    end_date = None
    if args.end_date:
        end_date = datetime.fromisoformat(args.end_date).replace(tzinfo=timezone.utc)
    
    # Parse contracts and timeframes
    contracts = None
    if args.contracts:
        contracts = [contract.strip() for contract in args.contracts.split(",")]
        
    timeframes = None
    if args.timeframes:
        timeframes = [tf.strip() for tf in args.timeframes.split(",")]
    
    try:
        exit_code = asyncio.run(download_historical_data(
            start_date=start_date,
            end_date=end_date,
            batch_size=args.batch_size,
            max_requests=args.max_requests,
            contracts=contracts,
            timeframes=timeframes,
        ))
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nDownload cancelled by user")
        sys.exit(0) 