import logging
from typing import Optional, Dict, Any, Tuple, List
from decimal import Decimal, ROUND_HALF_UP
import uuid

from src.core.config import Config
from src.data.models import Order # Assuming Order model from previous steps
from src.execution.execution_client import ExecutionClient # Now we can import this
# from src.execution.execution_client import ExecutionClient # Will be used to check current positions

logger = logging.getLogger(__name__)

class OrderManager:
    """Manages order creation based on signals, applying risk and position rules."""

    def __init__(self, config: Config, execution_client: ExecutionClient):
        self.config = config
        self.execution_config = config.get_execution_config()
        if not self.execution_config:
            raise ValueError("Execution configuration not found in settings.")
        
        self.risk_params = self.execution_config.get("risk_parameters", {})
        self.default_account_id = self.execution_config.get("default_account_id")
        if not self.default_account_id:
            raise ValueError("default_account_id not found in execution configuration.")

        self.execution_client = execution_client # Used to fetch current positions
        logger.info("OrderManager initialized.")

    def _get_contract_risk_params(self, contract_id: str) -> Dict[str, Any]:
        """Returns specific risk parameters for a contract, falling back to defaults."""
        contract_specific = self.risk_params.get("contract_specific_risk", {}).get(contract_id, {})
        
        # Deep merge contract specific over defaults carefully
        stop_loss_conf = contract_specific.get("stop_loss", self.risk_params.get("default_stop_loss", {}))
        take_profit_conf = contract_specific.get("take_profit", self.risk_params.get("default_take_profit", {}))
        max_contracts = contract_specific.get("max_contracts_per_trade", 
                                              self.risk_params.get("default_max_contracts_per_trade"))
        
        # Handle contract_max_contracts override for max_contracts_per_trade
        specific_max_override = self.risk_params.get("contract_max_contracts", {}).get(contract_id)
        if specific_max_override is not None:
            max_contracts = specific_max_override
            
        return {
            "stop_loss": stop_loss_conf,
            "take_profit": take_profit_conf,
            "max_contracts_per_trade": max_contracts
        }

    def _calculate_stop_profit_prices(self, entry_price: Decimal, direction: str, 
                                     stop_loss_conf: Dict, take_profit_conf: Dict, 
                                     tick_size: Optional[Decimal] = None, points_per_unit: Optional[Decimal] = None) -> Tuple[Optional[Decimal], Optional[Decimal]]:
        """Calculates stop loss and take profit prices based on configuration.
           Requires tick_size for 'ticks' type, and points_per_unit for 'points' type if different from price units.
           For now, assumes points_per_unit = 1 if type is 'points' (i.e. value is in same units as price)
        """
        stop_loss_price = None
        take_profit_price = None

        # Helper to quantize to tick_size if available, otherwise 2 decimal places
        def quantize_price(price_val):
            if tick_size:
                return (price_val / tick_size).quantize(Decimal('1'), rounding=ROUND_HALF_UP) * tick_size
            return price_val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) # Default for non-tick based

        # Stop Loss
        if stop_loss_conf and stop_loss_conf.get("value") is not None:
            sl_value = Decimal(str(stop_loss_conf["value"]))
            sl_type = stop_loss_conf.get("type", "points") # Default to points
            
            delta = Decimal("0")
            if sl_type == "ticks":
                if not tick_size: raise ValueError("tick_size required for 'ticks' stop loss type")
                delta = sl_value * tick_size
            elif sl_type == "points":
                # Assuming points_per_unit = 1 for now, so sl_value is directly in price units
                delta = sl_value * (points_per_unit or Decimal("1"))
            elif sl_type == "percentage":
                delta = entry_price * (sl_value / Decimal("100"))
            else:
                logger.warning(f"Unsupported stop loss type: {sl_type}")

            if direction == "BUY":
                stop_loss_price = quantize_price(entry_price - delta)
            else: # SELL
                stop_loss_price = quantize_price(entry_price + delta)

        # Take Profit
        if take_profit_conf and take_profit_conf.get("value") is not None:
            tp_value = Decimal(str(take_profit_conf["value"]))
            tp_type = take_profit_conf.get("type", "points")

            delta = Decimal("0")
            if tp_type == "ticks":
                if not tick_size: raise ValueError("tick_size required for 'ticks' take profit type")
                delta = tp_value * tick_size
            elif tp_type == "points":
                delta = tp_value * (points_per_unit or Decimal("1"))
            elif tp_type == "percentage":
                delta = entry_price * (tp_value / Decimal("100"))
            else:
                logger.warning(f"Unsupported take profit type: {tp_type}")
                
            if direction == "BUY":
                take_profit_price = quantize_price(entry_price + delta)
            else: # SELL
                take_profit_price = quantize_price(entry_price - delta)
                
        return stop_loss_price, take_profit_price

    async def create_order_from_signal(self, coordinated_signal: Dict[str, Any],
                                       current_market_price: Optional[Decimal] = None) -> Optional[Order]:
        """Processes a coordinated signal and decides whether to create an order.
           `coordinated_signal` is a dictionary, expected to have at least:
           `signal_id` (of the primary signal), `contract_id`, `direction` (UP/DOWN from signal),
           `timestamp`, `rule_name`.
           `current_market_price` is needed for MARKET orders or if signal doesn't provide entry price.
        """
        # Extract necessary info from the coordinated signal
        # This mapping might need adjustment based on actual coordinated_signal structure
        primary_signal_details = coordinated_signal.get("primary_signal_details", coordinated_signal) # Adapt as needed
        
        contract_id = primary_signal_details.get("contract_id")
        # Assuming coordinated signal indicates "UP" for buy, "DOWN" for sell
        signal_direction = primary_signal_details.get("direction") 
        signal_id_str = primary_signal_details.get("signal_id")
        signal_id = uuid.UUID(signal_id_str) if signal_id_str else None
        coordinated_event_id = coordinated_signal.get("coordinated_event_id", f"coord_{signal_id_str or uuid.uuid4().hex[:8]}")

        if not contract_id or not signal_direction:
            logger.error(f"Missing contract_id or direction in coordinated_signal: {coordinated_signal}")
            return None

        trade_direction = "BUY" if signal_direction == "UP" else "SELL"

        # 1. Check current positions for this contract_id (using execution_client)
        # For now, let's assume we don't open a new trade if one is already open for the same contract.
        # This logic will be refined (e.g. allow multiple positions, scaling in, etc.)
        try:
            open_positions = await self.execution_client.get_open_positions(contract_id=contract_id)
            if open_positions:
                # Check if existing position is in the same direction or if it should be reversed/ignored
                # Simple rule for now: if any position exists, don't open another one.
                logger.info(f"Position already exists for {contract_id}. Skipping new order. Positions: {open_positions}")
                return None
        except Exception as e:
            logger.error(f"Failed to get open positions for {contract_id}: {e}")
            return None # Or handle based on policy, e.g., proceed with caution

        # 2. Determine order quantity based on risk parameters
        contract_risk = self._get_contract_risk_params(contract_id)
        quantity = contract_risk.get("max_contracts_per_trade", 1)
        if quantity is None or quantity <= 0:
            logger.warning(f"Invalid or zero quantity configured for {contract_id}. Defaulting to 1.")
            quantity = 1

        # 3. Determine order type and prices
        # For now, all orders are MARKET orders. This will be expanded.
        order_type = "MARKET" 
        limit_price = None
        stop_price_param = None # This is for stop entry orders, not SL for a market order

        # Determine entry price for SL/TP calculation
        # If the signal provides a specific entry price (e.g. from a limit order target), use that.
        # Otherwise, use current_market_price for market orders.
        entry_price_for_calc = primary_signal_details.get("trigger_price") # Example field from signal
        if entry_price_for_calc:
            entry_price_for_calc = Decimal(str(entry_price_for_calc))
        elif order_type == "MARKET" and current_market_price:
            entry_price_for_calc = current_market_price
        else:
            logger.error(f"Cannot determine entry price for SL/TP calculation for {contract_id}. Signal: {primary_signal_details}")
            return None
        
        # Fetch contract-specific metadata like tick_size (this would ideally come from a ContractDetailsService)
        # Hardcoding for MES for now as an example
        tick_size_map = {"CON.F.US.MES.M25": Decimal("0.25")}
        tick_size = tick_size_map.get(contract_id)

        # 4. Calculate Stop Loss and Take Profit
        sl_price, tp_price = self._calculate_stop_profit_prices(
            entry_price=entry_price_for_calc,
            direction=trade_direction,
            stop_loss_conf=contract_risk["stop_loss"],
            take_profit_conf=contract_risk["take_profit"],
            tick_size=tick_size
        )

        # 5. Construct the Order object
        internal_order_id = f"ord_{contract_id.replace('.', '_')}_{coordinated_event_id}_{uuid.uuid4().hex[:8]}"
        
        order_details = {
            "strategy_rule_name": coordinated_signal.get("rule_name", "UnknownRule"),
            "signal_timestamp": primary_signal_details.get("timestamp"),
            "calculated_sl": str(sl_price) if sl_price else None,
            "calculated_tp": str(tp_price) if tp_price else None,
            # Potentially add more details from the coordinated_signal or primary_signal_details
        }

        order_data = {
            "internal_order_id": internal_order_id,
            "broker_order_id": None, # To be filled by execution client upon submission
            "contract_id": contract_id,
            "signal_id": signal_id,
            "coordinated_signal_id": coordinated_event_id,
            "account_id": self.default_account_id,
            "order_type": order_type,
            "direction": trade_direction,
            "quantity": quantity,
            "limit_price": limit_price, # For LIMIT orders
            "stop_price": stop_price_param, # For STOP entry orders
            "status": "PENDING_SUBMIT", # Initial status
            "details": order_details
            # SL/TP might be submitted as separate orders or as part of OCO/bracket depending on broker
            # For now, we store them in details; actual submission of SL/TP orders is a later step.
        }

        try:
            order = Order(**order_data)
            logger.info(f"OrderManager: Prepared order: {order.internal_order_id} for {contract_id} {trade_direction} Qty: {quantity} SL: {sl_price} TP: {tp_price}")
            return order
        except Exception as e: # Catch Pydantic ValidationError or other issues
            logger.error(f"OrderManager: Failed to create Order object: {e}. Data: {order_data}", exc_info=True)
            return None

# Example usage (conceptual, requires coordinated_signal and a mock execution_client)
async def main_test_order_manager():
    from src.core.config import load_config
    from src.execution.execution_client import MockExecutionClient # For testing
    import os

    # Ensure .env and config/settings.yaml exist for load_config()
    if not os.path.exists(".env"): open(".env", "w").close()
    if not os.path.exists("config"): os.makedirs("config")
    if not os.path.exists("config/settings.yaml"):
        with open("config/settings.yaml", "w") as f:
            f.write("""
execution:
  default_account_id: "test_om_account"
  risk_parameters:
    default_max_contracts_per_trade: 1
    contract_max_contracts:
      "CON.F.US.MES.M25": 2
    default_stop_loss:
      type: "ticks"
      value: 20
    default_take_profit:
      type: "points"
      value: 10
    contract_specific_risk:
      "CON.F.US.MES.M25":
        stop_loss:
          type: "points"
          value: 5
        take_profit:
          type: "ticks"
          value: 50 # 12.5 points for MES
  mock_client_config: {}
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
    src.execution.order_manager:
      level: DEBUG
      handlers: [console]
      propagate: no
""")
    cfg = load_config()
    logging.config.dictConfig(cfg.get_logging_config())

    # Mock execution client for the OrderManager to use
    mock_exec_client = MockExecutionClient(config=cfg) 
    await mock_exec_client.connect()

    order_manager = OrderManager(config=cfg, execution_client=mock_exec_client)

    # Example coordinated signal
    sample_coordinated_signal = {
        "coordinated_event_id": "coord_evt_12345",
        "rule_name": "MES_1h_5m_TrendConfirm",
        "primary_signal_details": {
            "signal_id": str(uuid.uuid4()),
            "contract_id": "CON.F.US.MES.M25",
            "direction": "UP", # UP for BUY, DOWN for SELL
            "timestamp": "2023-10-26T10:00:00Z",
            "trigger_price": "5350.50" # Price at which signal triggered
        }
    }

    market_price = Decimal("5351.00")
    created_order = await order_manager.create_order_from_signal(sample_coordinated_signal, market_price)

    if created_order:
        logger.info(f"Test: Created Order: {created_order.model_dump_json(indent=2)}")
        # Optionally, submit it via the mock client to see it stored
        # submitted_order = await mock_exec_client.submit_order(created_order)
        # logger.info(f"Test: Submitted Order via Mock Client: {submitted_order.model_dump_json(indent=2)}")
    else:
        logger.info("Test: No order created.")

    # Test with an existing position (assuming the first trade was pseudo-filled by mock client)
    # To make this test deterministic, we'd need to pre-populate mock_exec_client._positions
    # For now, just showing the call path if a position existed.
    logger.info("\nTesting with assumed existing position (will likely still create order as mock client starts empty):")
    # mock_exec_client._positions["CON.F.US.MES.M25"] = {"quantity": 1, "average_entry_price": Decimal("5350.00")} # Manual set
    created_order_with_pos = await order_manager.create_order_from_signal(sample_coordinated_signal, market_price)
    if created_order_with_pos:
        logger.info(f"Test (with pos check): Created Order: {created_order_with_pos.model_dump_json(indent=2)}")
    else:
        logger.info("Test (with pos check): No order created, likely due to existing position rule.")

    await mock_exec_client.disconnect()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main_test_order_manager()) 