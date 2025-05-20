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
        if self.use_timescale():
            # 1. Prioritize direct TIMESCALE_DB_URL from environment
            env_db_url = os.getenv("TIMESCALE_DB_URL")
            if env_db_url:
                return env_db_url

            # 2. Try to construct from settings.yaml template and components
            db_config = self.settings.get("database", {})
            local_ts_config = db_config.get("local_timescaledb", {})
            dsn_template = local_ts_config.get("dsn_template")
            
            if dsn_template:
                password_env_var = local_ts_config.get("password_env_var")
                password = "" # Default to empty string if env var name not specified
                if password_env_var:
                    password = os.getenv(password_env_var, "") # Fetch password from specified env var
                
                try:
                    return dsn_template.format(
                        user=local_ts_config.get("user", "postgres"),
                        password=password, # Use fetched password
                        host=local_ts_config.get("host", "localhost"),
                        port=local_ts_config.get("port", 5432),
                        dbname=local_ts_config.get("dbname", "projectx")
                    )
                except KeyError as e:
                    print(f"Warning: Missing key in dsn_template formatting: {e}. Check local_timescaledb settings in settings.yaml")
            
            # 3. Fallback to a hardcoded default (as was previously in settings.yaml sort of)
            # This should ideally not be reached if settings.yaml is correct
            print("Warning: Could not construct TimescaleDB URL from settings template. Falling back to default DSN.")
            return "postgresql://postgres:password@localhost:5432/projectx"
        else:
            # SQLite path (remains the same)
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
    
    def get_database_config(self) -> Optional[Dict[str, Any]]:
        """Returns the raw database configuration section."""
        db_conf = self.settings.get("database")
        if db_conf and db_conf.get("use_timescale"):
            # If using timescale, provide the specific config for local_timescaledb
            # or railway_timescaledb based on default_ingestion_db or other logic.
            # For now, let's assume we need the local_timescaledb details directly
            # if they exist under a 'local_timescaledb' key, which they do.
            # A more robust version might resolve which actual DB to use.
            return db_conf.get("local_timescaledb")
        elif db_conf:
            return db_conf # For non-timescale setups, could be flat
        return None
    
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

    def get_analysis_config(self) -> Optional[Dict[str, Any]]:
        """Returns the 'analysis' section of the config."""
        return self.settings.get('analysis')

    def get_coordination_config(self) -> Optional[Dict[str, Any]]:
        """Returns the coordination configuration."""
        return self.settings.get("coordination")

    def get_execution_config(self) -> Optional[Dict[str, Any]]:
        """Returns the execution configuration."""
        return self.settings.get("execution")

    def get_logging_config(self) -> Optional[Dict[str, Any]]:
        """Returns the 'logging' section of the config."""
        # This method is not provided in the original file or the code block
        # It's assumed to exist as it's called in the original file
        return self.settings.get("logging") # Added return based on typical usage

# Helper function to load configuration easily
_config_instance: Optional[Config] = None

def load_config(config_path: Optional[str] = None) -> Config:
    """Loads the configuration or returns the existing instance."""
    global _config_instance
    if _config_instance is None:
        _config_instance = Config(config_path=config_path)
    return _config_instance
