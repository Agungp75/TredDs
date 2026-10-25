from fastapi import APIRouter, Query
import asyncio
from app.services.mexc_orderflow import analyze_mexc_derivatives, fetch_orderbook_depth
from app.services.market_data import resolve_symbol

router = APIRouter(prefix="/derivatives", tags=["MEXC Derivatives & Orderflow (Layer 2)"])


@router.get("/{symbol}")
async def get_derivatives_intelligence(
    symbol: str,
    timeframe: str = Query("15m", description="Timeframe untuk kalkulasi CVD dan momentum OI"),
):
    """
    Endpoint khusus Layer 2 (MEXC Derivatives & Orderflow Microstructure):
    Mengembalikan Funding Rate, Open Interest Matrix, 20-Level OBI, CVD,
    Fair vs Last Price Basis Deviation, dan Max Zero-Slippage Position Size.
    """
    f_sym = resolve_symbol(symbol, "futures")
    data = await asyncio.to_thread(analyze_mexc_derivatives, f_sym, None, timeframe)
    return data


@router.get("/{symbol}/orderbook")
async def get_l2_orderbook(
    symbol: str,
    limit: int = Query(20, ge=5, le=50),
):
    """Mengambil snapshot 20-level Orderbook L2 (Bids & Asks) untuk visualisasi kedalaman."""
    f_sym = resolve_symbol(symbol, "futures")
    depth = await asyncio.to_thread(fetch_orderbook_depth, f_sym, limit)
    return depth
