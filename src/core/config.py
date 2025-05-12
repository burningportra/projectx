"""
Configuration loader for the automated trading system.

This module handles loading configuration from:
- Environment variables
- YAML configuration files
"""

import os
import yaml
from pathlib import Path
from typing import Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    """Configuration handler for the automated trading system."""

    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize configuration from the specified path or default.
        
        Args:
            config_path: Path to the config directory. If None, uses default.
        """
        if config_path is None:
            # Default to the config directory relative to the project root
            self.config_dir = Path(__file__).parents[2] / "config"
        else:
            self.config_dir = Path(config_path)
        
        # Load main settings
        self.settings = self._load_yaml("settings.yaml")
        
        # Load risk limits
        self.risk_limits = self._load_yaml("risk_limits.yaml")
        
        # We don't validate the API token at initialization to allow startup
        # without a token and provide a graceful user experience
        
    def validate_api_token(self):
        """
        Validate the API token format and presence.
        
        Returns:
            bool: True if token is valid, False otherwise
        """
        token = self.get_api_token()
        if not token:
            return False
        if not isinstance(token, str) or len(token) < 32:
            return False
        return True
            
    def _load_yaml(self, filename: str) -> Dict[str, Any]:
        """
        Load a YAML file from the config directory.
        
        Args:
            filename: Name of the YAML file to load
            
        Returns:
            Dict containing the parsed YAML contents
        """
        file_path = self.config_dir / filename
        if not file_path.exists():
            return {}
        
        with open(file_path, "r") as f:
            return yaml.safe_load(f)
    
    def get_strategy_config(self, strategy_name: str) -> Dict[str, Any]:
        """
        Load a specific strategy's configuration.
        
        Args:
            strategy_name: Name of the strategy
            
        Returns:
            Dict containing the strategy configuration
        """
        return self._load_yaml(f"strategies/{strategy_name}.yaml")
    
    def get_api_url(self) -> str:
        """Get the ProjectX Gateway API URL from environment or config."""
        return os.getenv(
            "PROJECTX_API_URL", 
            self.settings.get("api", {}).get("url", "https://gateway-api-demo.s2f.projectx.com")
        )
    
    def get_api_token(self) -> str:
        """Get the ProjectX Gateway API token from environment."""
        token = os.getenv("PROJECTX_API_TOKEN", "").strip()
        if not token:
            token = self.settings.get("api", {}).get("token", "")
        return token
    
    def get_rtc_market_url(self) -> str:
        """Get the ProjectX RTC market hub URL."""
        url = os.getenv(
            "PROJECTX_RTC_MARKET_URL", 
            self.settings.get("api", {}).get("rtc_market_url", "https://gateway-rtc-demo.s2f.projectx.com/hubs/market")
        )
        # Convert HTTPS to WS for WebSocket connection
        return url.replace("https://", "wss://")
    
    def get_rtc_user_url(self) -> str:
        """Get the ProjectX RTC user hub URL."""
        url = os.getenv(
            "PROJECTX_RTC_USER_URL", 
            self.settings.get("api", {}).get("rtc_user_url", "https://gateway-rtc-demo.s2f.projectx.com/hubs/user")
        )
        # Convert HTTPS to WS for WebSocket connection
        return url.replace("https://", "wss://")
    
    def get_database_url(self) -> str:
        """Get the database connection URL."""
        # Check if TimescaleDB is enabled
        if self.use_timescale():
            # Return the TimescaleDB URL
            return os.getenv(
                "TIMESCALE_DB_URL",
                self.settings.get("database", {}).get("timescale_url", "postgresql://postgres:password@localhost:5432/projectx")
            )
        else:
            # Return the SQLite URL (fallback)
            return os.getenv(
                "DATABASE_URL",
                self.settings.get("database", {}).get("url", "sqlite:///projectx.db")
            )
    
    def use_timescale(self) -> bool:
        """Check if TimescaleDB should be used."""
        env_value = os.getenv("USE_TIMESCALE", "").lower()
        if env_value in ("true", "1", "yes"):
            return True
        elif env_value in ("false", "0", "no"):
            return False
            
        # If not specified in environment, check settings
        return self.settings.get("database", {}).get("use_timescale", False)
    
    def get_db_min_connections(self) -> int:
        """Get the minimum database connections."""
        return int(os.getenv(
            "DB_MIN_CONNECTIONS",
            self.settings.get("database", {}).get("min_connections", 1)
        ))
    
    def get_db_max_connections(self) -> int:
        """Get the maximum database connections."""
        return int(os.getenv(
            "DB_MAX_CONNECTIONS",
            self.settings.get("database", {}).get("max_connections", 10)
        ))
    
    def get_timeframes(self) -> list:
        """Get the list of timeframes to track."""
        return self.settings.get("timeframes", ["5m", "15m", "1h", "4h", "1d"])
