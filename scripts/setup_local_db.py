import psycopg2
from psycopg2 import sql
import os
from dotenv import load_dotenv
import time

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

def main():
    conn = None
    try:
        conn = get_db_connection()

        print("\n--- Enabling TimescaleDB Extension ---")
        try:
            execute_query(conn, "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")
            print("TimescaleDB extension enabled (or already existed).")
        except Exception as e:
            print(f"Note: Could not ensure TimescaleDB extension is enabled: {e}")
            print("This might be fine if it's already enabled or if the user lacks permissions for CREATE EXTENSION.")
            print("If hypertable creation fails later, this might be the cause.")
            # It's possible the connection itself is the issue, so we might not want to proceed if this fails.
            # However, for now, let's keep it as a warning.

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

        print("\n--- Converting ohlc_bars to Hypertable ---")
        # Check if already a hypertable to avoid error
        with conn.cursor() as cur:
            cur.execute("""
                SELECT EXISTS (
                    SELECT 1
                    FROM timescaledb_information.hypertables
                    WHERE hypertable_name = 'ohlc_bars'
                );
            """)
            is_hypertable = cur.fetchone()[0]

        if not is_hypertable:
            execute_query(conn, "SELECT create_hypertable('ohlc_bars', 'timestamp', if_not_exists => TRUE);")
            print("ohlc_bars converted to hypertable (or already was).")
        else:
            print("ohlc_bars is already a hypertable.")

        print("\n--- Creating analyzer_watermarks Table ---")
        analyzer_watermarks_schema = """
        CREATE TABLE IF NOT EXISTS analyzer_watermarks (
            analyzer_id TEXT NOT NULL,
            contract_id TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            last_processed_timestamp TIMESTAMPTZ,
            PRIMARY KEY (analyzer_id, contract_id, timeframe)
        );
        """
        execute_query(conn, analyzer_watermarks_schema)

        print("\n--- Creating coordinator_watermarks Table ---")
        coordinator_watermarks_schema = """
        CREATE TABLE IF NOT EXISTS coordinator_watermarks (
            coordinator_id TEXT PRIMARY KEY,
            last_processed_signal_id BIGINT
        );
        """
        execute_query(conn, coordinator_watermarks_schema)

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