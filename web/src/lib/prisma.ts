// This is a simplified version that works with Next.js
// Using type definitions instead of direct imports

// Mock Prisma client for Next.js development
// This allows our component types to work while we develop the actual DB integration
const prisma = {
  ohlcBar: {
    findMany: async ({ where, orderBy, take }: any) => {
      console.log("Prisma mock findMany called with:", { where, orderBy, take });
      
      // Return mock data for development
      const mockBars: OhlcBar[] = Array.from({ length: take || 100 }, (_, i) => {
        const date = new Date();
        date.setMinutes(date.getMinutes() - (take || 100) + i);
        
        const basePrice = 4200 + Math.random() * 50;
        const open = basePrice;
        const close = basePrice + (Math.random() * 10 - 5);
        const high = Math.max(open, close) + Math.random() * 5;
        const low = Math.min(open, close) - Math.random() * 5;
        
        return {
          id: i,
          contractId: where?.contractId || "CON.F.US.MES.M25",
          timestamp: date,
          open,
          high,
          low,
          close,
          volume: Math.floor(Math.random() * 1000),
          timeframeUnit: where?.timeframeUnit || 2,
          timeframeValue: where?.timeframeValue || 5
        };
      });
      
      return mockBars;
    }
  }
};

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