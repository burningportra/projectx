"""
Database handler for market data storage.

This module provides functionality for storing and retrieving OHLC bars
from a database, supporting both SQLite and TimescaleDB.
"""

import logging
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
import asyncio
import aiosqlite
import asyncpg
from pathlib import Path

from src.core.exceptions import DatabaseError
from src.data.models import Bar
from src.core.config import Config


logger = logging.getLogger(__name__)


class DBHandler:
    """
    Handler for database operations related to OHLC bar data.
    
    Supports both SQLite (for development) and TimescaleDB/PostgreSQL (for production).
    """
    
    def __init__(self, config: Config, db_path: Optional[str] = None):
        """
        Initialize the database handler.
        
        Args:
            config: Configuration object
            db_path: Path to the database file (optional, uses config if not provided)
        """
        self.config = config
        self.use_timescale = config.use_timescale()
        self.db_url = config.get_database_url()
        
        # Extract filename for SQLite
        if not self.use_timescale:
            if db_path is None:
                # Use the config database URL
                if self.db_url.startswith('sqlite:///'):
                    db_path = self.db_url[10:]
                else:
                    db_path = 'projectx.db'  # Default filename
            self.db_path = db_path
        
        # Initialize connection objects
        self.sqlite_conn = None
        self.pg_pool = None
        self._setup_task = None
        
    async def setup(self):
        """
        Set up the database connection and tables.
        
        Returns:
            Self for method chaining
        """
        try:
            if self.use_timescale:
                await self._setup_timescale()
            else:
                await self._setup_sqlite()
                
            logger.info(f"Database setup complete: {'TimescaleDB' if self.use_timescale else 'SQLite'}")
            return self
            
        except Exception as e:
            logger.error(f"Error setting up database: {str(e)}")
            raise DatabaseError(f"Failed to setup database: {str(e)}")
    
    async def _setup_sqlite(self):
        """Set up SQLite database."""
        self.sqlite_conn = await aiosqlite.connect(self.db_path)
        
        # Create tables if they don't exist
        await self.sqlite_conn.execute("""
            CREATE TABLE IF NOT EXISTS ohlc_bars (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contract_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,  -- ISO format timestamp
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume REAL,
                timeframe_unit INTEGER NOT NULL,  -- 1=s, 2=m, 3=h, 4=d, 5=w, 6=mo
                timeframe_value INTEGER NOT NULL,
                
                -- Create a unique index on these fields to prevent duplicates
                UNIQUE(contract_id, timestamp, timeframe_unit, timeframe_value)
            )
        """)
        
        # Create indices for efficient querying
        await self.sqlite_conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_bars_contract_timeframe 
            ON ohlc_bars(contract_id, timeframe_unit, timeframe_value)
        """)
        
        await self.sqlite_conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_bars_timestamp 
            ON ohlc_bars(timestamp)
        """)
        
        await self.sqlite_conn.commit()
        
    async def _setup_timescale(self):
        """Set up TimescaleDB database."""
        # Create connection pool
        self.pg_pool = await asyncpg.create_pool(
            dsn=self.db_url,
            min_size=self.config.get_db_min_connections(),
            max_size=self.config.get_db_max_connections()
        )
        
        async with self.pg_pool.acquire() as conn:
            # Enable TimescaleDB extension if it doesn't exist
            try:
                await conn.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")
                logger.info("TimescaleDB extension enabled")
            except Exception as e:
                logger.warning(f"Could not enable TimescaleDB extension: {str(e)}")
                logger.warning("Make sure TimescaleDB is properly installed on your PostgreSQL server")
            
            # First check if table exists
            table_exists = await conn.fetchval(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ohlc_bars')"
            )
            
            if not table_exists:
                # Create a simple table structure
                await conn.execute("""
                    CREATE TABLE ohlc_bars (
                        id SERIAL PRIMARY KEY,
                        contract_id TEXT NOT NULL,
                        timestamp TIMESTAMPTZ NOT NULL,
                        open DOUBLE PRECISION NOT NULL,
                        high DOUBLE PRECISION NOT NULL,
                        low DOUBLE PRECISION NOT NULL,
                        close DOUBLE PRECISION NOT NULL,
                        volume DOUBLE PRECISION,
                        timeframe_unit INTEGER NOT NULL,
                        timeframe_value INTEGER NOT NULL
                    );
                """)
                
                # Convert to hypertable
                try:
                    await conn.execute("""
                        SELECT create_hypertable('ohlc_bars', 'timestamp');
                    """)
                    logger.info("TimescaleDB hypertable created successfully")
                except Exception as e:
                    logger.warning(f"Could not convert to hypertable: {str(e)}")
                    logger.warning("Will use regular PostgreSQL table instead of hypertable")
                
                # Create indices
                await conn.execute("""
                    CREATE INDEX idx_bars_contract ON ohlc_bars(contract_id);
                """)
                
                await conn.execute("""
                    CREATE INDEX idx_bars_timeframe ON ohlc_bars(timeframe_unit, timeframe_value);
                """)
                
                await conn.execute("""
                    CREATE INDEX idx_bars_contract_timeframe ON ohlc_bars(contract_id, timeframe_unit, timeframe_value);
                """)
                
                logger.info("TimescaleDB indices created")
            else:
                logger.info("TimescaleDB table 'ohlc_bars' already exists")
    
    async def ensure_setup(self):
        """Ensure the database is set up before queries."""
        if (self.use_timescale and self.pg_pool is None) or (not self.use_timescale and self.sqlite_conn is None):
            if self._setup_task is None or self._setup_task.done():
                self._setup_task = asyncio.create_task(self.setup())
            await self._setup_task
    
    async def close(self):
        """Close the database connection."""
        if self.use_timescale and self.pg_pool is not None:
            await self.pg_pool.close()
            self.pg_pool = None
        elif not self.use_timescale and self.sqlite_conn is not None:
            await self.sqlite_conn.close()
            self.sqlite_conn = None
        logger.info("Database connection closed")
            
    async def __aenter__(self):
        """Context manager entry."""
        await self.ensure_setup()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        await self.close()
    
    async def store_bar(self, bar: Bar) -> int:
        """
        Store a single OHLC bar in the database.
        
        Args:
            bar: The Bar object to store
            
        Returns:
            The ID of the stored bar
            
        Raises:
            DatabaseError: If there's an error storing the bar
        """
        await self.ensure_setup()
        
        try:
            # Format the timestamp appropriately for the database
            if self.use_timescale:
                # Ensure timestamp is a datetime object for PostgreSQL
                if isinstance(bar.t, str):
                    timestamp = datetime.fromisoformat(bar.t)
                else:
                    timestamp = bar.t
            else:
                # Convert to ISO string for SQLite
                timestamp = bar.t.isoformat() if isinstance(bar.t, datetime) else bar.t
            
            if self.use_timescale:
                async with self.pg_pool.acquire() as conn:
                    # Simple insert without ON CONFLICT
                    result = await conn.fetchval("""
                        INSERT INTO ohlc_bars (
                            contract_id, timestamp, open, high, low, close, volume,
                            timeframe_unit, timeframe_value
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        RETURNING id
                    """, 
                    bar.contract_id, timestamp, bar.o, bar.h, bar.l, bar.c, bar.v,
                    bar.timeframe_unit, bar.timeframe_value)
                    
                    return result
            else:
                cursor = await self.sqlite_conn.execute("""
                    INSERT OR REPLACE INTO ohlc_bars (
                        contract_id, timestamp, open, high, low, close, volume,
                        timeframe_unit, timeframe_value
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    bar.contract_id, timestamp, bar.o, bar.h, bar.l, bar.c, bar.v,
                    bar.timeframe_unit, bar.timeframe_value
                ))
                
                await self.sqlite_conn.commit()
                return cursor.lastrowid
            
        except Exception as e:
            logger.error(f"Error storing bar: {str(e)}")
            raise DatabaseError(f"Failed to store bar: {str(e)}")
            
    async def store_bars(self, bars: List[Bar]) -> int:
        """
        Store multiple OHLC bars in the database.
        
        Args:
            bars: List of Bar objects to store
            
        Returns:
            Number of bars stored
            
        Raises:
            DatabaseError: If there's an error storing the bars
        """
        if not bars:
            return 0
            
        await self.ensure_setup()
        
        try:
            # Filter out bars that already exist in the database
            bars_to_insert = []
            
            for bar in bars:
                # Check if this bar already exists in the database
                existing = await self._bar_exists(bar)
                if not existing:
                    bars_to_insert.append(bar)
            
            if not bars_to_insert:
                logger.info("All bars already exist in database, skipping insertion")
                return 0
            
            logger.info(f"Inserting {len(bars_to_insert)} new bars out of {len(bars)} total")
            
            if self.use_timescale:
                async with self.pg_pool.acquire() as conn:
                    # Use a simpler insert without ON CONFLICT for bulk inserts
                    records = []
                    for bar in bars_to_insert:
                        # Ensure timestamp is a datetime object, not a string
                        if isinstance(bar.t, str):
                            timestamp = datetime.fromisoformat(bar.t)
                        else:
                            timestamp = bar.t
                        
                        records.append((
                            bar.contract_id, timestamp, bar.o, bar.h, bar.l, bar.c, bar.v,
                            bar.timeframe_unit, bar.timeframe_value
                        ))
                    
                    if records:
                        # Execute the insert in a transaction
                        async with conn.transaction():
                            result = await conn.executemany("""
                                INSERT INTO ohlc_bars (
                                    contract_id, timestamp, open, high, low, close, volume,
                                    timeframe_unit, timeframe_value
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                            """, records)
            else:
                # Prepare the batch insert for SQLite
                values = []
                for bar in bars_to_insert:
                    timestamp = bar.t.isoformat() if isinstance(bar.t, datetime) else bar.t
                    values.append((
                        bar.contract_id, timestamp, bar.o, bar.h, bar.l, bar.c, bar.v,
                        bar.timeframe_unit, bar.timeframe_value
                    ))
                    
                # Use executemany for batch insert
                await self.sqlite_conn.executemany("""
                    INSERT OR REPLACE INTO ohlc_bars (
                        contract_id, timestamp, open, high, low, close, volume,
                        timeframe_unit, timeframe_value
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, values)
                
                await self.sqlite_conn.commit()
                
            return len(bars_to_insert)
            
        except Exception as e:
            logger.error(f"Error storing {len(bars)} bars: {str(e)}")
            raise DatabaseError(f"Failed to store bars: {str(e)}")
            
    async def _bar_exists(self, bar: Bar) -> bool:
        """
        Check if a bar already exists in the database.
        
        Args:
            bar: The Bar object to check
            
        Returns:
            True if the bar exists, False otherwise
        """
        # Format the timestamp appropriately for the database
        if self.use_timescale:
            # Ensure timestamp is a datetime object for PostgreSQL
            if isinstance(bar.t, str):
                timestamp = datetime.fromisoformat(bar.t)
            else:
                timestamp = bar.t
        else:
            # Convert to ISO string for SQLite
            timestamp = bar.t.isoformat() if isinstance(bar.t, datetime) else bar.t
        
        try:
            if self.use_timescale:
                async with self.pg_pool.acquire() as conn:
                    exists = await conn.fetchval("""
                        SELECT EXISTS(
                            SELECT 1 FROM ohlc_bars
                            WHERE contract_id = $1
                            AND timeframe_unit = $2
                            AND timeframe_value = $3
                            AND timestamp = $4
                        )
                    """, bar.contract_id, bar.timeframe_unit, bar.timeframe_value, timestamp)
                    return exists
            else:
                cursor = await self.sqlite_conn.execute("""
                    SELECT COUNT(*) FROM ohlc_bars
                    WHERE contract_id = ?
                    AND timeframe_unit = ?
                    AND timeframe_value = ?
                    AND timestamp = ?
                """, (bar.contract_id, bar.timeframe_unit, bar.timeframe_value, timestamp))
                row = await cursor.fetchone()
                return row[0] > 0
        except Exception as e:
            logger.warning(f"Error checking if bar exists: {str(e)}")
            # If there's an error, let's be safe and assume the bar doesn't exist
            return False
            
    async def get_bars(
        self,
        contract_id: str,
        timeframe_unit: int,
        timeframe_value: int,
        start_time: Optional[Union[datetime, str]] = None,
        end_time: Optional[Union[datetime, str]] = None,
        limit: int = 100
    ) -> List[Bar]:
        """
        Retrieve OHLC bars from the database.
        
        Args:
            contract_id: The contract ID
            timeframe_unit: The timeframe unit (1=s, 2=m, 3=h, 4=d, 5=w, 6=mo)
            timeframe_value: The timeframe value
            start_time: Start time for the query (optional)
            end_time: End time for the query (optional)
            limit: Maximum number of bars to return
            
        Returns:
            List of Bar objects
            
        Raises:
            DatabaseError: If there's an error querying the database
        """
        await self.ensure_setup()
        
        try:
            if self.use_timescale:
                async with self.pg_pool.acquire() as conn:
                    # Build the query
                    query = """
                        SELECT contract_id, timestamp, open, high, low, close, volume,
                               timeframe_unit, timeframe_value
                        FROM ohlc_bars
                        WHERE contract_id = $1
                        AND timeframe_unit = $2
                        AND timeframe_value = $3
                    """
                    params = [contract_id, timeframe_unit, timeframe_value]
                    param_idx = 4
                    
                    # Add time constraints if provided
                    if start_time:
                        if isinstance(start_time, datetime):
                            start_time = start_time.isoformat()
                        query += f" AND timestamp >= ${param_idx}"
                        params.append(start_time)
                        param_idx += 1
                        
                    if end_time:
                        if isinstance(end_time, datetime):
                            end_time = end_time.isoformat()
                        query += f" AND timestamp <= ${param_idx}"
                        params.append(end_time)
                        param_idx += 1
                    
                    # Add ordering and limit
                    query += f" ORDER BY timestamp ASC LIMIT ${param_idx}"
                    params.append(limit)
                    
                    # Execute the query
                    rows = await conn.fetch(query, *params)
                    
                    # Convert to Bar objects
                    bars = []
                    for row in rows:
                        bars.append(Bar(
                            t=row['timestamp'],
                            o=row['open'],
                            h=row['high'],
                            l=row['low'],
                            c=row['close'],
                            v=row['volume'],
                            contract_id=row['contract_id'],
                            timeframe_unit=row['timeframe_unit'],
                            timeframe_value=row['timeframe_value']
                        ))
                    
                    return bars
            else:
                # SQLite query
                query = """
                    SELECT contract_id, timestamp, open, high, low, close, volume,
                           timeframe_unit, timeframe_value
                    FROM ohlc_bars
                    WHERE contract_id = ?
                    AND timeframe_unit = ?
                    AND timeframe_value = ?
                """
                
                params = [contract_id, timeframe_unit, timeframe_value]
                
                # Add time constraints if provided
                if start_time:
                    if isinstance(start_time, datetime):
                        start_time = start_time.isoformat()
                    query += " AND timestamp >= ?"
                    params.append(start_time)
                    
                if end_time:
                    if isinstance(end_time, datetime):
                        end_time = end_time.isoformat()
                    query += " AND timestamp <= ?"
                    params.append(end_time)
                
                # Add ordering and limit
                query += " ORDER BY timestamp ASC LIMIT ?"
                params.append(limit)
                
                # Execute the query
                cursor = await self.sqlite_conn.execute(query, params)
                rows = await cursor.fetchall()
                
                # Convert to Bar objects
                bars = []
                for row in rows:
                    bars.append(Bar(
                        t=row[1],  # timestamp
                        o=row[2],  # open
                        h=row[3],  # high
                        l=row[4],  # low
                        c=row[5],  # close
                        v=row[6],  # volume
                        contract_id=row[0],  # contract_id
                        timeframe_unit=row[7],  # timeframe_unit
                        timeframe_value=row[8]   # timeframe_value
                    ))
                
                return bars
                
        except Exception as e:
            logger.error(f"Error retrieving bars: {str(e)}")
            raise DatabaseError(f"Failed to retrieve bars: {str(e)}")

    async def get_latest_bar(
        self,
        contract_id: str,
        timeframe_unit: int,
        timeframe_value: int
    ) -> Optional[Bar]:
        """
        Get the latest bar for a given contract and timeframe.
        
        Args:
            contract_id: The contract ID
            timeframe_unit: The timeframe unit (1=s, 2=m, 3=h, 4=d, 5=w, 6=mo)
            timeframe_value: The timeframe value
            
        Returns:
            The latest Bar object or None if no bars exist
            
        Raises:
            DatabaseError: If there's an error querying the database
        """
        await self.ensure_setup()
        
        try:
            if self.use_timescale:
                async with self.pg_pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT contract_id, timestamp, open, high, low, close, volume,
                               timeframe_unit, timeframe_value
                        FROM ohlc_bars
                        WHERE contract_id = $1
                        AND timeframe_unit = $2
                        AND timeframe_value = $3
                        ORDER BY timestamp DESC
                        LIMIT 1
                    """, contract_id, timeframe_unit, timeframe_value)
                    
                    if row:
                        return Bar(
                            t=row['timestamp'],
                            o=row['open'],
                            h=row['high'],
                            l=row['low'],
                            c=row['close'],
                            v=row['volume'],
                            contract_id=row['contract_id'],
                            timeframe_unit=row['timeframe_unit'],
                            timeframe_value=row['timeframe_value']
                        )
                    return None
            else:
                # SQLite query
                cursor = await self.sqlite_conn.execute("""
                    SELECT contract_id, timestamp, open, high, low, close, volume,
                           timeframe_unit, timeframe_value
                    FROM ohlc_bars
                    WHERE contract_id = ?
                    AND timeframe_unit = ?
                    AND timeframe_value = ?
                    ORDER BY timestamp DESC
                    LIMIT 1
                """, (contract_id, timeframe_unit, timeframe_value))
                
                row = await cursor.fetchone()
                
                if row:
                    return Bar(
                        t=row[1],  # timestamp
                        o=row[2],  # open
                        h=row[3],  # high
                        l=row[4],  # low
                        c=row[5],  # close
                        v=row[6],  # volume
                        contract_id=row[0],  # contract_id
                        timeframe_unit=row[7],  # timeframe_unit
                        timeframe_value=row[8]   # timeframe_value
                    )
                return None
                
        except Exception as e:
            logger.error(f"Error retrieving latest bar: {str(e)}")
            raise DatabaseError(f"Failed to retrieve latest bar: {str(e)}") 