import asyncio
import asyncpg
import os
from datetime import datetime, timezone

async def check_signals():
    # Get database URL from environment
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("DATABASE_URL not set")
        return
    
    # Connect to database
    conn = await asyncpg.connect(database_url)
    
    try:
        # Count total signals
        total = await conn.fetchval("SELECT COUNT(*) FROM detected_signals")
        print(f"Total signals in database: {total}")
        
        # Count by signal type
        type_counts = await conn.fetch("""
            SELECT signal_type, COUNT(*) as count 
            FROM detected_signals 
            GROUP BY signal_type
        """)
        print("\nSignals by type:")
        for row in type_counts:
            print(f"  {row['signal_type']}: {row['count']}")
        
        # Count by timeframe
        tf_counts = await conn.fetch("""
            SELECT timeframe, COUNT(*) as count 
            FROM detected_signals 
            GROUP BY timeframe
            ORDER BY timeframe
        """)
        print("\nSignals by timeframe:")
        for row in tf_counts:
            print(f"  {row['timeframe']}: {row['count']}")
        
        # Get latest signals
        latest = await conn.fetch("""
            SELECT signal_id, analyzer_id, timestamp, contract_id, timeframe, signal_type, signal_price
            FROM detected_signals 
            ORDER BY timestamp DESC 
            LIMIT 10
        """)
        print("\nLatest 10 signals:")
        for row in latest:
            print(f"  ID: {row['signal_id']}, Time: {row['timestamp']}, {row['contract_id']}/{row['timeframe']}, Type: {row['signal_type']}, Price: {row['signal_price']}")
        
        # Check for specific timeframe (1h)
        hour_signals = await conn.fetch("""
            SELECT signal_id, timestamp, signal_type, signal_price
            FROM detected_signals 
            WHERE timeframe = '1h' AND contract_id = 'CON.F.US.MES.M25'
            ORDER BY timestamp DESC 
            LIMIT 5
        """)
        print("\nLatest 1h signals for MES:")
        for row in hour_signals:
            print(f"  ID: {row['signal_id']}, Time: {row['timestamp']}, Type: {row['signal_type']}, Price: {row['signal_price']}")
            
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_signals()) 