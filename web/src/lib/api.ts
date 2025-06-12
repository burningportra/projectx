/**
 * API utilities for ProjectX Trading
 */

// Strategy Types
export interface Strategy {
  id: string;
  name: string;
  description: string;
  contracts: string[];
  timeframes: string[];
  status: 'active' | 'paused' | 'inactive';
  performance: {
    winRate: number;
    pnl: number;
    trades: number;
  };
}

// Position Types
export interface Position {
  id: string;
  strategyName: string;
  contract: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  size: number;
  pnl: number;
  openTime: string;
  status: 'open' | 'closing' | 'closed';
}

// Order Types
export interface Order {
  id: string;
  strategyName: string;
  contract: string;
  side: 'buy' | 'sell' | 'long' | 'short';
  price: number;
  size: number;
  time: string;
  status: 'pending' | 'submitted' | 'filled' | 'cancelled' | 'rejected';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
}

/**
 * Fetch strategies from API
 */
export async function getStrategies(): Promise<Strategy[]> {
  try {
    const response = await fetch('/api/strategies');
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching strategies:', error);
    return [];
  }
}

/**
 * Create a new strategy
 */
export async function createStrategy(strategy: Omit<Strategy, 'id'>): Promise<Strategy | null> {
  try {
    const response = await fetch('/api/strategies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(strategy),
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating strategy:', error);
    return null;
  }
}

/**
 * Update a strategy's status (activate, pause, stop)
 */
export async function updateStrategyStatus(
  id: string, 
  status: 'active' | 'paused' | 'inactive'
): Promise<Strategy | null> {
  try {
    const response = await fetch(`/api/strategies/${id}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating strategy status:', error);
    return null;
  }
}

/**
 * Fetch positions from API
 */
export async function getPositions(): Promise<Position[]> {
  try {
    const response = await fetch('/api/positions');
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Handle both direct array and object with positions property
    return Array.isArray(data) ? data : (data.positions || []);
  } catch (error) {
    console.error('Error fetching positions:', error);
    return [];
  }
}

/**
 * Close a position
 */
export async function closePosition(positionId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/positions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ positionId }),
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error closing position:', error);
    return false;
  }
}

/**
 * Fetch order history from API
 */
export async function getOrders(): Promise<Order[]> {
  try {
    const response = await fetch('/api/orders');
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
} 