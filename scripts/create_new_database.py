#!/usr/bin/env python3
"""
Script to create a new database with the same schema as projectx
Usage: python create_new_database.py <new_database_name>
"""

import sys
import os
import subprocess
import psycopg2
from psycopg2 import sql
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import argparse
from pathlib import Path

# ANSI color codes
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
RED = '\033[0;31m'
NC = '\033[0m'  # No Color

def print_colored(message, color=NC):
    """Print message with color"""
    print(f"{color}{message}{NC}")

def get_db_config():
    """Get database configuration from environment or defaults"""
    return {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': os.getenv('DB_PORT', '5433'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', 'password'),
        'database': 'projectx'
    }

def database_exists(conn, db_name):
    """Check if database exists"""
    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM pg_database WHERE datname = %s",
        (db_name,)
    )
    exists = cur.fetchone() is not None
    cur.close()
    return exists

def export_schema(config, output_file):
    """Export schema from existing database using pg_dump"""
    print_colored(f"Exporting schema from {config['database']}...", YELLOW)
    
    env = os.environ.copy()
    env['PGPASSWORD'] = config['password']
    
    cmd = [
        'pg_dump',
        '-h', config['host'],
        '-p', config['port'],
        '-U', config['user'],
        '-d', config['database'],
        '--schema-only',
        '--no-owner',
        '--no-privileges',
        '-f', output_file
    ]
    
    try:
        subprocess.run(cmd, env=env, check=True, capture_output=True, text=True)
        print_colored("✓ Schema exported successfully", GREEN)
    except subprocess.CalledProcessError as e:
        print_colored(f"Error exporting schema: {e.stderr}", RED)
        sys.exit(1)

def create_database(config, new_db_name):
    """Create new database"""
    print_colored(f"Creating database {new_db_name}...", YELLOW)
    
    # Connect to postgres database to create new database
    conn = psycopg2.connect(
        host=config['host'],
        port=config['port'],
        user=config['user'],
        password=config['password'],
        database='postgres'
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    
    if database_exists(conn, new_db_name):
        print_colored(f"Error: Database '{new_db_name}' already exists", RED)
        conn.close()
        sys.exit(1)
    
    cur = conn.cursor()
    cur.execute(sql.SQL("CREATE DATABASE {}").format(
        sql.Identifier(new_db_name)
    ))
    cur.close()
    conn.close()
    
    print_colored("✓ Database created successfully", GREEN)

def import_schema(config, new_db_name, schema_file):
    """Import schema to new database"""
    print_colored(f"Importing schema to {new_db_name}...", YELLOW)
    
    env = os.environ.copy()
    env['PGPASSWORD'] = config['password']
    
    cmd = [
        'psql',
        '-h', config['host'],
        '-p', config['port'],
        '-U', config['user'],
        '-d', new_db_name,
        '-f', schema_file
    ]
    
    try:
        subprocess.run(cmd, env=env, check=True, capture_output=True, text=True)
        print_colored("✓ Schema imported successfully", GREEN)
    except subprocess.CalledProcessError as e:
        print_colored(f"Error importing schema: {e.stderr}", RED)
        sys.exit(1)

def setup_timescaledb(config, new_db_name):
    """Enable TimescaleDB and convert ohlc_bars to hypertable"""
    print_colored("Setting up TimescaleDB...", YELLOW)
    
    conn = psycopg2.connect(
        host=config['host'],
        port=config['port'],
        user=config['user'],
        password=config['password'],
        database=new_db_name
    )
    
    cur = conn.cursor()
    
    try:
        # Enable TimescaleDB extension
        cur.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")
        conn.commit()
        print_colored("✓ TimescaleDB extension enabled", GREEN)
        
        # Convert ohlc_bars to hypertable if it exists
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'ohlc_bars'
            );
        """)
        
        if cur.fetchone()[0]:
            try:
                cur.execute("SELECT create_hypertable('ohlc_bars', 'timestamp', if_not_exists => TRUE);")
                conn.commit()
                print_colored("✓ ohlc_bars converted to hypertable", GREEN)
            except Exception as e:
                print_colored(f"Note: ohlc_bars might already be a hypertable: {e}", YELLOW)
        else:
            print_colored("Note: ohlc_bars table doesn't exist yet", YELLOW)
            
    except Exception as e:
        print_colored(f"Error setting up TimescaleDB: {e}", RED)
    finally:
        cur.close()
        conn.close()

def main():
    parser = argparse.ArgumentParser(description='Create a new database with the same schema as projectx')
    parser.add_argument('new_database_name', help='Name for the new database')
    parser.add_argument('--skip-timescaledb', action='store_true', help='Skip TimescaleDB setup')
    
    args = parser.parse_args()
    
    new_db_name = args.new_database_name
    config = get_db_config()
    
    print_colored(f"Creating new database: {new_db_name}", YELLOW)
    
    # Temporary schema file
    schema_file = '/tmp/projectx_schema.sql'
    
    try:
        # Export schema
        export_schema(config, schema_file)
        
        # Create new database
        create_database(config, new_db_name)
        
        # Import schema
        import_schema(config, new_db_name, schema_file)
        
        # Setup TimescaleDB
        if not args.skip_timescaledb:
            setup_timescaledb(config, new_db_name)
        
        print_colored(f"\n✓ Database '{new_db_name}' created successfully!", GREEN)
        
        # Print next steps
        print_colored("\nNext steps:", YELLOW)
        print(f"1. Update your .env file:")
        print(f"   DATABASE_URL=\"postgresql://{config['user']}:{config['password']}@{config['host']}:{config['port']}/{new_db_name}\"")
        print(f"\n2. Update web/.env.local file:")
        print(f"   DATABASE_URL=\"postgresql://{config['user']}:{config['password']}@{config['host']}:{config['port']}/{new_db_name}\"")
        print(f"\n3. Run Prisma generate in the web directory:")
        print(f"   cd web && npx prisma generate")
        print(f"\n4. (Optional) Run Prisma migrate to ensure schema is in sync:")
        print(f"   cd web && npx prisma db push")
        
    finally:
        # Clean up
        if os.path.exists(schema_file):
            os.remove(schema_file)

if __name__ == "__main__":
    main() 