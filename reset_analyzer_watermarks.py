import asyncio
import asyncpg
import os
from dotenv import load_dotenv

# Load .env file to get LOCAL_DB_PASSWORD
load_dotenv()

# --- Configuration (matches your settings.yaml and analyzer_service.py logs) ---
DB_CONFIG = {
    "host": "localhost",
    "port": 5433,
    "user": "postgres",
    "password": os.getenv("LOCAL_DB_PASSWORD"),
    "database": "projectx",
}

ANALYZER_ID_TO_RESET = "cus_cds_trend_finder"
CONTRACT_ID_TO_RESET = "CON.F.US.MES.M25"
TIMEFRAMES_TO_RESET = ["5m", "30m", "1h", "4h", "1d", "1w"] # From analyzer_service.py logs

async def delete_watermarks():
    if not DB_CONFIG["password"]:
        print("Error: LOCAL_DB_PASSWORD environment variable not set.")
        print("Please set it in your .env file or system environment.")
        return

    conn = None
    try:
        conn = await asyncpg.connect(**DB_CONFIG)
        print(f"Successfully connected to database '{DB_CONFIG['database']}'.")

        for tf in TIMEFRAMES_TO_RESET:
            query = """
                DELETE FROM analyzer_watermarks
                WHERE analyzer_id = $1 AND contract_id = $2 AND timeframe = $3;
            """
            result = await conn.execute(query, ANALYZER_ID_TO_RESET, CONTRACT_ID_TO_RESET, tf)
            # result from DELETE is like 'DELETE N' where N is number of rows
            if result and result.startswith("DELETE"):
                num_deleted = int(result.split(" ")[1])
                if num_deleted > 0:
                    print(f"  Deleted {num_deleted} watermark(s) for: Analyzer='{ANALYZER_ID_TO_RESET}', Contract='{CONTRACT_ID_TO_RESET}', Timeframe='{tf}'")
                else:
                    print(f"  No watermark found (or already deleted) for: Analyzer='{ANALYZER_ID_TO_RESET}', Contract='{CONTRACT_ID_TO_RESET}', Timeframe='{tf}'")
            else: # Should not happen if query is correct and table exists
                 print(f"  Unexpected result deleting watermark for Timeframe='{tf}': {result}")
        
        print("\nWatermark deletion process complete.")
        print("Restart your services (run_services.sh) for the analyzer to reprocess historical data.")

    except asyncpg.exceptions.PostgresConnectionError as e:
        print(f"Error connecting to the database: {e}")
        print("Please ensure TimescaleDB is running and accessible with the configured credentials.")
    except asyncpg.exceptions.InvalidPasswordError:
        print(f"Error: Invalid password for user '{DB_CONFIG['user']}'. Check LOCAL_DB_PASSWORD.")
    except asyncpg.exceptions.UndefinedTableError:
        print("Error: The 'analyzer_watermarks' table does not exist. Has the analyzer_service.py run at least once to create it?")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        if conn:
            await conn.close()
            print("Database connection closed.")

if __name__ == "__main__":
    asyncio.run(delete_watermarks()) 