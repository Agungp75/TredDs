from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import json
import random
import time
from app.services.market_data import DEFAULT_ASSETS, fetch_live_quote

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

def get_current_real_tick(symbol: str) -> dict:
    """
    Mengambil data tick pasar riil terkini apa adanya dari fetch_live_quote
    tanpa micro-tick buatan (+/-0.03%), sesuai aturan Kejujuran Data (Fase 0).
    """
    quote = fetch_live_quote(symbol)
    base_price = quote["price"]
    prev_known = _last_known_prices.get(symbol, base_price)

    is_forex = quote.get("type") == "forex" or base_price < 10.0
    decimals = 4 if is_forex else 2

    new_price = round(float(base_price), decimals)
    _last_known_prices[symbol] = new_price

    direction = "up" if new_price > prev_known else ("down" if new_price < prev_known else "neutral")

    return {
        "type": "TICK",
        "symbol": symbol,
        "name": quote["name"],
        "asset_type": quote["type"],
        "price": new_price,
        "change": quote.get("change", 0.0),
        "change_pct": quote.get("change_pct", 0.0),
        "direction": direction,
        "high_24h": quote["high_24h"],
        "low_24h": quote["low_24h"],
        "volume": quote["volume"],
        "timestamp": time.time(),
        "last_updated": quote.get("last_updated"),
        "data_source": quote.get("data_source", "live")
    }

@router.websocket("/ticks")
async def websocket_ticks(websocket: WebSocket):
    """
    WebSocket endpoint untuk real-time price tick streaming
    berbasis data pasar asli Yahoo Finance.
    """
    await manager.connect(websocket)
    try:
        # Kirim status koneksi awal beserta snapshot awal seluruh aset
        symbols = list(DEFAULT_ASSETS.keys())
        initial_snapshot = {}
        for s in symbols[:8]:  # Kirim 8 aset utama pertama sebagai snapshot kilat
            try:
                q = fetch_live_quote(s)
                initial_snapshot[s] = {
                    "price": q["price"],
                    "change": q.get("change", 0.0),
                    "change_pct": q["change_pct"],
                    "high_24h": q.get("high_24h"),
                    "low_24h": q.get("low_24h"),
                    "volume": q.get("volume"),
                    "last_updated": q.get("last_updated"),
                    "data_source": q.get("data_source", "live"),
                    "timestamp": time.time()
                }
            except Exception:
                pass

        await websocket.send_json({
            "type": "CONNECTION_ESTABLISHED",
            "message": "Connected to Atred Real-Time Market Stream",
            "snapshot": initial_snapshot
        })

        # Loop pengiriman tick real-time
        index = 0
        alerted_symbols = {}
        while True:
            priority_symbols = ["BTC-USD", "ETH-USD", "SOL-USD", "GC=F", "EURUSD=X", "GBPUSD=X", "USDJPY=X"]
            all_syms = list(DEFAULT_ASSETS.keys())
            
            if random.random() < 0.6:
                symbol = random.choice(priority_symbols)
            else:
                symbol = all_syms[index % len(all_syms)]
            index += 1

            tick_payload = get_current_real_tick(symbol)
            await websocket.send_json(tick_payload)

            # Kirim alert HANYA jika terjadi pergerakan harian nyata yang signifikan (>= 3%)
            # dan data berasal dari sumber live/delayed (bukan synthetic)
            now_ts = time.time()
            chg_pct = abs(float(tick_payload.get("change_pct") or 0.0))
            if (
                tick_payload.get("data_source") in ("live", "delayed")
                and chg_pct >= 3.0
                and now_ts - alerted_symbols.get(symbol, 0) > 120
            ):
                alerted_symbols[symbol] = now_ts
                arah = "Bullish Surge" if tick_payload.get("change_pct", 0) > 0 else "Bearish Drop"
                await websocket.send_json({
                    "type": "ALERT",
                    "symbol": symbol,
                    "event": "VOLATILITY_MOVE",
                    "message": f"{arah} ({tick_payload['change_pct']:+.2f}% 24h) pada {symbol} @ {tick_payload['price']}",
                    "score": min(95, int(70 + chg_pct * 3)),
                    "price": tick_payload["price"],
                    "data_source": tick_payload.get("data_source"),
                    "timestamp": now_ts
                })

            await asyncio.sleep(1.0)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
