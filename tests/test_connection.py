#!/usr/bin/env python3
"""
Test script to verify API connection and available contracts.
"""

import os
import sys
import asyncio
import logging
import json
from pathlib import Path

# Add the project root to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.core.config import Config
from src.core.logging_config import setup_logging
from src.data.ingestion.gateway_client import GatewayClient


async def test_connection():
    """Test API connection and authentication."""
    logger = setup_logging(log_level="INFO")
    logger.info("Testing API connection...")
    
    # Load configuration
    config = Config()
    
    # Create gateway client
    gateway_client = GatewayClient(config)
    
    try:
        # Initialize session
        await gateway_client._ensure_session()
        
        # Test authentication
        try:
            await gateway_client._login()
            logger.info("✓ Authentication successful!")
            
            # Try different contract formats
            contract_formats = [
                "ES",              # Simple symbol
                "ESM24",           # Symbol + Month + Year
                "ES.M24",          # Symbol + Month + Year with dot
                "CON.F.US.ES.M24", # Full contract path
                "ES.MES",          # E-mini with micro prefix
                "M.ES",            # Micro prefix first notation
                "MES",             # Micro prefix combined notation
            ]
            
            logger.info("Testing contract formats...")
            for contract in contract_formats:
                logger.info(f"Testing contract format: {contract}")
                try:
                    # Try to retrieve 1 bar just to test the format
                    bars = await gateway_client.retrieve_bars(
                        contract_id=contract,
                        timeframe="1d",
                        limit=1
                    )
                    
                    if bars:
                        logger.info(f"✓ Format works: {contract} - Received {len(bars)} bars")
                    else:
                        logger.info(f"✗ Format may work but no data: {contract}")
                except Exception as e:
                    logger.error(f"✗ Format failed: {contract} - Error: {str(e)}")
            
            # Clean up
            if gateway_client.session:
                await gateway_client.session.close()
                
        except Exception as e:
            logger.error(f"Authentication failed: {str(e)}")
            return 1
            
    except Exception as e:
        logger.error(f"Connection error: {str(e)}", exc_info=True)
        return 1
    
    return 0


if __name__ == "__main__":
    try:
        exit_code = asyncio.run(test_connection())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nTest cancelled by user")
        sys.exit(0) 