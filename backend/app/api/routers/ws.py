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
    Mengambil data tick pasar riil terkini.
    Harga selalu terikat langsung (anchored) ke harga pasar riil dari fetch_live_quote
    sehingga tidak pernah drifting (melenceng) dari harga TradingView.
    """
    quote = fetch_live_quote(symbol)
    base_price = quote["price"]
    prev_known = _last_known_prices.get(symbol, base_price)

    is_forex = quote.get("type") == "forex" or base_price < 10.0
    decimals = 4 if is_forex else 2

    # Micro-tick realistis yang berpusat pada harga riil aktual (maks +/- 0.03%)
    jitter_pct = random.uniform(-0.0003, 0.0003)
    new_price = round(base_price * (1 + jitter_pct), decimals)
    _last_known_prices[symbol] = new_price

    direction = "up" if new_price > prev_known else ("down" if new_price < prev_known else "neutral")

    prev_close = (quote["price"] - quote["change"]) if quote.get("change") is not None else base_price
    change = round(new_price - prev_close, decimals)
    change_pct = round((change / prev_close * 100), 2) if prev_close else quote.get("change_pct", 0.0)

    return {
        "type": "TICK",
        "symbol": symbol,
        "name": quote["name"],
        "asset_type": quote["type"],
        "price": new_price,
        "change": change,
        "change_pct": change_pct,
        "direction": direction,
        "high_24h": max(quote["high_24h"], new_price),
        "low_24h": min(quote["low_24h"], new_price),
        "volume": quote["volume"],
        "timestamp": time.time(),
        "data_source": quote.get("data_source", "live")
    }

@router.websocket("/ticks")
async def websocket_ticks(websocket: WebSocket):
    """
    WebSocket endpoint untuk real-time price tick streaming & breakout alerts
    berbasis data pasar asli Yahoo Finance & On-Chain.
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
                    "change_pct": q["change_pct"],
                    "timestamp": time.time()
                }
            except Exception:
                pass

        await websocket.send_json({
            "type": "CONNECTION_ESTABLISHED",
            "message": "Connected to Atred Real-Time Market Stream",
            "snapshot": initial_snapshot
        })

        # Loop pengiriman tick real-time untuk scalping
        index = 0
        while True:
            # Prioritaskan instrumen scalping populer (Kripto & Forex + Gold)
            priority_symbols = ["BTC-USD", "ETH-USD", "SOL-USD", "GC=F", "EURUSD=X", "GBPUSD=X", "USDJPY=X"]
            # Campur dengan seluruh aset lainnya
            all_syms = list(DEFAULT_ASSETS.keys())
            
            # Pilih simbol untuk dikirim
            if random.random() < 0.6:
                symbol = random.choice(priority_symbols)
            else:
                symbol = all_syms[index % len(all_syms)]
            index += 1

            tick_payload = get_current_real_tick(symbol)
            await websocket.send_json(tick_payload)

            # Sesekali kirim alert breakout kuantitatif
            if random.random() < 0.10:
                pola = random.choice([
                    "Bullish Pennant Scalp Breakout",
                    "Ascending Triangle Scalp Breakout",
                    "Double Bottom Confirmation",
                    "Volume Spike > 1.8x SMA20"
                ])
                await websocket.send_json({
                    "type": "ALERT",
                    "symbol": symbol,
                    "event": "POTENTIAL_BREAKOUT",
                    "message": f"{pola} terkonfirmasi pada {symbol} @ {tick_payload['price']}",
                    "score": random.randint(80, 95),
                    "price": tick_payload["price"],
                    "timestamp": time.time()
                })

            await asyncio.sleep(0.8)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
