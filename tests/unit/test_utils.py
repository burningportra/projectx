"""
Unit tests for core utility functions.
"""

import unittest
from datetime import datetime, timezone, timedelta

from src.core.utils import parse_timeframe, get_bar_start_time, format_bar_timestamp


class TestUtils(unittest.TestCase):
    """Test case for utility functions."""
    
    def test_parse_timeframe(self):
        """Test parse_timeframe function."""
        # Test valid timeframes
        self.assertEqual(parse_timeframe("5m"), (2, 5))  # 5 minutes
        self.assertEqual(parse_timeframe("1h"), (3, 1))  # 1 hour
        self.assertEqual(parse_timeframe("4h"), (3, 4))  # 4 hours
        self.assertEqual(parse_timeframe("1d"), (4, 1))  # 1 day
        self.assertEqual(parse_timeframe("1w"), (5, 1))  # 1 week
        self.assertEqual(parse_timeframe("1mo"), (6, 1))  # 1 month
        
        # Test with whitespace
        self.assertEqual(parse_timeframe(" 5m "), (2, 5))
        
        # Test default unit number
        self.assertEqual(parse_timeframe("m"), (2, 1))
        
        # Test invalid timeframes
        with self.assertRaises(ValueError):
            parse_timeframe("5x")
            
        with self.assertRaises(ValueError):
            parse_timeframe("")
    
    def test_get_bar_start_time(self):
        """Test get_bar_start_time function."""
        # Test minute bars
        dt = datetime(2023, 5, 15, 10, 37, 42, tzinfo=timezone.utc)
        
        # 5-minute bar
        expected = datetime(2023, 5, 15, 10, 35, 0, tzinfo=timezone.utc)
        self.assertEqual(get_bar_start_time(dt, 2, 5), expected)
        
        # 15-minute bar
        expected = datetime(2023, 5, 15, 10, 30, 0, tzinfo=timezone.utc)
        self.assertEqual(get_bar_start_time(dt, 2, 15), expected)
        
        # Test hour bars
        dt = datetime(2023, 5, 15, 10, 37, 42, tzinfo=timezone.utc)
        
        # 1-hour bar
        expected = datetime(2023, 5, 15, 10, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(get_bar_start_time(dt, 3, 1), expected)
        
        # 4-hour bar
        expected = datetime(2023, 5, 15, 8, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(get_bar_start_time(dt, 3, 4), expected)
        
        # Test day bars
        dt = datetime(2023, 5, 15, 10, 37, 42, tzinfo=timezone.utc)
        
        # 1-day bar
        expected = datetime(2023, 5, 15, 0, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(get_bar_start_time(dt, 4, 1), expected)
        
        # Test week bars
        dt = datetime(2023, 5, 15, 10, 37, 42, tzinfo=timezone.utc)  # Monday
        
        # 1-week bar (should start on Monday)
        expected = datetime(2023, 5, 15, 0, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(get_bar_start_time(dt, 5, 1), expected)
        
        dt = datetime(2023, 5, 18, 10, 37, 42, tzinfo=timezone.utc)  # Thursday
        
        # 1-week bar (should start on Monday)
        expected = datetime(2023, 5, 15, 0, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(get_bar_start_time(dt, 5, 1), expected)
        
        # Test month bars
        dt = datetime(2023, 5, 15, 10, 37, 42, tzinfo=timezone.utc)
        
        # 1-month bar
        expected = datetime(2023, 5, 1, 0, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(get_bar_start_time(dt, 6, 1), expected)
        
        # Test with string timestamp
        dt_str = "2023-05-15T10:37:42Z"
        expected = datetime(2023, 5, 15, 10, 35, 0, tzinfo=timezone.utc)
        self.assertEqual(get_bar_start_time(dt_str, 2, 5), expected)
    
    def test_format_bar_timestamp(self):
        """Test format_bar_timestamp function."""
        # Test with datetime
        dt = datetime(2023, 5, 15, 10, 37, 42, tzinfo=timezone.utc)
        bar = {"t": dt, "o": 100.0, "h": 105.0, "l": 98.0, "c": 103.0}
        
        formatted_bar = format_bar_timestamp(bar)
        self.assertEqual(formatted_bar["t"], dt.isoformat())
        
        # Test with string already
        bar = {"t": "2023-05-15T10:37:42Z", "o": 100.0, "h": 105.0, "l": 98.0, "c": 103.0}
        
        formatted_bar = format_bar_timestamp(bar)
        self.assertEqual(formatted_bar["t"], "2023-05-15T10:37:42Z")
        
        
if __name__ == "__main__":
    unittest.main() 