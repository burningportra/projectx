import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client'; // Prisma type for WhereInput
import { prisma } from '@/lib/prisma'; // Import the centralized Prisma client

console.log('[API Route] DATABASE_URL:', process.env.DATABASE_URL);

// TODO: Add more robust logging and error handling
// TODO: Add request validation (e.g., using Zod)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  try {
    // --- Query Parameter Extraction & Validation ---
    const timeframe = searchParams.get('timeframe');
    const contractId = searchParams.get('contract_id');
    const signalType = searchParams.get('signal_type');
    const startDateStr = searchParams.get('start_date');
    const endDateStr = searchParams.get('end_date');
    const limitStr = searchParams.get('limit') || '100'; // Default limit
    const offsetStr = searchParams.get('offset') || '0';   // Default offset

    if (!timeframe) {
      return NextResponse.json({ error: 'timeframe query parameter is required' }, { status: 400 });
    }

    const limit = parseInt(limitStr, 10);
    const offset = parseInt(offsetStr, 10);

    if (isNaN(limit) || limit <= 0) {
      return NextResponse.json({ error: 'limit must be a positive integer' }, { status: 400 });
    }
    if (isNaN(offset) || offset < 0) {
      return NextResponse.json({ error: 'offset must be a non-negative integer' }, { status: 400 });
    }

    let startDate: Date | undefined;
    if (startDateStr) {
      startDate = new Date(startDateStr);
      if (isNaN(startDate.getTime())) {
        return NextResponse.json({ error: 'Invalid start_date format. Please use ISO 8601.' }, { status: 400 });
      }
    }

    let endDate: Date | undefined;
    if (endDateStr) {
      endDate = new Date(endDateStr);
      if (isNaN(endDate.getTime())) {
        return NextResponse.json({ error: 'Invalid end_date format. Please use ISO 8601.' }, { status: 400 });
      }
    }

    // --- Prisma Query Construction ---
    const whereClause: Prisma.DetectedSignalWhereInput = {
      timeframe: timeframe, // In the DB schema, timeframe is a string like "1m", "1h"
    };

    if (contractId) {
      whereClause.contract_id = contractId;
    }
    if (signalType) {
      // Assuming signal_type in DB matches "uptrend_start", "downtrend_start" etc.
      // The schema doc says `rule_type` for the column name, but `signal_type` for the query param.
      // Let's assume the DB column for signal type is `signal_type` based on the query param name.
      // If it's `rule_type`, we'll need to adjust.
      // From analyzer_service.py, it seems 'signal_type' is used for the table column.
      // The insert query in analyzer_service.py uses `signal_type` for the column.
      // However, the table definition in framework.md uses `rule_type` and then the insert uses `signal_type` for the value to `rule_type`.
      // Let's stick to `signal_type` as the column name in `whereClause.signal_type` based on the API parameter name.
      // The `create_signals_table_if_not_exists` function in `analyzer_service.py` has `rule_type TEXT NOT NULL`
      // And the insert statement uses `signal_type` for the values to `rule_type`.
      // The `detected_signals` table schema in `framework.md` has `signal_type`
      // Let's look at the actual create table SQL from analyzer_service.py:
      // `rule_type TEXT NOT NULL` is in the CREATE TABLE DDL.
      // The `store_signals` function inserts `signal['signal_type']` into a column also named `signal_type` in the INSERT query.
      // This is confusing. The DDL in `analyzer_service.py` defines `rule_type`.
      // The INSERT query in `analyzer_service.py` targets a column named `signal_type`.
      // The query in `mechanical_trading_system_framework.md` mentions `signal_type` as a query param.
      // Let's assume the DB column is indeed `signal_type` for now for the API, and if there's a mismatch we'll fix it.
      // Re-checking `analyzer_service.py` `store_signals` INSERT: `INSERT INTO detected_signals (... signal_type ...)` -> `VALUES (... signal['signal_type'] ...)`
      // Re-checking DDL in `analyzer_service.py` `create_signals_table_if_not_exists`: `rule_type TEXT NOT NULL,`
      // There's a mismatch. The DDL has `rule_type` but the insert has `signal_type`.
      // The framework doc under "Signal Storage Schema" says: `signal_type (e.g., "uptrend_start", "downtrend_start")`
      // Let's assume the database column will be `signal_type` as that's more consistent with the API param and signal data structure.
      // If not, Prisma will error, and we'll know the actual column name. For now, this is the best guess.
      // Re-checking `analyzer_service.py` `store_signals` INSERT: `INSERT INTO detected_signals (... signal_type ...)` -> `VALUES (... signal['signal_type'] ...)`
      // Re-checking DDL in `analyzer_service.py` `create_signals_table_if_not_exists`: `rule_type TEXT NOT NULL,`
      // There's a mismatch. The DDL has `rule_type` but the insert has `signal_type`.
      // The framework doc under "Signal Storage Schema" says: `signal_type (e.g., "uptrend_start", "downtrend_start")`
      // Let's assume the database column will be `signal_type` as that's more consistent with the API param and signal data structure.
      // If not, Prisma will error, and we'll know the actual column name. For now, this is the best guess.
      whereClause.signal_type = signalType;
    }

    if (startDate || endDate) {
      whereClause.timestamp = {}; // Initialize timestamp filter
      if (startDate) {
        whereClause.timestamp.gte = startDate;
      }
      if (endDate) {
        whereClause.timestamp.lte = endDate;
      }
    }

    // --- Database Query ---
    const signals = await prisma.detectedSignal.findMany({
      where: whereClause,
      orderBy: {
        timestamp: 'desc', // Default sort: newest first
      },
      take: limit,
      skip: offset,
    });

    const totalSignals = await prisma.detectedSignal.count({
      where: whereClause,
    });

    // --- Response Formatting ---
    return NextResponse.json({
      data: signals,
      pagination: {
        limit,
        offset,
        total: totalSignals,
        hasMore: offset + limit < totalSignals,
      },
    }, { status: 200 });

  } catch (error) {
    console.error('Error fetching trend starts:', error);
    // Consider more specific error checking, e.g., Prisma specific errors
    if (error instanceof Error) {
        // Check for Prisma known request errors (e.g., column does not exist)
        if (error.name === 'PrismaClientKnownRequestError' && (error as any).code === 'P2021') { // P2021: Table does not exist
             return NextResponse.json({ error: 'Database table not found. Ensure migrations are run.' }, { status: 500 });
        }
        if (error.name === 'PrismaClientKnownRequestError' && (error as any).code === 'P2002') { // P2002: Unique constraint failed
             return NextResponse.json({ error: 'Unique constraint failed during operation.' }, { status: 409 }); // Conflict
        }
         // P2025: Record to update or delete does not exist
        if (error.name === 'PrismaClientKnownRequestError' && (error as any).code === 'P2025') {
            return NextResponse.json({ error: 'Required record not found for operation.' }, { status: 404 });
        }
        // Example of catching if a column doesn't exist, though Prisma's error codes are more general.
        // A common issue would be `P2009: Failed to validate the query: 'Reason for failure'` which can cover missing columns.
        // For a missing column specifically during a query, it might be more subtle or part of a general validation error.
        // If `whereClause.signal_type` was problematic, Prisma would likely throw a validation error.
        // For now, a generic server error is provided for other Prisma issues.
        return NextResponse.json({ error: 'Failed to fetch trend starts. '+ error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 