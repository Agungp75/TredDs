import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, Query
from app.services.market_data import DEFAULT_ASSETS, fetch_ohlcv, is_volume_meaningless, df_data_status
from app.core.quantitative import (
    calculate_rsi, calculate_atr, check_volume_anomaly, calculate_dynamic_tp_sl,
    calculate_macd, analyze_stochastic, calculate_fibonacci, determine_comprehensive_signal
)
from app.services.pattern_engine import detect_chart_patterns
from app.services.similarity_engine import compute_similarity

router = APIRouter(prefix="/screener", tags=["Screener"])

_SCREENER_CACHE = {}
_CACHE_TTL = 15.0  # cache screener results for 15 seconds for responsive scalping

def _process_asset(item, timeframe: str = "15m"):
    symbol, meta = item
    try:
        df = fetch_ohlcv(symbol, period=timeframe, force_live=True)
    except Exception:
        df = None

    if df is None or df.empty or len(df) < 15:
        return None

    data_status = df_data_status(df, symbol, timeframe)
    data_source = data_status.get("data_source", "live")

    latest_close = float(df['Close'].iloc[-1])
    prev_close = float(df['Close'].iloc[-2]) if len(df) > 1 else latest_close
    change_pct = round(((latest_close - prev_close) / prev_close) * 100, 2) if prev_close else 0.0

    rsi_series = calculate_rsi(df['Close'])
    latest_rsi = round(float(rsi_series.iloc[-1]), 1) if not rsi_series.empty else 50.0

    atr_series = calculate_atr(df)
    latest_atr = round(float(atr_series.iloc[-1]), 4) if not atr_series.empty else 0.01

    _, _, hist_series = calculate_macd(df['Close'])
    macd_hist = float(hist_series.iloc[-1]) if not hist_series.empty else 0.0

    vol_anomaly = False if is_volume_meaningless(symbol) else check_volume_anomaly(df)
    pattern_res = detect_chart_patterns(df)

    swing_low = float(df['Low'].tail(15).min())
    swing_high = float(df['High'].tail(15).max())

    stoch_data = analyze_stochastic(df, 14, 3, 3)
    fib_data = calculate_fibonacci(df, latest_atr)

    comp_sig = determine_comprehensive_signal(
        df=df,
        pattern_res=pattern_res,
        rsi_val=latest_rsi,
        macd_hist=macd_hist,
        stoch_data=stoch_data,
        fib_data=fib_data
    )
    direction = comp_sig["direction"]
    signal_type = comp_sig["signal_type"]

    tpsl = calculate_dynamic_tp_sl(
        breakout_price=latest_close,
        pattern_height=pattern_res.get("pattern_height", latest_atr * 2),
        swing_low=swing_low,
        atr_14=latest_atr,
        swing_high=swing_high,
        signal_type=signal_type,
        direction=direction
    )

    # Kalkulasi Scalping Opportunity Score (0 - 100)
    score = 50 + (comp_sig["score"] // 4)
    if vol_anomaly:
        score += 15
    if comp_sig["confidence"] >= 75:
        score += 10

    if 40 <= latest_rsi <= 65:
        score += 10
    elif latest_rsi < 30:  # Oversold rebound scalping
        score += 15
    elif latest_rsi > 70:  # Overbought exhaustion
        score -= 10

    # Historical Similarity (summary_only)
    hist_signal = {"verdict": "NEUTRAL", "confidence": 0.0, "data_source": data_source}
    try:
        summ = compute_similarity(
            df,
            timeframe=timeframe,
            probe_lengths=[15, 30],
            top_k=5,
            data_source=data_source,
            summary_only=True,
        )
        if summ:
            hist_signal = {
                "verdict": summ["consensus_verdict"],
                "confidence": summ["confidence"],
                "probability_up": summ["probability_up"],
                "data_source": data_source,
            }
            score += summ["score_bonus"]
    except Exception:
        pass

    score = max(10, min(99, score))

    return {
        "symbol": symbol,
        "name": meta["name"],
        "type": meta["type"],
        "price": latest_close,
        "change_pct": change_pct,
        "volume": float(df['Volume'].iloc[-1]),
        "volume_sma": float(df['Volume'].tail(20).mean()) if len(df) >= 20 else float(df['Volume'].mean()),
        "rsi": latest_rsi,
        "pattern": pattern_res["pattern"],
        "signal": signal_type,
        "direction": direction,
        "is_bearish": comp_sig["is_bearish"],
        "volume_anomaly": vol_anomaly,
        "score": score,
        "entry": latest_close,
        "tp": tpsl["tp"],
        "sl": tpsl["sl"],
        "risk_reward": f"1:{tpsl['risk_reward']}",
        "confidence": comp_sig["confidence"],
        "historical_signal": hist_signal,
        "timeframe": timeframe,
        "data_source": data_source,
        "data_status": data_status,
    }


@router.get("")
async def get_screener_opportunities(
    asset_type: str = Query(None, description="Filter by type: crypto, forex"),
    timeframe: str = Query("15m", description="Scalping timeframe: 1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d"),
    min_score: int = Query(0, description="Minimum opportunity score 0-100")
):
    """
    Scalping Screener Engine:
    - Pemindaian timeframe mikro (1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d)
    - Filter volume anomaly & breakout geometris intraday
    - Perhitungan Dynamic TP/SL rasio scalping
    - Khusus instrumen Kripto & Forex (+ Gold)
    """
    tf = timeframe.lower() if timeframe else "15m"
    cache_key = f"{asset_type}:{min_score}:{tf}"
    now = time.time()
    if cache_key in _SCREENER_CACHE:
        cached_res, timestamp = _SCREENER_CACHE[cache_key]
        if now - timestamp < _CACHE_TTL:
            return cached_res

    items = [(symbol, meta) for symbol, meta in DEFAULT_ASSETS.items()
             if not asset_type or meta["type"].lower() == asset_type.lower()]

    results = []
    max_workers = min(12, len(items)) if items else 1
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_process_asset, it, tf): it for it in items}
        for future in as_completed(futures):
            res = future.result()
            if res and res["score"] >= min_score:
                results.append(res)

    results.sort(key=lambda x: x["score"], reverse=True)
    response_data = {"total": len(results), "timeframe": tf, "items": results}
    _SCREENER_CACHE[cache_key] = (response_data, now)
    return response_data
