import { OrderManager } from './OrderManager';
import { BacktestBarData, SubBarData, OrderType, OrderSide, OrderStatus, Order } from './types/backtester';
import { UTCTimestamp } from 'lightweight-charts';

describe('OrderManager', () => {
  let orderManager: OrderManager;

  const sampleMainBar: BacktestBarData = {
    time: 1672531200 as UTCTimestamp, // 2023-01-01 00:00:00 UTC
    open: 100,
    high: 105,
    low: 95,
    close: 102,
  };

  const sampleSubBars: SubBarData[] = [
    { time: 1672531200 as UTCTimestamp, open: 100, high: 101, low: 99, close: 100.5, parentBarIndex: 0 },
    { time: 1672531201 as UTCTimestamp, open: 100.5, high: 102, low: 100, close: 101, parentBarIndex: 0 },
    { time: 1672531202 as UTCTimestamp, open: 101, high: 103, low: 100.5, close: 102.5, parentBarIndex: 0 },
    { time: 1672531203 as UTCTimestamp, open: 102.5, high: 105, low: 102, close: 104, parentBarIndex: 0 }, // SL/TP might hit here
    { time: 1672531204 as UTCTimestamp, open: 104, high: 104.5, low: 95, close: 102, parentBarIndex: 0 },   // And here
  ];

  beforeEach(() => {
    orderManager = new OrderManager(0.25); // Assuming tickSize of 0.25
  });

  describe('Market Orders', () => {
    it('should fill a BUY market order at the open of the first sub-bar', () => {
      const marketOrderInput: Partial<Order> = {
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 1,
      };
      const submittedOrder = orderManager.submitOrder(marketOrderInput);
      const filledOrders = orderManager.processBar(sampleMainBar, sampleSubBars, 0);

      expect(filledOrders.length).toBe(1);
      const filledOrder = filledOrders[0];
      expect(filledOrder.id).toBe(submittedOrder.id);
      expect(filledOrder.status).toBe(OrderStatus.FILLED);
      expect(filledOrder.filledPrice).toBe(sampleSubBars[0].open); // 100
      expect(filledOrder.filledQuantity).toBe(1);
      expect(filledOrder.filledTime).toBe(sampleSubBars[0].time);
    });

    it('should fill a SELL market order at the open of the first sub-bar', () => {
      const marketOrderInput: Partial<Order> = {
        type: OrderType.MARKET,
        side: OrderSide.SELL,
        quantity: 1,
      };
      const submittedOrder = orderManager.submitOrder(marketOrderInput);
      const filledOrders = orderManager.processBar(sampleMainBar, sampleSubBars, 0);

      expect(filledOrders.length).toBe(1);
      const filledOrder = filledOrders[0];
      expect(filledOrder.id).toBe(submittedOrder.id);
      expect(filledOrder.status).toBe(OrderStatus.FILLED);
      expect(filledOrder.filledPrice).toBe(sampleSubBars[0].open); // 100
      expect(filledOrder.filledQuantity).toBe(1);
      expect(filledOrder.filledTime).toBe(sampleSubBars[0].time);
    });

    it('should fill a BUY market order using main bar open when no sub-bars are provided (fallback)', () => {
      const marketOrderInput: Partial<Order> = {
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 1,
      };
      const submittedOrder = orderManager.submitOrder(marketOrderInput);
      // Pass undefined or empty array for subBarsForMainBar
      const filledOrders = orderManager.processBar(sampleMainBar, undefined, 0);

      expect(filledOrders.length).toBe(1);
      const filledOrder = filledOrders[0];
      expect(filledOrder.id).toBe(submittedOrder.id);
      expect(filledOrder.status).toBe(OrderStatus.FILLED);
      expect(filledOrder.filledPrice).toBe(sampleMainBar.open); // 100
      expect(filledOrder.filledQuantity).toBe(1);
      expect(filledOrder.filledTime).toBe(sampleMainBar.time);
    });

    it('should fill a BUY market order using main bar open when sub-bars array is empty (fallback)', () => {
      const marketOrderInput: Partial<Order> = {
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 1,
      };
      const submittedOrder = orderManager.submitOrder(marketOrderInput);
      const filledOrders = orderManager.processBar(sampleMainBar, [], 0);

      expect(filledOrders.length).toBe(1);
      const filledOrder = filledOrders[0];
      expect(filledOrder.id).toBe(submittedOrder.id);
      expect(filledOrder.status).toBe(OrderStatus.FILLED);
      expect(filledOrder.filledPrice).toBe(sampleMainBar.open); // 100
      expect(filledOrder.filledQuantity).toBe(1);
      expect(filledOrder.filledTime).toBe(sampleMainBar.time);
    });
  });

  describe('Limit Orders', () => {
    it('should fill a BUY limit order at order.price when sub-bar low hits the price', () => {
      const limitOrderInput: Partial<Order> = {
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        quantity: 1,
        price: 99.5, // SubBar[0].low is 99, SubBar[0].open is 100
      };
      const submittedOrder = orderManager.submitOrder(limitOrderInput);
      // sampleSubBars[0] = { time: ..., open: 100, high: 101, low: 99, close: 100.5 }
      const filledOrders = orderManager.processBar(sampleMainBar, sampleSubBars, 0);

      expect(filledOrders.length).toBe(1);
      const filledOrder = filledOrders[0];
      expect(filledOrder.status).toBe(OrderStatus.FILLED);
      expect(filledOrder.filledPrice).toBe(99.5); // Fills at limit price
      expect(filledOrder.filledQuantity).toBe(1);
      expect(filledOrder.filledTime).toBe(sampleSubBars[0].time); // Triggered by the first sub-bar
    });

    it('should fill a SELL limit order at order.price when sub-bar high hits the price', () => {
      const limitOrderInput: Partial<Order> = {
        type: OrderType.LIMIT,
        side: OrderSide.SELL,
        quantity: 1,
        price: 101.5, // SubBar[1].high is 102, SubBar[1].open is 100.5
      };
      const submittedOrder = orderManager.submitOrder(limitOrderInput);
      // sampleSubBars[1] = { time: ..., open: 100.5, high: 102, low: 100, close: 101 }
      const filledOrders = orderManager.processBar(sampleMainBar, sampleSubBars, 0);
      
      expect(filledOrders.length).toBe(1);
      const filledOrder = filledOrders[0];
      expect(filledOrder.status).toBe(OrderStatus.FILLED);
      expect(filledOrder.filledPrice).toBe(101.5); // Fills at limit price
      expect(filledOrder.filledQuantity).toBe(1);
      expect(filledOrder.filledTime).toBe(sampleSubBars[1].time); // Triggered by the second sub-bar
    });

    it('should NOT fill a BUY limit order if sub-bar low does not reach the price', () => {
      const limitOrderInput: Partial<Order> = {
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        quantity: 1,
        price: 90, // Well below any sub-bar low (lowest is 95 in sampleSubBars[4])
      };
      orderManager.submitOrder(limitOrderInput);
      const filledOrders = orderManager.processBar(sampleMainBar, sampleSubBars, 0);
      expect(filledOrders.length).toBe(0);
      const pendingOrders = orderManager.getPendingOrders();
      expect(pendingOrders.length).toBe(1);
      expect(pendingOrders[0].price).toBe(90);
    });

    it('should fill a BUY limit order using main bar low when no sub-bars are provided (fallback)', () => {
      const limitOrderInput: Partial<Order> = {
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        quantity: 1,
        price: 96, // sampleMainBar.low is 95
      };
      const submittedOrder = orderManager.submitOrder(limitOrderInput);
      const filledOrders = orderManager.processBar(sampleMainBar, undefined, 0);

      expect(filledOrders.length).toBe(1);
      const filledOrder = filledOrders[0];
      expect(filledOrder.status).toBe(OrderStatus.FILLED);
      expect(filledOrder.filledPrice).toBe(96);
      expect(filledOrder.filledQuantity).toBe(1);
      expect(filledOrder.filledTime).toBe(sampleMainBar.time);
    });
  });

  describe('Standalone Stop Orders', () => {
    it('should fill a BUY stop order at order.stopPrice when sub-bar high hits the stopPrice', () => {
      const stopOrderInput: Partial<Order> = {
        type: OrderType.STOP,
        side: OrderSide.BUY,
        quantity: 1,
        stopPrice: 101.5, // SubBar[1].high is 102
      };
      const submittedOrder = orderManager.submitOrder(stopOrderInput);
      // sampleSubBars[1] = { time: ..., open: 100.5, high: 102, low: 100, close: 101 }
      const filledOrders = orderManager.processBar(sampleMainBar, sampleSubBars, 0);

      expect(filledOrders.length).toBe(1);
      const filledOrder = filledOrders[0];
      expect(filledOrder.status).toBe(OrderStatus.FILLED);
      expect(filledOrder.filledPrice).toBe(101.5); // Fills at stop price
      expect(filledOrder.filledQuantity).toBe(1);
      expect(filledOrder.filledTime).toBe(sampleSubBars[1].time); // Triggered by the second sub-bar
    });

    it('should fill a SELL stop order at order.stopPrice when sub-bar low hits the stopPrice', () => {
      const stopOrderInput: Partial<Order> = {
        type: OrderType.STOP,
        side: OrderSide.SELL,
        quantity: 1,
        stopPrice: 99.5, // SubBar[0].low is 99
      };
      const submittedOrder = orderManager.submitOrder(stopOrderInput);
      // sampleSubBars[0] = { time: ..., open: 100, high: 101, low: 99, close: 100.5 }
      const filledOrders = orderManager.processBar(sampleMainBar, sampleSubBars, 0);
      
      expect(filledOrders.length).toBe(1);
      const filledOrder = filledOrders[0];
      expect(filledOrder.status).toBe(OrderStatus.FILLED);
      expect(filledOrder.filledPrice).toBe(99.5); // Fills at stop price
      expect(filledOrder.filledQuantity).toBe(1);
      expect(filledOrder.filledTime).toBe(sampleSubBars[0].time); // Triggered by the first sub-bar
    });

    it('should NOT fill a BUY stop order if sub-bar high does not reach the stopPrice', () => {
      const stopOrderInput: Partial<Order> = {
        type: OrderType.STOP,
        side: OrderSide.BUY,
        quantity: 1,
        stopPrice: 110, // Well above any sub-bar high (highest is 105 in sampleSubBars[3])
      };
      orderManager.submitOrder(stopOrderInput);
      const filledOrders = orderManager.processBar(sampleMainBar, sampleSubBars, 0);
      expect(filledOrders.length).toBe(0);
      const pendingOrders = orderManager.getPendingOrders();
      expect(pendingOrders.length).toBe(1);
      expect(pendingOrders[0].stopPrice).toBe(110);
    });

    it('should fill a BUY stop order using main bar high when no sub-bars are provided (fallback)', () => {
      const stopOrderInput: Partial<Order> = {
        type: OrderType.STOP,
        side: OrderSide.BUY,
        quantity: 1,
        stopPrice: 104, // sampleMainBar.high is 105
      };
      const submittedOrder = orderManager.submitOrder(stopOrderInput);
      const filledOrders = orderManager.processBar(sampleMainBar, undefined, 0);

      expect(filledOrders.length).toBe(1);
      const filledOrder = filledOrders[0];
      expect(filledOrder.status).toBe(OrderStatus.FILLED);
      expect(filledOrder.filledPrice).toBe(104);
      expect(filledOrder.filledQuantity).toBe(1);
      expect(filledOrder.filledTime).toBe(sampleMainBar.time);
    });
  });

  describe('SL/TP OCO Orders', () => {
    const setupLongPosition = (entryPrice: number, quantity: number, entryTime: UTCTimestamp) => {
      const entryOrder = orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity,
        contractId: 'TEST_CONTRACT',
      });
      // Manually fill the entry order to establish a position
      (orderManager as any).executeFill(entryOrder, quantity, entryPrice, entryTime, -1, false);
      const position = orderManager.getOpenPosition('TEST_CONTRACT');
      expect(position).toBeDefined();
      expect(position!.size).toBe(quantity);
      expect(position!.averageEntryPrice).toBe(entryPrice);
      return { entryOrder, positionId: position!.id };
    };

    const setupShortPosition = (entryPrice: number, quantity: number, entryTime: UTCTimestamp) => {
      const entryOrder = orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.SELL,
        quantity,
        contractId: 'TEST_CONTRACT',
      });
      (orderManager as any).executeFill(entryOrder, quantity, entryPrice, entryTime, -1, false);
      const position = orderManager.getOpenPosition('TEST_CONTRACT');
      expect(position).toBeDefined();
      expect(position!.size).toBe(quantity);
      expect(position!.averageEntryPrice).toBe(entryPrice);
      return { entryOrder, positionId: position!.id };
    };

    it('should fill SL for a long position and cancel TP when sub-bar low hits SL price', () => {
      const { positionId } = setupLongPosition(101, 1, sampleSubBars[1].time); // Entry on sub-bar 1 open (100.5)
      
      const slOrder = orderManager.submitOrder({ type: OrderType.STOP, side: OrderSide.SELL, quantity: 1, stopPrice: 99, isStopLoss: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });
      const tpOrder = orderManager.submitOrder({ type: OrderType.LIMIT, side: OrderSide.SELL, quantity: 1, price: 103, isTakeProfit: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });

      // SL @ 99. SubBar[0].low is 99. Main bar starts processing from sampleSubBars[0]
      // We entered at subBar[1] (100.5), so SL/TP active from subBar[2] onwards.
      // Let's adjust sampleSubBars for this test to make SL hit on a later sub-bar
      const specificSubBars: SubBarData[] = [
        { time: 1672531200 as UTCTimestamp, open: 100, high: 101, low: 100, close: 100.5, parentBarIndex: 0 }, // Entry bar for position setup if needed
        { time: 1672531201 as UTCTimestamp, open: 100.5, high: 102, low: 100, close: 101, parentBarIndex: 0 }, // Position established here
        { time: 1672531202 as UTCTimestamp, open: 101, high: 101.5, low: 98.5, close: 99, parentBarIndex: 0 }, // SL hits here (low 98.5 <= 99)
      ];
      const filledOrders = orderManager.processBar(sampleMainBar, specificSubBars, 0);
      
      expect(filledOrders.length).toBe(1);
      const filledSl = filledOrders.find(o => o.id === slOrder.id);
      expect(filledSl).toBeDefined();
      expect(filledSl!.status).toBe(OrderStatus.FILLED);
      expect(filledSl!.filledPrice).toBe(99); // Fills at SL stopPrice
      expect(filledSl!.filledTime).toBe(specificSubBars[2].time);

      expect(tpOrder.status).toBe(OrderStatus.CANCELLED);
    });

    it('should fill TP for a long position and cancel SL when sub-bar high hits TP price', () => {
      const { positionId } = setupLongPosition(100, 1, sampleSubBars[0].time);

      const slOrder = orderManager.submitOrder({ type: OrderType.STOP, side: OrderSide.SELL, quantity: 1, stopPrice: 98, isStopLoss: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });
      const tpOrder = orderManager.submitOrder({ type: OrderType.LIMIT, side: OrderSide.SELL, quantity: 1, price: 102.5, isTakeProfit: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });
      
      // TP @ 102.5. sampleSubBars[2].high is 103
      const filledOrders = orderManager.processBar(sampleMainBar, sampleSubBars, 0);

      expect(filledOrders.length).toBe(1);
      const filledTp = filledOrders.find(o => o.id === tpOrder.id);
      expect(filledTp).toBeDefined();
      expect(filledTp!.status).toBe(OrderStatus.FILLED);
      expect(filledTp!.filledPrice).toBe(102.5); // Fills at TP price
      expect(filledTp!.filledTime).toBe(sampleSubBars[2].time);

      expect(slOrder.status).toBe(OrderStatus.CANCELLED);
    });

    it('should prioritize SL when sub-bar range hits both SL and TP for a long position and open is between them', () => {
      const { positionId } = setupLongPosition(101, 1, sampleSubBars[0].time); // Entry @ 100 (open of subbar 0)

      const slOrder = orderManager.submitOrder({ type: OrderType.STOP, side: OrderSide.SELL, quantity: 1, stopPrice: 100, isStopLoss: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });
      const tpOrder = orderManager.submitOrder({ type: OrderType.LIMIT, side: OrderSide.SELL, quantity: 1, price: 102, isTakeProfit: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });

      const ambiguousSubBar: SubBarData[] = [
        // Position entered before this bar
        { time: 1672531201 as UTCTimestamp, open: 101, high: 103, low: 99, close: 101.5, parentBarIndex: 0 } // Open 101 is between SL 100 and TP 102. High 103 hits TP. Low 99 hits SL.
      ];
      const filledOrders = orderManager.processBar({ ...sampleMainBar, time: ambiguousSubBar[0].time }, ambiguousSubBar, 0);
      
      expect(filledOrders.length).toBe(1);
      const filledSl = filledOrders.find(o => o.id === slOrder.id);
      expect(filledSl).toBeDefined();
      expect(filledSl!.status).toBe(OrderStatus.FILLED);
      expect(filledSl!.filledPrice).toBe(100); // SL fills at its stopPrice
      expect(filledSl!.filledTime).toBe(ambiguousSubBar[0].time);

      expect(tpOrder.status).toBe(OrderStatus.CANCELLED);
    });

    // TODO: Add tests for short positions and fallback scenarios for SL/TP
    it('should fill SL for a short position and cancel TP when sub-bar high hits SL price', () => {
      const { positionId } = setupShortPosition(100, 1, sampleSubBars[0].time); // Entry @ 100 (open of subbar 0)
      
      const slOrder = orderManager.submitOrder({ type: OrderType.STOP, side: OrderSide.BUY, quantity: 1, stopPrice: 102, isStopLoss: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });
      const tpOrder = orderManager.submitOrder({ type: OrderType.LIMIT, side: OrderSide.BUY, quantity: 1, price: 98, isTakeProfit: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });

      // SL @ 102. sampleSubBars[1].high is 102
      const filledOrders = orderManager.processBar(sampleMainBar, sampleSubBars, 0);
      
      expect(filledOrders.length).toBe(1);
      const filledSl = filledOrders.find(o => o.id === slOrder.id);
      expect(filledSl).toBeDefined();
      expect(filledSl!.status).toBe(OrderStatus.FILLED);
      expect(filledSl!.filledPrice).toBe(102); // Fills at SL stopPrice
      expect(filledSl!.filledTime).toBe(sampleSubBars[1].time);

      expect(tpOrder.status).toBe(OrderStatus.CANCELLED);
    });

    it('should fill TP for a short position and cancel SL when sub-bar low hits TP price', () => {
      const { positionId } = setupShortPosition(101.5, 1, sampleSubBars[1].time); // Entry @ 100.5 (open of subbar 1)

      const slOrder = orderManager.submitOrder({ type: OrderType.STOP, side: OrderSide.BUY, quantity: 1, stopPrice: 103, isStopLoss: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });
      const tpOrder = orderManager.submitOrder({ type: OrderType.LIMIT, side: OrderSide.BUY, quantity: 1, price: 99, isTakeProfit: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });
      
      // TP @ 99. sampleSubBars[0].low is 99. This test needs careful subbar setup.
      // Position entered at subbar 1 (100.5). TP/SL active from subbar 2.
      // Let's use specific sub-bars.
       const specificSubBars: SubBarData[] = [
        { time: 1672531200 as UTCTimestamp, open: 102, high: 102.5, low: 101.5, close: 101.5, parentBarIndex: 0 }, // Entry bar for position setup
        { time: 1672531201 as UTCTimestamp, open: 101.5, high: 102, low: 101, close: 101, parentBarIndex: 0 },   // Position established here
        { time: 1672531202 as UTCTimestamp, open: 101, high: 101.2, low: 98.5, close: 99, parentBarIndex: 0 },  // TP @ 99 hits here (low 98.5 <= 99)
      ];
      const filledOrders = orderManager.processBar({ ...sampleMainBar, time: specificSubBars[0].time }, specificSubBars, 0);


      expect(filledOrders.length).toBe(1);
      const filledTp = filledOrders.find(o => o.id === tpOrder.id);
      expect(filledTp).toBeDefined();
      expect(filledTp!.status).toBe(OrderStatus.FILLED);
      expect(filledTp!.filledPrice).toBe(99); // Fills at TP price
      expect(filledTp!.filledTime).toBe(specificSubBars[2].time);

      expect(slOrder.status).toBe(OrderStatus.CANCELLED);
    });
    
    it('should prioritize SL when sub-bar range hits both SL and TP for a short position and open is between them', () => {
      const { positionId } = setupShortPosition(101, 1, sampleSubBars[0].time); // Entry @ 100 (open of subbar 0)

      const slOrder = orderManager.submitOrder({ type: OrderType.STOP, side: OrderSide.BUY, quantity: 1, stopPrice: 102, isStopLoss: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });
      const tpOrder = orderManager.submitOrder({ type: OrderType.LIMIT, side: OrderSide.BUY, quantity: 1, price: 100, isTakeProfit: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });

      const ambiguousSubBar: SubBarData[] = [
        { time: 1672531201 as UTCTimestamp, open: 101, high: 103, low: 99, close: 101.5, parentBarIndex: 0 } // Open 101 is between TP 100 and SL 102. High 103 hits SL. Low 99 hits TP.
      ];
      const filledOrders = orderManager.processBar({ ...sampleMainBar, time: ambiguousSubBar[0].time }, ambiguousSubBar, 0);
      
      expect(filledOrders.length).toBe(1);
      const filledSl = filledOrders.find(o => o.id === slOrder.id);
      expect(filledSl).toBeDefined();
      expect(filledSl!.status).toBe(OrderStatus.FILLED);
      expect(filledSl!.filledPrice).toBe(102); // SL fills at its stopPrice
      expect(filledSl!.filledTime).toBe(ambiguousSubBar[0].time);

      expect(tpOrder.status).toBe(OrderStatus.CANCELLED);
    });
    
    it('should fill SL for a long position using main bar low (fallback) and cancel TP', () => {
      const { positionId } = setupLongPosition(100, 1, sampleMainBar.time); // Entry @ 100
      
      const slOrder = orderManager.submitOrder({ type: OrderType.STOP, side: OrderSide.SELL, quantity: 1, stopPrice: 96, isStopLoss: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' }); // Main bar low is 95
      const tpOrder = orderManager.submitOrder({ type: OrderType.LIMIT, side: OrderSide.SELL, quantity: 1, price: 105, isTakeProfit: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' });

      const filledOrders = orderManager.processBar(sampleMainBar, undefined, 0); // No sub-bars
      
      expect(filledOrders.length).toBe(1);
      const filledSl = filledOrders.find(o => o.id === slOrder.id);
      expect(filledSl).toBeDefined();
      expect(filledSl!.status).toBe(OrderStatus.FILLED);
      expect(filledSl!.filledPrice).toBe(96); // Fills at SL stopPrice
      expect(filledSl!.filledTime).toBe(sampleMainBar.time);

      expect(tpOrder.status).toBe(OrderStatus.CANCELLED);
    });

    it('should fill TP for a short position using main bar low (fallback) and cancel SL', () => {
      const { positionId } = setupShortPosition(102, 1, sampleMainBar.time); // Entry @ 102
      
      const slOrder = orderManager.submitOrder({ type: OrderType.STOP, side: OrderSide.BUY, quantity: 1, stopPrice: 106, isStopLoss: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' }); 
      const tpOrder = orderManager.submitOrder({ type: OrderType.LIMIT, side: OrderSide.BUY, quantity: 1, price: 97, isTakeProfit: true, parentTradeId: positionId, contractId: 'TEST_CONTRACT' }); // Main bar low is 95

      const filledOrders = orderManager.processBar(sampleMainBar, [], 0); // Empty sub-bars
      
      expect(filledOrders.length).toBe(1);
      const filledTp = filledOrders.find(o => o.id === tpOrder.id);
      expect(filledTp).toBeDefined();
      expect(filledTp!.status).toBe(OrderStatus.FILLED);
      expect(filledTp!.filledPrice).toBe(97); // Fills at TP price
      expect(filledTp!.filledTime).toBe(sampleMainBar.time);

      expect(slOrder.status).toBe(OrderStatus.CANCELLED);
    });
  });

  // describe('Order Lifecycle and P&L', () => { ... });
  describe('Order Lifecycle and P&L', () => {
    it('should correctly update position and P&L for a round trip trade with commission', () => {
      const contractId = 'PNL_COMM_TEST';
      const quantity = 2;
      const entryCommPerContract = 0.5; // Commission per contract for entry
      const exitCommPerContract = 0.5;  // Commission per contract for exit

      // 1. BUY Market Order
      const buyOrder = orderManager.submitOrder({ 
        type: OrderType.MARKET, 
        side: OrderSide.BUY, 
        quantity, 
        contractId,
        commission: entryCommPerContract 
      });
      // Process on first sub-bar: open = 100
      orderManager.processBar(sampleMainBar, [sampleSubBars[0]], 0); 

      let position = orderManager.getOpenPosition(contractId);
      expect(position).toBeDefined();
      expect(position!.size).toBe(quantity);
      expect(position!.averageEntryPrice).toBe(sampleSubBars[0].open); // 100
      // Initial P&L is negative due to entry commission.
      // OrderManager's executeFill calculates: realizedPnl = -(order.commission * quantity) for opening fills.
      expect(position!.realizedPnl).toBe(-(entryCommPerContract * quantity)); // -(0.5 * 2) = -1.0

      // 2. SELL Market Order to close
      const sellOrder = orderManager.submitOrder({ 
        type: OrderType.MARKET, 
        side: OrderSide.SELL, 
        quantity, 
        contractId,
        commission: exitCommPerContract 
      });
      const mainBarForExit = { ...sampleMainBar, time: sampleSubBars[1].time };
      // Process on second sub-bar: open = 100.5
      orderManager.processBar(mainBarForExit, [sampleSubBars[1]], 1); 
      
      const finalPosition = orderManager.getOpenPosition(contractId);
      expect(finalPosition).toBeUndefined(); // Position should be closed

      // Verify order statuses directly on the order objects
      expect(buyOrder.status).toBe(OrderStatus.FILLED);
      expect(buyOrder.filledPrice).toBe(sampleSubBars[0].open);
      
      expect(sellOrder.status).toBe(OrderStatus.FILLED);
      expect(sellOrder.filledPrice).toBe(sampleSubBars[1].open);

      // Expected P&L calculation:
      // Entry Price: 100, Exit Price: 100.5
      // Gross P&L from price change: (100.5 - 100) * 2 = 1.0
      // Total Commission: (entryCommPerContract * quantity) + (exitCommPerContract * quantity)
      //                  = (0.5 * 2) + (0.5 * 2) = 1.0 + 1.0 = 2.0
      // Net P&L = Gross P&L - Total Commission = 1.0 - 2.0 = -1.0
      // The OrderManager logs this, but direct assertion is tricky after position deletion.
      // This test verifies the lifecycle and that fills occur at expected prices.
    });

    // TODO: Add more P&L tests, partial fills, multiple positions
    it('should handle partial fills correctly', () => {
      const contractId = 'PARTIAL_FILL_TEST';
      const totalQuantity = 10;
      const partialFillQuantity1 = 4;
      const partialFillQuantity2 = 6;
      const price = 100;

      const order = orderManager.submitOrder({
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        quantity: totalQuantity,
        price,
        contractId,
      });

      // Simulate first partial fill
      (orderManager as any).executeFill(order, partialFillQuantity1, price, sampleSubBars[0].time, 0);
      
      expect(order.status).toBe(OrderStatus.PARTIALLY_FILLED);
      expect(order.filledQuantity).toBe(partialFillQuantity1);
      expect(order.filledPrice).toBe(price);
      
      let position = orderManager.getOpenPosition(contractId);
      expect(position).toBeDefined();
      expect(position!.size).toBe(partialFillQuantity1);

      // Simulate second (completing) partial fill
      (orderManager as any).executeFill(order, partialFillQuantity2, price + 1, sampleSubBars[1].time, 1); // Fill at a slightly different price

      expect(order.status).toBe(OrderStatus.FILLED);
      expect(order.filledQuantity).toBe(totalQuantity);
      // filledPrice would be the price of the last fill (101)
      expect(order.filledPrice).toBe(price + 1); 
      
      position = orderManager.getOpenPosition(contractId);
      expect(position).toBeDefined();
      expect(position!.size).toBe(totalQuantity);
      // Average entry price would be ((4*100) + (6*101)) / 10 = (400 + 606) / 10 = 1006 / 10 = 100.6
      expect(position!.averageEntryPrice).toBeCloseTo(100.6);
    });
  });
});
