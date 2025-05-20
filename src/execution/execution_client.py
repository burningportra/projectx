import asyncio
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, List
from decimal import Decimal
import logging
import random
import uuid
from datetime import datetime, timezone

from src.data.models import Order # Assuming Order model is in src.data.models
from src.core.config import Config

logger = logging.getLogger(__name__)

class ExecutionClient(ABC):
    """Abstract base class for execution clients."""

    def __init__(self, config: Config, client_specific_config: Optional[Dict[str, Any]] = None):
        self.config = config
        self.client_specific_config = client_specific_config or {}
        self.account_id = self.client_specific_config.get("default_account_id") or \
                          config.get_execution_config().get("default_account_id")
        if not self.account_id:
            raise ValueError("Execution client requires an account_id either in client_specific_config or main execution_config")

    @abstractmethod
    async def connect(self):
        """Connect to the execution provider."""
        pass

    @abstractmethod
    async def disconnect(self):
        """Disconnect from the execution provider."""
        pass

    @abstractmethod
    async def submit_order(self, order: Order) -> Order:
        """Submit an order and return the updated order with broker_order_id and status."""
        pass

    @abstractmethod
    async def cancel_order(self, broker_order_id: str, internal_order_id: Optional[str] = None) -> Order:
        """Cancel an existing order."""
        pass

    @abstractmethod
    async def get_order_status(self, broker_order_id: str, internal_order_id: Optional[str] = None) -> Order:
        """Get the current status of an order."""
        pass

    @abstractmethod
    async def get_open_positions(self, contract_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get current open positions. Optionally filter by contract_id."""
        pass

    @abstractmethod
    async def get_account_summary(self) -> Dict[str, Any]:
        """Get account balance, margin, P&L, etc."""
        pass


class MockExecutionClient(ExecutionClient):
    """Mock execution client for simulation and testing."""

    def __init__(self, config: Config, client_specific_config: Optional[Dict[str, Any]] = None):
        super().__init__(config, client_specific_config)
        self.mock_config = config.get_execution_config().get("mock_client_config", {})
        self._orders: Dict[str, Order] = {} # Stores orders by internal_order_id
        self._broker_order_id_map: Dict[str, str] = {} # Maps broker_order_id to internal_order_id
        self._positions: Dict[str, Dict[str, Any]] = {} # contract_id -> {qty, avg_price}
        logger.info(f"MockExecutionClient initialized for account: {self.account_id} with config: {self.mock_config}")

    async def connect(self):
        logger.info("MockExecutionClient: Connecting...")
        await asyncio.sleep(0.1) # Simulate connection delay
        logger.info("MockExecutionClient: Connected.")

    async def disconnect(self):
        logger.info("MockExecutionClient: Disconnecting...")
        await asyncio.sleep(0.1) # Simulate disconnection delay
        logger.info("MockExecutionClient: Disconnected.")

    async def submit_order(self, order: Order) -> Order:
        logger.info(f"MockExecutionClient: Received order submission: {order.internal_order_id} for {order.contract_id}")
        
        if order.internal_order_id in self._orders:
            logger.warning(f"Order {order.internal_order_id} already submitted. Returning existing.")
            # Potentially update status if it was PENDING_SUBMIT
            if self._orders[order.internal_order_id].status == "PENDING_SUBMIT":
                 self._orders[order.internal_order_id].status = "SUBMITTED"
                 self._orders[order.internal_order_id].broker_order_id = str(uuid.uuid4())
                 self._broker_order_id_map[self._orders[order.internal_order_id].broker_order_id] = order.internal_order_id
            return self._orders[order.internal_order_id]

        order.broker_order_id = str(uuid.uuid4())
        order.status = "SUBMITTED"
        order.account_id = self.account_id # Ensure order is tagged with the client's account
        self._orders[order.internal_order_id] = order
        self._broker_order_id_map[order.broker_order_id] = order.internal_order_id
        
        logger.info(f"MockExecutionClient: Order {order.internal_order_id} (Broker ID: {order.broker_order_id}) submitted.")

        # Simulate fill based on mock_config
        await self._simulate_order_lifecycle(order.internal_order_id)
        return self._orders[order.internal_order_id]

    async def _simulate_order_lifecycle(self, internal_order_id: str):
        order = self._orders.get(internal_order_id)
        if not order:
            return

        await asyncio.sleep(self.mock_config.get("simulated_fill_delay_ms", 100) / 1000.0)

        if random.randint(1, 100) <= self.mock_config.get("fill_chance_percentage", 80):
            order.status = "FILLED"
            order.filled_quantity = order.quantity
            
            # Simulate slippage for market orders
            fill_price = order.limit_price if order.order_type == "LIMIT" else Decimal(str(random.uniform(5000, 5500))) # Dummy price for market
            
            if order.order_type == "MARKET":
                slippage_ticks = self.mock_config.get("slippage_ticks", 1)
                # Assuming 0.25 points per tick for MES-like contract for simulation
                # This part is highly dependent on contract specifics, so it's a very rough simulation
                tick_value = Decimal("0.25") 
                slippage_amount = Decimal(str(slippage_ticks)) * tick_value
                if order.direction == "BUY":
                    fill_price += slippage_amount
                else: # SELL
                    fill_price -= slippage_amount
            
            order.average_fill_price = fill_price.quantize(Decimal("0.01")) # Quantize to 2 decimal places
            
            # Update positions
            current_pos_qty = self._positions.get(order.contract_id, {}).get("quantity", 0)
            current_avg_price = self._positions.get(order.contract_id, {}).get("average_entry_price", Decimal("0"))

            if order.direction == "BUY":
                new_total_value = (current_avg_price * current_pos_qty) + (order.average_fill_price * order.filled_quantity)
                new_qty = current_pos_qty + order.filled_quantity
                new_avg_price = new_total_value / new_qty if new_qty != 0 else Decimal("0")
            else: # SELL (assuming closing or shorting)
                # Simplified: if shorting, avg_price logic would be different or tracked separately.
                # For now, assume sells reduce existing long positions or establish simple short quantity.
                new_total_value = (current_avg_price * current_pos_qty) - (order.average_fill_price * order.filled_quantity) # This logic is flawed for avg price of shorts
                new_qty = current_pos_qty - order.filled_quantity
                if new_qty == 0:
                    new_avg_price = Decimal("0")
                elif (current_pos_qty > 0 and new_qty < 0) or (current_pos_qty < 0 and new_qty > 0) : # Flipped position
                    new_avg_price = order.average_fill_price # Position flipped, new avg price is the fill price
                elif abs(new_qty) < abs(current_pos_qty): # Reduced position
                     new_avg_price = current_avg_price # Avg price doesn't change when reducing
                else: # Increased short or started new short from flat
                     new_avg_price = order.average_fill_price # This needs refinement for proper short avg price tracking


            self._positions[order.contract_id] = {
                "contract_id": order.contract_id,
                "quantity": new_qty,
                "average_entry_price": new_avg_price.quantize(Decimal("0.01"))
            }
            logger.info(f"MockExecutionClient: Order {internal_order_id} FILLED. Position for {order.contract_id}: {self._positions[order.contract_id]}")

        else:
            order.status = "REJECTED" # Or some other non-fill status like EXPIRED if it was a limit
            logger.info(f"MockExecutionClient: Order {internal_order_id} REJECTED (simulated).")
        
        order.updated_at = datetime.now(timezone.utc)

    async def cancel_order(self, broker_order_id: str, internal_order_id: Optional[str] = None) -> Order:
        target_internal_id = internal_order_id or self._broker_order_id_map.get(broker_order_id)
        if not target_internal_id or target_internal_id not in self._orders:
            logger.warning(f"MockExecutionClient: Order not found for cancellation (BrokerID: {broker_order_id}, InternalID: {internal_order_id})")
            raise ValueError(f"Order not found for cancellation: {broker_order_id or internal_order_id}")

        order = self._orders[target_internal_id]
        if order.status not in ["SUBMITTED", "ACCEPTED", "WORKING", "PENDING_SUBMIT"]:
            logger.warning(f"MockExecutionClient: Order {target_internal_id} cannot be cancelled in status {order.status}.")
            return order # Cannot cancel, return current state

        order.status = "CANCELLED"
        order.updated_at = datetime.now(timezone.utc)
        logger.info(f"MockExecutionClient: Order {target_internal_id} CANCELLED.")
        return order

    async def get_order_status(self, broker_order_id: str, internal_order_id: Optional[str] = None) -> Order:
        target_internal_id = internal_order_id or self._broker_order_id_map.get(broker_order_id)
        if not target_internal_id or target_internal_id not in self._orders:
            logger.warning(f"MockExecutionClient: Order not found for status check (BrokerID: {broker_order_id}, InternalID: {internal_order_id})")
            raise ValueError(f"Order not found for status check: {broker_order_id or internal_order_id}")
        
        # Potentially simulate further state changes if the order was e.g. submitted but not yet filled/rejected
        # For simplicity here, we assume _simulate_order_lifecycle already ran or its state is final for now.
        return self._orders[target_internal_id]

    async def get_open_positions(self, contract_id: Optional[str] = None) -> List[Dict[str, Any]]:
        logger.info(f"MockExecutionClient: Getting open positions. Filter by contract: {contract_id}")
        open_positions = []
        for symbol, pos_data in self._positions.items():
            if pos_data["quantity"] != 0:
                if contract_id is None or symbol == contract_id:
                    open_positions.append({
                        "contract_id": symbol,
                        "quantity": pos_data["quantity"],
                        "average_entry_price": pos_data["average_entry_price"],
                        # Add other relevant fields like unrealized P&L if needed
                    })
        return open_positions

    async def get_account_summary(self) -> Dict[str, Any]:
        # Simulate some basic account details
        logger.info("MockExecutionClient: Getting account summary.")
        total_equity = Decimal("100000") # Starting mock equity
        # Rudimentary P&L calculation (very simplified)
        # In a real scenario, this would involve tracking cost basis, market value of positions etc.
        realized_pl = Decimal("0") 
        unrealized_pl = Decimal("0")

        for order_id, order in self._orders.items():
            if order.status == "FILLED" and order.average_fill_price is not None:
                # This isn't a full P&L calc, just summing potential value from fills
                # A proper P&L needs to consider opening and closing trades.
                # For now, this is a placeholder.
                pass


        for symbol, pos_data in self._positions.items():
            if pos_data["quantity"] != 0:
                # Simulate market price for P&L (highly arbitrary)
                mock_market_price = pos_data["average_entry_price"] * Decimal(str(random.uniform(0.98, 1.02)))
                if pos_data["quantity"] > 0: # Long
                    unrealized_pl += (mock_market_price - pos_data["average_entry_price"]) * pos_data["quantity"]
                else: # Short
                    unrealized_pl += (pos_data["average_entry_price"] - mock_market_price) * abs(pos_data["quantity"])
        
        return {
            "account_id": self.account_id,
            "balance": total_equity + realized_pl, # Assuming balance reflects realized P&L
            "equity": total_equity + realized_pl + unrealized_pl,
            "unrealized_pnl": unrealized_pl.quantize(Decimal("0.01")),
            "realized_pnl": realized_pl.quantize(Decimal("0.01")), # Needs proper tracking
            "margin_available": (total_equity + realized_pl + unrealized_pl) * Decimal("0.5"), # Mock 50% margin
            "currency": "USD"
        }

# Example usage (for testing this file directly, not part of the actual service flow)
async def main_test():
    from src.core.config import load_config
    # Make sure you have a .env file and config/settings.yaml with execution and mock_client_config sections
    
    # Create dummy .env if it doesn't exist for test
    with open(".env", "a") as f:
        pass # Ensure file exists

    # Create dummy config/settings.yaml if it doesn't exist for test
    import os
    if not os.path.exists("config"): os.makedirs("config")
    if not os.path.exists("config/settings.yaml"):
        with open("config/settings.yaml", "w") as f:
            f.write("""
execution:
  default_account_id: "test_mock_account"
  mock_client_config:
    fill_chance_percentage: 90
    simulated_fill_delay_ms: 50
    slippage_ticks: 1
logging:
  version: 1
  disable_existing_loggers: false
  formatters:
    simple:
      format: \'%(asctime)s - %(name)s - %(levelname)s - %(message)s\'
  handlers:
    console:
      class: logging.StreamHandler
      level: DEBUG
      formatter: simple
      stream: ext://sys.stdout
  root:
    level: INFO
    handlers: [console]
  loggers:
    src.execution.execution_client:
      level: DEBUG
      handlers: [console]
      propagate: no
""")

    cfg = load_config()
    
    logging.basicConfig(level=logging.DEBUG) # Ensure root logger is also at DEBUG for library logs if needed
    
    # Setup specific logger for this module based on config
    log_config = cfg.get_logging_config()
    if log_config:
        logging.config.dictConfig(log_config)


    mock_client = MockExecutionClient(config=cfg)
    await mock_client.connect()

    # Test order submission
    order_data = {
        "internal_order_id": f"test_order_{uuid.uuid4()}",
        "contract_id": "CON.F.US.MES.M25",
        "account_id": mock_client.account_id, # Will be overridden by client but good practice
        "order_type": "MARKET",
        "direction": "BUY",
        "quantity": 2,
        "status": "PENDING_SUBMIT" 
    }
    try:
        order_model = Order(**order_data)
        submitted_order = await mock_client.submit_order(order_model)
        logger.info(f"Submitted order: {submitted_order.model_dump_json(indent=2)}")

        if submitted_order.broker_order_id:
            status_order = await mock_client.get_order_status(submitted_order.broker_order_id)
            logger.info(f"Status check: {status_order.model_dump_json(indent=2)}")

        # Test another order
        limit_order_data = {
            "internal_order_id": f"limit_order_{uuid.uuid4()}",
            "contract_id": "CON.F.US.MES.M25",
            "account_id": mock_client.account_id,
            "order_type": "LIMIT",
            "direction": "SELL",
            "quantity": 1,
            "limit_price": Decimal("5400.50"),
            "status": "PENDING_SUBMIT"
        }
        limit_order_model = Order(**limit_order_data)
        submitted_limit_order = await mock_client.submit_order(limit_order_model)
        logger.info(f"Submitted limit order: {submitted_limit_order.model_dump_json(indent=2)}")

        if submitted_limit_order.broker_order_id and submitted_limit_order.status not in ["FILLED", "REJECTED"]:
             # Try to cancel if it's not immediately filled/rejected
             await asyncio.sleep(0.01) # short delay
             cancelled_order = await mock_client.cancel_order(submitted_limit_order.broker_order_id)
             logger.info(f"Attempted cancel: {cancelled_order.model_dump_json(indent=2)}")


    except Exception as e:
        logger.error(f"Error during mock client test: {e}", exc_info=True)

    # Test positions
    positions = await mock_client.get_open_positions()
    logger.info(f"Open positions: {positions}")

    # Test account summary
    summary = await mock_client.get_account_summary()
    logger.info(f"Account summary: {summary}")

    await mock_client.disconnect()

if __name__ == "__main__":
    # This allows running this file directly for quick testing of the MockExecutionClient
    # Requires config/settings.yaml and .env to be set up for load_config()
    
    # Basic logging setup for the test run
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    asyncio.run(main_test()) 