import time
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
from fastapi import APIRouter, Query
from app.services.market_data import (
    DEFAULT_ASSETS,
    fetch_all_mexc_tickers,
    fetch_ohlcv,
    is_volume_meaningless,
    df_data_status,
    resolve_symbol,
)
from app.core.quantitative import (
    calculate_rsi,
    calculate_atr,
    check_volume_anomaly,
    calculate_dynamic_tp_sl,
    calculate_macd,
    analyze_stochastic,
    calculate_fibonacci,
    determine_comprehensive_signal,
    _dec,
)
from app.services.pattern_engine import detect_chart_patterns
from app.services.mexc_orderflow import (
    compute_oi_and_funding_regime,
    compute_cvd_metrics,
)
from app.services.similarity_engine import compute_similarity

router = APIRouter(prefix="/screener", tags=["MEXC Two-Stage Screener"])

_SCREENER_CACHE = {}
_CACHE_TTL = 18.0
_CORR_CACHE = {"data": None, "ts": 0.0}


def _select_stage1_funnel_candidates(max_candidates: int = 24) -> list[tuple[str, dict, dict]]:
    """
    STAGE 1 (Fast Ticker Funnel):
    Menyaring ratusan koin aktif MEXC menjadi Top Kandidat Paling Aktif & Anomali
    berdasarkan:
      - Likuiditas Volume 24 Jam (USDT)
      - Momentum Perubahan Harga 24 Jam (|change_pct|)
      - Anomali Funding Rate
    """
    tickers = fetch_all_mexc_tickers()
    ticker_map = {t["symbol"]: t for t in tickers if "symbol" in t}

    candidates = []
    seen = set()

    # Prioritaskan koin dengan aktivitas tertinggi dari seluruh pasar MEXC + DEFAULT_ASSETS
    scored_tickers = []
    for t in tickers:
        sym = t.get("symbol", "")
        if not sym.endswith("_USDT"):
            continue
        vol_usdt = float(t.get("amount24") or t.get("volume24") or 0.0)
        if vol_usdt < 1_000_000 and sym not in DEFAULT_ASSETS:
            continue
        chg = abs(float(t.get("riseFallRate") or 0.0) * 100.0)
        fund = abs(float(t.get("fundingRate") or 0.0) * 10000.0)
        funnel_score = np.log10(max(vol_usdt, 1000.0)) * 10.0 + chg * 1.8 + fund * 3.0
        scored_tickers.append((funnel_score, sym, t))

    scored_tickers.sort(key=lambda x: x[0], reverse=True)

    # Pastikan aset utama selalu masuk funnel diikuti top mover dinamis
    core_majors = [
        "BTC_USDT", "ETH_USDT", "SOL_USDT", "BNB_USDT",
        "XRP_USDT", "DOGE_USDT", "SUI_USDT", "PEPE_USDT",
        "WIF_USDT", "AVAX_USDT", "LINK_USDT", "FET_USDT",
    ]
    for sym in core_majors:
        if sym not in seen:
            seen.add(sym)
            meta = DEFAULT_ASSETS.get(sym, {"name": sym.replace("_USDT", ""), "type": "crypto"})
            t_data = ticker_map.get(sym, {})
            candidates.append((sym, meta, t_data))

    for _, sym, t_data in scored_tickers:
        if len(candidates) >= max_candidates:
            break
        if sym not in seen:
            seen.add(sym)
            meta = DEFAULT_ASSETS.get(sym, {"name": sym.replace("_USDT", ""), "type": "crypto"})
            candidates.append((sym, meta, t_data))

    return candidates


def _process_asset(item_tuple, timeframe: str = "15m"):
    """
    STAGE 2 (Deep Quant Scan per Kandidat):
    Menghitung Layer 1 (RANSAC Pattern, SFP, Regime, BTC Gate), Layer 2 (OI Matrix, Funding Squeeze, CVD),
    Layer 3 (Similarity Edge), dan Execution Engine (0% Maker Fee, Net EV%, Half-Kelly).
    """
    symbol, meta, ticker_data = item_tuple
    try:
        df = fetch_ohlcv(symbol, period=timeframe, force_live=True, limit=160)
    except Exception:
        df = None

    if df is None or df.empty or len(df) < 20:
        return None

    data_status = df_data_status(df, symbol, timeframe)
    data_source = data_status.get("data_source", "live")

    latest_close = float(df['Close'].iloc[-1])
    dec = _dec(latest_close)
    prev_close = float(df['Close'].iloc[-2]) if len(df) > 1 else latest_close

    # Gunakan perubahan 24h dari ticker MEXC jika tersedia, fallback ke candle change
    if ticker_data and "riseFallRate" in ticker_data:
        change_pct = round(float(ticker_data.get("riseFallRate", 0.0)) * 100.0, 2)
    else:
        change_pct = round(((latest_close - prev_close) / prev_close) * 100.0, 2) if prev_close else 0.0

    rsi_series = calculate_rsi(df['Close'])
    latest_rsi = round(float(rsi_series.iloc[-1]), 1) if not rsi_series.empty else 50.0

    atr_series = calculate_atr(df)
    latest_atr = round(float(atr_series.iloc[-1]), dec) if not atr_series.empty else (latest_close * 0.01)

    _, _, hist_series = calculate_macd(df['Close'])
    macd_hist = float(hist_series.iloc[-1]) if not hist_series.empty else 0.0

    vol_anomaly = False if is_volume_meaningless(symbol) else check_volume_anomaly(df)
    pattern_res = detect_chart_patterns(df)

    swing_low = float(df['Low'].tail(15).min())
    swing_high = float(df['High'].tail(15).max())

    stoch_data = analyze_stochastic(df, 14, 3, 3)
    fib_data = calculate_fibonacci(df, latest_atr)

    # Layer 2 fast microstructure (OI Matrix, Funding Squeeze, CVD)
    quote_proxy = {
        "price": latest_close,
        "open_interest": float(ticker_data.get("holdVol") or 0.0) if ticker_data else 0.0,
        "funding_rate": float(ticker_data.get("fundingRate") or 0.0) if ticker_data else 0.0,
        "change_pct": change_pct,
    }
    oi_funding = compute_oi_and_funding_regime(symbol, quote_proxy, df)
    cvd_info = compute_cvd_metrics(df)

    comp_sig = determine_comprehensive_signal(
        df=df,
        pattern_res=pattern_res,
        rsi_val=latest_rsi,
        macd_hist=macd_hist,
        stoch_data=stoch_data,
        fib_data=fib_data,
        symbol=symbol,
    )
    direction = comp_sig["direction"]
    signal_type = comp_sig["signal_type"]
    regime_ctx = comp_sig.get("regime_context", {})
    btc_gate = comp_sig.get("btc_gate", {})
    sfp_detected = pattern_res.get("sfp_detected", "NONE")

    # Layer 3 Historical Similarity (summary_only)
    hist_signal = {
        "verdict": "NEUTRAL",
        "statistical_verdict": "NEUTRAL (NO STATISTICAL EDGE)",
        "confidence": 0.0,
        "probability_up": 0.5,
        "p_value": 1.0,
        "is_statistically_significant": False,
        "data_source": data_source,
    }
    win_rate_est = float(comp_sig.get("confidence", 58))
    try:
        summ = compute_similarity(
            df,
            timeframe=timeframe,
            probe_lengths=[15, 30],
            top_k=15,
            min_separation=8,
            data_source=data_source,
            summary_only=True,
        )
        if summ:
            hist_signal = {
                "verdict": summ["consensus_verdict"],
                "statistical_verdict": summ.get("statistical_verdict", summ["consensus_verdict"]),
                "confidence": summ["confidence"],
                "probability_up": summ["probability_up"],
                "p_value": summ.get("p_value", 1.0),
                "is_statistically_significant": summ.get("is_statistically_significant", False),
                "sample_size": summ.get("sample_size", 15),
                "data_source": data_source,
            }
            prob_for_dir = summ["probability_up"] if direction == "LONG" else (1.0 - summ["probability_up"])
            win_rate_est = max(46.0, min(78.0, prob_for_dir * 100.0 * 0.6 + win_rate_est * 0.4))
    except Exception:
        pass

    tpsl = calculate_dynamic_tp_sl(
        breakout_price=latest_close,
        pattern_height=pattern_res.get("pattern_height", latest_atr * 2),
        swing_low=swing_low,
        atr_14=latest_atr,
        swing_high=swing_high,
        signal_type=signal_type,
        direction=direction,
        win_rate_pct=win_rate_est,
        adx_val=float(regime_ctx.get("adx_14", 22.0)),
        obi_val=0.15 if "BULLISH" in cvd_info["cvd_trend"] else (-0.15 if "BEARISH" in cvd_info["cvd_trend"] else 0.0),
        spread_pct=0.01,
        funding_rate_pct=oi_funding["funding_rate_pct"],
    )

    # --- Formula Baru Opportunity Score v3.0 ---
    # Opportunity Score = 0.30*(Technical) + 0.30*(Orderflow/OI) + 0.25*(Stat Edge/EV) + 0.15*(BTC RS)
    tech_component = min(100.0, max(25.0, 50.0 + abs(comp_sig["score"]) * 0.5 + (12.0 if sfp_detected != "NONE" else 0.0)))

    of_component = 55.0
    if (direction == "LONG" and oi_funding["oi_regime"] == "NEW_LONG_BUILDUP") or (
        direction == "SHORT" and oi_funding["oi_regime"] == "NEW_SHORT_BUILDUP"
    ):
        of_component += 25.0
    if "SQUEEZE" in oi_funding["squeeze_status"] or oi_funding["funding_regime"] != "NEUTRAL_FUNDING":
        of_component += 15.0
    if ("BULLISH" in cvd_info["cvd_trend"] and direction == "LONG") or (
        "BEARISH" in cvd_info["cvd_trend"] and direction == "SHORT"
    ):
        of_component += 12.0
    of_component = min(100.0, of_component)

    ev_pct = float(tpsl.get("net_expected_value_pct", 0.0))
    ev_component = min(100.0, max(20.0, 50.0 + ev_pct * 45.0 + (15.0 if hist_signal["is_statistically_significant"] else 0.0)))

    rs_val = float(btc_gate.get("alt_rs_vs_btc_pct", 0.0))
    rs_component = min(100.0, max(20.0, 60.0 + (rs_val * 8.0 if direction == "LONG" else -rs_val * 8.0)))
    if comp_sig.get("btc_blocked"):
        rs_component = 15.0

    opportunity_score = int(round(
        0.30 * tech_component
        + 0.30 * of_component
        + 0.25 * ev_component
        + 0.15 * rs_component
    ))
    opportunity_score = max(15, min(99, opportunity_score))

    # Tagging kategori strategi untuk 4 Tab Screener v3.0
    is_squeeze = (
        oi_funding["funding_regime"] in ("SHORT_SQUEEZE_FUEL", "OVERCROWDED_LONG_RISK", "HEAVY_SHORT_BIAS")
        or oi_funding["oi_regime"] in ("SHORT_COVERING_RALLY", "LONG_CAPITULATION")
        or abs(oi_funding["funding_rate_pct"]) >= 0.015
    )
    is_sfp = sfp_detected in ("BULLISH_SFP", "BEARISH_SFP") or vol_anomaly
    is_high_ev = tpsl["trade_validity"] == "EXECUTABLE_HIGH_EDGE" and ev_pct >= 0.20

    vol_24h_usdt = float(ticker_data.get("amount24") or df['Volume'].iloc[-1]) if ticker_data else float(df['Volume'].iloc[-1])

    return {
        "symbol": symbol,
        "name": meta.get("name", symbol.replace("_USDT", "")),
        "type": "crypto",
        "exchange": "MEXC_USDT_M",
        "price": round(latest_close, dec),
        "fair_price": round(float(ticker_data.get("fairPrice") or latest_close), dec) if ticker_data else round(latest_close, dec),
        "change_pct": change_pct,
        "volume": round(vol_24h_usdt, 2),
        "volume_sma": round(float(df['Volume'].tail(20).mean()) if len(df) >= 20 else float(df['Volume'].mean()), 2),
        "rsi": latest_rsi,
        "pattern": pattern_res["pattern"],
        "wick_outliers_ignored": pattern_res.get("wick_outliers_ignored", 0),
        "sfp_detected": sfp_detected,
        "signal": signal_type,
        "direction": direction,
        "is_bearish": comp_sig["is_bearish"],
        "volume_anomaly": vol_anomaly,
        "score": opportunity_score,
        "entry": tpsl["maker_limit_entry"],
        "maker_limit_entry": tpsl["maker_limit_entry"],
        "aggressive_market_entry": tpsl["aggressive_market_entry"],
        "recommended_entry_type": tpsl["recommended_entry_type"],
        "tp": tpsl["tp"],
        "tp1": tpsl["tp1"],
        "tp2": tpsl["tp2"],
        "sl": tpsl["sl"],
        "sl_trigger_type": "FAIR_PRICE",
        "risk_reward": f"1:{tpsl['net_rr_after_mexc_fees']}",
        "net_rr": tpsl["net_rr_after_mexc_fees"],
        "net_ev_pct": ev_pct,
        "trade_validity": tpsl["trade_validity"],
        "safe_max_leverage": tpsl["position_sizing"]["safe_max_leverage"],
        "half_kelly_pct": tpsl["position_sizing"]["half_kelly_capital_fraction_pct"],
        "confidence": comp_sig["confidence"],
        "market_regime": regime_ctx.get("market_regime", "TRANSITIONAL"),
        "adx_14": regime_ctx.get("adx_14", 20.0),
        "hurst_exponent": regime_ctx.get("hurst_exponent", 0.50),
        "btc_gate_status": btc_gate.get("btc_gate_status", "PASS"),
        "alt_rs_vs_btc_pct": btc_gate.get("alt_rs_vs_btc_pct", 0.0),
        "mexc_derivatives": {
            "funding_rate_pct": oi_funding["funding_rate_pct"],
            "funding_regime": oi_funding["funding_regime"],
            "oi_regime": oi_funding["oi_regime"],
            "oi_change_4h_pct": oi_funding["oi_change_4h_pct"],
            "squeeze_status": oi_funding["squeeze_status"],
            "cvd_trend": cvd_info["cvd_trend"],
            "cvd_divergence": cvd_info["cvd_divergence"],
        },
        "strategy_tags": {
            "is_squeeze": is_squeeze,
            "is_sfp": is_sfp,
            "is_high_ev": is_high_ev,
        },
        "historical_signal": hist_signal,
        "timeframe": timeframe,
        "data_source": data_source,
        "data_status": data_status,
    }


@router.get("")
async def get_screener_opportunities(
    asset_type: str = Query(None, description="Filter by type: crypto (100% MEXC Crypto)"),
    timeframe: str = Query("15m", description="MEXC Timeframe: 1m, 5m, 15m, 30m, 1h, 4h, 1d"),
    min_score: int = Query(0, description="Minimum opportunity score 0-100"),
    strategy: str = Query("all", description="Strategy tab: all | squeeze | sfp | high_ev"),
):
    """
    ATRED v3.0 Two-Stage MEXC Full-Market Screener:
      - Stage 1: Fast Ticker Funnel dari seluruh pasar MEXC USDT-M
      - Stage 2: Deep Quant Scan (Layer 1 RANSAC/SFP + Layer 2 Orderflow/OI + Layer 3 Stat Edge + Net EV%)
    """
    tf = timeframe.lower() if timeframe else "15m"
    if tf == "1s":
        tf = "1m"
    cache_key = f"mexc_v3:{min_score}:{tf}"
    now = time.time()

    if cache_key in _SCREENER_CACHE:
        cached_items, timestamp = _SCREENER_CACHE[cache_key]
        if now - timestamp < _CACHE_TTL:
            return _filter_by_strategy(cached_items, tf, strategy)

    candidates = _select_stage1_funnel_candidates(max_candidates=24)

    results = []
    max_workers = min(10, len(candidates)) if candidates else 1
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_process_asset, it, tf): it for it in candidates}
        for future in as_completed(futures):
            try:
                res = future.result()
                if res and res["score"] >= min_score:
                    results.append(res)
            except Exception:
                pass

    results.sort(key=lambda x: x["score"], reverse=True)
    _SCREENER_CACHE[cache_key] = (results, now)
    return _filter_by_strategy(results, tf, strategy)


def _filter_by_strategy(items: list[dict], timeframe: str, strategy: str) -> dict:
    strat = (strategy or "all").lower().strip()
    if strat == "squeeze":
        filtered = [it for it in items if it.get("strategy_tags", {}).get("is_squeeze")]
    elif strat == "sfp":
        filtered = [it for it in items if it.get("strategy_tags", {}).get("is_sfp")]
    elif strat == "high_ev":
        filtered = [it for it in items if it.get("strategy_tags", {}).get("is_high_ev")]
    else:
        filtered = items

    return {
        "total": len(filtered),
        "total_scanned": len(items),
        "exchange": "MEXC_USDT_M",
        "timeframe": timeframe,
        "strategy": strat,
        "items": filtered,
    }


@router.get("/correlation-matrix")
async def get_crypto_correlation_matrix(
    timeframe: str = Query("1h", description="Timeframe perhitungan korelasi: 15m, 1h, 4h"),
):
    """
    Menghitung Matriks Korelasi Pearson Real-Time & Relative Strength (RS_Alt/BTC)
    antar aset kripto utama MEXC untuk mendeteksi koin Decoupled Leader vs Beta Follower.
    """
    now = time.time()
    if _CORR_CACHE["data"] is not None and (now - _CORR_CACHE["ts"]) < 45.0:
        return _CORR_CACHE["data"]

    symbols = [
        "BTC_USDT", "ETH_USDT", "SOL_USDT", "BNB_USDT",
        "XRP_USDT", "DOGE_USDT", "SUI_USDT", "PEPE_USDT",
    ]
    returns_map = {}
    ret_12bar_map = {}

    def _load_ret(sym):
        df = fetch_ohlcv(sym, interval=timeframe, limit=60)
        if df is not None and len(df) >= 20:
            closes = df['Close'].astype(float)
            rets = closes.pct_change().dropna().tail(45).values
            r12 = float((closes.iloc[-1] - closes.iloc[-13]) / closes.iloc[-13] * 100.0) if len(closes) >= 13 else 0.0
            return sym, rets, round(r12, 2)
        return sym, None, 0.0

    with ThreadPoolExecutor(max_workers=8) as ex:
        for sym, rets, r12 in ex.map(_load_ret, symbols):
            if rets is not None and len(rets) >= 15:
                returns_map[sym] = rets
                ret_12bar_map[sym] = r12

    valid_syms = [s for s in symbols if s in returns_map]
    min_len = min((len(returns_map[s]) for s in valid_syms), default=0)

    matrix = {}
    for s1 in valid_syms:
        matrix[s1] = {}
        for s2 in valid_syms:
            if s1 == s2:
                matrix[s1][s2] = 1.0
            elif min_len >= 10:
                a = returns_map[s1][-min_len:]
                b = returns_map[s2][-min_len:]
                if np.std(a) > 1e-12 and np.std(b) > 1e-12:
                    corr = float(np.corrcoef(a, b)[0, 1])
                    matrix[s1][s2] = round(0.0 if np.isnan(corr) else corr, 2)
                else:
                    matrix[s1][s2] = 0.0
            else:
                matrix[s1][s2] = 0.0

    btc_r12 = ret_12bar_map.get("BTC_USDT", 0.0)
    relative_strength = []
    for s in valid_syms:
        rs = round(ret_12bar_map.get(s, 0.0) - btc_r12, 2)
        corr_btc = matrix.get(s, {}).get("BTC_USDT", 1.0)
        if s == "BTC_USDT":
            status = "BENCHMARK_INDEX"
        elif rs > 2.0 and corr_btc < 0.75:
            status = "DECOUPLED_STRONG_LEADER"
        elif rs > 0.5:
            status = "OUTPERFORMING_BTC"
        elif rs < -1.5:
            status = "LAGGING_WEAK"
        else:
            status = "BETA_FOLLOWER"
        relative_strength.append({
            "symbol": s,
            "return_12bar_pct": ret_12bar_map.get(s, 0.0),
            "rs_vs_btc_pct": rs,
            "corr_with_btc": corr_btc,
            "status": status,
        })

    payload = {
        "timeframe": timeframe,
        "symbols": valid_syms,
        "matrix": matrix,
        "relative_strength": relative_strength,
        "timestamp": now,
    }
    _CORR_CACHE["data"] = payload
    _CORR_CACHE["ts"] = now
    return payload


@router.get("/catalyst-calendar")
async def get_crypto_catalyst_calendar():
    """
    Kalender Katalis Kripto & Siklus Settlement Funding Rate MEXC (00:00, 08:00, 16:00 UTC).
    """
    now_utc = datetime.now(timezone.utc)
    hour_utc = now_utc.hour
    minute_utc = now_utc.minute

    next_settlement_hour = ((hour_utc // 8) + 1) * 8
    hours_left = (next_settlement_hour - hour_utc - 1) % 8
    mins_left = (60 - minute_utc) % 60
    if mins_left == 0:
        hours_left += 1

    settlement_label = f"{next_settlement_hour % 24:02d}:00 UTC ({hours_left}j {mins_left}m lagi)"

    events = [
        {
            "id": "mexc-funding-settlement",
            "time": settlement_label,
            "category": "FUNDING_SETTLEMENT",
            "asset": "ALL USDT-M PERP",
            "event": "MEXC 8-Hour Funding Rate Settlement Window",
            "impact": "HIGH",
            "detail": "Waspadai lonjakan volatilitas & potensi Short/Long Squeeze 15 menit sebelum jam settlement funding.",
        },
        {
            "id": "sol-sui-ecosystem",
            "time": "Siklus Likuiditas Harian (13:30 - 16:00 UTC)",
            "category": "LIQUIDITY_WINDOW",
            "asset": "BTC_USDT / SOL_USDT",
            "event": "US Session Open & CME Crypto Futures Overlap",
            "impact": "HIGH",
            "detail": "Periode volume orderbook tertinggi di MEXC. Ideal untuk eksekusi breakout & sapuan likuiditas SFP.",
        },
        {
            "id": "token-unlock-watch",
            "time": "Jadwal Vesting Mingguan",
            "category": "TOKEN_UNLOCK",
            "asset": "SUI_USDT / ARB_USDT / APT_USDT",
            "event": "Cliff Token Unlock & Ecosystem Emission",
            "impact": "MEDIUM",
            "detail": "Pantau rasio Open Interest & CVD untuk mendeteksi hedging short institusional menjelang distribusi suplai.",
        },
        {
            "id": "meme-perp-rotation",
            "time": "Siklus Rotasi Altcoin",
            "category": "MEME_VOLATILITY",
            "asset": "PEPE_USDT / WIF_USDT / BONK_USDT",
            "event": "High-Beta Meme Perpetual Liquidity Rotation",
            "impact": "MEDIUM",
            "detail": "Gunakan Maker Limit Entry (0% Fee) & pemicu Stop-Loss Fair Price untuk menghindari likuidasi scam wick.",
        },
    ]

    return {
        "exchange": "MEXC_USDT_M",
        "next_funding_settlement": settlement_label,
        "utc_now": now_utc.strftime("%H:%M UTC"),
        "events": events,
    }
