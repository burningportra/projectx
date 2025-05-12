"""
Multi-timeframe aggregation for OHLC bars.

This module handles real-time aggregation of trade data into OHLC bars
for multiple timeframes.
"""

import asyncio
import logging
from typing import Dict, List, Optional, Callable, Tuple
from datetime import datetime, timezone, timedelta

from src.core.utils import get_bar_start_time, parse_timeframe
from src.data.models import Trade, Bar, InProgressBar
from src.core.exceptions import MarketDataError

logger = logging.getLogger(__name__)


class OHLCAggregator:
    """
    Real-time OHLC bar aggregator for multiple timeframes.
    """
    
    def __init__(self):
        """Initialize the OHLC aggregator."""
        # Dictionary to store in-progress bars
        # {contract_id: {timeframe_str: InProgressBar}}
        self.in_progress_bars: Dict[str, Dict[str, InProgressBar]] = {}
        
        # Dictionary to store completed bars callbacks
        # {contract_id: {timeframe_str: [callbacks]}}
        self.bar_completed_callbacks: Dict[str, Dict[str, List[Callable[[Bar], None]]]] = {}
        
        # Dictionary to hold the timer tasks for each timeframe
        # {timeframe_str: asyncio.Task}
        self.timer_tasks: Dict[str, asyncio.Task] = {}
        
    def add_timeframe(self, contract_id: str, timeframe: str) -> None:
        """
        Add a timeframe to track for a specific contract.
        
        Args:
            contract_id: The contract ID to track
            timeframe: The timeframe to track (e.g., "5m", "1h")
            
        Raises:
            ValueError: If the timeframe is invalid
        """
        # Parse the timeframe
        unit, unit_number = parse_timeframe(timeframe)
        
        # Initialize dictionaries if needed
        if contract_id not in self.in_progress_bars:
            self.in_progress_bars[contract_id] = {}
        
        if contract_id not in self.bar_completed_callbacks:
            self.bar_completed_callbacks[contract_id] = {}
            
        # Create timer task if needed for this timeframe
        if timeframe not in self.timer_tasks:
            self.timer_tasks[timeframe] = asyncio.create_task(
                self._run_timeframe_timer(timeframe, unit, unit_number)
            )
            
        # Initialize an empty in-progress bar placeholder
        # The actual bar will be created on first trade
        self.in_progress_bars[contract_id][timeframe] = None
        self.bar_completed_callbacks[contract_id][timeframe] = []
        
        logger.info(f"Added timeframe {timeframe} for contract {contract_id}")
        
    def remove_timeframe(self, contract_id: str, timeframe: str) -> None:
        """
        Remove a timeframe from tracking for a specific contract.
        
        Args:
            contract_id: The contract ID
            timeframe: The timeframe to stop tracking
        """
        if contract_id in self.in_progress_bars:
            if timeframe in self.in_progress_bars[contract_id]:
                del self.in_progress_bars[contract_id][timeframe]
                logger.info(f"Removed timeframe {timeframe} for contract {contract_id}")
                
        if contract_id in self.bar_completed_callbacks:
            if timeframe in self.bar_completed_callbacks[contract_id]:
                del self.bar_completed_callbacks[contract_id][timeframe]
        
        # Only cancel timer task if no contracts use this timeframe anymore
        any_contracts_using_timeframe = False
        for contract_bars in self.in_progress_bars.values():
            if timeframe in contract_bars:
                any_contracts_using_timeframe = True
                break
                
        if not any_contracts_using_timeframe and timeframe in self.timer_tasks:
            self.timer_tasks[timeframe].cancel()
            del self.timer_tasks[timeframe]
            logger.info(f"Canceled timer for timeframe {timeframe}")
            
    def register_bar_callback(
        self, contract_id: str, timeframe: str, callback: Callable[[Bar], None]
    ) -> None:
        """
        Register a callback to be called when a bar is completed.
        
        Args:
            contract_id: The contract ID
            timeframe: The timeframe
            callback: Function to call with the completed Bar
        """
        if contract_id not in self.bar_completed_callbacks:
            self.bar_completed_callbacks[contract_id] = {}
            
        if timeframe not in self.bar_completed_callbacks[contract_id]:
            self.bar_completed_callbacks[contract_id][timeframe] = []
            
        self.bar_completed_callbacks[contract_id][timeframe].append(callback)
        
    def process_trade(self, trade: Trade) -> None:
        """
        Process a new trade and update all relevant in-progress bars.
        
        Args:
            trade: The trade to process
        """
        contract_id = trade.contract_id
        
        if contract_id not in self.in_progress_bars:
            # Not tracking this contract
            return
            
        # Process the trade for each timeframe being tracked for this contract
        for timeframe, in_progress_bar in self.in_progress_bars[contract_id].items():
            unit, unit_number = parse_timeframe(timeframe)
            
            # Calculate the bar start time for this trade
            bar_start = get_bar_start_time(trade.timestamp, unit, unit_number)
            
            # If this is the first trade or the bar hasn't been initialized yet
            if in_progress_bar is None:
                # Create a new in-progress bar
                self.in_progress_bars[contract_id][timeframe] = InProgressBar(
                    t=bar_start,
                    o=trade.price,
                    h=trade.price,
                    l=trade.price,
                    c=trade.price,
                    v=trade.volume or 0,
                    is_first_update=False,  # We're setting values explicitly
                    contract_id=contract_id,
                    timeframe_unit=unit,
                    timeframe_value=unit_number
                )
                logger.debug(f"Created new bar for {contract_id} {timeframe} starting at {bar_start}")
            
            # If the trade belongs to a new bar, we need to finalize the old one and create a new one
            elif bar_start > in_progress_bar.t:
                # Finalize the old bar
                completed_bar = in_progress_bar.to_bar()
                self._notify_bar_completed(contract_id, timeframe, completed_bar)
                logger.debug(f"Completed bar for {contract_id} {timeframe} from {in_progress_bar.t} to {bar_start}")
                
                # Create a new in-progress bar
                self.in_progress_bars[contract_id][timeframe] = InProgressBar(
                    t=bar_start,
                    o=trade.price,
                    h=trade.price,
                    l=trade.price,
                    c=trade.price,
                    v=trade.volume or 0,
                    is_first_update=False,  # We're setting values explicitly
                    contract_id=contract_id,
                    timeframe_unit=unit,
                    timeframe_value=unit_number
                )
            else:
                # Update the existing in-progress bar
                in_progress_bar.update(trade.price, trade.volume)
                
    async def _run_timeframe_timer(self, timeframe: str, unit: int, unit_number: int) -> None:
        """
        Run a timer for a specific timeframe to check for bar completion.
        
        This runs as a background task to periodically check if bars need to be closed
        due to time passing, even if no new trades have occurred.
        
        Args:
            timeframe: The timeframe string
            unit: The unit (1=Second, 2=Minute, 3=Hour, 4=Day, 5=Week, 6=Month)
            unit_number: The number of units in the timeframe
        """
        try:
            while True:
                now = datetime.now(timezone.utc)
                
                # Calculate when the next bar closes
                current_bar_start = get_bar_start_time(now, unit, unit_number)
                
                # Calculate seconds until the next bar
                if unit == 1:  # Second
                    next_bar_time = current_bar_start + timedelta(seconds=unit_number)
                elif unit == 2:  # Minute
                    next_bar_time = current_bar_start + timedelta(minutes=unit_number)
                    # Handle minute rollover
                    if next_bar_time.minute >= 60:
                        next_bar_time = next_bar_time.replace(
                            minute=next_bar_time.minute % 60,
                            hour=next_bar_time.hour + next_bar_time.minute // 60
                        )
                elif unit == 3:  # Hour
                    next_bar_time = current_bar_start + timedelta(hours=unit_number)
                    # Handle hour rollover
                    if next_bar_time.hour >= 24:
                        next_bar_time = next_bar_time.replace(
                            hour=next_bar_time.hour % 24,
                            day=next_bar_time.day + next_bar_time.hour // 24
                        )
                else:
                    # For day, week, month timeframes, check every hour
                    next_bar_time = now.replace(minute=0, second=0, microsecond=0)
                    next_bar_time = next_bar_time + timedelta(hours=1)
                    
                # Calculate seconds to sleep
                seconds_to_next_bar = (next_bar_time - now).total_seconds()
                
                # Add 1 second buffer
                seconds_to_next_bar += 1
                
                if seconds_to_next_bar > 0:
                    await asyncio.sleep(seconds_to_next_bar)
                    
                # Close any completed bars
                await self._close_completed_bars(timeframe)
                
        except Exception as e:
            logger.error(f"Error in timer for timeframe {timeframe}: {str(e)}")
            # Restart the timer after a short delay
            await asyncio.sleep(5)
            asyncio.create_task(self._run_timeframe_timer(timeframe, unit, unit_number))
            
    def _notify_bar_completed(self, contract_id: str, timeframe: str, bar: Bar) -> None:
        """
        Notify all callbacks that a bar has been completed.
        
        Args:
            contract_id: The contract ID
            timeframe: The timeframe
            bar: The completed Bar
        """
        if contract_id in self.bar_completed_callbacks:
            if timeframe in self.bar_completed_callbacks[contract_id]:
                for callback in self.bar_completed_callbacks[contract_id][timeframe]:
                    try:
                        callback(bar)
                    except Exception as e:
                        logger.error(f"Error in bar completion callback: {str(e)}")
                        
    async def _close_completed_bars(self, timeframe: str) -> None:
        """
        Close any completed bars for the given timeframe.
        
        This method is called by the timer to finalize bars when the period ends,
        even if no new trades have occurred.
        
        Args:
            timeframe: The timeframe to check
        """
        now = datetime.now(timezone.utc)
        unit, unit_number = parse_timeframe(timeframe)
        current_bar_start = get_bar_start_time(now, unit, unit_number)
        
        # Check all contracts for this timeframe
        for contract_id, contract_bars in self.in_progress_bars.items():
            if timeframe not in contract_bars:
                continue
                
            in_progress_bar = contract_bars[timeframe]
            if in_progress_bar is None:
                continue
                
            # If the bar's period has ended, finalize it
            if in_progress_bar.t < current_bar_start:
                completed_bar = in_progress_bar.to_bar()
                self._notify_bar_completed(contract_id, timeframe, completed_bar)
                logger.debug(f"Timer closed bar for {contract_id} {timeframe} at {current_bar_start}")
                
                # Create a new empty bar for the current period
                self.in_progress_bars[contract_id][timeframe] = None
    
    async def stop(self) -> None:
        """Stop all timer tasks."""
        for task in self.timer_tasks.values():
            task.cancel()
            
        self.timer_tasks.clear()
        self.in_progress_bars.clear()
        self.bar_completed_callbacks.clear()
