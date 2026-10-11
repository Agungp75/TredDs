from fastapi import APIRouter, HTTPException, Query
from app.services.market_data import fetch_ohlcv, DEFAULT_ASSETS, resolve_symbol
from app.services.similarity_engine import compute_similarity

router = APIRouter(prefix="/analysis", tags=["Historical Similarity"])

@router.get("/{symbol}/similarity")
async def get_similarity(
    symbol: str,
    timeframe: str = Query("1d", description="Timeframe data: 1d (harian) atau 1h (per jam)"),
    period: str = Query("max", description="Rentang histori: max, 730d, 365d, 1y, 2y"),
):
    """
    Historical Similarity Engine (tanpa AI):
    Membandingkan window harga terakhir (probe) dengan seluruh segmen historis
    untuk menemukan pergerakan paling mirip, lalu memproyeksikan arah ke depan.

    3 metode: z-score Euclidean, Pearson, DTW (Sakoe-Chiba band).
    Probes: [15, 30, 60] bar, auto pilih yang terbaik.
    """
    resolved_sym = resolve_symbol(symbol)
    
    # Normalisasi timeframe -> interval yfinance & rentang period
    tf_lower = timeframe.lower()
    if tf_lower in ["15m", "5m"]:
        interval = "15m"
        eff_period = "60d" if period in ["max", "3mo", "1y"] else period
    elif tf_lower in ["1h", "4h", "60m"]:
        interval = "1h"
        eff_period = "730d" if period in ["max", "3mo", "1y"] else period
    else:
        interval = "1d"
        eff_period = "max"

    if resolved_sym not in DEFAULT_ASSETS:
        raise HTTPException(status_code=404, detail=f"Simbol '{symbol}' tidak dikenal.")

    try:
        df = fetch_ohlcv(resolved_sym, period=eff_period, interval=interval, force_live=True)
    except Exception:
        df = None

    if df is None or df.empty or len(df) < 60:
        # Fallback ke 1d harian jika data intraday tidak mencukupi
        try:
            df = fetch_ohlcv(symbol, period="max", interval="1d", force_live=True)
            timeframe = "1d"
        except Exception:
            df = None

    if df is None or df.empty or len(df) < 60:
        raise HTTPException(status_code=404, detail="Data historis tidak mencukupi untuk analisis.")

    data_source = getattr(df, "attrs", {}).get("data_source", "live")

    result = compute_similarity(
        df,
        timeframe=timeframe,
        data_source=data_source,
    )

    if result is None:
        raise HTTPException(status_code=422, detail="Data terlalu pendek untuk pencocokan pola.")

    return result
