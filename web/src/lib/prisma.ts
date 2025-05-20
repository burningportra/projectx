// This is a simplified version that works with Next.js
// Using type definitions instead of direct imports

import { PrismaClient } from '@prisma/client';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more: https://pris.ly/d/help/next-js-best-practices

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    // log: ['query', 'info', 'warn', 'error'], // Uncomment to see Prisma query logs
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;

// Type definitions for OhlcBar
export interface OhlcBar {
  id: number;
  contractId: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  timeframeUnit: number;
  timeframeValue: number;
}

// Type definitions for TrendPoint
export interface TrendPoint {
  id: number;
  contractId: string;
  timestamp: Date;
  price: number;
  type: string;  // uptrendStart, downtrendStart, highestDowntrendStart, unbrokenUptrendStart, uptrendToHigh
  timeframe: string; // Format: "5m", "1h", etc.
  createdAt: Date;
  updatedAt: Date;
} 