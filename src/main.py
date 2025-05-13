"""
Main entry point for the automated trading system.

This module initializes the trading system components and starts the application.
"""

import os
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta

from src.core.config import Config
from src.core.exceptions import ApiError, WebSocketConnectionError
from src.core.logging_config import setup_logging
from src.data.models import Bar
from src.data.ingestion.gateway_client import GatewayClient
from src.data.storage.db_handler import DBHandler
from src.data.aggregation import OHLCAggregator
from src.data.caching import TimeSeriesCache
from src.data.validation import validate_bars, validate_trade
from src.strategy.rule_engine import RuleEngine
from src.strategy.strategy_service import StrategyService
from src.execution.position_manager import PositionManager
from src.execution.strategy_executor import StrategyExecutor


# Setup logging first so other modules can use it
logger = setup_logging(log_level="INFO")

# Create config directory if it doesn't exist
config_dir = Path(__file__).parents[1] / "config"
os.makedirs(config_dir, exist_ok=True)

# Create logs directory
log_dir = Path(__file__).parents[1] / "logs"
os.makedirs(log_dir, exist_ok=True)

# Create data directory
data_dir = Path(__file__).parents[1] / "data"
os.makedirs(data_dir, exist_ok=True)

# Create strategies directory
strategies_dir = data_dir / "strategies"
os.makedirs(strategies_dir, exist_ok=True)


class TradingApp:
    """
    Main trading application that orchestrates all components.
    """
    
    def __init__(self, historical_only=False):
        """
        Initialize the trading application.
        
        Args:
            historical_only (bool): If True, only historical data processing will be used.
        """
        self.config = Config()
        self.logger = logging.getLogger(__name__)
        self.db_handler = None
        self.gateway_client = None
        self.aggregator = None
        self.cache = None
        self.rule_engine = None
        self.strategy_service = None
        self.position_manager = None
        self.strategy_executor = None
        self.historical_only = historical_only
        
        # Settings
        self.contract_ids = [
            "CON.F.US.MES.M25",  # Micro E-mini S&P 500 June 2025
        ]
        self.timeframes = self.config.get_timeframes()
        
    async def setup(self):
        """Set up the application components."""
        self.logger.info("Setting up trading application...")
        
        # Initialize database handler
        self.db_handler = DBHandler(self.config)
        await self.db_handler.setup()
        
        # Initialize gateway client
        self.gateway_client = GatewayClient(self.config)
        
        # Initialize aggregator
        self.aggregator = OHLCAggregator()
        
        # Initialize cache
        self.cache = TimeSeriesCache(max_items=1000, ttl_seconds=3600)
        
        # Initialize rule engine
        self.rule_engine = RuleEngine()
        
        # Initialize strategy service
        self.strategy_service = StrategyService()
        await self.strategy_service.initialize()
        
        # Initialize position manager
        self.position_manager = PositionManager()
        
        # Initialize strategy executor
        self.strategy_executor = StrategyExecutor(
            strategy_service=self.strategy_service,
            rule_engine=self.rule_engine,
            position_manager=self.position_manager
        )
        await self.strategy_executor.initialize()
        
        # Register position management callbacks
        self.position_manager.register_position_opened_callback(self.on_position_opened)
        self.position_manager.register_position_closed_callback(self.on_position_closed)
        self.position_manager.register_order_updated_callback(self.on_order_updated)
        
        # Register callbacks
        self.strategy_service.register_strategy_activated_callback(self.on_strategy_activated)
        self.strategy_service.register_strategy_deactivated_callback(self.on_strategy_deactivated)
        
        # Register callback for completed bars
        for contract_id in self.contract_ids:
            for timeframe in self.timeframes:
                self.aggregator.add_timeframe(contract_id, timeframe)
                self.aggregator.register_bar_callback(
                    contract_id, 
                    timeframe, 
                    self.on_bar_completed
                )
        
        # Register callback for trades
        self.gateway_client.register_trade_callback(self.on_trade_received)
        
        self.logger.info("Trading application setup complete")
        
    async def bootstrap_historical_data(self):
        """Load historical data for all contracts and timeframes."""
        self.logger.info("Bootstrapping historical data...")
        
        # Skip API access in historical-only mode
        if self.historical_only:
            self.logger.info("Historical-only mode: Using local database for historical data")
            self.logger.info("Historical data bootstrap process completed")
            return
            
        # Proceed with API access for live mode
        try:
            # Initialize the gateway client session
            if self.gateway_client.session is None:
                await self.gateway_client._ensure_session()
            
            # Try authenticating
            try:
                await self.gateway_client._login()
                self.logger.info("Authentication successful, proceeding with data retrieval")
                
                # Proceed with retrieving historical data
                for contract_id in self.contract_ids:
                    for timeframe in self.timeframes:
                        self.logger.info(f"Loading historical data for {contract_id} {timeframe}")
                        try:
                            # Get historical bars
                            bars = await self.gateway_client.retrieve_bars(
                                contract_id=contract_id,
                                timeframe=timeframe,
                                limit=100  # Adjust as needed
                            )
                            
                            # Validate bars
                            valid_bars = validate_bars(bars)
                            
                            # Store in database
                            if valid_bars:
                                await self.db_handler.store_bars(valid_bars)
                                
                                # Add to cache
                                self.cache.add_bars(contract_id, timeframe, valid_bars)
                                
                                # Add to rule engine
                                self.rule_engine.add_bars(contract_id, timeframe, valid_bars)
                                
                                self.logger.info(f"Loaded {len(valid_bars)} bars for {contract_id} {timeframe}")
                            else:
                                self.logger.warning(f"No valid bars retrieved for {contract_id} {timeframe}")
                                
                        except Exception as e:
                            self.logger.error(f"Error loading historical data for {contract_id} {timeframe}: {str(e)}")
                
                # Clean up
                if self.gateway_client.session:
                    await self.gateway_client.session.close()
                    self.gateway_client.session = None
                    
            except ApiError as e:
                self.logger.error(f"Authentication failed: {str(e)}")
                self.logger.warning("Historical data bootstrapping skipped due to authentication failure")
                self.logger.info("System will continue with limited functionality")
                
                # Close session if open
                if self.gateway_client.session:
                    await self.gateway_client.session.close()
                    self.gateway_client.session = None
                
        except Exception as e:
            self.logger.error(f"Error during bootstrap process: {str(e)}", exc_info=True)
            self.logger.warning("Historical data bootstrapping failed")
            self.logger.info("System will continue with limited functionality")
        
        self.logger.info("Historical data bootstrap process completed")
        
    async def start_real_time_processing(self):
        """Start real-time data processing."""
        self.logger.info("Starting real-time data processing...")
        
        try:
            # Initialize the gateway client session if needed
            if self.gateway_client.session is None:
                await self.gateway_client._ensure_session()
            
            try:
                # Make sure we're authenticated
                if self.gateway_client.session_token is None:
                    await self.gateway_client._login()
                    
                try:
                    # Connect to the market hub
                    self.logger.info("Attempting to connect to market hub")
                    await self.gateway_client.connect_market_hub()
                    
                    # Subscribe to contract trades
                    for contract_id in self.contract_ids:
                        try:
                            await self.gateway_client.subscribe_contract_trades(contract_id)
                            self.logger.info(f"Subscribed to trades for {contract_id}")
                        except Exception as e:
                            self.logger.error(f"Failed to subscribe to trades for {contract_id}: {str(e)}")
                            # Continue with other contracts even if one fails
                    
                    self.logger.info("Real-time data processing started")
                    
                    # Start strategy evaluation loop
                    asyncio.create_task(self.strategy_evaluation_loop())
                    
                    # Keep the application running
                    while True:
                        await asyncio.sleep(60)
                        
                except WebSocketConnectionError as e:
                    self.logger.warning(f"WebSocket connection not available: {str(e)}")
                    self.logger.info("Running in historical data mode only (no real-time updates)")
                    # Sleep to keep the application running in historical-only mode
                    await asyncio.sleep(600)  # 10 minutes
                    
            except ApiError as e:
                self.logger.error(f"Authentication failed for real-time processing: {str(e)}")
                self.logger.warning("Real-time data processing will not be available")
                
                # Sleep for a while before returning to indicate the application is still running
                await asyncio.sleep(5)
                
            except asyncio.CancelledError:
                self.logger.info("Real-time processing cancelled")
                raise  # Re-raise CancelledError to properly propagate it
                
            except Exception as e:
                self.logger.error(f"Error in real-time data processing: {str(e)}", exc_info=True)
                
                # Sleep for a while to avoid busy-looping if there's a persistent error
                await asyncio.sleep(5)
            
        except Exception as e:
            self.logger.error(f"Error starting real-time processing: {str(e)}", exc_info=True)
            
    async def strategy_evaluation_loop(self):
        """Periodically evaluate strategies and execute trades if triggered."""
        self.logger.info("Starting strategy evaluation loop")
        
        while True:
            try:
                # Evaluate active strategies and execute trades if needed
                await self.strategy_executor.evaluate_strategies()
            except Exception as e:
                self.logger.error(f"Error in strategy evaluation: {str(e)}", exc_info=True)
            
            # Wait before next evaluation
            await asyncio.sleep(5)  # Evaluate every 5 seconds
    
    async def process_rule_results(self, strategy, results):
        """Process rule evaluation results."""
        # This method is no longer needed as StrategyExecutor handles rule execution
        pass
            
    def on_trade_received(self, trade):
        """Callback for when a new trade is received."""
        # Validate trade
        valid_trade = validate_trade(trade)
        if not valid_trade:
                return
                
        # Process trade
        self.logger.debug(f"Trade received: {trade.contract_id} @ {trade.price}")
        
        # Update aggregator
            self.aggregator.process_trade(trade)
            
        # Update position prices if applicable
        self._update_positions_with_trade(trade)
            
    async def on_bar_completed(self, bar):
        """Callback for when a new bar is completed."""
        try:
            # Store bar in DB
            await self.db_handler.store_bar(bar)
            
            # Add to cache
            self.cache.add_bar(bar.contract_id, f"{bar.timeframe_value}{self._get_timeframe_unit_str(bar.timeframe_unit)}", bar)
            
            # Add to rule engine
            self.rule_engine.update_with_bar(bar)
            
            self.logger.debug(
                f"Bar completed: {bar.contract_id} {bar.timeframe_value}{self._get_timeframe_unit_str(bar.timeframe_unit)} "
                f"@ {bar.t}: O:{bar.o} H:{bar.h} L:{bar.l} C:{bar.c} V:{bar.v}"
            )
            
        except Exception as e:
            self.logger.error(f"Error processing completed bar: {str(e)}", exc_info=True)
            
    def _update_positions_with_trade(self, trade):
        """Update position prices based on a new trade."""
        open_positions = self.position_manager.get_open_positions()
        
        for position in open_positions:
            if position.contract_id == trade.contract_id:
                self.position_manager.update_position_price(position.id, trade.price)
            
    def on_strategy_activated(self, strategy):
        """Callback for when a strategy is activated."""
        self.logger.info(f"Strategy activated: {strategy.name} ({strategy.id})")
        asyncio.create_task(self.load_strategy_rule_set(strategy))
        
    def on_strategy_deactivated(self, strategy):
        """Callback for when a strategy is deactivated."""
        self.logger.info(f"Strategy deactivated: {strategy.name} ({strategy.id})")
        
        # Remove rule set from rule engine
        rule_set_id = strategy.rule_set_id
        if rule_set_id in self.rule_engine.rule_sets:
            self.rule_engine.remove_rule_set(rule_set_id)
            self.logger.info(f"Removed rule set {rule_set_id} from rule engine")
            
    def on_position_opened(self, position):
        """Callback for when a position is opened."""
        self.logger.info(
            f"Position opened: {position.side.value} {position.quantity} {position.contract_id} "
            f"at {position.entry_price}"
        )
        
    def on_position_closed(self, position):
        """Callback for when a position is closed."""
        self.logger.info(
            f"Position closed: {position.side.value} {position.quantity} {position.contract_id}, "
            f"P&L: {position.realized_pnl:.2f}"
        )
        
    def on_order_updated(self, order):
        """Callback for when an order is updated."""
        self.logger.info(
            f"Order updated: {order.side.value} {order.quantity} {order.contract_id} "
            f"status: {order.status.value}, filled: {order.filled_quantity}/{order.quantity}"
        )
            
    async def load_strategy_rule_set(self, strategy):
        """Load a strategy's rule set into the rule engine."""
        try:
            # Get rule set
            rule_set = await self.strategy_service.get_rule_set(strategy.rule_set_id)
            if not rule_set:
                self.logger.error(f"Rule set {strategy.rule_set_id} not found for strategy {strategy.id}")
                return
                
            # Add to rule engine
            self.rule_engine.add_rule_set(rule_set)
            
            self.logger.info(f"Loaded rule set {rule_set.id} for strategy {strategy.name}")
            
        except Exception as e:
            self.logger.error(f"Error loading rule set for strategy {strategy.id}: {str(e)}", exc_info=True)
            
    def _get_timeframe_unit_str(self, unit_code: int) -> str:
        """Convert timeframe unit code to string."""
        mapping = {
            1: 's',  # seconds
            2: 'm',  # minutes
            3: 'h',  # hours
            4: 'd',  # days
            5: 'w',  # weeks
            6: 'mo'  # months
        }
        return mapping.get(unit_code, '')
            
    async def run(self):
        """Run the trading application."""
        try:
            # Set up application
        await self.setup()
            
            # Bootstrap historical data
        await self.bootstrap_historical_data()
        
            # Start real-time processing
        if not self.historical_only:
            await self.start_real_time_processing()
                
        except Exception as e:
            self.logger.error(f"Error running trading application: {str(e)}", exc_info=True)


async def main():
    """Main entry point."""
    app = TradingApp()
    await app.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Application terminated by user")
    except Exception as e:
        logger.critical(f"Unhandled exception: {str(e)}", exc_info=True)
