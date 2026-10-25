import pandas as pd
import numpy as np
import httpx
import time
from datetime import datetime, timedelta
import random
from concurrent.futures import ThreadPoolExecutor

# Cache memory sederhana
_cache = {}
_live_cache = {}
_last_good_quote = {}
_QUOTE_TTL = 5.0  # Durasi cache live quote (detik)

# ---------------------------------------------------------------------------
# FASE 0 - Kejujuran Data
# ---------------------------------------------------------------------------
# Setiap respons harga/OHLCV wajib membawa:
#   data_source : "live" | "delayed" | "cache" | "synthetic"
#   last_updated: unix timestamp (detik) dari data pasar terakhir (bukan waktu server)
DATA_SOURCE_LIVE = "live"
DATA_SOURCE_DELAYED = "delayed"
DATA_SOURCE_CACHE = "cache"
DATA_SOURCE_SYNTHETIC = "synthetic"

# Sumber yang boleh dipakai untuk sinyal/TP/SL. Synthetic SELALU diblokir.
TRADEABLE_SOURCES = {DATA_SOURCE_LIVE, DATA_SOURCE_DELAYED, DATA_SOURCE_CACHE}

# Umur data (detik) di atas ini dianggap tertunda untuk aset 24/7 (kripto)
_CRYPTO_STALE_SECONDS = 15 * 60


def is_tradeable_source(data_source: str) -> bool:
    """True jika data boleh dipakai untuk sinyal / screener / TP-SL."""
    return str(data_source or "").lower() in TRADEABLE_SOURCES


def _is_known_delayed_symbol(sym: str) -> bool:
    """Bursa yang feed Yahoo-nya tertunda (IDX ~15 menit, indeks)."""
    s = str(sym or "").upper()
    return s.endswith(".JK") or s.startswith("^")


def _classify_live_source(sym: str, asset_type: str, last_updated) -> str:
    """Tentukan live vs delayed dari simbol dan umur data pasar."""
    if _is_known_delayed_symbol(sym):
        return DATA_SOURCE_DELAYED
    if last_updated and asset_type == "crypto":
        if time.time() - float(last_updated) > _CRYPTO_STALE_SECONDS:
            return DATA_SOURCE_DELAYED
    return DATA_SOURCE_LIVE


def get_data_limitations(symbol: str, interval: str = None) -> list[str]:
    """Catatan keterbatasan sumber data yang wajib ditampilkan di UI."""
    sym = resolve_symbol(symbol)
    meta = DEFAULT_ASSETS.get(sym, {})
    notes = []
    if sym.endswith(".JK"):
        notes.append("Saham IDX via Yahoo Finance tertunda ~15 menit.")
    if sym.startswith("^"):
        notes.append("Data indeks via Yahoo Finance dapat tertunda ~15 menit.")
    if sym == "GC=F":
        notes.append("GC=F adalah kontrak futures emas COMEX, bukan spot XAUUSD (ada selisih harga & gap rollover).")
    if is_volume_meaningless(sym):
        notes.append("Volume forex dari Yahoo tidak bermakna (tidak ada volume terpusat); anomali volume dinonaktifkan.")
    if meta.get("type") == "crypto":
        notes.append("Harga kripto Yahoo adalah agregat spot, bukan harga bursa/perpetual tertentu (tidak ada funding/mark price).")
    if interval and interval.lower() in ("1m", "2m", "5m", "15m", "30m"):
        notes.append("Data intraday < 1 jam dari Yahoo hanya tersedia ~60 hari terakhir; histori similarity terbatas.")
    if interval and interval.lower() == "1s":
        notes.append("Timeframe 1 detik TIDAK tersedia dari Yahoo Finance; candle 1s adalah SIMULASI.")
    return notes


def is_volume_meaningless(symbol: str) -> bool:
    """Volume forex spot (=X) tidak bermakna. Gold futures (GC=F) punya volume nyata."""
    sym = resolve_symbol(symbol)
    return sym.endswith("=X")


def build_data_status(data_source: str, last_updated=None, symbol: str = None, interval: str = None) -> dict:
    """Objek status data standar untuk dikirim ke frontend."""
    src = str(data_source or DATA_SOURCE_SYNTHETIC).lower()
    age = None
    if last_updated:
        try:
            age = max(0, int(time.time() - float(last_updated)))
        except Exception:
            age = None
    tradeable = is_tradeable_source(src)
    return {
        "data_source": src,
        "last_updated": float(last_updated) if last_updated else None,
        "age_seconds": age,
        "is_tradeable": tradeable,
        "warning": None if tradeable else "DATA SIMULASI - JANGAN DIPAKAI UNTUK ENTRY",
        "limitations": get_data_limitations(symbol, interval) if symbol else [],
    }


def df_data_status(df: pd.DataFrame, symbol: str = None, interval: str = None) -> dict:
    attrs = getattr(df, "attrs", {}) or {}
    return build_data_status(attrs.get("data_source", DATA_SOURCE_SYNTHETIC), attrs.get("last_updated"), symbol, interval)

ASSET_ALIASES = {
    # Commodities & Gold
    "XAUUSD": "GC=F",
    "XAUUSD=X": "GC=F",
    "GOLD": "GC=F",
    "XAU-USD": "GC=F",
    "XAU": "GC=F",
    
    # Major Crypto (Plain ticker or USDT pair -> -USD)
    "BTC": "BTC-USD",
    "BTCUSDT": "BTC-USD",
    "ETH": "ETH-USD",
    "ETHUSDT": "ETH-USD",
    "SOL": "SOL-USD",
    "SOLUSDT": "SOL-USD",
    "AVAX": "AVAX-USD",
    "AVAXUSDT": "AVAX-USD",
    "BNB": "BNB-USD",
    "BNBUSDT": "BNB-USD",
    "XRP": "XRP-USD",
    "XRPUSDT": "XRP-USD",
    "ADA": "ADA-USD",
    "ADAUSDT": "ADA-USD",
    "DOGE": "DOGE-USD",
    "DOGEUSDT": "DOGE-USD",
    "NEAR": "NEAR-USD",
    "NEARUSDT": "NEAR-USD",
    "LINK": "LINK-USD",
    "LINKUSDT": "LINK-USD",
    "DOT": "DOT-USD",
    "SUI": "SUI-USD",
    "APT": "APT-USD",
    "PEPE": "PEPE-USD",
    "SHIB": "SHIB-USD",
    
    # Forex Pairs
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "USDJPY=X",
    "AUDUSD": "AUDUSD=X",
    "USDCHF": "USDCHF=X",
    "EUR/USD": "EURUSD=X",
    "GBP/USD": "GBPUSD=X",
    "USD/JPY": "USDJPY=X",
    "AUD/USD": "AUDUSD=X",
    "USD/CHF": "USDCHF=X",
}

def resolve_symbol(symbol: str) -> str:
    if not symbol:
        return "BTC-USD"
    s = str(symbol).upper().strip()
    s = s.replace("/", "").replace(" ", "").replace(".P", "").replace("-PERP", "")
    
    if s in ASSET_ALIASES:
        return ASSET_ALIASES[s]
    if s in DEFAULT_ASSETS:
        return s
        
    # Handle USDT suffixes (e.g. AVAXUSDT -> AVAX-USD)
    if s.endswith("USDT"):
        base = s[:-4]
        if f"{base}-USD" in DEFAULT_ASSETS or len(base) <= 6:
            return f"{base}-USD"
            
    # Handle USD suffixes without hyphen (e.g. AVAXUSD -> AVAX-USD)
    if s.endswith("USD") and not s.endswith("-USD") and not s.startswith("USD"):
        base = s[:-3]
        if f"{base}-USD" in DEFAULT_ASSETS or len(base) <= 6:
            return f"{base}-USD"
            
    # If base exists in DEFAULT_ASSETS with -USD
    if f"{s}-USD" in DEFAULT_ASSETS:
        return f"{s}-USD"
        
    # If forex pair without =X
    if f"{s}=X" in DEFAULT_ASSETS:
        return f"{s}=X"
        
    # Fallback heuristic: 2-6 character ticker is likely crypto on Yahoo
    if len(s) <= 6 and not s.endswith("=X") and not s.endswith("=F") and not s.endswith("-USD"):
        return f"{s}-USD"
        
    return s

DEFAULT_ASSETS = {
    # Crypto
    "BTC-USD": {"name": "Bitcoin", "type": "crypto", "yf": "BTC-USD", "base_price": 85500.0},
    "ETH-USD": {"name": "Ethereum", "type": "crypto", "yf": "ETH-USD", "base_price": 2500.0},
    "SOL-USD": {"name": "Solana", "type": "crypto", "yf": "SOL-USD", "base_price": 120.0},
    "AVAX-USD": {"name": "Avalanche", "type": "crypto", "yf": "AVAX-USD", "base_price": 11.50},
    "BNB-USD": {"name": "BNB", "type": "crypto", "yf": "BNB-USD", "base_price": 780.0},
    "XRP-USD": {"name": "XRP", "type": "crypto", "yf": "XRP-USD", "base_price": 2.45},
    "ADA-USD": {"name": "Cardano", "type": "crypto", "yf": "ADA-USD", "base_price": 0.85},
    "DOGE-USD": {"name": "Dogecoin", "type": "crypto", "yf": "DOGE-USD", "base_price": 0.20},
    "NEAR-USD": {"name": "NEAR Protocol", "type": "crypto", "yf": "NEAR-USD", "base_price": 4.50},
    "LINK-USD": {"name": "Chainlink", "type": "crypto", "yf": "LINK-USD", "base_price": 15.0},
    
    # Forex & Gold
    "GC=F": {"name": "Gold / USD (XAU/USD)", "type": "forex", "yf": "GC=F", "base_price": 2900.0},
    "EURUSD=X": {"name": "EUR / USD", "type": "forex", "yf": "EURUSD=X", "base_price": 1.1618},
    "GBPUSD=X": {"name": "GBP / USD", "type": "forex", "yf": "GBPUSD=X", "base_price": 1.3350},
    "USDJPY=X": {"name": "USD / JPY", "type": "forex", "yf": "USDJPY=X", "base_price": 156.40},
    "AUDUSD=X": {"name": "AUD / USD", "type": "forex", "yf": "AUDUSD=X", "base_price": 0.7050},
    "USDCHF=X": {"name": "USD / CHF", "type": "forex", "yf": "USDCHF=X", "base_price": 0.8350},
}

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

def generate_synthetic_ohlcv(symbol: str, count: int = 120, base_price: float = 100.0, is_intraday: bool = False, step_seconds: int = 86400) -> pd.DataFrame:
    """
    Membuat data time-series realistis dengan pola harga geometris (triangles / breakout)
    sebagai fallback instan ketika koneksi eksternal lambat atau timeout.
    """
    now = datetime.now()
    if is_intraday:
        times = [int((now - timedelta(seconds=(count - i) * step_seconds)).timestamp()) for i in range(count)]
    else:
        dates = [now - timedelta(days=(count - i)) for i in range(count)]
        times = [d.strftime("%Y-%m-%d") for d in dates]
    
    np.random.seed(abs(hash(symbol)) % 100000)
    # Drift random walk
    returns = np.random.normal(0.001, 0.018, count)
    # Buat konsolidasi atau pola di 30 candle terakhir
    returns[-30:] = np.random.normal(0.0002, 0.008, 30)
    
    price = base_price
    prices = []
    for r in returns:
        price = max(0.01, price * (1 + r))
        prices.append(price)
        
    prices = np.array(prices)
    highs = prices * (1 + np.abs(np.random.normal(0.005, 0.004, count)))
    lows = prices * (1 - np.abs(np.random.normal(0.005, 0.004, count)))
    opens = prices * (1 + np.random.normal(0, 0.003, count))
    closes = prices
    
    # Volume dengan lonjakan di candle terakhir (Volume anomaly)
    volumes = np.random.exponential(scale=1000000, size=count)
    if "JK" in symbol:
        volumes *= 5
    elif "USD=X" in symbol:
        volumes *= 10
    if len(symbol) % 2 == 0:
        volumes[-1] *= 2.2
        
    df = pd.DataFrame({
        "Time": times,
        "Open": np.round(opens, 4 if base_price < 10 else 2),
        "High": np.round(highs, 4 if base_price < 10 else 2),
        "Low": np.round(lows, 4 if base_price < 10 else 2),
        "Close": np.round(closes, 4 if base_price < 10 else 2),
        "Volume": np.round(volumes, 0)
    })
    return df


import urllib.parse

_client = httpx.Client(
    timeout=2.5,
    headers=HTTP_HEADERS,
    follow_redirects=True,
    limits=httpx.Limits(max_keepalive_connections=20, max_connections=30)
)

def _fetch_direct_yahoo_chart(yf_symbol: str, range_param: str = "3mo", interval: str = "1d", timeout: float = 4.5):
    """
    Mengambil data chart OHLCV langsung dari endpoint Yahoo Finance API (v8)
    yang super cepat (~150ms) dan tidak bergantung pada scraping lambat.
    """
    safe_symbol = urllib.parse.quote(yf_symbol, safe="")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{safe_symbol}?interval={interval}&range={range_param}"
    # Retry dengan exponential backoff untuk mengurangi dampak rate-limit (429) / timeout
    max_attempts = 2
    for attempt in range(max_attempts):
        try:
            resp = _client.get(url, timeout=timeout)
            if resp.status_code == 200:
                data = resp.json()
                result = data.get("chart", {}).get("result")
                if result and len(result) > 0:
                    return result[0]
                return None
            if resp.status_code not in (429, 500, 502, 503, 504):
                return None
        except Exception:
            pass
        if attempt < max_attempts - 1:
            time.sleep(0.5 * (2 ** attempt) + random.uniform(0, 0.25))
    return None


def fetch_live_quote(symbol: str) -> dict:
    """
    Mengambil harga real-time aktual instrumen tunggal (dengan cache 5 detik).
    """
    now_ts = datetime.now().timestamp()
    if symbol in _live_cache:
        cached_data, ts = _live_cache[symbol]
        if now_ts - ts < _QUOTE_TTL:
            return cached_data

    resolved_sym = resolve_symbol(symbol)
    if resolved_sym in _live_cache:
        cached_data, ts = _live_cache[resolved_sym]
        if now_ts - ts < _QUOTE_TTL:
            return cached_data

    meta = DEFAULT_ASSETS.get(resolved_sym, {"name": resolved_sym, "type": "crypto" if "-USD" in resolved_sym else "forex", "yf": resolved_sym, "base_price": 100.0})
    yf_symbol = meta.get("yf", resolved_sym)

    chart_data = _fetch_direct_yahoo_chart(yf_symbol, range_param="5d", interval="1d", timeout=3.5)
    if chart_data and "meta" in chart_data:
        m = chart_data["meta"]
        price = m.get("regularMarketPrice")
        prev_close = m.get("chartPreviousClose") or m.get("previousClose") or price
        market_time = m.get("regularMarketTime")
        
        # Fallback harga jika regularMarketPrice kosong (ambil close terakhir yang NYATA)
        if price is None:
            quotes = chart_data.get("indicators", {}).get("quote", [{}])[0]
            closes = [c for c in quotes.get("close", []) if c is not None]
            if closes:
                price = closes[-1]
                prev_close = closes[-2] if len(closes) > 1 else price
            else:
                price = None

    if chart_data and "meta" in chart_data and price is not None:

        change = (price - prev_close) if prev_close else 0.0
        change_pct = (change / prev_close * 100) if prev_close else 0.0

        high_24h = m.get("regularMarketDayHigh") or price
        low_24h = m.get("regularMarketDayLow") or price
        volume = m.get("regularMarketVolume") or 0

        # Jika forex mata uang, format 4 desimal; jika Gold atau kripto, 2 desimal
        is_gold = resolved_sym in ["GC=F", "XAUUSD=X", "XAUUSD", "GOLD"]
        is_forex = (meta.get("type") == "forex" and not is_gold) or (price < 10.0 and not is_gold)
        decimals = 4 if is_forex else 2

        quote_res = {
            "symbol": resolved_sym,
            "name": meta.get("name", resolved_sym),
            "type": meta.get("type", "crypto" if "-USD" in resolved_sym else "forex"),
            "price": round(float(price), decimals),
            "change": round(float(change), decimals),
            "change_pct": round(float(change_pct), 2),
            "high_24h": round(float(high_24h), decimals),
            "low_24h": round(float(low_24h), decimals),
            "volume": float(volume),
            "timestamp": now_ts,
            "last_updated": float(market_time) if market_time else now_ts,
            "data_source": _classify_live_source(resolved_sym, meta.get("type"), market_time),
        }
        _live_cache[resolved_sym] = (quote_res, now_ts)
        _live_cache[symbol] = (quote_res, now_ts)
        _last_good_quote[resolved_sym] = quote_res
        return quote_res

    # Fallback 1: quote nyata terakhir yang pernah berhasil (ditandai CACHE)
    if resolved_sym in _last_good_quote:
        stale = dict(_last_good_quote[resolved_sym])
        stale["data_source"] = DATA_SOURCE_CACHE
        stale["timestamp"] = now_ts
        _live_cache[resolved_sym] = (stale, now_ts)
        _live_cache[symbol] = (stale, now_ts)
        return stale

    # Fallback 2: SIMULASI (harga referensi statis, BUKAN harga pasar)
    base_p = meta.get("base_price", 100.0)
    is_gold = resolved_sym in ["GC=F", "XAUUSD=X", "XAUUSD", "GOLD"]
    is_forex = (meta.get("type") == "forex" and not is_gold) or (base_p < 10.0 and not is_gold)
    decimals = 4 if is_forex else 2
    quote_res = {
        "symbol": resolved_sym,
        "name": meta.get("name", resolved_sym),
        "type": meta.get("type", "crypto" if "-USD" in resolved_sym else "forex"),
        "price": round(float(base_p), decimals),
        "change": 0.0,
        "change_pct": 0.0,
        "high_24h": round(base_p * 1.01, decimals),
        "low_24h": round(base_p * 0.99, decimals),
        "volume": 0.0,
        "timestamp": now_ts,
        "last_updated": None,
        "data_source": DATA_SOURCE_SYNTHETIC
    }
    _live_cache[resolved_sym] = (quote_res, now_ts)
    _live_cache[symbol] = (quote_res, now_ts)
    return quote_res


def fetch_live_quotes(symbols: list[str]) -> dict[str, dict]:
    """
    Mengambil sekumpulan live quotes secara paralel dan cepat.
    """
    results = {}
    with ThreadPoolExecutor(max_workers=min(8, len(symbols))) as executor:
        futures = {executor.submit(fetch_live_quote, s): s for s in symbols}
        for f in futures:
            try:
                q = f.result()
                results[q["symbol"]] = q
            except Exception:
                pass
    return results


TIMEFRAME_CONFIG = {
    # Ultra-Fast Scalping (1 Detik)
    "1s": {"interval": "1s", "range": "1h", "count": 150, "is_intraday": True, "step": 1},
    
    # Primary Scalping Timeframes (Diutamakan pada menu)
    "1m": {"interval": "1m", "range": "1d", "count": 150, "is_intraday": True, "step": 60},
    "5m": {"interval": "5m", "range": "1d", "count": 150, "is_intraday": True, "step": 300},
    "15m": {"interval": "15m", "range": "5d", "count": 150, "is_intraday": True, "step": 900},
    "30m": {"interval": "30m", "range": "5d", "count": 160, "is_intraday": True, "step": 1800},
    "1h": {"interval": "1h", "range": "1mo", "count": 160, "is_intraday": True, "step": 3600},
    "4h": {"interval": "4h", "range": "3mo", "count": 180, "is_intraday": True, "step": 14400},
    
    # Maximum Boundary (1 Hari)
    "1d": {"interval": "1d", "range": "3mo", "count": 90, "is_intraday": False, "step": 86400},
}

def fetch_ohlcv(symbol: str, period: str = "5m", interval: str = None, force_live: bool = True) -> pd.DataFrame:
    """
    Mengambil data OHLCV historis real-time dengan caching in-memory.
    Fokus pada scalping 1 detik (1s) hingga 1 hari (1d).
    """
    resolved_sym = resolve_symbol(symbol)
    period_lower = period.lower()
    tf_info = TIMEFRAME_CONFIG.get(
        period_lower,
        TIMEFRAME_CONFIG.get(
            interval.lower() if interval else "",
            {"interval": interval or "5m", "range": "1d", "count": 150, "is_intraday": True, "step": 300}
        )
    )
    eff_interval = interval or tf_info["interval"]
    eff_range = tf_info["range"]
    is_intraday = tf_info["is_intraday"]

    cache_key = f"{resolved_sym}_{period}_{eff_interval}_{eff_range}"
    now_ts = datetime.now().timestamp()

    asset_meta = DEFAULT_ASSETS.get(resolved_sym, {"name": resolved_sym, "type": "crypto" if "-USD" in resolved_sym else "forex", "yf": resolved_sym, "base_price": 100.0})
    is_gold = resolved_sym in ["GC=F", "XAUUSD=X", "XAUUSD", "GOLD"]
    decimals = 2 if (is_gold or asset_meta.get("type") == "crypto") else 4

    # TTL caching: kilat untuk 1s dan intraday
    ttl = 3 if eff_interval == "1s" else (10 if eff_interval in ["1m", "5m"] else (25 if is_intraday else 120))
    if cache_key in _cache:
        data, ts = _cache[cache_key]
        if now_ts - ts < ttl:
            return data.copy()

    # (0) Khusus 1-detik (1s) Scalping Engine
    if eff_interval == "1s" or period_lower == "1s":
        quote = fetch_live_quote(resolved_sym)
        anchor_price = float(quote.get("price") or asset_meta.get("base_price", 100.0))
        count = tf_info.get("count", 150)
        now_int = int(now_ts)
        times = [now_int - (count - 1 - i) for i in range(count)]

        np.random.seed(int(now_ts * 10) % 100000)
        volatility = 0.00012  # micro-tick ~0.012% per detik
        returns = np.random.normal(0, volatility, count)

        cum_returns = np.cumsum(returns)
        drift = cum_returns - cum_returns[-1]
        closes = anchor_price * (1 + drift)

        highs = closes * (1 + np.abs(np.random.normal(0, volatility * 0.7, count)))
        lows = closes * (1 - np.abs(np.random.normal(0, volatility * 0.7, count)))
        opens = np.roll(closes, 1)
        opens[0] = closes[0] * (1 + np.random.normal(0, volatility * 0.4))

        highs = np.maximum(highs, np.maximum(opens, closes))
        lows = np.minimum(lows, np.minimum(opens, closes))
        volumes = np.random.exponential(scale=35, size=count) + 5

        df = pd.DataFrame({
            "Time": times,
            "Open": np.round(opens, decimals),
            "High": np.round(highs, decimals),
            "Low": np.round(lows, decimals),
            "Close": np.round(closes, decimals),
            "Volume": np.round(volumes, 0)
        })
        df.attrs["data_source"] = DATA_SOURCE_SYNTHETIC
        df.attrs["last_updated"] = now_ts
        _cache[cache_key] = (df, now_ts)
        return df

    yf_symbol = asset_meta.get("yf", resolved_sym)

    # (1) Coba Direct Yahoo Chart API
    if force_live:
        try:
            chart_res = _fetch_direct_yahoo_chart(yf_symbol, range_param=eff_range, interval=eff_interval, timeout=3.5)
            if chart_res and "timestamp" in chart_res and "indicators" in chart_res:
                timestamps = chart_res["timestamp"]
                quote = chart_res["indicators"]["quote"][0]
                market_time = chart_res.get("meta", {}).get("regularMarketTime") or (timestamps[-1] if timestamps else now_ts)
                
                opens = quote.get("open", [])
                highs = quote.get("high", [])
                lows = quote.get("low", [])
                closes = quote.get("close", [])
                volumes = quote.get("volume", [])
                
                if is_intraday:
                    times = [int(ts) for ts in timestamps]
                else:
                    times = [datetime.fromtimestamp(ts).strftime("%Y-%m-%d") for ts in timestamps]
                
                df = pd.DataFrame({
                    "Time": times,
                    "Open": opens,
                    "High": highs,
                    "Low": lows,
                    "Close": closes,
                    "Volume": volumes
                }).dropna(subset=["Close"])
                
                # Pastikan bebas duplikat timestamp & terurut strictly increasing
                df = df.drop_duplicates(subset=["Time"], keep="last").sort_values("Time").reset_index(drop=True)
                df["Open"] = df["Open"].fillna(df["Close"])
                df["High"] = df["High"].fillna(df[["Open", "Close"]].max(axis=1))
                df["Low"] = df["Low"].fillna(df[["Open", "Close"]].min(axis=1))
                
                if len(df) >= 10:
                    dec = 2 if (is_gold or asset_meta.get("type") == "crypto" or df["Close"].iloc[-1] >= 10.0) else 4
                    df["Open"] = df["Open"].round(dec)
                    df["High"] = df["High"].round(dec)
                    df["Low"] = df["Low"].round(dec)
                    df["Close"] = df["Close"].round(dec)
                    df["Volume"] = df["Volume"].fillna(0).round(0)
                    
                    df.attrs["data_source"] = _classify_live_source(resolved_sym, asset_meta.get("type"), market_time)
                    df.attrs["last_updated"] = float(market_time) if market_time else now_ts
                    _cache[cache_key] = (df, now_ts)
                    return df
        except Exception:
            pass

    # (2) Fallback sintetis berkualitas tinggi jika koneksi luar terkendala
    base_p = asset_meta.get("base_price", 100.0)
    try:
        live_q = fetch_live_quote(resolved_sym)
        if live_q and live_q.get("price") and is_tradeable_source(live_q.get("data_source")):
            base_p = float(live_q["price"])
    except Exception:
        pass
    count = tf_info.get("count", 150)
    step = tf_info.get("step", 300)
    df = generate_synthetic_ohlcv(resolved_sym, count=count, base_price=base_p, is_intraday=is_intraday, step_seconds=step)
    df.attrs["data_source"] = DATA_SOURCE_SYNTHETIC
    df.attrs["last_updated"] = None
    _cache[cache_key] = (df, now_ts)
    return df


def get_asset_overview(symbol: str):
    """
    Mendapatkan ringkasan pasar real-time terbaru untuk instrumen.
    """
    quote = fetch_live_quote(symbol)
    src = quote.get("data_source", DATA_SOURCE_LIVE)
    last_upd = quote.get("last_updated")
    return {
        "symbol": symbol,
        "name": quote["name"],
        "type": quote["type"],
        "price": quote["price"],
        "change": quote["change"],
        "change_pct": quote["change_pct"],
        "high_24h": quote["high_24h"],
        "low_24h": quote["low_24h"],
        "volume": quote["volume"],
        "volume_24h": quote["volume"],
        "last_updated": last_upd,
        "data_source": src,
        "data_status": build_data_status(src, last_upd, symbol),
    }
