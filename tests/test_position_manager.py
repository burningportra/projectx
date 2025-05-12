"""
Tests for the position management system.
"""

import os
import sys
import unittest
import asyncio
from datetime import datetime, timezone

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.execution.position_manager import (
    PositionManager, Position, Order, OrderStatus, OrderSide, 
    OrderType, PositionSide, PositionStatus
)


class TestPositionManager(unittest.TestCase):
    """Test cases for position management."""
    
    def setUp(self):
        """Set up test cases."""
        self.position_manager = PositionManager()
        self.strategy_id = "test_strategy_1"
        self.contract_id = "CON.F.US.MES.M25"
        
    def test_create_position(self):
        """Test creating a position."""
        position = self.position_manager.create_position(
            strategy_id=self.strategy_id,
            contract_id=self.contract_id,
            side=PositionSide.LONG,
            quantity=1.0
        )
        
        self.assertIsNotNone(position)
        self.assertEqual(position.strategy_id, self.strategy_id)
        self.assertEqual(position.contract_id, self.contract_id)
        self.assertEqual(position.side, PositionSide.LONG)
        self.assertEqual(position.quantity, 1.0)
        self.assertEqual(position.status, PositionStatus.OPENING)
        self.assertTrue(position.is_open)
        
    def test_create_order(self):
        """Test creating an order."""
        order = self.position_manager.create_order(
            strategy_id=self.strategy_id,
            contract_id=self.contract_id,
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=1.0
        )
        
        self.assertIsNotNone(order)
        self.assertEqual(order.strategy_id, self.strategy_id)
        self.assertEqual(order.contract_id, self.contract_id)
        self.assertEqual(order.side, OrderSide.BUY)
        self.assertEqual(order.order_type, OrderType.MARKET)
        self.assertEqual(order.quantity, 1.0)
        self.assertEqual(order.status, OrderStatus.PENDING)
        
    def test_update_order_status(self):
        """Test updating an order's status."""
        order = self.position_manager.create_order(
            strategy_id=self.strategy_id,
            contract_id=self.contract_id,
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=1.0
        )
        
        updated_order = self.position_manager.update_order_status(
            order_id=order.id,
            status=OrderStatus.SUBMITTED,
            external_order_id="ext-123"
        )
        
        self.assertEqual(updated_order.status, OrderStatus.SUBMITTED)
        self.assertEqual(updated_order.external_order_id, "ext-123")
        
    def test_position_lifecycle(self):
        """Test the full lifecycle of a position."""
        # Create position
        position = self.position_manager.create_position(
            strategy_id=self.strategy_id,
            contract_id=self.contract_id,
            side=PositionSide.LONG,
            quantity=1.0
        )
        
        # Create order to open position
        order = self.position_manager.create_order(
            strategy_id=self.strategy_id,
            contract_id=self.contract_id,
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=1.0,
            position_id=position.id
        )
        
        # Update order to filled
        self.position_manager.update_order_status(
            order_id=order.id,
            status=OrderStatus.FILLED,
            filled_quantity=1.0,
            average_fill_price=4200.0
        )
        
        # Verify position is now open
        position = self.position_manager.get_position(position.id)
        self.assertEqual(position.status, PositionStatus.OPEN)
        self.assertEqual(position.entry_price, 4200.0)
        
        # Update position price
        self.position_manager.update_position_price(position.id, 4210.0)
        
        # Verify unrealized P&L
        position = self.position_manager.get_position(position.id)
        self.assertEqual(position.current_price, 4210.0)
        self.assertEqual(position.unrealized_pnl, 10.0)  # (4210 - 4200) * 1.0
        
        # Close position
        close_order = self.position_manager.close_position(position.id)
        
        # Verify position is closing
        position = self.position_manager.get_position(position.id)
        self.assertEqual(position.status, PositionStatus.CLOSING)
        
        # Fill close order
        self.position_manager.update_order_status(
            order_id=close_order.id,
            status=OrderStatus.FILLED,
            filled_quantity=1.0,
            average_fill_price=4220.0
        )
        
        # Verify position is closed with realized P&L
        position = self.position_manager.get_position(position.id)
        self.assertEqual(position.status, PositionStatus.CLOSED)
        self.assertEqual(position.realized_pnl, 20.0)  # (4220 - 4200) * 1.0
        self.assertEqual(position.unrealized_pnl, 0.0)
        self.assertFalse(position.is_open)
        
    def test_callback_registration(self):
        """Test callback registration."""
        position_opened_called = False
        position_closed_called = False
        order_updated_called = False
        
        def on_position_opened(position):
            nonlocal position_opened_called
            position_opened_called = True
            
        def on_position_closed(position):
            nonlocal position_closed_called
            position_closed_called = True
            
        def on_order_updated(order):
            nonlocal order_updated_called
            order_updated_called = True
            
        # Register callbacks
        self.position_manager.register_position_opened_callback(on_position_opened)
        self.position_manager.register_position_closed_callback(on_position_closed)
        self.position_manager.register_order_updated_callback(on_order_updated)
        
        # Create position
        position = self.position_manager.create_position(
            strategy_id=self.strategy_id,
            contract_id=self.contract_id,
            side=PositionSide.LONG,
            quantity=1.0
        )
        
        # Create and fill order
        order = self.position_manager.create_order(
            strategy_id=self.strategy_id,
            contract_id=self.contract_id,
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=1.0,
            position_id=position.id
        )
        
        # Update order - should trigger order_updated callback
        self.position_manager.update_order_status(
            order_id=order.id,
            status=OrderStatus.SUBMITTED
        )
        
        self.assertTrue(order_updated_called)
        
        # Fill order - should trigger position_opened callback
        self.position_manager.update_order_status(
            order_id=order.id,
            status=OrderStatus.FILLED,
            filled_quantity=1.0,
            average_fill_price=4200.0
        )
        
        self.assertTrue(position_opened_called)
        
        # Close position
        close_order = self.position_manager.close_position(position.id)
        
        # Fill close order - should trigger position_closed callback
        self.position_manager.update_order_status(
            order_id=close_order.id,
            status=OrderStatus.FILLED,
            filled_quantity=1.0,
            average_fill_price=4220.0
        )
        
        self.assertTrue(position_closed_called)


if __name__ == "__main__":
    unittest.main() 