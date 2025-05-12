"""
Custom exceptions for the automated trading system.
"""

class ProjectXError(Exception):
    """Base class for all exceptions in the application."""
    pass


class ConfigurationError(ProjectXError):
    """Exception raised for configuration errors."""
    pass


class ApiError(ProjectXError):
    """Exception raised for errors in API calls."""
    
    def __init__(self, message, status_code=None, response=None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class MarketDataError(ProjectXError):
    """Exception raised for errors in market data processing."""
    pass


class ValidationError(ProjectXError):
    """Exception raised for data validation errors."""
    pass


class DatabaseError(ProjectXError):
    """Exception raised for database errors."""
    pass


class StrategyError(ProjectXError):
    """Exception raised for strategy execution errors."""
    pass


class OrderExecutionError(ProjectXError):
    """Exception raised for order execution errors."""
    pass


class RiskLimitExceededError(ProjectXError):
    """Exception raised when a risk limit is exceeded."""
    pass


class WebSocketConnectionError(ProjectXError):
    """Exception raised for WebSocket connection errors."""
    pass 