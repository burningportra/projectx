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

async def delete_watermarks_and_signals():
    if not DB_CONFIG["password"]:
        print("Error: LOCAL_DB_PASSWORD environment variable not set.")
        print("Please set it in your .env file or system environment.")
        return

    conn = None
    try:
        conn = await asyncpg.connect(**DB_CONFIG)
        print(f"Successfully connected to database '{DB_CONFIG['database']}'.")

        for tf in TIMEFRAMES_TO_RESET:
            # Delete watermarks
            watermark_query = """
                DELETE FROM analyzer_watermarks
                WHERE analyzer_id = $1 AND contract_id = $2 AND timeframe = $3;
            """
            result_wm = await conn.execute(watermark_query, ANALYZER_ID_TO_RESET, CONTRACT_ID_TO_RESET, tf)
            if result_wm and result_wm.startswith("DELETE"):
                num_deleted_wm = int(result_wm.split(" ")[1])
                if num_deleted_wm > 0:
                    print(f"  Deleted {num_deleted_wm} watermark(s) for: Analyzer='{ANALYZER_ID_TO_RESET}', Contract='{CONTRACT_ID_TO_RESET}', Timeframe='{tf}'")
                else:
                    print(f"  No watermark found (or already deleted) for: Analyzer='{ANALYZER_ID_TO_RESET}', Contract='{CONTRACT_ID_TO_RESET}', Timeframe='{tf}'")
            else:
                 print(f"  Unexpected result deleting watermark for Timeframe='{tf}': {result_wm}")

            # Delete signals
            signal_query = """
                DELETE FROM detected_signals
                WHERE analyzer_id = $1 AND contract_id = $2 AND timeframe = $3;
            """
            result_sig = await conn.execute(signal_query, ANALYZER_ID_TO_RESET, CONTRACT_ID_TO_RESET, tf)
            if result_sig and result_sig.startswith("DELETE"):
                num_deleted_sig = int(result_sig.split(" ")[1])
                if num_deleted_sig > 0:
                    print(f"  Deleted {num_deleted_sig} signal(s) for: Analyzer='{ANALYZER_ID_TO_RESET}', Contract='{CONTRACT_ID_TO_RESET}', Timeframe='{tf}'")
                else:
                    print(f"  No signals found (or already deleted) for: Analyzer='{ANALYZER_ID_TO_RESET}', Contract='{CONTRACT_ID_TO_RESET}', Timeframe='{tf}'")
            else:
                print(f"  Unexpected result deleting signals for Timeframe='{tf}': {result_sig}")
        
        print("\nWatermark and signal deletion process complete.")
        print("Restart your services (run_services.sh) for the analyzer to reprocess historical data.")

    except asyncpg.exceptions.PostgresConnectionError as e:
        print(f"Error connecting to the database: {e}")
        print("Please ensure TimescaleDB is running and accessible with the configured credentials.")
    except asyncpg.exceptions.InvalidPasswordError:
        print(f"Error: Invalid password for user '{DB_CONFIG['user']}'. Check LOCAL_DB_PASSWORD.")
    except asyncpg.exceptions.UndefinedTableError as e:
        print(f"Error: Table not found - {e}. Has the analyzer_service.py run at least once to create all tables?")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        if conn:
            await conn.close()
            print("Database connection closed.")

if __name__ == "__main__":
    asyncio.run(delete_watermarks_and_signals()) 