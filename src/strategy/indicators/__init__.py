"""
Strategy indicators package.

This package contains technical indicators and market analysis tools
for the automated trading system.
"""

from src.strategy.indicators.trend_start import TrendDetector, uptrend_start, downtrend_start

__all__ = ['TrendDetector', 'uptrend_start', 'downtrend_start'] 