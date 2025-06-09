import { MessageBus, MessageType, Message } from '../MessageBus';

describe('MessageBus', () => {
  let messageBus: MessageBus;

  beforeEach(() => {
    messageBus = new MessageBus();
  });

  afterEach(() => {
    messageBus.dispose();
  });

  describe('publish and subscribe', () => {
    it('should publish and receive messages', (done) => {
      const testData = { orderId: '123', price: 100 };
      
      const subscription = messageBus.subscribe(MessageType.ORDER_SUBMITTED, (message: Message) => {
        expect(message.type).toBe(MessageType.ORDER_SUBMITTED);
        expect(message.source).toBe('TestSource');
        expect(message.data).toEqual(testData);
        expect(message.timestamp).toBeDefined();
        subscription.unsubscribe();
        done();
      });

      messageBus.publish(MessageType.ORDER_SUBMITTED, 'TestSource', testData);
    });

    it('should support multiple subscribers for the same event', () => {
      const receivedMessages: Message[] = [];
      
      const sub1 = messageBus.subscribe(MessageType.ORDER_FILLED, (msg) => {
        receivedMessages.push(msg);
      });
      
      const sub2 = messageBus.subscribe(MessageType.ORDER_FILLED, (msg) => {
        receivedMessages.push(msg);
      });

      messageBus.publish(MessageType.ORDER_FILLED, 'OrderManager', { orderId: '456' });

      expect(receivedMessages).toHaveLength(2);
      expect(receivedMessages[0]).toEqual(receivedMessages[1]);

      sub1.unsubscribe();
      sub2.unsubscribe();
    });

    it('should support wildcard subscriptions', (done) => {
      const receivedTypes: MessageType[] = [];
      
      const subscription = messageBus.subscribe('*', (message: Message) => {
        receivedTypes.push(message.type);
        
        if (receivedTypes.length === 3) {
          expect(receivedTypes).toEqual([
            MessageType.ORDER_SUBMITTED,
            MessageType.ORDER_FILLED,
            MessageType.POSITION_OPENED
          ]);
          subscription.unsubscribe();
          done();
        }
      });

      messageBus.publish(MessageType.ORDER_SUBMITTED, 'Strategy', {});
      messageBus.publish(MessageType.ORDER_FILLED, 'OrderManager', {});
      messageBus.publish(MessageType.POSITION_OPENED, 'PositionManager', {});
    });

    it('should unsubscribe correctly', () => {
      let messageCount = 0;
      
      const subscription = messageBus.subscribe(MessageType.BAR_RECEIVED, () => {
        messageCount++;
      });

      messageBus.publish(MessageType.BAR_RECEIVED, 'DataFeed', { bar: {} });
      expect(messageCount).toBe(1);

      subscription.unsubscribe();
      
      messageBus.publish(MessageType.BAR_RECEIVED, 'DataFeed', { bar: {} });
      expect(messageCount).toBe(1); // Should not increase
    });
  });

  describe('request-response pattern', () => {
    it('should handle request-response successfully', async () => {
      // Set up responder
      messageBus.subscribe(MessageType.SUBMIT_ORDER, (message: Message) => {
        if (message.data.correlationId) {
          messageBus.publish(
            'SUBMIT_ORDER_RESPONSE' as MessageType,
            'OrderManager',
            {
              correlationId: message.data.correlationId,
              response: { orderId: 'NEW-123', status: 'SUBMITTED' }
            }
          );
        }
      });

      const response = await messageBus.request<{ orderId: string; status: string }>(
        MessageType.SUBMIT_ORDER,
        'Strategy',
        { symbol: 'AAPL', quantity: 100 }
      );

      expect(response.orderId).toBe('NEW-123');
      expect(response.status).toBe('SUBMITTED');
    });

    it('should timeout on no response', async () => {
      await expect(
        messageBus.request(
          MessageType.SUBMIT_ORDER,
          'Strategy',
          { symbol: 'AAPL' },
          100 // 100ms timeout
        )
      ).rejects.toThrow('Request timeout for SUBMIT_ORDER');
    });
  });

  describe('message history', () => {
    it('should maintain message history', () => {
      messageBus.publish(MessageType.ORDER_SUBMITTED, 'Strategy1', { orderId: '1' });
      messageBus.publish(MessageType.ORDER_FILLED, 'OrderManager', { orderId: '1' });
      messageBus.publish(MessageType.ORDER_SUBMITTED, 'Strategy2', { orderId: '2' });

      const history = messageBus.getHistory();
      expect(history).toHaveLength(3);
    });

    it('should filter history by type', () => {
      messageBus.publish(MessageType.ORDER_SUBMITTED, 'Strategy', { orderId: '1' });
      messageBus.publish(MessageType.ORDER_FILLED, 'OrderManager', { orderId: '1' });
      messageBus.publish(MessageType.ORDER_SUBMITTED, 'Strategy', { orderId: '2' });

      const filtered = messageBus.getHistory({ type: MessageType.ORDER_SUBMITTED });
      expect(filtered).toHaveLength(2);
      expect(filtered.every(m => m.type === MessageType.ORDER_SUBMITTED)).toBe(true);
    });

    it('should filter history by source', () => {
      messageBus.publish(MessageType.ORDER_SUBMITTED, 'Strategy1', { orderId: '1' });
      messageBus.publish(MessageType.ORDER_SUBMITTED, 'Strategy2', { orderId: '2' });
      messageBus.publish(MessageType.ORDER_SUBMITTED, 'Strategy1', { orderId: '3' });

      const filtered = messageBus.getHistory({ source: 'Strategy1' });
      expect(filtered).toHaveLength(2);
      expect(filtered.every(m => m.source === 'Strategy1')).toBe(true);
    });

    it('should limit history results', () => {
      for (let i = 0; i < 10; i++) {
        messageBus.publish(MessageType.BAR_RECEIVED, 'DataFeed', { index: i });
      }

      const limited = messageBus.getHistory({ limit: 5 });
      expect(limited).toHaveLength(5);
      expect(limited[0].data.index).toBe(5); // Should get last 5
      expect(limited[4].data.index).toBe(9);
    });

    it('should respect max history size', () => {
      const smallBus = new MessageBus();
      // Access private property for testing
      (smallBus as any).maxHistorySize = 5;

      for (let i = 0; i < 10; i++) {
        smallBus.publish(MessageType.BAR_RECEIVED, 'DataFeed', { index: i });
      }

      const history = smallBus.getHistory();
      expect(history).toHaveLength(5);
      expect(history[0].data.index).toBe(5); // Oldest should be index 5

      smallBus.dispose();
    });

    it('should clear history', () => {
      messageBus.publish(MessageType.ORDER_SUBMITTED, 'Strategy', {});
      messageBus.publish(MessageType.ORDER_FILLED, 'OrderManager', {});
      
      expect(messageBus.getHistory()).toHaveLength(2);
      
      messageBus.clearHistory();
      expect(messageBus.getHistory()).toHaveLength(0);
    });
  });

  describe('type safety', () => {
    it('should maintain type safety for event payloads', () => {
      interface OrderSubmittedPayload {
        symbol: string;
        quantity: number;
        price: number;
      }

      const subscription = messageBus.subscribe(MessageType.ORDER_SUBMITTED, (message: Message) => {
        const payload = message.data as OrderSubmittedPayload;
        expect(payload.symbol).toBe('AAPL');
        expect(payload.quantity).toBe(100);
        expect(payload.price).toBe(150.50);
      });

      const typedPayload: OrderSubmittedPayload = {
        symbol: 'AAPL',
        quantity: 100,
        price: 150.50
      };

      messageBus.publish(MessageType.ORDER_SUBMITTED, 'Strategy', typedPayload);
      subscription.unsubscribe();
    });
  });

  describe('error handling', () => {
    it('should isolate errors in event handlers', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });

      const goodHandler = jest.fn();

      const sub1 = messageBus.subscribe(MessageType.ORDER_SUBMITTED, errorHandler);
      const sub2 = messageBus.subscribe(MessageType.ORDER_SUBMITTED, goodHandler);

      // Publish should complete even if one handler errors
      messageBus.publish(MessageType.ORDER_SUBMITTED, 'Strategy', {});

      expect(errorHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('Error in message handler'),
        expect.any(Error)
      );

      sub1.unsubscribe();
      sub2.unsubscribe();
      consoleError.mockRestore();
    });
  });

  describe('performance', () => {
    it('should handle high-frequency publishing', () => {
      let messageCount = 0;
      const subscription = messageBus.subscribe(MessageType.BAR_RECEIVED, () => {
        messageCount++;
      });

      const startTime = Date.now();
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        messageBus.publish(MessageType.BAR_RECEIVED, 'DataFeed', { index: i });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(messageCount).toBe(iterations);
      expect(duration).toBeLessThan(1000); // Should process 10k messages in under 1 second

      subscription.unsubscribe();
    });
  });
}); 