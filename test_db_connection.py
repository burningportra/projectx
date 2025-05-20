import psycopg2
import os
from dotenv import load_dotenv

# Load .env from the current directory
dotenv_path = '.env'
load_dotenv(dotenv_path)

print("Attempting to connect with the following parameters:")
db_host = os.getenv("LOCAL_DB_HOST", "localhost")
db_port = os.getenv("LOCAL_DB_PORT", "5433")
db_name = os.getenv("LOCAL_DB_NAME", "projectx")
db_user = os.getenv("LOCAL_DB_USER", "postgres")
# Ensure this matches exactly what's in your .env file for LOCAL_DB_PASSWORD
db_pass = os.getenv("LOCAL_DB_PASSWORD")

print(f"Host: {db_host}")
print(f"Port: {db_port}")
print(f"DB Name: {db_name}")
print(f"User: {db_user}")
if db_pass:
    print(f"Password being used for test: {'*' * len(db_pass)}")
else:
    print("Password being used for test: None (LOCAL_DB_PASSWORD not found in .env or is empty)")


try:
    print("\\nConnecting...")
    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        dbname=db_name,
        user=db_user,
        password=db_pass,
        connect_timeout=10  # Timeout for connection attempt in seconds
    )
    print("Successfully connected to the database!")
    
    # Test a simple query
    cur = conn.cursor()
    cur.execute("SELECT version();")
    db_version = cur.fetchone()
    print(f"Database version: {db_version}")
    cur.close()
    
    conn.close()
    print("Connection closed.")

except psycopg2.OperationalError as e:
    print(f"Connection failed: {e}")
    if "password authentication failed" in str(e):
        print("Hint: Double-check your LOCAL_DB_PASSWORD in the .env file.")
    elif "Connection refused" in str(e):
        print("Hint: Ensure the Docker container 'projectx_timescaledb' is running and the port 5433 is correct.")
    elif "database" in str(e) and "does not exist" in str(e):
         print(f"Hint: The database '{db_name}' might not exist. Was 'scripts/setup_local_db.py' run successfully after the container was started?")
    elif "timeout expired" in str(e):
        print("Hint: Connection timed out. Check for firewalls or if the database server is slow/unresponsive.")

except Exception as e:
    print(f"An unexpected error occurred: {e}")
