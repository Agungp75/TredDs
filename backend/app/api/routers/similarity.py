from fastapi import APIRouter, HTTPException, Query
import asyncio
from app.services.market_data import fetch_ohlcv, resolve_symbol
from app.services.similarity_engine import compute_similarity

router = APIRouter(prefix="/analysis", tags=["Historical Similarity (Layer 3)"])


@router.get("/{symbol}/similarity")
async def get_similarity(
    symbol: str,
    timeframe: str = Query("1h", description="Timeframe data: 15m, 1h, 4h, atau 1d"),
    period: str = Query("max", description="Rentang histori"),
    top_k: int = Query(30, ge=5, le=50, description="Jumlah analogi historis (default K=30)"),
):
    """
    ATRED v3.0 Historical Similarity Engine (Layer 3):
    Membandingkan window harga terakhir (probe) dengan seluruh segmen historis
    menggunakan K=30 sampel, Pre-Filter Rezim EMA-200, dan Uji Signifikansi
    Statistik Wilcoxon / One-Sample t-test (p-value < 0.05).
    """
    resolved_sym = resolve_symbol(symbol, "futures")

    tf_lower = timeframe.lower()
    if tf_lower in ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]:
        interval = tf_lower
    else:
        interval = "1h"

    try:
        df = await asyncio.to_thread(
            fetch_ohlcv, resolved_sym, period=period, interval=interval, force_live=True, limit=500
        )
    except Exception:
        df = None

    if df is None or df.empty or len(df) < 60:
        try:
            df = await asyncio.to_thread(
                fetch_ohlcv, resolved_sym, period="max", interval="1h", force_live=True, limit=500
            )
            timeframe = "1h"
        except Exception:
            df = None

    if df is None or df.empty or len(df) < 50:
        raise HTTPException(status_code=404, detail="Data historis tidak mencukupi untuk analisis.")

    data_source = getattr(df, "attrs", {}).get("data_source", "LIVE_OK")

    result = await asyncio.to_thread(
        compute_similarity,
        df,
        timeframe=timeframe,
        top_k=top_k,
        min_separation=12,
        data_source=data_source,
    )

    if result is None:
        raise HTTPException(status_code=422, detail="Data terlalu pendek untuk pencocokan pola.")

    best_summary = result.get("screener_summary", {})
    result["conclusion"] = {
        "recommendation": best_summary.get("statistical_verdict", best_summary.get("consensus_verdict", "NEUTRAL")),
        "raw_verdict": best_summary.get("consensus_verdict", "NEUTRAL"),
        "win_rate_pct": round(float(best_summary.get("probability_up", 0.5)) * 100.0, 1),
        "p_value": best_summary.get("p_value", 1.0),
        "is_statistically_significant": best_summary.get("is_statistically_significant", False),
        "sample_size": best_summary.get("sample_size", top_k),
        "confidence": best_summary.get("confidence", 0.5),
    }

    return result
