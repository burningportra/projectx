#!/usr/bin/env python3

"""
Entry point script for the ProjectX trading system.
"""

import asyncio
import sys
import os
import logging
from pathlib import Path

# Add the project root to the Python path if needed
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from src.core.logging_config import setup_logging
from src.core.config import Config
from src.main import TradingApp


async def start_trading():
    """Start the trading application."""
    # Setup logging
    logger = setup_logging(log_level="INFO")
    logger.info("Starting ProjectX trading system...")
    
    try:
        # Create required directories
        for directory in ["logs", "config", "config/strategies"]:
            os.makedirs(directory, exist_ok=True)
            
        # Create a config object to check for settings
        config = Config()
        
        # Check for valid API token
        if not config.get_api_token() or not config.validate_api_token():
            logger.warning(
                "No valid API token found. Please set the PROJECTX_API_TOKEN environment variable "
                "or add it to your configuration."
            )
            answer = input("Do you want to continue without a valid API token? (y/N): ")
            if answer.lower() not in ["y", "yes"]:
                logger.info("Exiting due to missing or invalid API token.")
                return
            
        # Check if we should run in historical data mode only
        historical_only = os.getenv("PROJECTX_HISTORICAL_ONLY", "false").lower() in ["true", "1", "yes"]
        if historical_only:
            logger.info("Running in historical data mode only (no real-time updates)")
            
        # Start the trading app
        app = TradingApp(historical_only=historical_only)
        await app.run()
            
    except KeyboardInterrupt:
        logger.info("Trading system stopped by user.")
    except Exception as e:
        logger.error(f"Error starting trading system: {str(e)}", exc_info=True)
        return 1
        
    return 0
    

if __name__ == "__main__":
    try:
        exit_code = asyncio.run(start_trading())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nTrading system terminated by user.")
        sys.exit(0)
