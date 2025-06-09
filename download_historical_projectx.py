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
import subprocess
from datetime import datetime, timezone, timedelta

# ---- START DEBUG ----
from dotenv import load_dotenv
load_dotenv() # Try loading .env explicitly here too
print(f"DEBUG: PROJECTX_USERNAME from os.getenv in download_historical.py (top): '{os.getenv('PROJECTX_USERNAME')}'")
# ---- END DEBUG ----

# Add the project root to Python path
# sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# The above line might be problematic if __file__ is not what's expected when run from project root.
# Let's assume project root is already in PYTHONPATH or use a more robust way if needed.
# For now, since Config is in src.core, direct imports should work if script is run from project root.

from src.core.config import Config
from src.core.logging_config import setup_logging
from src.data.ingestion.gateway_client import GatewayClient
from src.data.storage.db_handler import DBHandler
from src.data.validation import validate_bars
from src.core.exceptions import DatabaseError


# Default timeframes to download if none specified
# These are string representations that map to the database as follows:
# - "Xs" = timeframe_unit=1 (second), timeframe_value=X
# - "Xm" = timeframe_unit=2 (minute), timeframe_value=X
# - "Xh" = timeframe_unit=3 (hour), timeframe_value=X
# - "Xd" = timeframe_unit=4 (day), timeframe_value=X
# - "Xw" = timeframe_unit=5 (week), timeframe_value=X
DEFAULT_TIMEFRAMES = ["1s", "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]


def get_current_db_config(config, logger):
    """
    Get the current database configuration, checking if we're using the test database.
    """
    db_config = config.settings.get('database', {})
    active_db_key = db_config.get('default_ingestion_db', 'local_timescaledb')
    db_details = db_config.get(active_db_key, db_config.get('local_timescaledb', {}))
    
    # Log current database configuration
    logger.info(f"Using database configuration: {active_db_key}")
    logger.info(f"Database: {db_details.get('dbname', 'unknown')}")
    logger.info(f"Host: {db_details.get('host', 'unknown')}:{db_details.get('port', 'unknown')}")
    
    return db_details


def ensure_timescaledb_running(logger, db_config):
    """
    Check if TimescaleDB is running and start it if not.
    Updated to handle both production and test databases.
    """
    try:
        # Determine which container to check based on database name
        db_name = db_config.get('dbname', 'projectx')
        db_port = db_config.get('port', 5433)
        
        if db_name == 'projectx_test' or db_port == 5434:
            container_name = "projectx_test_timescaledb"
            logger.info(f"Checking for test database container: {container_name}")
        else:
            container_name = "projectx_timescaledb"
            logger.info(f"Checking for production database container: {container_name}")
        
        # Check if container is running
        result = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}", "--filter", f"name={container_name}"],
            capture_output=True,
            text=True,
            check=True
        )
        
        if container_name in result.stdout:
            logger.info(f"TimescaleDB container '{container_name}' is already running")
            return True
        
        # Check if any container is using the target port
        port_check = subprocess.run(
            ["docker", "ps", "--format", "table {{.Names}}\t{{.Ports}}"],
            capture_output=True,
            text=True,
            check=True
        )
        
        if f":{db_port}->" in port_check.stdout:
            logger.info(f"A container is already using port {db_port}")
            return True
            
        logger.info(f"TimescaleDB container '{container_name}' not running")
        
        # For test database, provide instructions
        if db_name == 'projectx_test':
            logger.warning(f"Test database container not found. Please run:")
            logger.warning(f"  ./scripts/create_new_db_docker_prisma.sh {db_name} {db_port}")
            return False
        
        # For production database, try to start it
        logger.info("Attempting to start production TimescaleDB...")
        script_path = os.path.join(os.getcwd(), "run_timescaledb_docker.sh")
        if os.path.exists(script_path):
            subprocess.run(["chmod", "+x", script_path], check=True)
            result = subprocess.run([script_path], capture_output=True, text=True, check=True)
            logger.info("TimescaleDB started successfully")
            return True
        else:
            logger.error(f"TimescaleDB startup script not found at {script_path}")
            return False
            
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to check/start TimescaleDB: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error checking TimescaleDB: {e}")
        return False


async def download_historical_data(
    start_date=None, 
    end_date=None, 
    batch_size=1000,
    contracts=None,
    timeframes=None,
):
    """
    Download historical data for all configured contracts and timeframes.
    
    Args:
        start_date: Start date for historical data (default: depends on timeframe)
        end_date: End date for historical data (default: current time)
        batch_size: Number of bars per request (max 1000)
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
    
    # Get current database configuration
    db_config = get_current_db_config(config, logger)
    
    # Log database type
    db_type = "TimescaleDB" if config.use_timescale() else "SQLite"
    logger.info(f"Using {db_type} for data storage")
    
    # Auto-start TimescaleDB if using it and not running
    if config.use_timescale():
        if not ensure_timescaledb_running(logger, db_config):
            logger.error("Failed to ensure TimescaleDB is running. Please check Docker installation and try again.")
            return 1
        
        # Give the database a moment to fully initialize
        logger.info("Waiting for TimescaleDB to initialize...")
        await asyncio.sleep(3)
    
    # Create database handler
    db_handler = DBHandler(config)
    
    try:
        await db_handler.setup()
    except DatabaseError as e:
        if config.use_timescale():
            logger.error(f"Database connection failed: {e}")
            logger.info("TimescaleDB may still be starting up. Waiting and retrying...")
            await asyncio.sleep(5)
            try:
                await db_handler.setup()
                logger.info("Database connection successful on retry")
            except DatabaseError as retry_e:
                logger.error(f"Database setup failed after retry: {retry_e}")
                logger.error("Please check TimescaleDB status manually: docker ps | grep timescale")
                return 1
        else:
            raise
    
    # Create gateway client
    gateway_client = GatewayClient(config)
    
    # Set end date to current time if not provided
    if end_date is None:
        end_date = datetime.now(timezone.utc)
        logger.info(f"End date set to current time: {end_date.isoformat()}")
    
    # Contract IDs to download - using the full qualified name format
    if contracts is None:
        contracts = [
            "CON.F.US.MES.M25",  # Micro E-mini S&P 500 June 2025
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
                        if unit == 1:  # Seconds
                            days_back = 7  # 1s bars - 1 week (very high volume data)
                        elif unit == 2:  # Minutes
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
                    total_requests_for_timeframe = 0
                    
                    # Continue downloading until we hit consecutive empty batches or reasonable limits
                    while consecutive_empty_batches < 5 and total_requests_for_timeframe < 100:
                        try:
                            # Get historical bars from current period
                            logger.info(f"Requesting batch {requests_made+1}: {current_start_date.isoformat()} to {batch_end_date.isoformat()}")
                            
                            bars = await gateway_client.retrieve_bars(
                                contract_id=contract_id,
                                timeframe=timeframe,
                                start_time=current_start_date,
                                end_time=batch_end_date,
                                limit=batch_size,
                                include_partial_bar=False
                            )
                            
                            total_requests_for_timeframe += 1
                            
                            # Validate bars
                            valid_bars = validate_bars(bars)
                            
                            if not valid_bars:
                                logger.warning(f"No valid bars retrieved in batch {total_requests_for_timeframe}")
                                consecutive_empty_batches += 1
                                
                                # If first request has no data, break early
                                if requests_made == 0:
                                    logger.info(f"No data available for {contract_id} {timeframe}")
                                    break
                                    
                                # Adjust dates and continue - go back further in time
                                time_window = batch_end_date - current_start_date
                                batch_end_date = current_start_date - timedelta(seconds=1)
                                current_start_date = batch_end_date - time_window
                                requests_made += 1
                                
                                logger.info(f"Adjusting date range due to empty batch: {current_start_date.isoformat()} to {batch_end_date.isoformat()}")
                                await asyncio.sleep(1)  # Wait 1 second between empty requests
                                continue
                            
                            # If we got data, reset empty batch counter
                            consecutive_empty_batches = 0
                            
                            # Store in database
                            num_stored = await db_handler.store_bars(valid_bars)
                            logger.info(f"✓ Batch {total_requests_for_timeframe}: Downloaded and stored {num_stored} new bars out of {len(valid_bars)} retrieved for {contract_id} {timeframe}")
                            bars_downloaded += num_stored
                            total_bars += num_stored
                            
                            # Progress indicator
                            if total_requests_for_timeframe % 10 == 0:
                                logger.info(f"Progress: {total_requests_for_timeframe} requests made, {bars_downloaded} total bars downloaded for {contract_id} {timeframe}")
                            
                            # Check if we've reached the beginning of available data
                            if len(valid_bars) < batch_size / 3:  # More lenient threshold
                                logger.info(f"Received {len(valid_bars)} bars (less than {batch_size//3}), likely near beginning of available data")
                                consecutive_empty_batches += 1
                                if consecutive_empty_batches >= 2:
                                    logger.info(f"Stopping due to consistently small batches for {contract_id} {timeframe}")
                                    break
                            
                            # Update date range for next batch
                            # Find earliest timestamp and use it as the new end date
                            timestamps = [bar.t for bar in valid_bars]
                            if timestamps:
                                earliest_timestamp = min(timestamps)
                                batch_end_date = earliest_timestamp - timedelta(seconds=1)
                                
                                # Calculate time window dynamically based on timeframe
                                if unit == 1:  # Seconds - smaller windows
                                    time_window = timedelta(hours=6)
                                elif unit == 2 and unit_number <= 5:  # 1m, 5m - medium windows
                                    time_window = timedelta(days=7)
                                elif unit == 2:  # Other minutes - larger windows
                                    time_window = timedelta(days=14)
                                elif unit == 3:  # Hours - very large windows
                                    time_window = timedelta(days=30)
                                else:  # Days, weeks - huge windows
                                    time_window = timedelta(days=90)
                                
                                current_start_date = batch_end_date - time_window
                                
                                if total_requests_for_timeframe <= 3:  # Log first few ranges
                                    logger.info(f"Next batch date range: {current_start_date.isoformat()} to {batch_end_date.isoformat()}")
                            else:
                                # If no timestamps, just shift back by a reasonable window
                                window_size = batch_end_date - current_start_date
                                batch_end_date = current_start_date - timedelta(seconds=1)
                                current_start_date = batch_end_date - window_size
                            
                            requests_made += 1
                            
                            # Apply rate limiting - increased for high-frequency data
                            if unit == 1:  # Seconds data - more conservative rate limiting
                                await asyncio.sleep(2)  # Wait 2 seconds between 1s data requests
                            else:
                                await asyncio.sleep(1)  # Wait 1 second between requests
                            
                        except Exception as e:
                            logger.error(f"Error downloading batch for {contract_id} {timeframe}: {str(e)}")
                            # Try to continue with next timeframe
                            break
                    
                    if consecutive_empty_batches >= 5:
                        logger.info(f"Stopping after {consecutive_empty_batches} consecutive empty batches")
                    elif total_requests_for_timeframe >= 100:
                        logger.info(f"Stopping after reaching request limit ({total_requests_for_timeframe} requests)")
                        
                    logger.info(f"Completed {contract_id} {timeframe}: {bars_downloaded} new bars with {total_requests_for_timeframe} total requests")
                    
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
    
    parser.add_argument("--start-date", type=str, help="Start date (YYYY-MM-DD, YYYY-M-D, YYYY/MM/DD, MM/DD/YYYY, or MM-DD-YYYY)")
    parser.add_argument("--end-date", type=str, help="End date (YYYY-MM-DD, YYYY-M-D, YYYY/MM/DD, MM/DD/YYYY, or MM-DD-YYYY)")
    parser.add_argument("--batch-size", type=int, default=1000, help="Number of bars per request (max 1000)")
    parser.add_argument("--contracts", type=str, help="Comma-separated list of contract IDs")
    parser.add_argument("--timeframes", type=str, help="Comma-separated list of timeframes (e.g. 1m,5m,30m,1h,4h,1d,1w)")
    
    args = parser.parse_args()
    
    # Parse dates with flexible format support
    start_date = None
    if args.start_date:
        try:
            # Try ISO format first
            start_date = datetime.fromisoformat(args.start_date).replace(tzinfo=timezone.utc)
        except ValueError:
            # Try common date formats if ISO fails
            for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%m/%d/%Y', '%m-%d-%Y']:
                try:
                    start_date = datetime.strptime(args.start_date, fmt).replace(tzinfo=timezone.utc)
                    break
                except ValueError:
                    continue
            if start_date is None:
                print(f"Error: Invalid start date format '{args.start_date}'. Use YYYY-MM-DD format (e.g., 2025-03-01)")
                sys.exit(1)
        
    end_date = None
    if args.end_date:
        try:
            # Try ISO format first
            end_date = datetime.fromisoformat(args.end_date).replace(tzinfo=timezone.utc)
        except ValueError:
            # Try common date formats if ISO fails
            for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%m/%d/%Y', '%m-%d-%Y']:
                try:
                    end_date = datetime.strptime(args.end_date, fmt).replace(tzinfo=timezone.utc)
                    break
                except ValueError:
                    continue
            if end_date is None:
                print(f"Error: Invalid end date format '{args.end_date}'. Use YYYY-MM-DD format (e.g., 2025-03-01)")
                sys.exit(1)
    
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
            contracts=contracts,
            timeframes=timeframes,
        ))
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nDownload cancelled by user")
        sys.exit(0) 