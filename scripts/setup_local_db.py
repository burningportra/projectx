import psycopg2
from psycopg2 import sql
import os
from dotenv import load_dotenv
import time
import logging

# Explicitly load .env from the project root
# Assumes this script is run from the project root (e.g., python3 scripts/setup_local_db.py)
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
print(f"Attempting to load .env from: {os.path.abspath(dotenv_path)}")
loaded_env = load_dotenv(dotenv_path=dotenv_path)
print(f".env file loaded: {loaded_env}")
print(f"Value of LOCAL_DB_USER directly from os.environ after load_dotenv: {os.environ.get('LOCAL_DB_USER')}")

# Database connection parameters from environment variables
DB_HOST = os.getenv("LOCAL_DB_HOST", "localhost")
DB_PORT = os.getenv("LOCAL_DB_PORT", "5433")
DB_NAME = os.getenv("LOCAL_DB_NAME", "projectx")
DB_USER = os.getenv("LOCAL_DB_USER", "postgres")
DB_PASSWORD = os.getenv("LOCAL_DB_PASSWORD")

print(f"--- Using DB Connection Parameters ---")
print(f"DB_HOST: {DB_HOST}")
print(f"DB_PORT: {DB_PORT}")
print(f"DB_NAME: {DB_NAME}")
print(f"DB_USER: {DB_USER}")
print(f"DB_PASSWORD IS SET: {'Yes' if DB_PASSWORD else 'No'}") # Don't print the actual password
print(f"-------------------------------------")

if not DB_PASSWORD:
    print("Error: LOCAL_DB_PASSWORD environment variable not set.")
    print("Please set it in your .env file.")
    exit(1)

def get_db_connection():
    """Establishes a connection to the PostgreSQL database."""
    conn = None
    for i in range(5): # Retry connection a few times
        try:
            conn = psycopg2.connect(
                host=DB_HOST,
                port=DB_PORT,
                dbname=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD
            )
            print(f"Successfully connected to database '{DB_NAME}' on {DB_HOST}:{DB_PORT}")
            return conn
        except psycopg2.OperationalError as e:
            print(f"Connection attempt {i+1} failed: {e}")
            if i < 4:
                print("Retrying in 5 seconds...")
                time.sleep(5)
            else:
                print("Could not connect to the database after several retries.")
                raise
    return conn # Should not reach here if retries fail

def execute_query(conn, query, params=None, fetch=False):
    """Executes a given SQL query."""
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            conn.commit()
            if fetch:
                return cur.fetchall()
            print(f"Successfully executed: {query[:100]}...") # Log snippet of query
    except Exception as e:
        print(f"Error executing query: {query[:100]}...")
        print(f"Error: {e}")
        # conn.rollback() # Rollback on error, though commit is per statement here
        raise # Re-raise the exception to stop execution if critical

def setup_tables(conn):
    """Creates all necessary tables in the database."""
    try:
        print("\n--- Enabling TimescaleDB Extension ---")
        try:
            execute_query(conn, "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")
            print("TimescaleDB extension enabled or already exists.")
        except psycopg2.Error as e:
            print(f"Warning: Could not enable TimescaleDB extension: {e}")
            print("This might be fine if it's already enabled or if the user lacks permissions for CREATE EXTENSION.")
            print("If hypertable creation fails later, this might be the cause.")

        print("\n--- Dropping ohlc_bars Table (if exists) to ensure clean hypertable conversion ---")
        execute_query(conn, "DROP TABLE IF EXISTS ohlc_bars CASCADE;")

        print("\n--- Creating ohlc_bars Table ---")
        ohlc_bars_schema = """
        CREATE TABLE IF NOT EXISTS ohlc_bars (
            contract_id TEXT NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL,
            open DOUBLE PRECISION NOT NULL,
            high DOUBLE PRECISION NOT NULL,
            low DOUBLE PRECISION NOT NULL,
            close DOUBLE PRECISION NOT NULL,
            volume BIGINT,
            timeframe_unit INTEGER NOT NULL, -- 1:sec, 2:min, 3:hr, 4:day, 5:wk
            timeframe_value INTEGER NOT NULL,
            PRIMARY KEY (contract_id, timestamp, timeframe_unit, timeframe_value)
        );
        """
        execute_query(conn, ohlc_bars_schema)
        print("Table 'ohlc_bars' created or already exists.")

        print("\n--- Converting ohlc_bars to Hypertable ---")
        # Use IF NOT EXISTS for create_hypertable if your TimescaleDB version supports it
        # For older versions, this might error if called twice, but DROP TABLE handles re-runs for this script.
        hypertable_query = "SELECT create_hypertable('ohlc_bars', 'timestamp', if_not_exists => TRUE);"
        try:
            execute_query(conn, hypertable_query)
            print("Successfully converted 'ohlc_bars' to hypertable or it already was.")
        except psycopg2.Error as e:
            # Check if the error is because it's already a hypertable
            if "already a hypertable" in str(e).lower():
                print("'ohlc_bars' is already a hypertable.")
            else:
                raise # Re-raise other errors

        # --- Watermark Tables ---
        print("\n--- Creating analyzer_watermarks Table ---")
        analyzer_watermarks_schema = """
        CREATE TABLE IF NOT EXISTS analyzer_watermarks (
            analyzer_id TEXT NOT NULL,
            contract_id TEXT NOT NULL,
            timeframe TEXT NOT NULL, -- e.g., '1m', '5m', '1h'
            last_processed_timestamp TIMESTAMPTZ,
            PRIMARY KEY (analyzer_id, contract_id, timeframe)
        );
        """
        execute_query(conn, analyzer_watermarks_schema)
        print("Table 'analyzer_watermarks' created or already exists.")

        print("\n--- Creating coordinator_watermarks Table ---")
        coordinator_watermarks_schema = """
        CREATE TABLE IF NOT EXISTS coordinator_watermarks (
            coordinator_id TEXT PRIMARY KEY,
            last_processed_signal_id BIGINT
        );
        """
        execute_query(conn, coordinator_watermarks_schema)
        print("Table 'coordinator_watermarks' created or already exists.")

        # --- Detected Signals Table ---
        print("\n--- Creating detected_signals Table ---")
        # Drop if exists to apply changes cleanly during development, consider ALTER TABLE for production migrations
        execute_query(conn, "DROP TABLE IF EXISTS detected_signals CASCADE;") 
        detected_signals_schema = """
        CREATE TABLE IF NOT EXISTS detected_signals (
            signal_id SERIAL PRIMARY KEY,
            analyzer_id TEXT NOT NULL,               -- Identifier for the analyzer that generated this signal
            timestamp TIMESTAMPTZ NOT NULL,          -- Timestamp of the bar that generated the signal
            trigger_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- When the signal was detected by the system
            contract_id TEXT NOT NULL,
            timeframe TEXT NOT NULL,                 -- e.g., '1m', '5m', '1h', '1D'
            signal_type TEXT NOT NULL,               -- e.g., 'uptrend_start', 'downtrend_start', 'ma_cross_bullish'
            signal_price DOUBLE PRECISION,           -- Price at which the signal occurred (e.g., breakout price, or close of signal bar)
            
            -- OHLCV of the bar that generated the signal
            signal_open DOUBLE PRECISION, 
            signal_high DOUBLE PRECISION,
            signal_low DOUBLE PRECISION,
            signal_close DOUBLE PRECISION,
            signal_volume BIGINT,
            
            details JSONB                            -- For additional signal parameters
        );
        """
        execute_query(conn, detected_signals_schema)
        print("Table 'detected_signals' created or already exists.")

        # Add index for faster querying on detected_signals by timestamp and contract_id
        print("\n--- Creating Index on detected_signals (timestamp, contract_id) ---")
        index_query_ts_contract = "CREATE INDEX IF NOT EXISTS idx_detected_signals_timestamp_contract ON detected_signals (timestamp DESC, contract_id);"
        execute_query(conn, index_query_ts_contract)
        print("Index 'idx_detected_signals_timestamp_contract' created or already exists.")
        
        print("\n--- Creating Index on detected_signals (analyzer_id) ---")
        index_query_analyzer = "CREATE INDEX IF NOT EXISTS idx_detected_signals_analyzer_id ON detected_signals (analyzer_id);"
        execute_query(conn, index_query_analyzer)
        print("Index 'idx_detected_signals_analyzer_id' created or already exists.")

        # The following index for rule_type might be incorrect as rule_type isn't in the schema, signal_type is.
        # If an index on signal_type is needed, it should reference that column.
        # CREATE INDEX IF NOT EXISTS idx_detected_signals_rule_type ON detected_signals (rule_type);
        print("\n--- Creating Index on detected_signals (signal_type) ---")
        index_query_signal_type = "CREATE INDEX IF NOT EXISTS idx_detected_signals_signal_type ON detected_signals (signal_type);"
        execute_query(conn, index_query_signal_type)
        print("Index 'idx_detected_signals_signal_type' created or already exists.")

        # logger.info("Table 'detected_signals' created or already exists.") # This was using async logger in sync script

        # Create orders table
        print("\n--- Creating orders Table ---")
        orders_table_schema = """
        CREATE TABLE IF NOT EXISTS orders (
            order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            internal_order_id VARCHAR(255) UNIQUE NOT NULL, 
            broker_order_id VARCHAR(255), 
            contract_id VARCHAR(255) NOT NULL,
            signal_id INTEGER REFERENCES detected_signals(signal_id),
            coordinated_signal_id VARCHAR(255), 
            account_id VARCHAR(255) NOT NULL, 
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            order_type VARCHAR(50) NOT NULL, 
            direction VARCHAR(4) NOT NULL, 
            quantity INTEGER NOT NULL,
            limit_price NUMERIC, 
            stop_price NUMERIC, 
            status VARCHAR(50) NOT NULL, 
            filled_quantity INTEGER DEFAULT 0,
            average_fill_price NUMERIC,
            commission NUMERIC,
            details JSONB, 
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
        execute_query(conn, orders_table_schema)
        print("Table 'orders' created or already exists.")

        print("\n--- Creating Indexes for orders Table ---")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON orders (timestamp DESC);")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_orders_contract_id ON orders (contract_id);")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_orders_internal_order_id ON orders (internal_order_id);")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_orders_broker_order_id ON orders (broker_order_id);")
        print("Indexes for 'orders' table created or already exist.")

        # Create a trigger to update updated_at for orders table
        print("\n--- Creating/Updating Function update_modified_column ---")
        update_function_sql = """
        CREATE OR REPLACE FUNCTION update_modified_column()
        RETURNS TRIGGER AS $$
        BEGIN
           NEW.updated_at = NOW();
           RETURN NEW;
        END;
        $$ language 'plpgsql';
        """
        execute_query(conn, update_function_sql)
        print("Function 'update_modified_column' created or updated.")

        print("\n--- Creating/Updating Trigger update_orders_modtime for orders Table ---")
        orders_trigger_sql = """
        DROP TRIGGER IF EXISTS update_orders_modtime ON orders;
        CREATE TRIGGER update_orders_modtime
        BEFORE UPDATE ON orders
        FOR EACH ROW
        EXECUTE FUNCTION update_modified_column();
        """
        execute_query(conn, orders_trigger_sql)
        print("Trigger 'update_orders_modtime' for 'orders' table created or updated.")

    except Exception as e:
        print(f"An error occurred during table setup: {e}")

def setup_database():
    conn = None
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        conn.autocommit = False # Ensure we can commit or rollback explicitly for the delete
        cur = conn.cursor()
        print(f"Successfully connected to database '{DB_NAME}' on {DB_HOST}:{DB_PORT}\\n")

        # Clear specific analyzer watermarks before other setup steps
        delete_watermark_query = """
        DELETE FROM analyzer_watermarks 
        WHERE analyzer_id = 'cus_cds_trend_finder' 
          AND contract_id = 'CON.F.US.MES.M25';
        """
        print("--- Clearing Specific Analyzer Watermarks ---")
        cur.execute(delete_watermark_query)
        conn.commit() # Commit the delete operation
        print(f"Successfully deleted watermarks for analyzer 'cus_cds_trend_finder', contract 'CON.F.US.MES.M25'. {cur.rowcount} rows affected.")
        
        conn.autocommit = True # Revert to autocommit for subsequent DDL operations

        print("\n--- Enabling TimescaleDB Extension ---")
        try:
            execute_query(conn, "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")
            print("TimescaleDB extension enabled or already exists.")
        except psycopg2.Error as e:
            print(f"Warning: Could not enable TimescaleDB extension: {e}")
            print("This might be fine if it's already enabled or if the user lacks permissions for CREATE EXTENSION.")
            print("If hypertable creation fails later, this might be the cause.")

        print("\n--- Dropping ohlc_bars Table (if exists) to ensure clean hypertable conversion ---")
        execute_query(conn, "DROP TABLE IF EXISTS ohlc_bars CASCADE;")

        print("\n--- Creating ohlc_bars Table ---")
        ohlc_bars_schema = """
        CREATE TABLE IF NOT EXISTS ohlc_bars (
            contract_id TEXT NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL,
            open DOUBLE PRECISION NOT NULL,
            high DOUBLE PRECISION NOT NULL,
            low DOUBLE PRECISION NOT NULL,
            close DOUBLE PRECISION NOT NULL,
            volume BIGINT,
            timeframe_unit INTEGER NOT NULL, -- 1:sec, 2:min, 3:hr, 4:day, 5:wk
            timeframe_value INTEGER NOT NULL,
            PRIMARY KEY (contract_id, timestamp, timeframe_unit, timeframe_value)
        );
        """
        execute_query(conn, ohlc_bars_schema)
        print("Table 'ohlc_bars' created or already exists.")

        print("\n--- Converting ohlc_bars to Hypertable ---")
        # Use IF NOT EXISTS for create_hypertable if your TimescaleDB version supports it
        # For older versions, this might error if called twice, but DROP TABLE handles re-runs for this script.
        hypertable_query = "SELECT create_hypertable('ohlc_bars', 'timestamp', if_not_exists => TRUE);"
        try:
            execute_query(conn, hypertable_query)
            print("Successfully converted 'ohlc_bars' to hypertable or it already was.")
        except psycopg2.Error as e:
            # Check if the error is because it's already a hypertable
            if "already a hypertable" in str(e).lower():
                print("'ohlc_bars' is already a hypertable.")
            else:
                raise # Re-raise other errors

        # --- Watermark Tables ---
        print("\n--- Creating analyzer_watermarks Table ---")
        analyzer_watermarks_schema = """
        CREATE TABLE IF NOT EXISTS analyzer_watermarks (
            analyzer_id TEXT NOT NULL,
            contract_id TEXT NOT NULL,
            timeframe TEXT NOT NULL, -- e.g., '1m', '5m', '1h'
            last_processed_timestamp TIMESTAMPTZ,
            PRIMARY KEY (analyzer_id, contract_id, timeframe)
        );
        """
        execute_query(conn, analyzer_watermarks_schema)
        print("Table 'analyzer_watermarks' created or already exists.")

        print("\n--- Creating coordinator_watermarks Table ---")
        coordinator_watermarks_schema = """
        CREATE TABLE IF NOT EXISTS coordinator_watermarks (
            coordinator_id TEXT PRIMARY KEY,
            last_processed_signal_id BIGINT
        );
        """
        execute_query(conn, coordinator_watermarks_schema)
        print("Table 'coordinator_watermarks' created or already exists.")

        # --- Detected Signals Table ---
        print("\n--- Creating detected_signals Table ---")
        # Drop if exists to apply changes cleanly during development, consider ALTER TABLE for production migrations
        execute_query(conn, "DROP TABLE IF EXISTS detected_signals CASCADE;") 
        detected_signals_schema = """
        CREATE TABLE IF NOT EXISTS detected_signals (
            signal_id SERIAL PRIMARY KEY,
            analyzer_id TEXT NOT NULL,               -- Identifier for the analyzer that generated this signal
            timestamp TIMESTAMPTZ NOT NULL,          -- Timestamp of the bar that generated the signal
            trigger_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- When the signal was detected by the system
            contract_id TEXT NOT NULL,
            timeframe TEXT NOT NULL,                 -- e.g., '1m', '5m', '1h', '1D'
            signal_type TEXT NOT NULL,               -- e.g., 'uptrend_start', 'downtrend_start', 'ma_cross_bullish'
            signal_price DOUBLE PRECISION,           -- Price at which the signal occurred (e.g., breakout price, or close of signal bar)
            
            -- OHLCV of the bar that generated the signal
            signal_open DOUBLE PRECISION, 
            signal_high DOUBLE PRECISION,
            signal_low DOUBLE PRECISION,
            signal_close DOUBLE PRECISION,
            signal_volume BIGINT,
            
            details JSONB                            -- For additional signal parameters
        );
        """
        execute_query(conn, detected_signals_schema)
        print("Table 'detected_signals' created or already exists.")

        # Add index for faster querying on detected_signals by timestamp and contract_id
        print("\n--- Creating Index on detected_signals (timestamp, contract_id) ---")
        index_query_ts_contract = "CREATE INDEX IF NOT EXISTS idx_detected_signals_timestamp_contract ON detected_signals (timestamp DESC, contract_id);"
        execute_query(conn, index_query_ts_contract)
        print("Index 'idx_detected_signals_timestamp_contract' created or already exists.")
        
        print("\n--- Creating Index on detected_signals (analyzer_id) ---")
        index_query_analyzer = "CREATE INDEX IF NOT EXISTS idx_detected_signals_analyzer_id ON detected_signals (analyzer_id);"
        execute_query(conn, index_query_analyzer)
        print("Index 'idx_detected_signals_analyzer_id' created or already exists.")

        # The following index for rule_type might be incorrect as rule_type isn't in the schema, signal_type is.
        # If an index on signal_type is needed, it should reference that column.
        # CREATE INDEX IF NOT EXISTS idx_detected_signals_rule_type ON detected_signals (rule_type);
        print("\n--- Creating Index on detected_signals (signal_type) ---")
        index_query_signal_type = "CREATE INDEX IF NOT EXISTS idx_detected_signals_signal_type ON detected_signals (signal_type);"
        execute_query(conn, index_query_signal_type)
        print("Index 'idx_detected_signals_signal_type' created or already exists.")

        # logger.info("Table 'detected_signals' created or already exists.") # This was using async logger in sync script

        # Create orders table
        print("\n--- Creating orders Table ---")
        orders_table_schema = """
        CREATE TABLE IF NOT EXISTS orders (
            order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            internal_order_id VARCHAR(255) UNIQUE NOT NULL, 
            broker_order_id VARCHAR(255), 
            contract_id VARCHAR(255) NOT NULL,
            signal_id INTEGER REFERENCES detected_signals(signal_id),
            coordinated_signal_id VARCHAR(255), 
            account_id VARCHAR(255) NOT NULL, 
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            order_type VARCHAR(50) NOT NULL, 
            direction VARCHAR(4) NOT NULL, 
            quantity INTEGER NOT NULL,
            limit_price NUMERIC, 
            stop_price NUMERIC, 
            status VARCHAR(50) NOT NULL, 
            filled_quantity INTEGER DEFAULT 0,
            average_fill_price NUMERIC,
            commission NUMERIC,
            details JSONB, 
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
        execute_query(conn, orders_table_schema)
        print("Table 'orders' created or already exists.")

        print("\n--- Creating Indexes for orders Table ---")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON orders (timestamp DESC);")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_orders_contract_id ON orders (contract_id);")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_orders_internal_order_id ON orders (internal_order_id);")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_orders_broker_order_id ON orders (broker_order_id);")
        print("Indexes for 'orders' table created or already exist.")

        # Create a trigger to update updated_at for orders table
        print("\n--- Creating/Updating Function update_modified_column ---")
        update_function_sql = """
        CREATE OR REPLACE FUNCTION update_modified_column()
        RETURNS TRIGGER AS $$
        BEGIN
           NEW.updated_at = NOW();
           RETURN NEW;
        END;
        $$ language 'plpgsql';
        """
        execute_query(conn, update_function_sql)
        print("Function 'update_modified_column' created or updated.")

        print("\n--- Creating/Updating Trigger update_orders_modtime for orders Table ---")
        orders_trigger_sql = """
        DROP TRIGGER IF EXISTS update_orders_modtime ON orders;
        CREATE TRIGGER update_orders_modtime
        BEFORE UPDATE ON orders
        FOR EACH ROW
        EXECUTE FUNCTION update_modified_column();
        """
        execute_query(conn, orders_trigger_sql)
        print("Trigger 'update_orders_modtime' for 'orders' table created or updated.")

    except Exception as e:
        print(f"An error occurred during table setup: {e}")

def main():
    conn = None
    try:
        conn = get_db_connection()

        setup_tables(conn)

        print("\n--- Basic Test Query ---")
        test_query_result = execute_query(conn, "SELECT current_database();", fetch=True)
        print(f"Current database: {test_query_result[0][0]}")
        
        test_query_result_tables = execute_query(conn, 
            "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema' AND schemaname != '_timescaledb_internal' AND schemaname != 'timescaledb_information' AND schemaname != 'timescaledb_experimental';"
        , fetch=True)
        print(f"User tables in database: {[r[0] for r in test_query_result_tables]}")


        print("\n--- Database Setup and Test Completed Successfully! ---")

    except (Exception, psycopg2.Error) as error:
        print(f"\n--- An error occurred during database setup: {error} ---")
    finally:
        if conn:
            conn.close()
            print("\nDatabase connection closed.")

if __name__ == "__main__":
    main() 