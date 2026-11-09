from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import asyncio
import time
from app.core.config import settings
from app.services.market_data import (
    fetch_ohlcv,
    get_asset_overview,
    resolve_symbol,
    df_data_status,
    is_volume_meaningless,
)
from app.core.quantitative import (
    calculate_rsi,
    calculate_atr,
    calculate_macd,
    calculate_bollinger_bands,
    check_volume_anomaly,
    calculate_dynamic_tp_sl,
    analyze_stochastic,
    calculate_fibonacci,
    calculate_target_zones,
    build_confluence,
    determine_comprehensive_signal,
    calculate_signal_summary_and_backtest,
    _dec,
)
from app.core.forecast import (
    forecast_next_move,
    apply_forward_plan,
)
from app.services.pattern_engine import detect_chart_patterns
from app.services.mexc_orderflow import analyze_mexc_derivatives
from app.services.dev_analytics import get_github_metrics
from app.services.ai_summarizer import (
    generate_ai_analysis,
    verify_ai_connection,
    fetch_remote_models,
    AI_PROVIDERS,
)

router = APIRouter(prefix="/analysis", tags=["Deep Analysis (3-Layer Quant & MEXC Derivatives)"])

CRYPTO_GITHUB_REPOS = {
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
    "DOT_USDT": "paritytech/polkadot-sdk",
    "SUI_USDT": "MystenLabs/sui",
    "APT_USDT": "aptos-labs/aptos-core",
    "UNI_USDT": "Uniswap/v3-core",
    "AAVE_USDT": "aave/aave-v3-core",
    "ATOM_USDT": "cosmos/cosmos-sdk",
    "INJ_USDT": "InjectiveLabs/injective-Chain-Releases",
}


class AIKeyTestRequest(BaseModel):
    provider: str
    api_key: str
    model: Optional[str] = None
    base_url: Optional[str] = None


class FetchModelsRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class AIQueryRequest(BaseModel):
    mode: str = "scalping"  # scalping, overview, swing, scenarios, chat
    custom_prompt: Optional[str] = None
    provider: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None
    period: Optional[str] = "15m"


_signal_persistence_cache: dict = {}


@router.get("/ai/providers")
async def get_ai_providers():
    configured_providers = {
        "gemini": bool(settings.GEMINI_API_KEY),
        "openai": bool(settings.OPENAI_API_KEY),
        "deepseek": bool(settings.DEEPSEEK_API_KEY),
        "groq": bool(settings.GROQ_API_KEY),
        "custom": False,
    }
    return {
        "providers": AI_PROVIDERS,
        "default_provider": settings.DEFAULT_AI_PROVIDER,
        "default_model": settings.DEFAULT_AI_MODEL,
        "server_configured": configured_providers,
    }


@router.post("/ai/test-key")
async def test_ai_key(req: AIKeyTestRequest):
    result = await verify_ai_connection(
        provider=req.provider,
        api_key=req.api_key,
        model=req.model,
        base_url=req.base_url,
    )
    if result.get("success"):
        models_data = await fetch_remote_models(
            provider=req.provider,
            api_key=req.api_key,
            base_url=req.base_url,
        )
        result["available_models"] = models_data.get("models", [])
    return result


@router.post("/ai/models")
async def get_provider_models(req: FetchModelsRequest):
    result = await fetch_remote_models(
        provider=req.provider,
        api_key=req.api_key,
        base_url=req.base_url,
    )
    return result


@router.post("/{symbol}/ai-query")
async def query_ai_analysis(symbol: str, req: AIQueryRequest):
    resolved_sym = resolve_symbol(symbol, "futures")
    eff_period = req.period or "15m"
    df = await asyncio.to_thread(fetch_ohlcv, resolved_sym, period=eff_period)
    if df.empty or len(df) < 15:
        raise HTTPException(status_code=404, detail="Data time-series tidak ditemukan untuk simbol ini.")

    overview, mexc_derivatives = await asyncio.gather(
        asyncio.to_thread(get_asset_overview, resolved_sym),
        asyncio.to_thread(analyze_mexc_derivatives, resolved_sym, df, eff_period),
    )
    data_status = df_data_status(df, resolved_sym, eff_period)
    latest_close = float(df['Close'].iloc[-1])
    dec = _dec(latest_close)

    rsi_s = calculate_rsi(df['Close'])
    atr_s = calculate_atr(df)
    macd_line, sig_line, hist = calculate_macd(df['Close'])
    bb_upper, bb_mid, bb_lower = calculate_bollinger_bands(df['Close'])
    vol_anomaly = False if is_volume_meaningless(resolved_sym) else check_volume_anomaly(df)
    pattern_res = detect_chart_patterns(df)

    swing_low = float(df['Low'].tail(40).min())
    swing_high = float(df['High'].tail(40).max())
    latest_atr = round(float(atr_s.iloc[-1]), dec)
    latest_rsi = round(float(rsi_s.iloc[-1]), 2)

    stoch_data = analyze_stochastic(df, 14, 3, 3)
    fib_data = calculate_fibonacci(df, latest_atr)

    comp_signal = determine_comprehensive_signal(
        df=df,
        pattern_res=pattern_res,
        rsi_val=latest_rsi,
        macd_hist=float(hist.iloc[-1]),
        stoch_data=stoch_data,
        fib_data=fib_data,
        symbol=resolved_sym,
        orderflow_data=mexc_derivatives,
    )
    trade_direction = comp_signal["direction"]
    signal_type = comp_signal["signal_type"]
    regime_context = comp_signal.get("regime_context", {})

    tp_sl = calculate_dynamic_tp_sl(
        breakout_price=latest_close,
        pattern_height=pattern_res.get("pattern_height", latest_atr * 2),
        swing_low=swing_low,
        atr_14=latest_atr,
        swing_high=swing_high,
        signal_type=signal_type,
        direction=trade_direction,
        win_rate_pct=min(75.0, max(45.0, float(comp_signal.get("confidence", 58)))),
        adx_val=float(regime_context.get("adx_14", 22.0)),
        obi_val=float(mexc_derivatives.get("obi_20_level", 0.0)),
        spread_pct=float(overview.get("spread_pct", 0.01)),
        funding_rate_pct=float(mexc_derivatives.get("funding_rate_pct", 0.01)),
        max_zero_slippage_usdt=float(mexc_derivatives.get("max_zero_slippage_position_usdt", 25000.0)),
        df=df,
        fib_data=fib_data,
    )

    layer_1 = {
        "rsi": latest_rsi,
        "atr": latest_atr,
        "macd": {
            "macd": round(float(macd_line.iloc[-1]), dec),
            "signal": round(float(sig_line.iloc[-1]), dec),
            "histogram": round(float(hist.iloc[-1]), dec),
        },
        "bollinger_bands": {
            "upper": round(float(bb_upper.iloc[-1]), dec),
            "middle": round(float(bb_mid.iloc[-1]), dec),
            "lower": round(float(bb_lower.iloc[-1]), dec),
        },
        "stochastic": stoch_data,
        "fibonacci": fib_data,
        "pattern": pattern_res["pattern"],
        "type": signal_type,
        "direction": trade_direction,
        "is_bearish": comp_signal["is_bearish"],
        "confidence": comp_signal["confidence"],
        "comp_signal": comp_signal,
        "volume_anomaly": vol_anomaly,
        "tp_sl": tp_sl,
        "swing_high": swing_high,
        "swing_low": swing_low,
        "data_status": data_status,
    }

    repo_target = CRYPTO_GITHUB_REPOS.get(resolved_sym, "bitcoin/bitcoin")
    dev_data = await get_github_metrics(repo_target)

    result = await generate_ai_analysis(
        mode=req.mode,
        asset_data=overview,
        technical_data=layer_1,
        dev_data=dev_data,
        macro_data=mexc_derivatives,
        custom_prompt=req.custom_prompt,
        provider=req.provider,
        api_key=req.api_key,
        model=req.model,
        base_url=req.base_url,
    )
    return result


@router.get("/{symbol}")
async def get_deep_analysis(
    symbol: str,
    period: str = Query("15m", description="MEXC Timeframe: 1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d"),
    light: bool = Query(False, description="Mode ringan untuk sinkronisasi grafik real-time (tanpa panggil ulang AI/GitHub)"),
    market_type: str = Query("future", description="Market type: spot | future"),
):
    """
    ATRED v3.0 3-Layer Deep Quantitative & MEXC Derivatives Engine:
      - Layer 1: Robust Technicals (RANSAC Trendlines, SFP Stop-Hunt, Regime ADX+Hurst, BTC Gate, Stoch 14 3 3)
      - Layer 2: MEXC Derivatives & Orderflow Microstructure (Funding Rate, OI Matrix, 20-Level OBI, CVD, Slippage Guard)
      - Layer 3 & Execution: 0% Maker Fee Limit Entry, Split TP1/TP2, FAIR_PRICE SL, Net EV, Half-Kelly, Safe Max Leverage
    """
    m_type = "spot" if str(market_type or "future").lower().startswith("spot") else "futures"
    resolved_sym = resolve_symbol(symbol, "futures")
    df = await asyncio.to_thread(fetch_ohlcv, resolved_sym, period=period, market_type=m_type)
    if df.empty or len(df) < 15:
        raise HTTPException(status_code=404, detail="Data time-series tidak ditemukan untuk simbol ini.")

    overview, mexc_derivatives = await asyncio.gather(
        asyncio.to_thread(get_asset_overview, resolved_sym),
        asyncio.to_thread(analyze_mexc_derivatives, resolved_sym, df, period),
    )
    # Sinkronkan candle terakhir (berjalan) dengan harga live quote terbaru agar grafik langsung bergerak real-time!
    live_quote_price = float(overview.get("price") or 0.0)
    if live_quote_price > 0 and len(df) > 0:
        last_idx = df.index[-1]
        df.at[last_idx, "Close"] = live_quote_price
        df.at[last_idx, "High"] = max(float(df.at[last_idx, "High"]), live_quote_price)
        df.at[last_idx, "Low"] = min(float(df.at[last_idx, "Low"]), live_quote_price)

    data_status = df_data_status(df, resolved_sym, period)
    latest_close = float(df['Close'].iloc[-1])
    dec = _dec(latest_close)

    # ANTI-REPAINT & ANTI-FLIP-FLOP:
    # Untuk timeframe multi-menit (5m, 15m, 30m, 1h, 4h, 1d), perhitungan indikator teknikal,
    # pola chart, level Fibonacci, dan arah sinyal kuantitatif WAJIB berbasis candle yang SUDAH
    # CONFIRMED CLOSE (df.iloc[:-1]). Candle berjalan (df.iloc[-1]) hanya digunakan untuk live ticker
    # harga, deteksi sentuhan Entry Zone, invalidasi Stop Loss, atau Take Profit!
    if period in ["5m", "15m", "30m", "1h", "4h", "1d"] and len(df) >= 20:
        df_struct = df.iloc[:-1].copy()
        struct_close = float(df_struct['Close'].iloc[-1])
    else:
        df_struct = df
        struct_close = latest_close

    # LAYER 1: Technical Indicators, RANSAC Pattern & SFP Detection (Confirmed Closed Structure)
    rsi_s = calculate_rsi(df_struct['Close'])
    atr_s = calculate_atr(df_struct)
    macd_line, sig_line, hist = calculate_macd(df_struct['Close'])
    bb_upper, bb_mid, bb_lower = calculate_bollinger_bands(df_struct['Close'])

    latest_rsi = round(float(rsi_s.iloc[-1]), 2)
    latest_atr = round(float(atr_s.iloc[-1]), dec)
    vol_anomaly = False if is_volume_meaningless(resolved_sym) else check_volume_anomaly(df_struct)
    pattern_res = detect_chart_patterns(df_struct)

    swing_low = float(df_struct['Low'].tail(40).min())
    swing_high = float(df_struct['High'].tail(40).max())

    # Stochastic 14 3 3 & Fibonacci
    stoch_data = analyze_stochastic(df_struct, 14, 3, 3)
    fib_data = calculate_fibonacci(df_struct, latest_atr)

    # Regime-Adaptive & BTC-Gated Comprehensive Signal
    comp_signal = determine_comprehensive_signal(
        df=df_struct,
        pattern_res=pattern_res,
        rsi_val=latest_rsi,
        macd_hist=float(hist.iloc[-1]),
        stoch_data=stoch_data,
        fib_data=fib_data,
        symbol=resolved_sym,
        orderflow_data=mexc_derivatives,
    )
    raw_direction = comp_signal["direction"]
    raw_score = comp_signal["score"]

    # HYSTERESIS & ACTIVE SETUP PERSISTENCE:
    # Mencegah sinyal berganti-ganti (flip-flop) antara menit 1 ke menit 5 saat harga berfluktuasi tipis intra-bar.
    # Setup aktif hanya dibatalkan jika:
    # 1. Stop Loss tersentuh oleh live tick (Invalidated)
    # 2. Target TP2 tercapai (Completed)
    # 3. Terjadi Reversal struktural ekstrem dengan keyakinan tinggi (|score| >= 30 berlawanan)
    cache_key = (resolved_sym, period)
    cached_setup = _signal_persistence_cache.get(cache_key)
    live_high = float(df['High'].iloc[-1])
    live_low = float(df['Low'].iloc[-1])

    if cached_setup:
        cached_dir = cached_setup["direction"]
        cached_sl = float(cached_setup.get("sl", 0.0))
        cached_tp1 = float(cached_setup.get("tp1", 0.0))
        cached_tp2 = float(cached_setup.get("tp2", 0.0))
        cached_entry = float(cached_setup.get("maker_limit_entry", latest_close))

        is_sl_hit = (live_low <= cached_sl) if cached_dir == "LONG" else (live_high >= cached_sl)
        is_tp1_hit = (
            (live_high >= cached_tp1 or latest_close >= cached_tp1 - 0.15 * latest_atr)
            if (cached_dir == "LONG" and cached_tp1 > 0)
            else (
                (live_low <= cached_tp1 or latest_close <= cached_tp1 + 0.15 * latest_atr)
                if (cached_dir == "SHORT" and cached_tp1 > 0)
                else False
            )
        )
        is_tp2_hit = (live_high >= cached_tp2) if (cached_dir == "LONG" and cached_tp2 > 0) else ((live_low <= cached_tp2) if (cached_dir == "SHORT" and cached_tp2 > 0) else False)
        is_entry_far_behind = abs(latest_close - cached_entry) >= 0.85 * max(latest_atr, latest_close * 0.002)

        is_strong_reversal = (
            (cached_dir == "LONG" and raw_score <= -25) or
            (cached_dir == "SHORT" and raw_score >= 25)
        )

        # Jika target TP1/TP2 sudah tersentuh atau harga sudah lari jauh dari entry lama, perbarui sinyal!
        if not is_sl_hit and not is_tp1_hit and not is_tp2_hit and not is_entry_far_behind and not is_strong_reversal:
            trade_direction = cached_dir
            signal_type = cached_setup.get("signal_type", comp_signal["signal_type"])
            comp_signal["direction"] = cached_dir
            comp_signal["is_bearish"] = (cached_dir == "SHORT")
            comp_signal["signal_type"] = signal_type
        else:
            trade_direction = raw_direction
            signal_type = comp_signal["signal_type"]
    else:
        trade_direction = raw_direction
        signal_type = comp_signal["signal_type"]

    regime_info = comp_signal.get("regime_context", {})
    btc_gate = comp_signal.get("btc_gate", {})
    sfp_info = comp_signal.get("sfp_info", pattern_res.get("sfp_info", {}))

    # Execution & Risk Plan (Anti-Telat & Anti-Stop-Hunt, mengacu pada df penuh termasuk candle berjalan)
    tp_sl = calculate_dynamic_tp_sl(
        breakout_price=latest_close,
        pattern_height=pattern_res.get("pattern_height", latest_atr * 2),
        swing_low=swing_low,
        atr_14=latest_atr,
        swing_high=swing_high,
        signal_type=signal_type,
        direction=trade_direction,
        win_rate_pct=min(76.0, max(45.0, float(comp_signal.get("confidence", 58)))),
        adx_val=float(regime_info.get("adx_14", 22.0)),
        obi_val=float(mexc_derivatives.get("obi_20_level", 0.0)),
        spread_pct=float(overview.get("spread_pct", 0.01)),
        funding_rate_pct=float(mexc_derivatives.get("funding_rate_pct", 0.01)),
        max_zero_slippage_usdt=float(mexc_derivatives.get("max_zero_slippage_position_usdt", 25000.0)),
        df=df,
        fib_data=fib_data,
        current_price=latest_close,
    )

    # -------------------------------------------------------------------------
    # Forward Forecast Engine (Prediksi Fase Berikutnya / Area Ungu)
    # Menggunakan df lengkap (termasuk candle live) agar ekstrem terbaru ikut terbaca.
    # -------------------------------------------------------------------------
    forecast = forecast_next_move(
        df=df,
        base_direction=trade_direction,
        base_plan=tp_sl,
        base_confidence=float(comp_signal.get("confidence", 58)),
        timeframe=period,
        horizon_bars=12,
    )

    # Jika setup lama terdeteksi stale (target sudah lewat) atau pasar berada di fase impulse/exhaustion baru,
    # ganti rencana trading dengan forward plan yang selalu berada di masa depan.
    if forecast.get("override_plan"):
        tp_sl = apply_forward_plan(tp_sl, forecast, win_rate_pct=float(comp_signal.get("confidence", 58)))
        trade_direction = tp_sl.get("direction", trade_direction)
        signal_type = f"{trade_direction} ({forecast.get('phase_label')})"
        comp_signal["direction"] = trade_direction
        comp_signal["is_bearish"] = (trade_direction == "SHORT")
        comp_signal["signal_type"] = signal_type

    # Simpan/perbarui setup aktif ke persistence cache
    _signal_persistence_cache[cache_key] = {
        "direction": trade_direction,
        "signal_type": signal_type,
        "sl": float(tp_sl.get("sl", 0.0)),
        "tp1": float(tp_sl.get("tp1", 0.0)),
        "tp2": float(tp_sl.get("tp2", 0.0)),
        "entry_zone": tp_sl.get("entry_zone", {}),
        "maker_limit_entry": float(tp_sl.get("maker_limit_entry", 0.0)),
        "last_closed_candle_time": str(df_struct['Time'].iloc[-1]),
        "updated_at": time.time(),
        "phase": forecast.get("phase"),
    }

    # Circuit Breaker Enforcement: Jika data stale atau BTC Gate memblokir sinyal
    if not data_status.get("is_tradable", True):
        tp_sl["trade_validity"] = "HALTED_DATA_STALE"
    elif comp_signal.get("btc_blocked"):
        tp_sl["trade_validity"] = "BLOCKED_BY_BTC_DUMP"

    target_zones = calculate_target_zones(
        df_struct, latest_atr, trade_direction, struct_close, fib=fib_data
    )
    confluence = build_confluence(
        df_struct, latest_rsi, float(hist.iloc[-1]), stoch_data, fib_data,
        signal_type, trade_direction
    )
    signal_summary = calculate_signal_summary_and_backtest(
        df=df_struct,
        direction=trade_direction,
        tp_sl=tp_sl,
        stoch_data=stoch_data,
        fib_data=fib_data,
        pattern_res=pattern_res,
        atr_val=latest_atr,
        timeframe=period,
    )
    signal_summary["forecast"] = forecast

    def _format_time_value(t):
        try:
            val = float(t)
            if val > 100000:
                return int(val)
        except Exception:
            pass
        return str(t)

    ohlcv_chart_data = []
    for _, row in df.iterrows():
        ohlcv_chart_data.append({
            "time": _format_time_value(row['Time']),
            "open": float(row['Open']),
            "high": float(row['High']),
            "low": float(row['Low']),
            "close": float(row['Close']),
            "volume": float(row['Volume']),
        })

    trendlines_data = {}
    if "trendlines" in pattern_res and "upper_line" in pattern_res["trendlines"]:
        tl = pattern_res["trendlines"]
        x_start_idx = min(tl["upper_line"][0]["x"], len(df) - 1)
        x_end_idx = min(tl["upper_line"][1]["x"], len(df) - 1)

        trendlines_data = {
            "upper_line": [
                {"time": _format_time_value(df['Time'].iloc[x_start_idx]), "price": tl["upper_line"][0]["price"]},
                {"time": _format_time_value(df['Time'].iloc[x_end_idx]), "price": tl["upper_line"][1]["price"]},
            ],
            "lower_line": [
                {"time": _format_time_value(df['Time'].iloc[x_start_idx]), "price": tl["lower_line"][0]["price"]},
                {"time": _format_time_value(df['Time'].iloc[x_end_idx]), "price": tl["lower_line"][1]["price"]},
            ],
        }

    # Map liquidity pool targets ke waktu candle nyata agar bisa dirender di chart
    liquidity_pools_timed = []
    for lp in pattern_res.get("liquidity_pool_targets", []):
        idx = min(max(0, int(lp.get("index", 0))), len(df) - 1)
        liquidity_pools_timed.append({
            **lp,
            "time": _format_time_value(df['Time'].iloc[idx]),
        })

    regime_context = {
        "market_regime": regime_info.get("market_regime", "TRANSITIONAL"),
        "adx_14": regime_info.get("adx_14", 20.0),
        "plus_di": regime_info.get("plus_di", 20.0),
        "minus_di": regime_info.get("minus_di", 20.0),
        "hurst_exponent": regime_info.get("hurst_exponent", 0.50),
        "trend_weight": regime_info.get("trend_weight", 0.50),
        "oscillator_weight": regime_info.get("oscillator_weight", 0.50),
        "description": regime_info.get("description", ""),
        "btc_1h_regime": btc_gate.get("btc_1h_regime", "NEUTRAL"),
        "alt_rs_vs_btc_pct": btc_gate.get("alt_rs_vs_btc_pct", 0.0),
        "btc_gate_status": btc_gate.get("btc_gate_status", "PASS"),
        "allow_alt_long": btc_gate.get("allow_alt_long", True),
    }

    layer_1 = {
        "rsi": latest_rsi,
        "atr": latest_atr,
        "macd": {
            "macd": round(float(macd_line.iloc[-1]), dec),
            "signal": round(float(sig_line.iloc[-1]), dec),
            "histogram": round(float(hist.iloc[-1]), dec),
        },
        "bollinger_bands": {
            "upper": round(float(bb_upper.iloc[-1]), dec),
            "middle": round(float(bb_mid.iloc[-1]), dec),
            "lower": round(float(bb_lower.iloc[-1]), dec),
        },
        "stochastic": stoch_data,
        "fibonacci": fib_data,
        "targets": target_zones,
        "confluence": confluence,
        "signal_summary": signal_summary,
        "price_zones": signal_summary.get("price_zones", []),
        "backtest": signal_summary.get("backtest", {}),
        "pattern": pattern_res["pattern"],
        "wick_outliers_ignored": pattern_res.get("wick_outliers_ignored", 0),
        "sfp_detected": pattern_res.get("sfp_detected", "NONE"),
        "sfp_info": sfp_info,
        "liquidity_pool_targets": liquidity_pools_timed,
        "type": signal_type,
        "direction": trade_direction,
        "is_bearish": comp_signal["is_bearish"],
        "confidence": comp_signal["confidence"],
        "comp_signal": comp_signal,
        "candlestick_patterns": pattern_res.get("candlestick_patterns", []),
        "volume_anomaly": vol_anomaly,
        "tp_sl": tp_sl,
        "trendlines": trendlines_data,
        "swing_high": swing_high,
        "swing_low": swing_low,
        "regime_context": regime_context,
        "forecast": forecast,
        "data_status": data_status,
    }

    repo_target = CRYPTO_GITHUB_REPOS.get(resolved_sym, "bitcoin/bitcoin")
    if light:
        dev_data = None
        ai_summary = None
        scalping_analysis = None
        swing_analysis = None
        investing_analysis = None
        scenarios_analysis = None
    else:
        dev_data = await get_github_metrics(repo_target)

    layer_2_legacy = {
        "dev_metrics": dev_data,
        "mexc_derivatives": mexc_derivatives,
        "on_chain": {
            "whale_concentration": f"OBI {mexc_derivatives['obi_20_level']:+.2f} ({mexc_derivatives['obi_status']})",
            "liquidity_health": f"Max No-Slip: ${mexc_derivatives['max_zero_slippage_position_usdt']:,.0f} USDT",
            "liquidity_locked": f"Depth 5L: ${mexc_derivatives['top5_depth_usdt']:,.0f} USDT",
            "circulating_supply": mexc_derivatives["oi_regime"],
            "top_10_holders": f"Funding: {mexc_derivatives['funding_rate_pct']:+.4f}%",
            "is_estimated": False,
        },
    }

    if not light:
        ai_summary, scalping_analysis, swing_analysis, investing_analysis, scenarios_analysis = await asyncio.gather(
            generate_ai_analysis(mode="overview", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=mexc_derivatives),
            generate_ai_analysis(mode="scalping", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=mexc_derivatives),
            generate_ai_analysis(mode="swing", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=mexc_derivatives),
            generate_ai_analysis(mode="investing", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=mexc_derivatives),
            generate_ai_analysis(mode="scenarios", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=mexc_derivatives),
        )

    return {
        "symbol": resolved_sym,
        "exchange": "MEXC_SPOT" if m_type == "spot" else "MEXC_FUTURES_USDT_M",
        "market_type": m_type,
        "timeframe": period,
        "data_integrity": {
            "status": data_status.get("status", "LIVE_OK"),
            "data_status": data_status.get("status", "LIVE_OK"),
            "data_age_ms": data_status.get("data_age_ms", 0),
            "is_tradable": data_status.get("is_tradable", True),
            "halt_reason": data_status.get("halt_reason"),
        },
        "regime_context": regime_context,
        "layer1_technical": layer_1,
        "layer2_mexc_derivatives": mexc_derivatives,
        "execution_plan": tp_sl,
        "forecast": forecast,
        # Backward-compatible keys for Frontend components
        "overview": overview,
        "data_status": data_status,
        "ohlcv": ohlcv_chart_data,
        "layer_1_technical": layer_1,
        "layer_2_dev_onchain": layer_2_legacy,
        "layer_3_macro": mexc_derivatives,
        "ai_summary": ai_summary,
        "ai_options": {
            "scalping": scalping_analysis,
            "swing": swing_analysis,
            "investing": investing_analysis,
            "scenarios": scenarios_analysis,
        },
    }
