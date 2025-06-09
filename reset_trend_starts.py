import asyncio
import asyncpg
import os
import logging
from src.core.config import Config

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def reset_database_tables():
    """
    Connects to the database and truncates the 'detected_signals' 
    and 'analyzer_watermarks' tables.
    """
    config = Config()
    database_configs = config.settings['database']
    active_db_key = database_configs.get('default_analysis_db', 'local_timescaledb')
    db_conn_details = database_configs.get(active_db_key)

    if not db_conn_details:
        logger.critical(f"Database configuration '{active_db_key}' not found in settings.")
        return

    password = db_conn_details.get('password')
    password_env_var = db_conn_details.get('password_env_var')
    if password_env_var:
        env_password = os.getenv(password_env_var)
        if env_password:
            password = env_password
        else:
            logger.warning(f"Environment variable '{password_env_var}' for DB password not set.")
    
    if not password:
        logger.critical(f"Database password for '{active_db_key}' could not be resolved. Exiting.")
        return

    conn = None
    try:
        conn = await asyncpg.connect(
            user=db_conn_details.get('user'),
            password=password,
            database=db_conn_details.get('dbname'),
            host=db_conn_details.get('host'),
            port=db_conn_details.get('port')
        )
        logger.info(f"Successfully connected to database '{active_db_key}'.")

        # Truncate detected_signals table
        await conn.execute("TRUNCATE TABLE detected_signals RESTART IDENTITY CASCADE;")
        logger.info("Successfully truncated 'detected_signals' table.")

        # Truncate analyzer_watermarks table
        await conn.execute("TRUNCATE TABLE analyzer_watermarks RESTART IDENTITY;")
        logger.info("Successfully truncated 'analyzer_watermarks' table.")

        logger.info("Database tables have been reset successfully.")

    except Exception as e:
        logger.error(f"An error occurred: {e}", exc_info=True)
    finally:
        if conn:
            await conn.close()
            logger.info("Database connection closed.")

if __name__ == "__main__":
    try:
        asyncio.run(reset_database_tables())
    except KeyboardInterrupt:
        logger.info("Script interrupted by user.")
    except Exception as e:
        logger.error(f"An unhandled error occurred in main execution: {e}", exc_info=True) 