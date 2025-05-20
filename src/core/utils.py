"""
Utility functions used across the automated trading system.
"""

import datetime
from typing import Tuple, Union, Dict, Any
from dateutil import parser as date_parser


def parse_timeframe(timeframe: str) -> Tuple[int, int]:
    """
    Parse a timeframe string (like "5m", "1h", "1d") into (unit, value).
    
    Args:
        timeframe: String representation of the timeframe
        
    Returns:
        Tuple of (unit, value) where:
          - unit is an integer (1=Second, 2=Minute, 3=Hour, 4=Day, 5=Week, 6=Month)
          - value is the number of units
          
    Raises:
        ValueError: If the timeframe string is invalid
    """
    if not timeframe:
        raise ValueError("Timeframe cannot be empty")
    
    # Strip any whitespace
    timeframe = timeframe.strip().lower()
    
    # Extract the numeric value and unit
    value = ""
    for char in timeframe:
        if char.isdigit():
            value += char
        else:
            break
    
    if not value:
        value = "1"  # Default to 1 if no number is specified
    
    value = int(value)
    unit_str = timeframe[len(str(value)):].strip()
    
    # Map the unit string to the correct unit integer
    unit_map = {
        "s": 1,  # Second
        "m": 2,  # Minute
        "h": 3,  # Hour
        "d": 4,  # Day
        "w": 5,  # Week
        "mo": 6  # Month
    }
    
    # If only unit string was provided (e.g., "m"), the unit_str might be empty
    # In this case, extract the entire string as the unit
    if not unit_str and len(timeframe) > 0:
        unit_str = timeframe
    
    if unit_str not in unit_map:
        raise ValueError(f"Invalid timeframe unit: {unit_str}")
    
    return (unit_map[unit_str], value)


def format_timeframe_from_unit_value(unit: int, value: int) -> str:
    """
    Convert a (unit, value) pair back into a timeframe string (e.g., "5m", "1h").

    Args:
        unit: Integer representation of the timeframe unit 
              (1=Second, 2=Minute, 3=Hour, 4=Day, 5=Week, 6=Month).
        value: The number of units.

    Returns:
        String representation of the timeframe.

    Raises:
        ValueError: If the unit integer is invalid.
    """
    # Inverse of the unit_map in parse_timeframe
    unit_str_map = {
        1: "s",  # Second
        2: "m",  # Minute
        3: "h",  # Hour
        4: "d",  # Day
        5: "w",  # Week
        6: "mo"  # Month
    }

    if unit not in unit_str_map:
        raise ValueError(f"Invalid timeframe unit integer: {unit}")

    unit_char = unit_str_map[unit]
    return f"{value}{unit_char}"


def get_bar_start_time(timestamp: Union[str, datetime.datetime], unit: int, unit_number: int) -> datetime.datetime:
    """
    Calculate the start time of a bar containing the given timestamp.
    
    Args:
        timestamp: The timestamp to find the bar start for
        unit: The unit (1=Second, 2=Minute, 3=Hour, 4=Day, 5=Week, 6=Month)
        unit_number: The number of units in the bar
        
    Returns:
        Datetime representing the start of the bar
    """
    if isinstance(timestamp, str):
        timestamp = date_parser.parse(timestamp)
    
    # Ensure timestamp is timezone-aware
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=datetime.timezone.utc)
    
    if unit == 1:  # Second
        seconds = timestamp.second
        return timestamp.replace(
            second=seconds - (seconds % unit_number),
            microsecond=0
        )
    elif unit == 2:  # Minute
        minutes = timestamp.minute
        return timestamp.replace(
            minute=minutes - (minutes % unit_number),
            second=0,
            microsecond=0
        )
    elif unit == 3:  # Hour
        hours = timestamp.hour
        return timestamp.replace(
            hour=hours - (hours % unit_number),
            minute=0,
            second=0,
            microsecond=0
        )
    elif unit == 4:  # Day
        return timestamp.replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0
        )
    elif unit == 5:  # Week
        # Get the start of the day, then subtract days to get to Monday (weekday 0)
        start_of_day = timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
        days_from_monday = start_of_day.weekday()
        return start_of_day - datetime.timedelta(days=days_from_monday)
    elif unit == 6:  # Month
        return timestamp.replace(
            day=1,
            hour=0,
            minute=0,
            second=0,
            microsecond=0
        )
    else:
        raise ValueError(f"Invalid unit: {unit}")


def format_bar_timestamp(bar: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format the timestamp in a bar dict to ISO format.
    
    Args:
        bar: Dictionary containing bar data with 't' timestamp field
        
    Returns:
        Bar dict with formatted timestamp
    """
    if 't' in bar and not isinstance(bar['t'], str):
        bar['t'] = bar['t'].isoformat()
    return bar 