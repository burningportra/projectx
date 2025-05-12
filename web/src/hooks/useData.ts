import useSWR from 'swr';
import { Strategy, Position, Order, getStrategies, getPositions, getOrders } from '@/lib/api';

/**
 * Hook for fetching strategies
 */
export function useStrategies() {
  const { data, error, isLoading, mutate } = useSWR<Strategy[]>('strategies', () => getStrategies(), {
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  return {
    strategies: data || [],
    isLoading,
    isError: error,
    mutate,
  };
}

/**
 * Hook for fetching positions
 */
export function usePositions() {
  const { data, error, isLoading, mutate } = useSWR<Position[]>('positions', () => getPositions(), {
    refreshInterval: 5000, // Refresh every 5 seconds
  });

  return {
    positions: data || [],
    isLoading,
    isError: error,
    mutate,
  };
}

/**
 * Hook for fetching orders
 */
export function useOrders() {
  const { data, error, isLoading, mutate } = useSWR<Order[]>('orders', () => getOrders(), {
    refreshInterval: 10000, // Refresh every 10 seconds
  });

  return {
    orders: data || [],
    isLoading,
    isError: error,
    mutate,
  };
} 