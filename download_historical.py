#!/usr/bin/env python3
"""
Simple script to download historical data for all configured contracts.
This is a standalone script focused only on downloading data.
"""

import os
import sys
import asyncio
import logging

# Add the project root to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.core.config import Config
from src.core.logging_config import setup_logging
from src.data.ingestion.gateway_client import GatewayClient
from src.data.storage.db_handler import DBHandler
from src.data.validation import validate_bars


async def download_historical_data():
    """Download historical data for all configured contracts and timeframes."""
    logger = setup_logging(log_level="INFO")
    logger.info("Starting historical data download...")
    
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
    
    # Contract IDs to download - using the full qualified name format
    contracts = [
        "CON.F.US.MES.M25",  # Micro E-mini S&P 500 June 2025
    ]
    
    # Get timeframes from config
    timeframes = config.get_timeframes()
    
    try:
        # Initialize gateway session
        await gateway_client._ensure_session()
        
        # Login
        try:
            await gateway_client._login()
            logger.info("Authentication successful")
            
            # Download data for each contract and timeframe
            for contract_id in contracts:
                for timeframe in timeframes:
                    logger.info(f"Downloading {contract_id} {timeframe} data...")
                    try:
                        # Get historical bars - increase limit for more data
                        bars = await gateway_client.retrieve_bars(
                            contract_id=contract_id,
                            timeframe=timeframe,
                            limit=500  # Adjust as needed
                        )
                        
                        # Validate bars
                        valid_bars = validate_bars(bars)
                        
                        # Store in database
                        if valid_bars:
                            num_stored = await db_handler.store_bars(valid_bars)
                            logger.info(f"✓ Downloaded and stored {num_stored} bars for {contract_id} {timeframe} in {db_type}")
                        else:
                            logger.warning(f"No valid bars retrieved for {contract_id} {timeframe}")
                            
                    except Exception as e:
                        logger.error(f"Error downloading {contract_id} {timeframe}: {str(e)}")
            
            logger.info(f"Historical data download complete - data stored in {db_type}")
            
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
    try:
        exit_code = asyncio.run(download_historical_data())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nDownload cancelled by user")
        sys.exit(0) 