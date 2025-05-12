"""
Integration test for the market data pipeline.
"""

import unittest
import asyncio
import os
import tempfile
from datetime import datetime, timezone, timedelta
import logging

from src.core.config import Config
from src.data.ingestion.gateway_client import GatewayClient
from src.data.storage.db_handler import DBHandler
from src.data.aggregation import OHLCAggregator
from src.data.caching import TimeSeriesCache
from src.data.models import Bar, Trade


class MockGatewayClient:
    """Mock client for testing without actual API access."""
    
    def __init__(self, config):
        """Initialize the mock client."""
        self.config = config
        self.trade_callbacks = []
    
    def register_trade_callback(self, callback):
        """Register a callback for trade events."""
        self.trade_callbacks.append(callback)
    
    async def __aenter__(self):
        """Context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        pass
    
    async def retrieve_bars(self, contract_id, timeframe, **kwargs):
        """Return mock bars."""
        from src.core.utils import parse_timeframe
        
        unit, value = parse_timeframe(timeframe)
        
        # Generate 10 test bars
        bars = []
        now = datetime.now(timezone.utc)
        
        # Create bars with appropriate spacing
        if unit == 2:  # Minutes
            interval = timedelta(minutes=value)
        elif unit == 3:  # Hours
            interval = timedelta(hours=value)
        elif unit == 4:  # Days
            interval = timedelta(days=value)
        elif unit == 5:  # Weeks
            interval = timedelta(weeks=value)
        elif unit == 6:  # Months
            # Approximate a month as 30 days
            interval = timedelta(days=30 * value)
        else:
            interval = timedelta(seconds=value)
        
        for i in range(10):
            bar_time = now - (9 - i) * interval
            bars.append(Bar(
                t=bar_time,
                o=100.0 + i,
                h=100.0 + i + 2,
                l=100.0 + i - 1,
                c=100.0 + i + 1,
                v=1000.0,
                contract_id=contract_id,
                timeframe_unit=unit,
                timeframe_value=value
            ))
        
        return bars
    
    def simulate_trade(self, contract_id="TEST", price=100.0):
        """Simulate a trade event."""
        trade = Trade(
            contract_id=contract_id,
            timestamp=datetime.now(timezone.utc),
            price=price,
            volume=10.0
        )
        
        for callback in self.trade_callbacks:
            callback(trade)


class TestDataPipeline(unittest.TestCase):
    """Integration test for the market data pipeline."""
    
    def setUp(self):
        """Set up the test."""
        # Create a temporary directory for test data
        self.test_dir = tempfile.mkdtemp()
        
        # Create a test database file
        self.db_path = os.path.join(self.test_dir, "test.db")
        
        # Set up logging
        logging.basicConfig(level=logging.INFO)
    
    async def setup_pipeline(self):
        """Set up a test data pipeline."""
        # Create a config
        self.config = Config()
        
        # Create the mock gateway client
        self.gateway_client = MockGatewayClient(self.config)
        
        # Create the database handler
        self.db_handler = DBHandler(self.config, db_path=self.db_path)
        await self.db_handler.setup()
        
        # Create the aggregator
        self.aggregator = OHLCAggregator()
        
        # Create the cache
        self.cache = TimeSeriesCache()
        
        # List of processed bars for testing
        self.processed_bars = []
        
        # Add timeframes to aggregator
        self.contract_id = "TEST"
        self.timeframes = ["5m", "1h"]
        
        for timeframe in self.timeframes:
            self.aggregator.add_timeframe(self.contract_id, timeframe)
            self.aggregator.register_bar_callback(
                self.contract_id, 
                timeframe, 
                self.on_bar_completed
            )
        
        # Register trade callback
        self.gateway_client.register_trade_callback(self.on_trade_received)
        
        return self
    
    async def on_bar_completed(self, bar):
        """Bar completion callback for testing."""
        self.processed_bars.append(bar)
        await self.db_handler.store_bar(bar)
        self.cache.add_bar(bar)
    
    def on_trade_received(self, trade):
        """Trade received callback for testing."""
        self.aggregator.process_trade(trade)
    
    async def test_historical_data_loading(self):
        """Test loading historical data into the pipeline."""
        await self.setup_pipeline()
        
        # Load historical data for each timeframe
        async with self.gateway_client:
            for timeframe in self.timeframes:
                bars = await self.gateway_client.retrieve_bars(
                    contract_id=self.contract_id,
                    timeframe=timeframe
                )
                
                # Store in database
                count = await self.db_handler.store_bars(bars)
                self.assertEqual(count, len(bars))
                
                # Add to cache
                self.cache.add_bars(self.contract_id, timeframe, bars)
                
                # Verify data is in cache
                cached_bars = self.cache.get_bars(self.contract_id, timeframe)
                self.assertIsNotNone(cached_bars)
                self.assertEqual(len(cached_bars), len(bars))
                
                # Verify latest bar is correct
                latest_bar = self.cache.get_latest_bar(self.contract_id, timeframe)
                self.assertEqual(latest_bar.c, bars[-1].c)
                
                # Verify data is in database
                from src.core.utils import parse_timeframe
                unit, value = parse_timeframe(timeframe)
                
                db_bars = await self.db_handler.get_bars(
                    contract_id=self.contract_id,
                    timeframe_unit=unit,
                    timeframe_value=value,
                    limit=100
                )
                
                self.assertEqual(len(db_bars), len(bars))
    
    async def test_real_time_processing(self):
        """Test real-time trade processing through the pipeline."""
        await self.setup_pipeline()
        
        # Simulate a few trades
        self.gateway_client.simulate_trade(self.contract_id, 100.0)
        self.gateway_client.simulate_trade(self.contract_id, 101.0)
        self.gateway_client.simulate_trade(self.contract_id, 102.0)
        
        # Allow some time for async processing
        await asyncio.sleep(0.1)
        
        # Verify that trade processing doesn't create bars immediately
        # (bars are only created when their timeframe completes)
        self.assertEqual(len(self.processed_bars), 0)
        
        # Clean up
        await self.aggregator.stop()
        await self.db_handler.close()


def run_async_test(coro):
    """Helper function to run async test coroutines."""
    return asyncio.run(coro)


if __name__ == "__main__":
    unittest.main() 