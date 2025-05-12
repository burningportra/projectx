"""
Strategy engine for the automated trading system.

This module handles loading, initializing, and running trading strategies.
"""

import os
import logging
import importlib
from typing import Dict, List, Any, Optional, Callable
from pathlib import Path

from src.core.config import Config
from src.data.models import Bar
from src.strategies.base import Strategy


logger = logging.getLogger(__name__)


class StrategyEngine:
    """
    Strategy engine that manages all trading strategies.
    
    This class is responsible for:
    - Loading strategy configurations
    - Initializing strategy instances
    - Processing new market data and generating signals
    - Tracking strategy performance
    """
    
    def __init__(self, config: Config):
        """
        Initialize the strategy engine.
        
        Args:
            config: Configuration object
        """
        self.config = config
        self.strategies: Dict[str, Strategy] = {}
        self.strategy_configs: Dict[str, Dict[str, Any]] = {}
        
        # Callback for when a strategy generates a signal
        self.signal_callback: Optional[Callable] = None
        
    async def load_strategies(self):
        """
        Load all enabled strategies from the configuration.
        
        Returns:
            Number of strategies loaded
        """
        logger.info("Loading strategies...")
        
        # Get the strategies directory
        strategies_dir = Path(self.config.config_dir) / "strategies"
        
        if not strategies_dir.exists():
            logger.warning(f"Strategies directory not found: {strategies_dir}")
            return 0
            
        # Load each strategy configuration file
        for config_file in strategies_dir.glob("*.yaml"):
            strategy_name = config_file.stem
            strategy_config = self.config.get_strategy_config(strategy_name)
            
            # Skip disabled strategies
            if not strategy_config.get("enabled", False):
                logger.info(f"Strategy {strategy_name} is disabled, skipping")
                continue
                
            # Store the configuration
            self.strategy_configs[strategy_name] = strategy_config
            
            # Initialize the strategy
            try:
                # Import the appropriate strategy class based on the type
                strategy_type = strategy_config.get("type", "rule_based")
                
                if strategy_type == "rule_based":
                    from src.strategies.rules.rule_based import RuleBasedStrategy
                    strategy = RuleBasedStrategy(strategy_name, strategy_config)
                else:
                    logger.warning(f"Unknown strategy type: {strategy_type}")
                    continue
                    
                # Store the strategy instance
                self.strategies[strategy_name] = strategy
                logger.info(f"Loaded strategy: {strategy_name}")
                
            except Exception as e:
                logger.error(f"Error initializing strategy {strategy_name}: {str(e)}")
                
        logger.info(f"Loaded {len(self.strategies)} strategies")
        return len(self.strategies)
        
    def register_signal_callback(self, callback: Callable):
        """
        Register a callback for when a strategy generates a signal.
        
        Args:
            callback: Function to call with the signal
        """
        self.signal_callback = callback
        
    async def process_bar(self, bar: Bar):
        """
        Process a new bar through all relevant strategies.
        
        Args:
            bar: The new completed bar
        """
        contract_id = bar.contract_id
        timeframe = f"{bar.timeframe_value}{self._unit_to_str(bar.timeframe_unit)}"
        
        for strategy_name, strategy in self.strategies.items():
            # Check if this strategy is for this contract
            if strategy.contract_id != contract_id:
                continue
                
            # Check if this strategy uses this timeframe
            if not strategy.uses_timeframe(timeframe):
                continue
                
            # Process the bar in the strategy
            try:
                signals = await strategy.process_bar(bar)
                
                # If signals were generated and we have a callback, call it
                if signals and self.signal_callback:
                    for signal in signals:
                        self.signal_callback(strategy_name, signal)
                        
            except Exception as e:
                logger.error(f"Error processing bar in strategy {strategy_name}: {str(e)}")
                
    def _unit_to_str(self, unit: int) -> str:
        """Convert a timeframe unit integer to its string representation."""
        unit_map = {
            1: "s",
            2: "m",
            3: "h",
            4: "d",
            5: "w",
            6: "mo"
        }
        return unit_map.get(unit, "") 