"""
Functions for detecting bar patterns and trend signals.
"""

import logging

logger = logging.getLogger(__name__)

def is_SDB(current_bar, prev_bar):
    """
    Check if current_bar is a Simple Down Bar relative to prev_bar.
    
    A Simple Down Bar has:
    - Lower low than previous bar
    - Lower high than previous bar
    - Lower close than previous bar
    
    Args:
        current_bar: The bar to check
        prev_bar: The previous bar for comparison
        
    Returns:
        bool: True if current_bar is a Simple Down Bar, False otherwise
    """
    res_l = current_bar.l < prev_bar.l
    res_h = current_bar.h < prev_bar.h
    res_c = current_bar.c < prev_bar.c
    return res_l and res_h and res_c


def is_SUB(current_bar, prev_bar):
    """
    Check if current_bar is a Simple Up Bar relative to prev_bar.
    
    A Simple Up Bar has:
    - Higher low than previous bar
    - Higher high than previous bar
    - Higher close than previous bar
    
    Args:
        current_bar: The bar to check
        prev_bar: The previous bar for comparison
        
    Returns:
        bool: True if current_bar is a Simple Up Bar, False otherwise
    """
    return (current_bar.l > prev_bar.l and
            current_bar.h > prev_bar.h and
            current_bar.c > prev_bar.c)


def is_BRB(current_bar, prev_bar):
    """
    Check if current_bar is a Bullish Reversal Bar relative to prev_bar.
    
    A Bullish Reversal Bar has:
    - Lower low than previous bar
    - Higher high than previous bar
    - Higher close than previous bar
    
    Args:
        current_bar: The bar to check
        prev_bar: The previous bar for comparison
        
    Returns:
        bool: True if current_bar is a Bullish Reversal Bar, False otherwise
    """
    return (current_bar.l < prev_bar.l and
            current_bar.h > prev_bar.h and
            current_bar.c > prev_bar.c)


def is_BeRB(current_bar, prev_bar):
    """
    Check if current_bar is a Bearish Reversal Bar relative to prev_bar.
    
    A Bearish Reversal Bar has:
    - Higher high than previous bar
    - Lower low than previous bar
    - Lower close than previous bar
    
    Args:
        current_bar: The bar to check
        prev_bar: The previous bar for comparison
        
    Returns:
        bool: True if current_bar is a Bearish Reversal Bar, False otherwise
    """
    return (current_bar.h > prev_bar.h and
            current_bar.l < prev_bar.l and
            current_bar.c < prev_bar.c)


def is_your_custom_pds_rule(current_bar, prev_bar):
    """
    Check if current_bar confirms prev_bar as a Potential Downtrend Signal (PDS).
    
    For PDS on prev_bar when current_bar closes:
    1. current_bar did NOT make a higher high than prev_bar's high
    2. current_bar closed BELOW prev_bar's open
    
    Args:
        current_bar: The bar to check
        prev_bar: The previous bar for comparison
        
    Returns:
        bool: True if prev_bar should be a PDS, False otherwise
    """
    return (current_bar.h <= prev_bar.h and 
            current_bar.c < prev_bar.o)


def is_your_custom_pus_rule(current_bar, prev_bar):
    """
    Check if current_bar confirms prev_bar as a Potential Uptrend Signal (PUS).
    
    For PUS on prev_bar when current_bar closes:
    1. current_bar did NOT make a lower low than prev_bar's low
    2. current_bar closed ABOVE prev_bar's open
    
    Args:
        current_bar: The bar to check
        prev_bar: The previous bar for comparison
        
    Returns:
        bool: True if prev_bar should be a PUS, False otherwise
    """
    return (current_bar.l >= prev_bar.l and
            current_bar.c > prev_bar.o)


def is_custom_pds_rule_B(current_bar, prev_bar):
    """
    Alternative rule for PDS on prev_bar.
    
    This simpler rule for PDS just checks if current_bar did not make a higher high.
    
    Args:
        current_bar: The bar to check
        prev_bar: The previous bar for comparison
        
    Returns:
        bool: True if prev_bar should be a PDS, False otherwise
    """
    return current_bar.h <= prev_bar.h


def is_custom_pus_rule_B(current_bar, prev_bar):
    """
    Alternative rule for PUS on prev_bar.
    
    This simpler rule for PUS just checks if current_bar did not make a lower low.
    
    Args:
        current_bar: The bar to check
        prev_bar: The previous bar for comparison
        
    Returns:
        bool: True if prev_bar should be a PUS, False otherwise
    """
    return current_bar.l >= prev_bar.l 