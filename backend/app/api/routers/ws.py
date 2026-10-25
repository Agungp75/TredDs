from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import json
import random
import time
from app.core.config import settings
from app.services.market_data import DEFAULT_ASSETS, fetch_live_quote, resolve_symbol

router = APIRouter(prefix="/ws", tags=["WebSocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager()

# Simpan harga live terakhir di level memori server
_last_known_prices = {}


def _price_decimals(price: float) -> int:
    if price <= 0:
        return 4
    if price < 0.001:
        return 8
    if price < 1.0:
        return 6
    if price < 10.0:
        return 4
    return 2


def get_current_real_tick(symbol: str) -> dict:
    """
    Mengambil data tick pasar riil MEXC USDT-M (lastPrice, fairPrice, indexPrice,
    fundingRate, holdVol/openInterest) tanpa micro-tick buatan (+/-0.03%).
    """
    norm_symbol = resolve_symbol(symbol, "futures")
    quote = fetch_live_quote(norm_symbol)
    base_price = float(quote.get("price") or 0.0)
    prev_known = _last_known_prices.get(norm_symbol, base_price)

    decimals = _price_decimals(base_price)
    new_price = round(base_price, decimals)
    _last_known_prices[norm_symbol] = new_price

    direction = "up" if new_price > prev_known else ("down" if new_price < prev_known else "neutral")

    return {
        "type": "TICK",
        "symbol": norm_symbol,
        "name": quote.get("name", norm_symbol),
        "asset_type": "crypto",
        "price": new_price,
        "lastPrice": new_price,
        "fairPrice": round(float(quote.get("fair_price") or new_price), decimals),
        "indexPrice": round(float(quote.get("index_price") or new_price), decimals),
        "fundingRate": float(quote.get("funding_rate") or 0.0),
        "openInterest": float(quote.get("open_interest") or 0.0),
        "spread_pct": float(quote.get("spread_pct") or 0.0),
        "change": quote.get("change", 0.0),
        "change_pct": quote.get("change_pct", 0.0),
        "direction": direction,
        "high_24h": quote.get("high_24h", new_price),
        "low_24h": quote.get("low_24h", new_price),
        "volume": quote.get("volume", 0.0),
        "timestamp": time.time(),
        "last_updated": quote.get("last_updated"),
        "data_source": quote.get("data_source", "mexc_futures"),
        "data_status": quote.get("data_status", "LIVE_OK"),
        "is_tradable": quote.get("is_tradable", True),
        "data_age_ms": quote.get("data_age_ms", 0),
    }


@router.websocket("/ticks")
async def websocket_ticks(websocket: WebSocket):
    """
    WebSocket endpoint untuk real-time price tick streaming
    khusus Kripto MEXC USDT-M Perpetual & Spot.
    """
    await manager.connect(websocket)
    try:
        symbols = list(DEFAULT_ASSETS.keys())
        initial_snapshot = {}
        for s in symbols[:10]:  # Kirim 10 aset utama pertama sebagai snapshot kilat
            try:
                q = fetch_live_quote(s)
                initial_snapshot[s] = {
                    "price": q["price"],
                    "lastPrice": q.get("last_price", q["price"]),
                    "fairPrice": q.get("fair_price", q["price"]),
                    "indexPrice": q.get("index_price", q["price"]),
                    "fundingRate": q.get("funding_rate", 0.0),
                    "openInterest": q.get("open_interest", 0.0),
                    "spread_pct": q.get("spread_pct", 0.0),
                    "change": q.get("change", 0.0),
                    "change_pct": q["change_pct"],
                    "high_24h": q.get("high_24h"),
                    "low_24h": q.get("low_24h"),
                    "volume": q.get("volume"),
                    "last_updated": q.get("last_updated"),
                    "data_source": q.get("data_source", "mexc_futures"),
                    "data_status": q.get("data_status", "LIVE_OK"),
                    "is_tradable": q.get("is_tradable", True),
                    "timestamp": time.time(),
                }
            except Exception:
                pass

        await websocket.send_json({
            "type": "CONNECTION_ESTABLISHED",
            "message": f"Connected to ATRED v3.0 MEXC Real-Time Stream ({settings.MEXC_WS_URL})",
            "exchange": "MEXC_USDT_M",
            "snapshot": initial_snapshot,
        })

        index = 0
        alerted_symbols = {}
        priority_symbols = [
            "BTC_USDT", "ETH_USDT", "SOL_USDT", "BNB_USDT",
            "XRP_USDT", "DOGE_USDT", "SUI_USDT", "PEPE_USDT",
        ]
        all_syms = list(DEFAULT_ASSETS.keys())

        while True:
            if random.random() < 0.6:
                symbol = random.choice(priority_symbols)
            else:
                symbol = all_syms[index % len(all_syms)]
            index += 1

            tick_payload = await asyncio.to_thread(get_current_real_tick, symbol)
            await websocket.send_json(tick_payload)

            # Kirim alert HANYA jika terjadi pergerakan harian nyata yang signifikan (>= 4%)
            # atau spread Fair Price vs Last Price ekstrem
            now_ts = time.time()
            chg_pct = abs(float(tick_payload.get("change_pct") or 0.0))
            if (
                tick_payload.get("is_tradable", True)
                and chg_pct >= 4.0
                and now_ts - alerted_symbols.get(symbol, 0) > 120
            ):
                alerted_symbols[symbol] = now_ts
                arah = "Bullish Surge" if tick_payload.get("change_pct", 0) > 0 else "Bearish Dump"
                await websocket.send_json({
                    "type": "ALERT",
                    "symbol": symbol,
                    "event": "MEXC_VOLATILITY_MOVE",
                    "message": (
                        f"{arah} ({tick_payload['change_pct']:+.2f}% 24h) pada {symbol} "
                        f"@ {tick_payload['price']} | Fair: {tick_payload['fairPrice']}"
                    ),
                    "score": min(96, int(70 + chg_pct * 2.5)),
                    "price": tick_payload["price"],
                    "fairPrice": tick_payload["fairPrice"],
                    "fundingRate": tick_payload["fundingRate"],
                    "data_source": tick_payload.get("data_source"),
                    "timestamp": now_ts,
                })

            await asyncio.sleep(1.0)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
