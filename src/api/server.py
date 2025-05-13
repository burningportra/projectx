"""
API server for ProjectX Trading Platform
"""

import logging
import uuid
from typing import List, Optional
from datetime import datetime, timedelta
from enum import Enum

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Initialize logger
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="ProjectX Trading API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Allow the Next.js frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enums for status values
class StrategyStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    INACTIVE = "inactive"

class PositionSide(str, Enum):
    LONG = "long"
    SHORT = "short"

class PositionStatus(str, Enum):
    OPEN = "open"
    CLOSING = "closing"
    CLOSED = "closed"

class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"
    LONG = "long"
    SHORT = "short"

class OrderStatus(str, Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"

class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"

# Data models
class StrategyPerformance(BaseModel):
    win_rate: float
    pnl: float
    trades: int

class Strategy(BaseModel):
    id: str
    name: str
    description: str
    contracts: List[str]
    timeframes: List[str]
    status: StrategyStatus
    performance: StrategyPerformance

class StrategyCreate(BaseModel):
    name: str
    description: str
    contracts: List[str]
    timeframes: List[str]

class StrategyStatusUpdate(BaseModel):
    status: StrategyStatus

class Position(BaseModel):
    id: str
    strategyName: str
    contract: str
    side: PositionSide
    entryPrice: float
    currentPrice: float
    size: int
    pnl: float
    openTime: str
    status: PositionStatus

class Order(BaseModel):
    id: str
    strategyName: str
    contract: str
    side: OrderSide
    price: float
    size: int
    time: str
    status: OrderStatus
    type: OrderType

# In-memory data store (replace with database in production)
strategies = [
    {
        "id": "1",
        "name": "Breakout Strategy",
        "description": "Captures price breakouts above resistance levels",
        "contracts": ["MES"],
        "timeframes": ["5m"],
        "status": "active",
        "performance": {
            "win_rate": 65,
            "pnl": 340.50,
            "trades": 28
        }
    },
    {
        "id": "2",
        "name": "Moving Average Crossover",
        "description": "Trades based on moving average crossovers",
        "contracts": ["ES"],
        "timeframes": ["15m"],
        "status": "paused",
        "performance": {
            "win_rate": 58,
            "pnl": 125.25,
            "trades": 12
        }
    },
    {
        "id": "3",
        "name": "Support/Resistance Bounce",
        "description": "Trades bounces from key support/resistance levels",
        "contracts": ["NQ", "MNQ"],
        "timeframes": ["1h", "4h"],
        "status": "inactive",
        "performance": {
            "win_rate": 72,
            "pnl": 512.75,
            "trades": 32
        }
    }
]

positions = [
    {
        "id": "1",
        "strategyName": "Breakout Strategy",
        "contract": "MES",
        "side": "long",
        "entryPrice": 4212.50,
        "currentPrice": 4225.75,
        "size": 1,
        "pnl": 26.50,
        "openTime": "2023-05-25T10:30:00Z",
        "status": "open"
    }
]

orders = [
    {
        "id": "101",
        "strategyName": "Moving Average Crossover",
        "contract": "ES",
        "side": "short",
        "price": 4315.25,
        "size": 1,
        "time": "2023-05-24T15:45:00Z",
        "status": "filled",
        "type": "market"
    },
    {
        "id": "102",
        "strategyName": "Moving Average Crossover",
        "contract": "ES",
        "side": "buy",
        "price": 4295.75,
        "size": 1,
        "time": "2023-05-24T16:30:00Z",
        "status": "filled",
        "type": "market"
    },
    {
        "id": "103",
        "strategyName": "Breakout Strategy",
        "contract": "MES",
        "side": "buy",
        "price": 4212.50,
        "size": 1,
        "time": "2023-05-25T10:30:00Z",
        "status": "filled",
        "type": "market"
    }
]

@app.get("/")
def read_root():
    """API root endpoint"""
    return {"message": "Welcome to ProjectX Trading API"}

@app.get("/api/strategies", response_model=List[Strategy])
def get_strategies():
    """Get all strategies"""
    return strategies

@app.post("/api/strategies", response_model=Strategy)
def create_strategy(strategy: StrategyCreate):
    """Create a new strategy"""
    new_strategy = {
        "id": str(uuid.uuid4()),
        "name": strategy.name,
        "description": strategy.description,
        "contracts": strategy.contracts,
        "timeframes": strategy.timeframes,
        "status": "inactive",
        "performance": {
            "win_rate": 0,
            "pnl": 0,
            "trades": 0
        }
    }
    strategies.append(new_strategy)
    return new_strategy

@app.post("/api/strategies/{strategy_id}/status", response_model=Strategy)
def update_strategy_status(strategy_id: str, status_update: StrategyStatusUpdate):
    """Update a strategy's status"""
    for i, strategy in enumerate(strategies):
        if strategy["id"] == strategy_id:
            strategies[i]["status"] = status_update.status
            return strategies[i]
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Strategy with ID {strategy_id} not found"
    )

@app.get("/api/positions", response_model=List[Position])
def get_positions():
    """Get all positions"""
    return positions

@app.post("/api/positions/{position_id}/close")
def close_position(position_id: str):
    """Close a position"""
    for i, position in enumerate(positions):
        if position["id"] == position_id:
            # In a real system, this would trigger order execution
            # For now, we'll just remove it from the list
            closed_position = positions.pop(i)
            
            # Add to order history
            new_order = {
                "id": str(uuid.uuid4()),
                "strategyName": closed_position["strategyName"],
                "contract": closed_position["contract"],
                "side": "sell" if closed_position["side"] == "long" else "buy",
                "price": closed_position["currentPrice"],
                "size": closed_position["size"],
                "time": datetime.now().isoformat() + "Z",
                "status": "filled",
                "type": "market"
            }
            orders.append(new_order)
            
            return {"message": f"Position {position_id} closed successfully"}
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Position with ID {position_id} not found"
    )

@app.get("/api/orders", response_model=List[Order])
def get_orders():
    """Get order history"""
    return orders

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting API server on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000) 