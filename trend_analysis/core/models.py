"""
Core data models for trend analysis.
"""

import logging

logger = logging.getLogger(__name__)

class Bar:
    """
    Represents a price bar with OHLC data.
    
    Attributes:
        date (str): Date/time of the bar
        o (float): Open price
        h (float): High price
        l (float): Low price
        c (float): Close price
        original_file_line (int): Original line number in the source file
        index (int): 1-based chronological index of the bar
        
    Examples:
        >>> bar = Bar("2023-01-01", 100.0, 105.0, 99.0, 102.0, 1, 1)
        >>> bar.h
        105.0
    """
    def __init__(self, date_str, o, h, l, c, original_file_line, chronological_index):
        """
        Initialize a Bar object with OHLC data.
        
        Args:
            date_str (str): Date/time of the bar
            o (float or str): Open price (will be converted to float)
            h (float or str): High price (will be converted to float)
            l (float or str): Low price (will be converted to float)
            c (float or str): Close price (will be converted to float)
            original_file_line (int): Line number from original file
            chronological_index (int): 1-based index in chronological order
        """
        self.date = date_str
        self.o = float(o)
        self.h = float(h)
        self.l = float(l)
        self.c = float(c)
        self.original_file_line = original_file_line  # For debugging if needed
        self.index = int(chronological_index)  # 1-based chronological index

    def __repr__(self):
        """String representation of the Bar object."""
        return (f"Bar({self.index}, D:{self.date} O:{self.o} H:{self.h} "
                f"L:{self.l} C:{self.c})")


class State:
    """
    Maintains the current state of trend detection analysis.
    
    This class tracks potential and confirmed trend signals, containing
    all the state needed to evaluate trend signals as new bars are processed.
    
    Attributes:
        potential_downtrend_signal_bar_index (int): Index of bar that initiated a potential downtrend
        potential_downtrend_anchor_high (float): High price of that potential downtrend bar
        potential_uptrend_signal_bar_index (int): Index of bar that initiated a potential uptrend
        potential_uptrend_anchor_low (float): Low price of that potential uptrend bar
        confirmed_downtrend_candidate_peak_bar_index (int): Index of current peak candidate for downtrend
        confirmed_downtrend_candidate_peak_high (float): High price of that peak candidate
        confirmed_downtrend_candidate_peak_low (float): Low price of that peak candidate
        confirmed_uptrend_candidate_low_bar_index (int): Index of current low candidate for uptrend
        confirmed_uptrend_candidate_low_low (float): Low price of that low candidate
        confirmed_uptrend_candidate_low_high (float): High price of that low candidate
        log_entries (list): List of log entries during analysis
        in_containment (bool): Whether price is currently in a containment range
        containment_ref_bar_index (int): Index of bar serving as containment reference
        containment_ref_type (str): Type of containment reference ("PDS_PEAK" or "PUS_LOW")
        containment_ref_high (float): High price of containment reference bar
        containment_ref_low (float): Low price of containment reference bar
        containment_start_bar_index_for_log (int): Index of bar that first entered containment
        containment_consecutive_bars_inside (int): Count of bars inside containment
        overall_trend_is_up (bool): Overall trend direction (True=up, False=down, None=neutral)
        last_confirmed_trend_type (str): Last confirmed trend type ("uptrend" or "downtrend")
        last_confirmed_trend_bar_index (int): Index of last bar with confirmed trend
    """
    def __init__(self):
        """Initialize a new State object with default values."""
        # Potential signals
        self.potential_downtrend_signal_bar_index = None  # 1-based index of the bar that initiated a potential downtrend
        self.potential_downtrend_anchor_high = None  # The high price of the bar that initiated the potential downtrend

        self.potential_uptrend_signal_bar_index = None  # 1-based index of the bar that initiated a potential uptrend
        self.potential_uptrend_anchor_low = None  # The low price of the bar that initiated the potential uptrend

        # For CDS detection
        self.confirmed_downtrend_candidate_peak_bar_index = None  # 1-based index of the bar that is the current peak candidate for a downtrend confirmation
        self.confirmed_downtrend_candidate_peak_high = None  # The high price of that peak candidate bar
        self.confirmed_downtrend_candidate_peak_low = None  # The low price of that peak candidate bar

        # For CUS detection
        self.confirmed_uptrend_candidate_low_bar_index = None  # 1-based index of the bar that is the current low candidate for an uptrend confirmation
        self.confirmed_uptrend_candidate_low_low = None  # The low price of that low candidate bar
        self.confirmed_uptrend_candidate_low_high = None  # The high price of that low candidate bar (added for symmetry/completeness)
        
        self.log_entries = []

        # Containment State
        self.in_containment = False
        self.containment_ref_bar_index = None
        self.containment_ref_type = None  # "PDS_PEAK" or "PUS_LOW"
        self.containment_ref_high = None  # High of the reference bar
        self.containment_ref_low = None  # Low of the reference bar
        self.containment_start_bar_index_for_log = None  # Bar that first entered containment
        self.containment_consecutive_bars_inside = 0  # Number of bars strictly inside after start

        # Overall trend state for strict U/D alternation
        self.overall_trend_is_up = None  # True if current confirmed trend is UP, False if DOWN, None if Neutral

        # For forcing alternation
        self.last_confirmed_trend_type = None
        self.last_confirmed_trend_bar_index = None 