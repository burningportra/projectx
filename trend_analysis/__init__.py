"""
Trend Analysis Package

This package contains modules for analyzing price trends and generating trading signals.
"""

# Import main classes and functions for easier access
from .trend_models import Bar, State
from . import trend_utils
from . import trend_patterns  
from . import cus_rules
from . import cds_rules
from . import signal_logic

__all__ = [
    'Bar',
    'State', 
    'trend_utils',
    'trend_patterns',
    'cus_rules', 
    'cds_rules',
    'signal_logic'
] 