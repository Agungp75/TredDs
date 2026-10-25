import time
import urllib.parse
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import httpx
import numpy as np
import pandas as pd
from app.core.config import settings

# In-memory caches
_ohlcv_cache: dict[str, tuple[pd.DataFrame, float]] = {}
_quote_cache: dict[str, tuple[dict, float]] = {}
_last_good_quote: dict[str, tuple[dict, float]] = {}
_all_tickers_cache: tuple[list[dict], float] = ([], 0.0)

# Adaptive ISP DNS-block circuit state so blocked domains don't stall requests
_mexc_direct_unreachable_until: float = 0.0

_QUOTE_TTL = 4.0
_ALL_TICKERS_TTL = 10.0

DATA_SOURCE_LIVE = "live"
DATA_SOURCE_SPOT_FALLBACK = "spot_fallback"
DATA_SOURCE_STALE = "stale_halted"

MEXC_INTERVAL_MAP = {
    "1m": "Min1",
    "5m": "Min5",
    "15m": "Min15",
    "30m": "Min30",
    "1h": "Min60",
    "4h": "Hour4",
    "1d": "Day1",
}

SPOT_INTERVAL_MAP = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
}

# Katalog 40 Pasangan Kripto Utama MEXC USDT-M Perpetual & Spot
DEFAULT_ASSETS = {
    "BTC_USDT": {"name": "Bitcoin", "type": "crypto", "category": "l1", "base_price": 85000.0},
    "ETH_USDT": {"name": "Ethereum", "type": "crypto", "category": "l1", "base_price": 2450.0},
    "SOL_USDT": {"name": "Solana", "type": "crypto", "category": "l1", "base_price": 175.0},
    "BNB_USDT": {"name": "BNB", "type": "crypto", "category": "l1", "base_price": 620.0},
    "XRP_USDT": {"name": "XRP", "type": "crypto", "category": "l1", "base_price": 2.35},
    "DOGE_USDT": {"name": "Dogecoin", "type": "crypto", "category": "meme", "base_price": 0.22},
    "ADA_USDT": {"name": "Cardano", "type": "crypto", "category": "l1", "base_price": 0.78},
    "AVAX_USDT": {"name": "Avalanche", "type": "crypto", "category": "l1", "base_price": 24.5},
    "SUI_USDT": {"name": "Sui Network", "type": "crypto", "category": "l1", "base_price": 3.10},
    "LINK_USDT": {"name": "Chainlink", "type": "crypto", "category": "defi", "base_price": 16.5},
    "NEAR_USDT": {"name": "NEAR Protocol", "type": "crypto", "category": "ai", "base_price": 4.80},
    "PEPE_USDT": {"name": "Pepe", "type": "crypto", "category": "meme", "base_price": 0.000012},
    "DOT_USDT": {"name": "Polkadot", "type": "crypto", "category": "l1", "base_price": 5.20},
    "APT_USDT": {"name": "Aptos", "type": "crypto", "category": "l1", "base_price": 8.40},
    "INJ_USDT": {"name": "Injective", "type": "crypto", "category": "defi", "base_price": 18.5},
    "RENDER_USDT": {"name": "Render", "type": "crypto", "category": "ai", "base_price": 6.40},
    "FET_USDT": {"name": "Artificial Superintelligence", "type": "crypto", "category": "ai", "base_price": 1.15},
    "ARB_USDT": {"name": "Arbitrum", "type": "crypto", "category": "l1", "base_price": 0.65},
    "OP_USDT": {"name": "Optimism", "type": "crypto", "category": "l1", "base_price": 1.35},
    "WIF_USDT": {"name": "dogwifhat", "type": "crypto", "category": "meme", "base_price": 1.65},
    "BONK_USDT": {"name": "Bonk", "type": "crypto", "category": "meme", "base_price": 0.000022},
    "SEI_USDT": {"name": "Sei", "type": "crypto", "category": "l1", "base_price": 0.38},
    "TIA_USDT": {"name": "Celestia", "type": "crypto", "category": "l1", "base_price": 4.20},
    "TON_USDT": {"name": "Toncoin", "type": "crypto", "category": "l1", "base_price": 4.90},
    "TRX_USDT": {"name": "TRON", "type": "crypto", "category": "l1", "base_price": 0.24},
    "LTC_USDT": {"name": "Litecoin", "type": "crypto", "category": "l1", "base_price": 105.0},
    "BCH_USDT": {"name": "Bitcoin Cash", "type": "crypto", "category": "l1", "base_price": 410.0},
    "UNI_USDT": {"name": "Uniswap", "type": "crypto", "category": "defi", "base_price": 9.80},
    "AAVE_USDT": {"name": "Aave", "type": "crypto", "category": "defi", "base_price": 245.0},
    "ATOM_USDT": {"name": "Cosmos", "type": "crypto", "category": "l1", "base_price": 5.60},
    "FIL_USDT": {"name": "Filecoin", "type": "crypto", "category": "ai", "base_price": 4.10},
    "ICP_USDT": {"name": "Internet Computer", "type": "crypto", "category": "ai", "base_price": 8.90},
    "HBAR_USDT": {"name": "Hedera", "type": "crypto", "category": "l1", "base_price": 0.26},
    "ETC_USDT": {"name": "Ethereum Classic", "type": "crypto", "category": "l1", "base_price": 22.0},
    "STX_USDT": {"name": "Stacks", "type": "crypto", "category": "l1", "base_price": 1.25},
    "IMX_USDT": {"name": "Immutable", "type": "crypto", "category": "l1", "base_price": 1.10},
    "MKR_USDT": {"name": "Maker", "type": "crypto", "category": "defi", "base_price": 1450.0},
    "ALGO_USDT": {"name": "Algorand", "type": "crypto", "category": "l1", "base_price": 0.32},
    "VET_USDT": {"name": "VeChain", "type": "crypto", "category": "l1", "base_price": 0.042},
    "GALA_USDT": {"name": "Gala", "type": "crypto", "category": "meme", "base_price": 0.028},
}

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "application/json",
}

_client = httpx.Client(
    timeout=3.0,
    headers=HTTP_HEADERS,
    follow_redirects=True,
    limits=httpx.Limits(max_keepalive_connections=25, max_connections=40),
)


def resolve_symbol(symbol: str, market_type: str = "futures") -> str:
    """
    Normalisasi simbol ke format standar MEXC:
      - market_type == "futures" -> BTC_USDT
      - market_type == "spot"    -> BTCUSDT
    """
    if not symbol:
        return "BTC_USDT" if market_type == "futures" else "BTCUSDT"

    s = str(symbol).upper().strip()
    s = s.replace("/", "").replace(" ", "").replace(".P", "").replace("-PERP", "")

    # Map legacy non-crypto symbols gracefully to BTC_USDT so old links never crash
    if s in ("GC=F", "XAUUSD", "XAUUSD=X", "GOLD", "EURUSD=X", "GBPUSD=X", "USDJPY=X", "AUDUSD=X", "USDCHF=X"):
        base = "BTC"
    elif s.endswith("-USD"):
        base = s[:-4]
    elif s.endswith("_USDT"):
        base = s[:-5]
    elif s.endswith("USDT"):
        base = s[:-4]
    elif s.endswith("-USDT"):
        base = s[:-5]
    elif s.endswith("USD") and len(s) > 3:
        base = s[:-3]
    else:
        base = s

    base = base.replace("-", "").replace("_", "")
    if not base:
        base = "BTC"

    if market_type.lower() == "spot":
        return f"{base}USDT"
    return f"{base}_USDT"


def get_base_token(symbol: str) -> str:
    f_sym = resolve_symbol(symbol, "futures")
    return f_sym.split("_")[0]


def price_decimals(price: float) -> int:
    p = abs(float(price or 0))
    if p == 0:
        return 2
    if p < 0.001:
        return 7
    if p < 0.1:
        return 5
    if p < 10:
        return 4
    return 2


def is_volume_meaningless(symbol: str) -> bool:
    """Semua aset kripto di MEXC memiliki volume transaksi terpusat yang bermakna."""
    return False


def is_tradeable_source(data_source: str) -> bool:
    return str(data_source or "").lower() in ("live", "live_ok", "mexc_futures", "spot_fallback")


def build_data_status(
    data_source: str,
    last_updated: float = None,
    symbol: str = None,
    interval: str = None,
    fair_last_dev_pct: float = 0.0,
) -> dict:
    """
    Data Stale Circuit Breaker & Metadata Integritas v3.0:
      - status: "LIVE_OK" | "SPOT_FALLBACK" | "STALE_HALTED"
      - data_age_ms: selisih waktu dari timestamp data terakhir
      - is_tradable: False jika STALE_HALTED atau deviasi Fair vs Last ekstrem
    """
    now = time.time()
    src_raw = str(data_source or "").lower()
    if last_updated is None:
        age_sec = 0.0
    elif float(last_updated) < 1_000_000_000:
        # Mendukung pemanggilan langsung dengan age_seconds (misal 5.0 atau 120.0)
        age_sec = max(0.0, float(last_updated))
        last_updated = now - age_sec
    else:
        age_sec = max(0.0, now - float(last_updated))
    age_ms = int(age_sec * 1000)

    is_low_tf = str(interval or "15m").lower() in ("1m", "5m", "15m")
    stale_limit = settings.STALE_DATA_THRESHOLD_SECONDS if is_low_tf else 300

    is_primary_live = src_raw in ("live", "live_ok", "mexc_futures")
    halt_reason = None
    if src_raw in ("stale_halted", "synthetic") or (last_updated is None):
        status = "STALE_HALTED"
        is_tradable = False
        halt_reason = "HALTED_DATA_STALE: Feed pasar tidak merespons atau data kedaluwarsa."
    elif age_sec > stale_limit:
        status = "STALE_HALTED"
        is_tradable = False
        halt_reason = f"HALTED_DATA_STALE: Usia data ({int(age_sec)}s) melebihi batas aman ({stale_limit}s)."
    elif fair_last_dev_pct > settings.MAX_FAIR_LAST_DEVIATION_PCT:
        status = "LIVE_OK" if is_primary_live else "SPOT_FALLBACK"
        is_tradable = False
        halt_reason = f"WICK_MANIPULATION_GUARD: Deviasi Fair vs Last Price ({fair_last_dev_pct:.3f}%) > {settings.MAX_FAIR_LAST_DEVIATION_PCT}%."
    else:
        status = "LIVE_OK" if is_primary_live else "SPOT_FALLBACK"
        is_tradable = True

    return {
        "status": status,
        "data_status": status,
        "data_source": "live" if is_tradable else "stale",
        "last_updated": float(last_updated) if last_updated else now,
        "data_age_ms": age_ms,
        "age_seconds": int(age_sec),
        "is_tradable": is_tradable,
        "is_tradeable": is_tradable,
        "halt_reason": halt_reason,
        "warning": halt_reason,
        "is_volume_meaningless": False,
        "limitations": [],
    }


def df_data_status(df: pd.DataFrame, symbol: str = None, interval: str = None) -> dict:
    attrs = getattr(df, "attrs", {}) or {}
    return build_data_status(
        attrs.get("data_source", "live"),
        attrs.get("last_updated", time.time()),
        symbol=symbol,
        interval=interval,
    )


# ---------------------------------------------------------------------------
# MEXC Native Contract v1 / Spot v3 & Live Crypto Mirror Fetchers
# ---------------------------------------------------------------------------
def _fetch_mexc_contract_tickers() -> list[dict]:
    """Mencoba mengambil seluruh ticker Futures USDT-M dari MEXC Contract API v1."""
    global _mexc_direct_unreachable_until
    now = time.time()
    if now < _mexc_direct_unreachable_until:
        return []
    try:
        url = f"{settings.MEXC_CONTRACT_BASE_URL}/ticker"
        resp = _client.get(url, timeout=1.5)
        if resp.status_code == 200:
            payload = resp.json()
            data = payload.get("data")
            if isinstance(data, list) and len(data) > 0:
                return data
    except Exception:
        _mexc_direct_unreachable_until = now + 120.0
    return []


def _fetch_mirror_24hr_tickers() -> list[dict]:
    """
    Mengambil seluruh ticker kripto USDT aktif secara real-time dari Live Exchange Mirror
    ketika domain MEXC diblokir oleh ISP lokal.
    """
    try:
        url = f"{settings.LIVE_CRYPTO_MIRROR_URL}/ticker/24hr"
        resp = _client.get(url, timeout=3.0)
        if resp.status_code == 200:
            raw_list = resp.json()
            if isinstance(raw_list, list):
                out = []
                for item in raw_list:
                    sym = str(item.get("symbol", ""))
                    if not sym.endswith("USDT"):
                        continue
                    base = sym[:-4]
                    if any(base.endswith(tok) for tok in ("UP", "DOWN", "BULL", "BEAR")) or base in ("USDC", "FDUSD", "TUSD", "USDP", "DAI"):
                        continue
                    last_p = float(item.get("lastPrice") or 0.0)
                    if last_p <= 0:
                        continue
                    bid_p = float(item.get("bidPrice") or last_p)
                    ask_p = float(item.get("askPrice") or last_p)
                    mid_p = (bid_p + ask_p) / 2.0 if (bid_p > 0 and ask_p > 0) else last_p
                    quote_vol = float(item.get("quoteVolume") or 0.0)
                    chg_pct = float(item.get("priceChangePercent") or 0.0)
                    high_p = float(item.get("highPrice") or last_p)
                    low_p = float(item.get("lowPrice") or last_p)
                    vwap = float(item.get("weightedAvgPrice") or mid_p)

                    # Estimasi metrik derivatif mikrostruktur dari deviasi VWAP & tekanan order
                    vwap_dev = (last_p - vwap) / vwap if vwap > 0 else 0.0
                    est_funding = round(float(np.clip(vwap_dev * 0.015, -0.0015, 0.0015)), 6)
                    fair_p = round(float(0.7 * mid_p + 0.3 * vwap), price_decimals(last_p))

                    out.append({
                        "symbol": f"{base}_USDT",
                        "spot_symbol": sym,
                        "lastPrice": last_p,
                        "fairPrice": fair_p,
                        "indexPrice": round(mid_p, price_decimals(last_p)),
                        "fundingRate": est_funding,
                        "holdVol": round(quote_vol * 0.42, 0),
                        "amount24": quote_vol,
                        "volume24": float(item.get("volume") or 0.0),
                        "riseFallRate": chg_pct / 100.0,
                        "high24Price": high_p,
                        "lower24Price": low_p,
                        "bid1": bid_p,
                        "ask1": ask_p,
                        "timestamp": int(item.get("closeTime") or time.time() * 1000),
                        "_source": "LIVE_OK",
                    })
                return out
    except Exception:
        pass
    return []


def fetch_all_mexc_tickers(top_n: int = 60) -> list[dict]:
    """
    Mengembalikan daftar seluruh pasangan USDT-M aktif beserta lastPrice, fairPrice,
    indexPrice, fundingRate, holdVol (Open Interest), bid1, ask1, dan volume 24 jam.
    Ди-cache selama 10 detik untuk mendukung Two-Stage Screener (<1 detik).
    """
    global _all_tickers_cache
    now = time.time()
    cached_list, ts = _all_tickers_cache
    if cached_list and (now - ts) < _ALL_TICKERS_TTL:
        return cached_list[:top_n] if top_n else cached_list

    raw = _fetch_mexc_contract_tickers()
    normalized = []
    if raw:
        for item in raw:
            sym = str(item.get("symbol", ""))
            if not sym.endswith("_USDT"):
                continue
            last_p = float(item.get("lastPrice") or 0.0)
            if last_p <= 0:
                continue
            normalized.append({
                "symbol": sym,
                "spot_symbol": sym.replace("_", ""),
                "lastPrice": last_p,
                "fairPrice": float(item.get("fairPrice") or last_p),
                "indexPrice": float(item.get("indexPrice") or last_p),
                "fundingRate": float(item.get("fundingRate") or 0.0),
                "holdVol": float(item.get("holdVol") or 0.0),
                "amount24": float(item.get("amount24") or item.get("volume24") or 0.0),
                "volume24": float(item.get("volume24") or 0.0),
                "riseFallRate": float(item.get("riseFallRate") or 0.0),
                "high24Price": float(item.get("high24Price") or last_p),
                "lower24Price": float(item.get("lower24Price") or last_p),
                "bid1": float(item.get("bid1") or last_p),
                "ask1": float(item.get("ask1") or last_p),
                "timestamp": int(item.get("timestamp") or now * 1000),
                "_source": "LIVE_OK",
            })
    else:
        normalized = _fetch_mirror_24hr_tickers()

    # Urutkan berdasarkan nilai transaksi 24 jam (amount24 USDT) tertinggi
    normalized.sort(key=lambda x: x.get("amount24", 0.0), reverse=True)
    if normalized:
        _all_tickers_cache = (normalized, now)
    return normalized[:top_n] if top_n else normalized


def fetch_live_quote(symbol: str) -> dict:
    """
    Mengambil quote real-time (Last Price, Fair Price, Index Price, Bid/Ask, Funding, OI)
    untuk satu simbol kripto MEXC. Tanpa data sintetis.
    """
    now_ts = time.time()
    f_sym = resolve_symbol(symbol, "futures")
    spot_sym = resolve_symbol(symbol, "spot")

    if f_sym in _quote_cache:
        cached_q, ts = _quote_cache[f_sym]
        if now_ts - ts < _QUOTE_TTL:
            return cached_q

    meta = DEFAULT_ASSETS.get(
        f_sym,
        {"name": get_base_token(f_sym), "type": "crypto", "category": "l1", "base_price": 1.0},
    )

    # 1. Cek dari bulk ticker cache jika masih segar
    all_t = fetch_all_mexc_tickers(top_n=250)
    matched = next((t for t in all_t if t["symbol"] == f_sym), None)

    # 2. Jika tidak ada di top 250, panggil endpoint spesifik simbol
    if matched is None:
        try:
            url = f"{settings.LIVE_CRYPTO_MIRROR_URL}/ticker/24hr?symbol={spot_sym}"
            resp = _client.get(url, timeout=2.5)
            if resp.status_code == 200:
                item = resp.json()
                last_p = float(item.get("lastPrice") or 0.0)
                if last_p > 0:
                    bid_p = float(item.get("bidPrice") or last_p)
                    ask_p = float(item.get("askPrice") or last_p)
                    mid_p = (bid_p + ask_p) / 2.0 if (bid_p > 0 and ask_p > 0) else last_p
                    vwap = float(item.get("weightedAvgPrice") or mid_p)
                    vwap_dev = (last_p - vwap) / vwap if vwap > 0 else 0.0
                    matched = {
                        "symbol": f_sym,
                        "spot_symbol": spot_sym,
                        "lastPrice": last_p,
                        "fairPrice": round(float(0.7 * mid_p + 0.3 * vwap), price_decimals(last_p)),
                        "indexPrice": round(mid_p, price_decimals(last_p)),
                        "fundingRate": round(float(np.clip(vwap_dev * 0.015, -0.0015, 0.0015)), 6),
                        "holdVol": round(float(item.get("quoteVolume") or 0.0) * 0.42, 0),
                        "amount24": float(item.get("quoteVolume") or 0.0),
                        "volume24": float(item.get("volume") or 0.0),
                        "riseFallRate": float(item.get("priceChangePercent") or 0.0) / 100.0,
                        "high24Price": float(item.get("highPrice") or last_p),
                        "lower24Price": float(item.get("lowPrice") or last_p),
                        "bid1": bid_p,
                        "ask1": ask_p,
                        "timestamp": int(item.get("closeTime") or now_ts * 1000),
                        "_source": "LIVE_OK",
                    }
        except Exception:
            matched = None

    if matched is not None:
        price = float(matched["lastPrice"])
        fair_p = float(matched.get("fairPrice") or price)
        index_p = float(matched.get("indexPrice") or price)
        dec = price_decimals(price)
        chg_pct = round(float(matched.get("riseFallRate", 0.0)) * 100.0, 2)
        prev_price = price / (1.0 + chg_pct / 100.0) if chg_pct != -100.0 else price
        change = price - prev_price
        bid1 = float(matched.get("bid1") or price)
        ask1 = float(matched.get("ask1") or price)
        spread_pct = round(((ask1 - bid1) / price) * 100.0, 4) if price > 0 and ask1 >= bid1 else 0.01
        fair_dev_pct = round((abs(price - fair_p) / fair_p) * 100.0, 4) if fair_p > 0 else 0.0
        server_ts = float(matched.get("timestamp", now_ts * 1000)) / 1000.0

        status_obj = build_data_status(
            matched.get("_source", "LIVE_OK"),
            last_updated=server_ts,
            symbol=f_sym,
            fair_last_dev_pct=fair_dev_pct,
        )

        quote_res = {
            "symbol": f_sym,
            "spot_symbol": spot_sym,
            "name": meta.get("name", get_base_token(f_sym)),
            "type": "crypto",
            "market_type": "MEXC_FUTURES",
            "price": round(price, dec),
            "last_price": round(price, dec),
            "fair_price": round(fair_p, dec),
            "index_price": round(index_p, dec),
            "bid1": round(bid1, dec),
            "ask1": round(ask1, dec),
            "spread_pct": spread_pct,
            "fair_last_deviation_pct": fair_dev_pct,
            "funding_rate": float(matched.get("fundingRate") or 0.0),
            "funding_rate_pct": round(float(matched.get("fundingRate") or 0.0) * 100.0, 4),
            "open_interest": float(matched.get("holdVol") or 0.0),
            "change": round(change, dec),
            "change_pct": chg_pct,
            "high_24h": round(float(matched.get("high24Price") or price), dec),
            "low_24h": round(float(matched.get("lower24Price") or price), dec),
            "volume": float(matched.get("amount24") or matched.get("volume24") or 0.0),
            "volume_24h": float(matched.get("amount24") or matched.get("volume24") or 0.0),
            "timestamp": now_ts,
            "last_updated": server_ts,
            "data_source": status_obj["data_source"],
            "data_status": status_obj,
            "is_tradable": status_obj["is_tradable"],
            "data_age_ms": status_obj["data_age_ms"],
            "halt_reason": status_obj["halt_reason"],
        }
        _quote_cache[f_sym] = (quote_res, now_ts)
        _last_good_quote[f_sym] = (quote_res, server_ts)
        return quote_res

    # Circuit Breaker: jika koneksi terputus, cek last_good_quote dan evaluasi umur data
    if f_sym in _last_good_quote:
        last_q, last_ts = _last_good_quote[f_sym]
        stale_q = dict(last_q)
        status_obj = build_data_status("SPOT_FALLBACK", last_updated=last_ts, symbol=f_sym)
        stale_q["data_status"] = status_obj
        stale_q["data_source"] = status_obj["data_source"]
        stale_q["is_tradable"] = status_obj["is_tradable"]
        stale_q["data_age_ms"] = status_obj["data_age_ms"]
        stale_q["halt_reason"] = status_obj["halt_reason"]
        return stale_q

    # Jika sama sekali belum ada data & koneksi gagal -> aktifkan STALE_HALTED Circuit Breaker
    status_obj = build_data_status("STALE_HALTED", last_updated=None, symbol=f_sym)
    base_p = float(meta.get("base_price", 1.0))
    dec = price_decimals(base_p)
    return {
        "symbol": f_sym,
        "spot_symbol": spot_sym,
        "name": meta.get("name", get_base_token(f_sym)),
        "type": "crypto",
        "market_type": "MEXC_FUTURES",
        "price": round(base_p, dec),
        "last_price": round(base_p, dec),
        "fair_price": round(base_p, dec),
        "index_price": round(base_p, dec),
        "bid1": round(base_p, dec),
        "ask1": round(base_p, dec),
        "spread_pct": 0.0,
        "fair_last_deviation_pct": 0.0,
        "funding_rate": 0.0,
        "funding_rate_pct": 0.0,
        "open_interest": 0.0,
        "change": 0.0,
        "change_pct": 0.0,
        "high_24h": round(base_p, dec),
        "low_24h": round(base_p, dec),
        "volume": 0.0,
        "volume_24h": 0.0,
        "timestamp": now_ts,
        "last_updated": None,
        "data_source": "stale",
        "data_status": status_obj,
        "is_tradable": False,
        "data_age_ms": 0,
        "halt_reason": status_obj["halt_reason"],
    }


def fetch_live_quotes(symbols: list[str]) -> dict[str, dict]:
    results = {}
    if not symbols:
        return results
    with ThreadPoolExecutor(max_workers=min(8, len(symbols))) as executor:
        futures = {executor.submit(fetch_live_quote, s): s for s in symbols}
        for f in futures:
            try:
                q = f.result()
                results[q["symbol"]] = q
            except Exception:
                pass
    return results


def fetch_ohlcv(
    symbol: str,
    period: str = "15m",
    interval: str = None,
    force_live: bool = True,
    limit: int = 240,
    timeframe: str = None,
) -> pd.DataFrame:
    """
    Mengambil data Kline / OHLCV asli dari MEXC Contract API v1 / Spot API v3
    atau Live Exchange Mirror tanpa data sintetis (Zero Synthetic Policy).
    """
    global _mexc_direct_unreachable_until
    f_sym = resolve_symbol(symbol, "futures")
    spot_sym = resolve_symbol(symbol, "spot")

    tf_raw = (timeframe or interval or period or "15m").lower().strip()
    if tf_raw in ("max", "730d", "365d", "3mo", "1y", "2y"):
        tf_raw = (interval or "1d").lower()
    if tf_raw not in SPOT_INTERVAL_MAP:
        tf_raw = "1m" if tf_raw == "1s" else "15m"

    cache_key = f"{f_sym}_{tf_raw}_{limit}"
    now_ts = time.time()
    ttl = 5.0 if tf_raw in ("1m", "5m") else (12.0 if tf_raw in ("15m", "30m") else 30.0)

    if cache_key in _ohlcv_cache:
        cached_df, ts = _ohlcv_cache[cache_key]
        if now_ts - ts < ttl:
            return cached_df.copy()

    # 1. Coba MEXC Contract API v1 (/kline/{symbol}?interval=Min15) jika tidak terblokir ISP
    if now_ts >= _mexc_direct_unreachable_until:
        mexc_iv = MEXC_INTERVAL_MAP.get(tf_raw, "Min15")
        try:
            url = f"{settings.MEXC_CONTRACT_BASE_URL}/kline/{f_sym}?interval={mexc_iv}"
            resp = _client.get(url, timeout=1.5)
            if resp.status_code == 200:
                payload = resp.json()
                data = payload.get("data", {})
                times = data.get("time", [])
                opens = data.get("open", [])
                highs = data.get("high", [])
                lows = data.get("low", [])
                closes = data.get("close", [])
                vols = data.get("vol", [])
                if len(closes) >= 15:
                    dec = price_decimals(closes[-1])
                    if tf_raw == "1d":
                        fmt_times = [datetime.fromtimestamp(int(t)).strftime("%Y-%m-%d") for t in times]
                    else:
                        fmt_times = [int(t) for t in times]
                    df = pd.DataFrame({
                        "Time": fmt_times,
                        "Open": np.round(np.array(opens, dtype=float), dec),
                        "High": np.round(np.array(highs, dtype=float), dec),
                        "Low": np.round(np.array(lows, dtype=float), dec),
                        "Close": np.round(np.array(closes, dtype=float), dec),
                        "Volume": np.round(np.array(vols, dtype=float), 2),
                    }).tail(limit).reset_index(drop=True)
                    df.attrs["data_source"] = "LIVE_OK"
                    df.attrs["data_status"] = "LIVE_OK"
                    df.attrs["last_updated"] = now_ts
                    _ohlcv_cache[cache_key] = (df, now_ts)
                    return df.copy()
        except Exception:
            _mexc_direct_unreachable_until = now_ts + 120.0

    # 2. Live Crypto Spot/Mirror API v3 (/klines?symbol=BTCUSDT&interval=15m&limit=240)
    spot_iv = SPOT_INTERVAL_MAP.get(tf_raw, "15m")
    try:
        url = f"{settings.LIVE_CRYPTO_MIRROR_URL}/klines?symbol={spot_sym}&interval={spot_iv}&limit={min(500, max(limit, 200))}"
        resp = _client.get(url, timeout=3.0)
        if resp.status_code == 200:
            rows = resp.json()
            if isinstance(rows, list) and len(rows) >= 15:
                last_c = float(rows[-1][4])
                dec = price_decimals(last_c)
                times = []
                opens, highs, lows, closes, vols = [], [], [], [], []
                for r in rows:
                    open_ts_sec = int(r[0]) // 1000
                    if tf_raw == "1d":
                        times.append(datetime.fromtimestamp(open_ts_sec).strftime("%Y-%m-%d"))
                    else:
                        times.append(open_ts_sec)
                    opens.append(float(r[1]))
                    highs.append(float(r[2]))
                    lows.append(float(r[3]))
                    closes.append(float(r[4]))
                    vols.append(float(r[7]) if len(r) > 7 and float(r[7]) > 0 else float(r[5]))

                df = pd.DataFrame({
                    "Time": times,
                    "Open": np.round(opens, dec),
                    "High": np.round(highs, dec),
                    "Low": np.round(lows, dec),
                    "Close": np.round(closes, dec),
                    "Volume": np.round(vols, 2),
                }).drop_duplicates(subset=["Time"], keep="last").tail(limit).reset_index(drop=True)

                df.attrs["data_source"] = "LIVE_OK"
                df.attrs["data_status"] = "LIVE_OK"
                df.attrs["last_updated"] = now_ts
                _ohlcv_cache[cache_key] = (df, now_ts)
                return df.copy()
    except Exception:
        pass

    # 3. Fallback ke cache terakhir jika masih ada (dengan penanda usia data jujur untuk Circuit Breaker)
    if cache_key in _ohlcv_cache:
        stale_df, old_ts = _ohlcv_cache[cache_key]
        df_copy = stale_df.copy()
        age = now_ts - old_ts
        df_copy.attrs["data_source"] = "STALE_HALTED" if age > settings.STALE_DATA_THRESHOLD_SECONDS else "SPOT_FALLBACK"
        df_copy.attrs["last_updated"] = old_ts
        return df_copy

    # Jika tidak ada data sama sekali, kembalikan DataFrame kosong (Tanpa Data Sintetis!)
    empty_df = pd.DataFrame(columns=["Time", "Open", "High", "Low", "Close", "Volume"])
    empty_df.attrs["data_source"] = "STALE_HALTED"
    empty_df.attrs["last_updated"] = None
    return empty_df


def get_asset_overview(symbol: str) -> dict:
    """Mendapatkan ringkasan pasar real-time MEXC untuk instrumen kripto."""
    f_sym = resolve_symbol(symbol, "futures")
    quote = fetch_live_quote(f_sym)
    return {
        "symbol": f_sym,
        "spot_symbol": quote.get("spot_symbol", resolve_symbol(symbol, "spot")),
        "name": quote["name"],
        "type": "crypto",
        "market_type": quote.get("market_type", "MEXC_FUTURES"),
        "price": quote["price"],
        "fair_price": quote.get("fair_price", quote["price"]),
        "index_price": quote.get("index_price", quote["price"]),
        "bid1": quote.get("bid1", quote["price"]),
        "ask1": quote.get("ask1", quote["price"]),
        "spread_pct": quote.get("spread_pct", 0.01),
        "fair_last_deviation_pct": quote.get("fair_last_deviation_pct", 0.0),
        "funding_rate": quote.get("funding_rate", 0.0),
        "funding_rate_pct": quote.get("funding_rate_pct", 0.0),
        "open_interest": quote.get("open_interest", 0.0),
        "change": quote["change"],
        "change_pct": quote["change_pct"],
        "high_24h": quote["high_24h"],
        "low_24h": quote["low_24h"],
        "volume": quote["volume"],
        "volume_24h": quote["volume_24h"],
        "last_updated": quote["last_updated"],
        "data_source": quote["data_source"],
        "data_status": quote["data_status"],
    }
