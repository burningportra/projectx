import { EventEmitter } from 'events';

export enum MessageType {
  // Commands
  SUBMIT_ORDER = 'SUBMIT_ORDER',
  CANCEL_ORDER = 'CANCEL_ORDER',
  MODIFY_ORDER = 'MODIFY_ORDER',
  
  // Events
  ORDER_SUBMITTED = 'ORDER_SUBMITTED',
  ORDER_FILLED = 'ORDER_FILLED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_REJECTED = 'ORDER_REJECTED',
  
  // Market Data
  BAR_RECEIVED = 'BAR_RECEIVED',
  TICK_RECEIVED = 'TICK_RECEIVED',
  MARKET_UPDATE = 'MARKET_UPDATE',
  
  // Strategy
  SIGNAL_GENERATED = 'SIGNAL_GENERATED',
  POSITION_OPENED = 'POSITION_OPENED',
  POSITION_CLOSED = 'POSITION_CLOSED',
  
  // System
  STRATEGY_INITIALIZED = 'STRATEGY_INITIALIZED',
  STRATEGY_STARTED = 'STRATEGY_STARTED',
  STRATEGY_STOPPED = 'STRATEGY_STOPPED',
  STRATEGY_DISPOSED = 'STRATEGY_DISPOSED',
}

export interface Message {
  type: MessageType;
  timestamp: number;
  source: string;
  data: any;
}

export interface Subscription {
  unsubscribe: () => void;
}

export class MessageBus {
  private emitter: EventEmitter;
  private messageHistory: Message[] = [];
  private maxHistorySize: number = 10000;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100); // Increase for complex systems
  }

  /**
   * Publish a message to all subscribers
   */
  publish(type: MessageType, source: string, data: any): void {
    const message: Message = {
      type,
      timestamp: Date.now(),
      source,
      data
    };

    // Store in history
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }

    // Get all listeners and call them with error isolation
    const typeListeners = this.emitter.listeners(type);
    const wildcardListeners = this.emitter.listeners('*');

    // Call type-specific listeners
    for (const listener of typeListeners) {
      try {
        listener(message);
      } catch (error) {
        console.error(`Error in message handler for type ${type}:`, error);
      }
    }

    // Call wildcard listeners
    for (const listener of wildcardListeners) {
      try {
        listener(message);
      } catch (error) {
        console.error('Error in wildcard message handler:', error);
      }
    }
  }

  /**
   * Subscribe to specific message type
   */
  subscribe(type: MessageType | '*', handler: (message: Message) => void): Subscription {
    this.emitter.on(type, handler);
    
    return {
      unsubscribe: () => {
        this.emitter.off(type, handler);
      }
    };
  }

  /**
   * Request-response pattern
   */
  async request<T>(type: MessageType, source: string, data: any, timeoutMs: number = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      const correlationId = `${type}_${Date.now()}_${Math.random()}`;
      const responseType = `${type}_RESPONSE` as MessageType;
      
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error(`Request timeout for ${type}`));
      }, timeoutMs);

      const subscription = this.subscribe(responseType, (message: Message) => {
        if (message.data.correlationId === correlationId) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve(message.data.response);
        }
      });

      this.publish(type, source, { ...data, correlationId });
    });
  }

  /**
   * Get message history for debugging/analysis
   */
  getHistory(filter?: { type?: MessageType; source?: string; limit?: number }): Message[] {
    let history = [...this.messageHistory];
    
    if (filter?.type) {
      history = history.filter(m => m.type === filter.type);
    }
    
    if (filter?.source) {
      history = history.filter(m => m.source === filter.source);
    }
    
    if (filter?.limit) {
      history = history.slice(-filter.limit);
    }
    
    return history;
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messageHistory = [];
  }

  /**
   * Remove all listeners
   */
  dispose(): void {
    this.emitter.removeAllListeners();
    this.messageHistory = [];
  }
}

// Singleton instance
export const messageBus = new MessageBus(); 