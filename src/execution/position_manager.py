"""
Position Manager

This module manages positions and orders for the automated trading system.
It tracks position state, calculates P&L, and enforces risk limits.
"""

import logging
import uuid
from enum import Enum
from typing import Dict, List, Optional, Callable
from datetime import datetime, timezone
from pydantic import BaseModel, Field, validator

logger = logging.getLogger(__name__)


class OrderStatus(str, Enum):
    """Order status enum."""
    PENDING = "pending"
    SUBMITTED = "submitted"
    PARTIAL = "partial"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
    EXPIRED = "expired"


class OrderSide(str, Enum):
    """Order side enum."""
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    """Order type enum."""
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class PositionStatus(str, Enum):
    """Position status enum."""
    OPENING = "opening"  # Orders are being submitted to open
    OPEN = "open"        # Position is open
    CLOSING = "closing"  # Orders are being submitted to close
    CLOSED = "closed"    # Position is closed


class PositionSide(str, Enum):
    """Position side enum."""
    LONG = "long"
    SHORT = "short"


class Order(BaseModel):
    """Order model."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    strategy_id: str
    contract_id: str
    side: OrderSide
    order_type: OrderType
    quantity: float
    price: Optional[float] = None  # Required for limit and stop-limit orders
    stop_price: Optional[float] = None  # Required for stop and stop-limit orders
    status: OrderStatus = OrderStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    filled_quantity: float = 0
    average_fill_price: Optional[float] = None
    external_order_id: Optional[str] = None  # ID from the broker/exchange
    parent_order_id: Optional[str] = None  # For linked orders (e.g., OCO)
    
    @validator('price', 'stop_price')
    def validate_prices(cls, v, values):
        """Validate prices based on order type."""
        order_type = values.get('order_type')
        if order_type == OrderType.LIMIT and v is None and 'price' in values:
            raise ValueError("Limit orders require a price")
        if order_type == OrderType.STOP and v is None and 'stop_price' in values:
            raise ValueError("Stop orders require a stop price")
        if order_type == OrderType.STOP_LIMIT and v is None and ('price' in values or 'stop_price' in values):
            raise ValueError("Stop-limit orders require both price and stop price")
        return v


class Position(BaseModel):
    """Position model."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    strategy_id: str
    contract_id: str
    side: PositionSide
    status: PositionStatus = PositionStatus.OPENING
    quantity: float = 0
    entry_price: Optional[float] = None
    current_price: Optional[float] = None
    unrealized_pnl: float = 0
    realized_pnl: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    closed_at: Optional[datetime] = None
    orders: List[str] = Field(default_factory=list)  # List of order IDs
    
    @property
    def is_open(self) -> bool:
        """Check if position is open."""
        return self.status in [PositionStatus.OPENING, PositionStatus.OPEN]
    
    @property
    def total_pnl(self) -> float:
        """Calculate total P&L."""
        return self.unrealized_pnl + self.realized_pnl


class PositionManager:
    """
    Manages positions and orders for the trading system.
    """
    def __init__(self):
        """Initialize the position manager."""
        self.positions: Dict[str, Position] = {}
        self.orders: Dict[str, Order] = {}
        self.logger = logging.getLogger(__name__)
        
        # Callbacks
        self.on_position_opened_callbacks: List[Callable] = []
        self.on_position_closed_callbacks: List[Callable] = []
        self.on_position_updated_callbacks: List[Callable] = []
        self.on_order_updated_callbacks: List[Callable] = []
        
    def create_position(self, strategy_id: str, contract_id: str, side: PositionSide, quantity: float) -> Position:
        """
        Create a new position.
        
        Args:
            strategy_id: ID of the strategy that created this position
            contract_id: Contract ID
            side: Position side (long or short)
            quantity: Position size
            
        Returns:
            The created position
        """
        position = Position(
            strategy_id=strategy_id,
            contract_id=contract_id,
            side=side,
            quantity=quantity
        )
        
        self.positions[position.id] = position
        self.logger.info(f"Created position {position.id}: {side.value} {quantity} {contract_id}")
        
        return position
    
    def create_order(
        self, 
        strategy_id: str, 
        contract_id: str, 
        side: OrderSide, 
        order_type: OrderType, 
        quantity: float, 
        price: Optional[float] = None,
        stop_price: Optional[float] = None,
        position_id: Optional[str] = None
    ) -> Order:
        """
        Create a new order.
        
        Args:
            strategy_id: ID of the strategy that created this order
            contract_id: Contract ID
            side: Order side (buy or sell)
            order_type: Order type (market, limit, stop, stop-limit)
            quantity: Order quantity
            price: Limit price (required for limit and stop-limit orders)
            stop_price: Stop price (required for stop and stop-limit orders)
            position_id: Position ID to associate this order with
            
        Returns:
            The created order
        """
        order = Order(
            strategy_id=strategy_id,
            contract_id=contract_id,
            side=side,
            order_type=order_type,
            quantity=quantity,
            price=price,
            stop_price=stop_price
        )
        
        self.orders[order.id] = order
        
        # Add to position if provided
        if position_id and position_id in self.positions:
            self.positions[position_id].orders.append(order.id)
            self.positions[position_id].updated_at = datetime.now(timezone.utc)
        
        self.logger.info(
            f"Created order {order.id}: {side.value} {quantity} {contract_id} "
            f"at {price if price is not None else 'market'}"
        )
        
        return order
    
    def update_order_status(self, order_id: str, status: OrderStatus, 
                          filled_quantity: float = None, 
                          average_fill_price: float = None,
                          external_order_id: str = None) -> Order:
        """
        Update an order's status.
        
        Args:
            order_id: Order ID
            status: New status
            filled_quantity: Filled quantity
            average_fill_price: Average fill price
            external_order_id: External order ID from broker/exchange
            
        Returns:
            The updated order
        """
        if order_id not in self.orders:
            self.logger.error(f"Order {order_id} not found")
            return None
        
        order = self.orders[order_id]
        order.status = status
        order.updated_at = datetime.now(timezone.utc)
        
        if filled_quantity is not None:
            order.filled_quantity = filled_quantity
        
        if average_fill_price is not None:
            order.average_fill_price = average_fill_price
            
        if external_order_id is not None:
            order.external_order_id = external_order_id
        
        self.logger.info(
            f"Updated order {order_id}: status={status.value}, "
            f"filled={order.filled_quantity}/{order.quantity}"
        )
        
        # Update associated position if order is filled
        if status == OrderStatus.FILLED:
            self._update_position_from_order(order)
            
        # Notify callbacks
        for callback in self.on_order_updated_callbacks:
            try:
                callback(order)
            except Exception as e:
                self.logger.error(f"Error in order updated callback: {str(e)}")
        
        return order
    
    def _update_position_from_order(self, order: Order) -> None:
        """
        Update position based on a filled order.
        
        Args:
            order: The filled order
        """
        # Find position associated with this order
        position_id = None
        for pos_id, position in self.positions.items():
            if order.id in position.orders:
                position_id = pos_id
                break
                
        if not position_id:
            self.logger.warning(f"No position found for order {order.id}")
            return
            
        position = self.positions[position_id]
        
        # Update position
        if position.status == PositionStatus.OPENING:
            # Order is opening a position
            position.entry_price = order.average_fill_price
            position.status = PositionStatus.OPEN
            position.updated_at = datetime.now(timezone.utc)
            
            self.logger.info(
                f"Position {position_id} opened: {position.side.value} "
                f"{position.quantity} {position.contract_id} at {position.entry_price}"
            )
            
            # Notify callbacks
            for callback in self.on_position_opened_callbacks:
                try:
                    callback(position)
                except Exception as e:
                    self.logger.error(f"Error in position opened callback: {str(e)}")
                    
        elif position.status == PositionStatus.CLOSING:
            # Order is closing a position
            position.status = PositionStatus.CLOSED
            position.closed_at = datetime.now(timezone.utc)
            position.updated_at = datetime.now(timezone.utc)
            
            # Calculate realized P&L
            if position.side == PositionSide.LONG:
                position.realized_pnl = (order.average_fill_price - position.entry_price) * position.quantity
            else:
                position.realized_pnl = (position.entry_price - order.average_fill_price) * position.quantity
                
            position.unrealized_pnl = 0
            
            self.logger.info(
                f"Position {position_id} closed: {position.side.value} "
                f"{position.quantity} {position.contract_id}, P&L: {position.realized_pnl:.2f}"
            )
            
            # Notify callbacks
            for callback in self.on_position_closed_callbacks:
                try:
                    callback(position)
                except Exception as e:
                    self.logger.error(f"Error in position closed callback: {str(e)}")
                    
        else:
            # Position already open or closed, update anyway
            position.updated_at = datetime.now(timezone.utc)
            
            # Notify callbacks
            for callback in self.on_position_updated_callbacks:
                try:
                    callback(position)
                except Exception as e:
                    self.logger.error(f"Error in position updated callback: {str(e)}")
    
    def update_position_price(self, position_id: str, current_price: float) -> Position:
        """
        Update a position's current price and calculate unrealized P&L.
        
        Args:
            position_id: Position ID
            current_price: Current price
            
        Returns:
            The updated position
        """
        if position_id not in self.positions:
            self.logger.error(f"Position {position_id} not found")
            return None
            
        position = self.positions[position_id]
        
        # Update price
        position.current_price = current_price
        position.updated_at = datetime.now(timezone.utc)
        
        # Calculate unrealized P&L
        if position.entry_price is not None and position.is_open:
            if position.side == PositionSide.LONG:
                position.unrealized_pnl = (current_price - position.entry_price) * position.quantity
            else:
                position.unrealized_pnl = (position.entry_price - current_price) * position.quantity
        
        # Notify callbacks
        for callback in self.on_position_updated_callbacks:
            try:
                callback(position)
            except Exception as e:
                self.logger.error(f"Error in position updated callback: {str(e)}")
                
        return position
    
    def close_position(self, position_id: str, order_type: OrderType = OrderType.MARKET, 
                     price: Optional[float] = None) -> Optional[Order]:
        """
        Close a position.
        
        Args:
            position_id: Position ID
            order_type: Order type for closing (default: MARKET)
            price: Price for limit orders
            
        Returns:
            The created order to close the position, or None if position not found
        """
        if position_id not in self.positions:
            self.logger.error(f"Position {position_id} not found")
            return None
            
        position = self.positions[position_id]
        
        if not position.is_open:
            self.logger.warning(f"Position {position_id} is already closed")
            return None
            
        # Update position status
        position.status = PositionStatus.CLOSING
        position.updated_at = datetime.now(timezone.utc)
        
        # Create close order
        side = OrderSide.SELL if position.side == PositionSide.LONG else OrderSide.BUY
        
        order = self.create_order(
            strategy_id=position.strategy_id,
            contract_id=position.contract_id,
            side=side,
            order_type=order_type,
            quantity=position.quantity,
            price=price,
            position_id=position_id
        )
        
        self.logger.info(f"Closing position {position_id} with order {order.id}")
        
        return order
    
    def cancel_order(self, order_id: str) -> bool:
        """
        Cancel an order.
        
        Args:
            order_id: Order ID
            
        Returns:
            True if successful, False otherwise
        """
        if order_id not in self.orders:
            self.logger.error(f"Order {order_id} not found")
            return False
            
        order = self.orders[order_id]
        
        if order.status not in [OrderStatus.PENDING, OrderStatus.SUBMITTED, OrderStatus.PARTIAL]:
            self.logger.warning(f"Order {order_id} cannot be cancelled: {order.status}")
            return False
            
        # Update status
        order.status = OrderStatus.CANCELLED
        order.updated_at = datetime.now(timezone.utc)
        
        self.logger.info(f"Cancelled order {order_id}")
        
        # Notify callbacks
        for callback in self.on_order_updated_callbacks:
            try:
                callback(order)
            except Exception as e:
                self.logger.error(f"Error in order updated callback: {str(e)}")
                
        return True
    
    def get_position(self, position_id: str) -> Optional[Position]:
        """Get a position by ID."""
        return self.positions.get(position_id)
    
    def get_order(self, order_id: str) -> Optional[Order]:
        """Get an order by ID."""
        return self.orders.get(order_id)
    
    def get_positions_by_strategy(self, strategy_id: str) -> List[Position]:
        """Get all positions for a strategy."""
        return [p for p in self.positions.values() if p.strategy_id == strategy_id]
    
    def get_orders_by_strategy(self, strategy_id: str) -> List[Order]:
        """Get all orders for a strategy."""
        return [o for o in self.orders.values() if o.strategy_id == strategy_id]
    
    def get_open_positions(self) -> List[Position]:
        """Get all open positions."""
        return [p for p in self.positions.values() if p.is_open]
    
    def get_open_positions_by_strategy(self, strategy_id: str) -> List[Position]:
        """Get all open positions for a strategy."""
        return [p for p in self.positions.values() if p.is_open and p.strategy_id == strategy_id]
    
    def register_position_opened_callback(self, callback: Callable):
        """Register a callback for position opened events."""
        self.on_position_opened_callbacks.append(callback)
        
    def register_position_closed_callback(self, callback: Callable):
        """Register a callback for position closed events."""
        self.on_position_closed_callbacks.append(callback)
        
    def register_position_updated_callback(self, callback: Callable):
        """Register a callback for position updated events."""
        self.on_position_updated_callbacks.append(callback)
        
    def register_order_updated_callback(self, callback: Callable):
        """Register a callback for order updated events."""
        self.on_order_updated_callbacks.append(callback) 