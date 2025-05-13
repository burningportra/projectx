// This is a simplified version that works with Next.js
// Using type definitions instead of direct imports

import { PrismaClient } from '@prisma/client';

// Use PrismaClient singleton to prevent too many client instances during development
// https://www.prisma.io/docs/guides/database/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices

// PrismaClient is attached to global when possible to prevent
// exhausting your database connection limit due to hot reloads
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

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