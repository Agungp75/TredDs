from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import pandas as pd
from app.services.market_data import (
    get_asset_overview,
    fetch_ohlcv,
    fetch_all_mexc_tickers,
    DEFAULT_ASSETS,
)
from app.services.dev_analytics import get_github_metrics
from app.services.similarity_engine import (
    match_current_market_pattern,
    classify_pattern_shape,
    extract_probe_from_points,
)

router = APIRouter(prefix="/crypto", tags=["MEXC Crypto Explorer & Pattern Search"])

DASHBOARD_TOKENS = [
    "BTC_USDT", "ETH_USDT", "SOL_USDT", "BNB_USDT",
    "XRP_USDT", "DOGE_USDT", "SUI_USDT", "PEPE_USDT",
    "WIF_USDT", "AVAX_USDT", "LINK_USDT", "FET_USDT",
    "NEAR_USDT", "ADA_USDT", "INJ_USDT", "BONK_USDT",
]

TIMEFRAME_FETCH_MAP = {
    "1m":  {"interval": "1m",  "period": "1m",  "resample": None},
    "5m":  {"interval": "5m",  "period": "5m",  "resample": None},
    "15m": {"interval": "15m", "period": "15m", "resample": None},
    "30m": {"interval": "30m", "period": "30m", "resample": None},
    "1h":  {"interval": "1h",  "period": "1h",  "resample": None},
    "4h":  {"interval": "4h",  "period": "4h",  "resample": None},
    "1d":  {"interval": "1d",  "period": "1d",  "resample": None},
}


def get_dynamic_top40_mexc_symbols() -> list[str]:
    """
    Mengambil daftar Top-40 koin kripto paling likuid (Volume 24 Jam tertinggi)
    di MEXC secara dinamis.
    """
    tickers = fetch_all_mexc_tickers()
    if tickers:
        sorted_t = sorted(
            [t for t in tickers if str(t.get("symbol", "")).endswith("_USDT")],
            key=lambda x: float(x.get("amount24") or x.get("volume24") or 0.0),
            reverse=True,
        )
        top_syms = []
        seen = set()
        for sym in DASHBOARD_TOKENS:
            seen.add(sym)
            top_syms.append(sym)
        for t in sorted_t:
            s = t["symbol"]
            if s not in seen:
                seen.add(s)
                top_syms.append(s)
            if len(top_syms) >= 40:
                break
        return top_syms
    return list(DEFAULT_ASSETS.keys())[:40]


@router.get("/tokens")
async def get_crypto_tokens():
    tokens = DASHBOARD_TOKENS
    repos = {
        "BTC_USDT": "bitcoin/bitcoin",
        "ETH_USDT": "ethereum/go-ethereum",
        "SOL_USDT": "solana-labs/solana",
        "AVAX_USDT": "ava-labs/avalanchego",
        "BNB_USDT": "bnb-chain/bsc",
        "XRP_USDT": "XRPLF/rippled",
        "ADA_USDT": "IntersectMBO/cardano-node",
        "DOGE_USDT": "dogecoin/dogecoin",
        "NEAR_USDT": "near/nearcore",
        "LINK_USDT": "smartcontractkit/chainlink",
        "SUI_USDT": "MystenLabs/sui",
        "INJ_USDT": "InjectiveLabs/injective-Chain-Releases",
    }

    categories = {
        "BTC_USDT": "l1",
        "ETH_USDT": "l1",
        "SOL_USDT": "l1",
        "AVAX_USDT": "l1",
        "BNB_USDT": "l1",
        "XRP_USDT": "l1",
        "ADA_USDT": "l1",
        "SUI_USDT": "l1",
        "DOGE_USDT": "meme",
        "PEPE_USDT": "meme",
        "WIF_USDT": "meme",
        "BONK_USDT": "meme",
        "NEAR_USDT": "ai",
        "FET_USDT": "ai",
        "LINK_USDT": "defi",
        "INJ_USDT": "defi",
    }

    async def _build_token(sym: str):
        overview = await asyncio.to_thread(get_asset_overview, sym)
        repo = repos.get(sym, "bitcoin/bitcoin")
        dev_metrics = await get_github_metrics(repo)
        overview.update({
            "category": categories.get(sym, DEFAULT_ASSETS.get(sym, {}).get("category", "l1")),
            "on_chain": {
                "whale_concentration": f"Spread {overview.get('spread_pct', 0.01):.3f}%",
                "liquidity_locked": f"Fair: ${overview.get('fair_price', overview['price'])}",
                "circulating_supply": f"OI: ${overview.get('open_interest', 0):,.0f}",
                "holders_count": f"Funding: {overview.get('funding_rate_pct', 0.0):+.4f}%",
                "is_estimated": False,
            },
            "dev_metrics": dev_metrics,
        })
        return overview

    results = await asyncio.gather(*[_build_token(sym) for sym in tokens])
    return list(results)


class Point(BaseModel):
    x: float
    y: float


class PatternSearchRequest(BaseModel):
    points: List[Point]
    top_k: Optional[int] = 12
    timeframe: Optional[str] = "auto"


FAST_AUTO_TIMEFRAMES = ["15m", "1h", "4h"]


@router.post("/pattern-search")
async def search_pattern(body: PatternSearchRequest):
    """
    ATRED v3.0 Draw-to-Search Pattern Scanner:
    Memindai Top-40 koin kripto paling likuid di MEXC secara dinamis pada kondisi pasar terkini (live)
    untuk menemukan aset yang sedang membentuk geometri harga sesuai gambar pengguna.
    """
    points = body.points
    requested_tf = (body.timeframe or "auto").lower()

    if len(points) < 3:
        raise HTTPException(status_code=422, detail="Minimal 3 titik diperlukan untuk pencarian pola.")

    target_len = 60
    probe_series = extract_probe_from_points(points, target_len=target_len)
    probe_pattern_name = classify_pattern_shape(probe_series)

    # Ambil daftar Top-40 koin MEXC paling likuid secara dinamis
    dynamic_symbols = await asyncio.to_thread(get_dynamic_top40_mexc_symbols)

    def _eval_symbol_auto(symbol: str):
        best_match = None
        best_tf = "15m"

        for tf in FAST_AUTO_TIMEFRAMES:
            try:
                df = fetch_ohlcv(symbol, period=tf, force_live=True, limit=160)
                if df is None or df.empty or len(df) < 45:
                    continue
                match = match_current_market_pattern(probe_series=probe_series, df=df)
                if match and (best_match is None or match["match_score"] > best_match["match_score"]):
                    best_match = match
                    best_tf = tf
            except Exception:
                continue

        if not best_match:
            return None

        coin_name = DEFAULT_ASSETS.get(symbol, {}).get("name", symbol.replace("_USDT", ""))
        best_match["symbol"] = symbol
        best_match["name"] = coin_name
        best_match["timeframe"] = best_tf
        best_match["pattern_name"] = probe_pattern_name
        return best_match

    def _eval_symbol_manual(symbol: str, tf_key: str):
        tf_cfg = TIMEFRAME_FETCH_MAP.get(tf_key, TIMEFRAME_FETCH_MAP["15m"])
        interval = tf_cfg["interval"]

        try:
            df = fetch_ohlcv(symbol, period=interval, interval=interval, force_live=True, limit=180)
        except Exception:
            return None

        if df is None or df.empty or len(df) < 45:
            return None

        match = match_current_market_pattern(probe_series=probe_series, df=df)
        if not match:
            return None

        coin_name = DEFAULT_ASSETS.get(symbol, {}).get("name", symbol.replace("_USDT", ""))
        match["symbol"] = symbol
        match["name"] = coin_name
        match["timeframe"] = tf_key
        match["pattern_name"] = probe_pattern_name
        return match

    # Batasi konkurensi dengan Semaphore agar efisien saat memindai 40 koin MEXC
    sem = asyncio.Semaphore(12)

    async def _bounded_eval(sym: str):
        async with sem:
            if requested_tf == "auto" or requested_tf not in TIMEFRAME_FETCH_MAP:
                return await asyncio.to_thread(_eval_symbol_auto, sym)
            return await asyncio.to_thread(_eval_symbol_manual, sym, requested_tf)

    raw_results = await asyncio.gather(*[_bounded_eval(sym) for sym in dynamic_symbols])

    all_results = [r for r in raw_results if r is not None]
    all_results.sort(key=lambda r: r["match_score"], reverse=True)

    return {
        "probe_values": [round(float(v), 4) for v in probe_series],
        "probe_len": target_len,
        "probe_pattern_name": probe_pattern_name,
        "timeframe": requested_tf,
        "scanned_coins_count": len(dynamic_symbols),
        "exchange": "MEXC_USDT_M",
        "is_present_market": True,
        "results": all_results[: max(12, int(body.top_k or 12))],
        "total": len(all_results),
    }
