from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import numpy as np
import pandas as pd
from app.services.market_data import get_asset_overview, fetch_ohlcv, DEFAULT_ASSETS
from app.services.dev_analytics import get_github_metrics
from app.services.similarity_engine import match_current_market_pattern, classify_pattern_shape, extract_probe_from_points

router = APIRouter(prefix="/crypto", tags=["Crypto"])

# Token untuk dashboard atas (dengan on-chain data & GitHub activity)
DASHBOARD_TOKENS = ["BTC-USD", "ETH-USD", "SOL-USD", "AVAX-USD", "BNB-USD"]

# Seluruh koin crypto yang dipindai saat user mencari pola terkini (masa sekarang)
SEARCH_CRYPTO_SYMBOLS = [
    "BTC-USD", "ETH-USD", "SOL-USD", "AVAX-USD", "BNB-USD",
    "XRP-USD", "ADA-USD", "DOGE-USD", "NEAR-USD", "LINK-USD"
]

# Peta konfigurasi fetch per timeframe scalping pilihan user
TIMEFRAME_FETCH_MAP = {
    "1s":  {"interval": "1s",  "period": "1s",  "resample": None},
    "1m":  {"interval": "1m",  "period": "1m",  "resample": None},
    "5m":  {"interval": "5m",  "period": "5m",  "resample": None},
    "15m": {"interval": "15m", "period": "15m", "resample": None},
    "30m": {"interval": "30m", "period": "30m", "resample": None},
    "1h":  {"interval": "1h",  "period": "1h",  "resample": None},
    "4h":  {"interval": "4h",  "period": "4h",  "resample": None},
    "1d":  {"interval": "1d",  "period": "1d",  "resample": None},
}

@router.get("/tokens")
async def get_crypto_tokens():
    tokens = DASHBOARD_TOKENS
    repos = {
        "BTC-USD": "bitcoin/bitcoin",
        "ETH-USD": "ethereum/go-ethereum",
        "SOL-USD": "solana-labs/solana",
        "AVAX-USD": "ava-labs/avalanchego",
        "BNB-USD": "bnb-chain/bsc"
    }

    on_chain_data = {
        "BTC-USD": {"whale_concentration": "11.2%", "liquidity_locked": "N/A (PoW)", "circulating_supply": "19.7M BTC", "holders_count": "54.2M"},
        "ETH-USD": {"whale_concentration": "28.4%", "liquidity_locked": "32.8M ETH (Staked)", "circulating_supply": "120.2M ETH", "holders_count": "118M"},
        "SOL-USD": {"whale_concentration": "34.1%", "liquidity_locked": "68.5% (Staked)", "circulating_supply": "468M SOL", "holders_count": "8.9M"},
        "AVAX-USD": {"whale_concentration": "39.5%", "liquidity_locked": "58.2% (Staked)", "circulating_supply": "395M AVAX", "holders_count": "2.4M"},
        "BNB-USD": {"whale_concentration": "48.6%", "liquidity_locked": "42.0% Locked", "circulating_supply": "153M BNB", "holders_count": "3.8M"}
    }

    results = []
    for sym in tokens:
        overview = get_asset_overview(sym)
        repo = repos.get(sym, "bitcoin/bitcoin")
        dev_metrics = await get_github_metrics(repo)

        overview.update({
            "on_chain": on_chain_data.get(sym, {}),
            "dev_metrics": dev_metrics
        })
        results.append(overview)

    return results


# ---------------------------------------------------------------------------
# Draw-to-Search Pattern Matching — MASA SEKARANG (Real-Time Live)
# ---------------------------------------------------------------------------

class Point(BaseModel):
    x: float
    y: float

class PatternSearchRequest(BaseModel):
    points: List[Point]
    top_k: Optional[int] = 5
    timeframe: Optional[str] = "auto"


def _resample_ohlcv(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    """Helper resampling DataFrame OHLCV ke aturan waktu lebih besar (e.g. 'ME' bulanan)."""
    try:
        df_copy = df.copy()
        if "Time" not in df_copy.columns:
            return df
        df_copy["_time"] = pd.to_datetime(df_copy["Time"], errors="coerce")
        df_copy = df_copy.dropna(subset=["_time"]).set_index("_time")
        df_r = df_copy.resample(rule).agg({
            "Open": "first", "High": "max", "Low": "min",
            "Close": "last", "Volume": "sum"
        }).dropna(subset=["Close"])
        df_r = df_r.reset_index()
        df_r["Time"] = df_r["_time"].dt.strftime("%Y-%m-%d")
        df_r = df_r.drop(columns=["_time"])
        return df_r
    except Exception:
        return df


# Timeframe scalping yang diprioritaskan saat mode Auto
FAST_AUTO_TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h"]


@router.post("/pattern-search")
async def search_pattern(body: PatternSearchRequest):
    """
    Menerima titik-titik yang digambar user (normalized [0..1]),
    secara otomatis mendeteksi bentuk pola geometris (misal: Segitiga, Pola W, Breakout),
    lalu memindai koin crypto di MASA SEKARANG (live) pada timeframe cepat (15m/1h/4h/1d)
    untuk menemukan koin yang pergerakan harganya saat ini paling identik.

    Jika timeframe="auto", sistem akan menguji timeframe cepat dan memilih timeframe optimal
    yang paling presisi membentuk pola untuk masing-masing koin secara otomatis.
    """
    points = body.points
    requested_tf = (body.timeframe or "auto").lower()

    if len(points) < 3:
        raise HTTPException(status_code=422, detail="Minimal 3 titik diperlukan untuk pencarian pola.")

    # Ekstrak kurva 1D harga yang dinormalisasi dengan resolusi tinggi (60 poin)
    target_len = 60
    probe_series = extract_probe_from_points(points, target_len=target_len)

    # Klasifikasi pola geometris yang digambar pengguna (e.g. Triple Top, Head & Shoulders, Segitiga, Pola W, dll)
    probe_pattern_name = classify_pattern_shape(probe_series)

    def _eval_symbol_auto(symbol: str):
        """Mengevaluasi simbol di beberapa timeframe cepat (15m, 1h, 4h) dan memilih skor tertinggi."""
        best_match = None
        best_tf = "15m"

        for tf in FAST_AUTO_TIMEFRAMES:
            try:
                df = fetch_ohlcv(symbol, period=tf, force_live=True)
                if df is None or df.empty or len(df) < 15:
                    continue
                match = match_current_market_pattern(probe_series=probe_series, df=df)
                if match and (best_match is None or match["match_score"] > best_match["match_score"]):
                    best_match = match
                    best_tf = tf
            except Exception:
                continue

        if not best_match:
            return None

        coin_name = DEFAULT_ASSETS.get(symbol, {}).get("name", symbol)
        best_match["symbol"] = symbol
        best_match["name"] = coin_name
        best_match["timeframe"] = best_tf
        best_match["pattern_name"] = probe_pattern_name
        return best_match

    def _eval_symbol_manual(symbol: str, tf_key: str):
        """Mengevaluasi simbol pada satu timeframe spesifik yang diminta."""
        tf_cfg = TIMEFRAME_FETCH_MAP.get(tf_key, TIMEFRAME_FETCH_MAP["1d"])
        interval = tf_cfg["interval"]
        period = tf_cfg["period"]
        resample_rule = tf_cfg["resample"]

        try:
            df = fetch_ohlcv(symbol, period=period, interval=interval, force_live=True)
        except Exception:
            return None

        if df is None or df.empty or len(df) < 15:
            return None

        if resample_rule:
            df = _resample_ohlcv(df, resample_rule)

        match = match_current_market_pattern(probe_series=probe_series, df=df)
        if not match:
            return None

        coin_name = DEFAULT_ASSETS.get(symbol, {}).get("name", symbol)
        match["symbol"] = symbol
        match["name"] = coin_name
        match["timeframe"] = tf_key
        match["pattern_name"] = probe_pattern_name
        return match

    # Jalankan scanning secara paralel
    if requested_tf == "auto" or requested_tf not in TIMEFRAME_FETCH_MAP:
        tasks = [asyncio.to_thread(_eval_symbol_auto, sym) for sym in SEARCH_CRYPTO_SYMBOLS]
    else:
        tasks = [asyncio.to_thread(_eval_symbol_manual, sym, requested_tf) for sym in SEARCH_CRYPTO_SYMBOLS]

    raw_results = await asyncio.gather(*tasks)

    all_results = [r for r in raw_results if r is not None]
    # Urutkan berdasarkan skor kemiripan tertinggi
    all_results.sort(key=lambda r: r["match_score"], reverse=True)

    return {
        "probe_values": [round(float(v), 4) for v in probe_series],
        "probe_len": target_len,
        "probe_pattern_name": probe_pattern_name,
        "timeframe": requested_tf,
        "is_present_market": True,
        "results": all_results,
        "total": len(all_results),
    }
