from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import asyncio
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

    swing_low = float(df['Low'].tail(15).min())
    swing_high = float(df['High'].tail(15).max())
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
    period: str = Query("15m", description="MEXC Timeframe: 1m, 5m, 15m, 30m, 1h, 4h, 1d"),
):
    """
    ATRED v3.0 3-Layer Deep Quantitative & MEXC Derivatives Engine:
      - Layer 1: Robust Technicals (RANSAC Trendlines, SFP Stop-Hunt, Regime ADX+Hurst, BTC Gate, Stoch 14 3 3)
      - Layer 2: MEXC Derivatives & Orderflow Microstructure (Funding Rate, OI Matrix, 20-Level OBI, CVD, Slippage Guard)
      - Layer 3 & Execution: 0% Maker Fee Limit Entry, Split TP1/TP2, FAIR_PRICE SL, Net EV, Half-Kelly, Safe Max Leverage
    """
    resolved_sym = resolve_symbol(symbol, "futures")
    df = await asyncio.to_thread(fetch_ohlcv, resolved_sym, period=period)
    if df.empty or len(df) < 15:
        raise HTTPException(status_code=404, detail="Data time-series tidak ditemukan untuk simbol ini.")

    overview, mexc_derivatives = await asyncio.gather(
        asyncio.to_thread(get_asset_overview, resolved_sym),
        asyncio.to_thread(analyze_mexc_derivatives, resolved_sym, df, period),
    )
    data_status = df_data_status(df, resolved_sym, period)
    latest_close = float(df['Close'].iloc[-1])
    dec = _dec(latest_close)

    # LAYER 1: Technical Indicators, RANSAC Pattern & SFP Detection
    rsi_s = calculate_rsi(df['Close'])
    atr_s = calculate_atr(df)
    macd_line, sig_line, hist = calculate_macd(df['Close'])
    bb_upper, bb_mid, bb_lower = calculate_bollinger_bands(df['Close'])

    latest_rsi = round(float(rsi_s.iloc[-1]), 2)
    latest_atr = round(float(atr_s.iloc[-1]), dec)
    vol_anomaly = False if is_volume_meaningless(resolved_sym) else check_volume_anomaly(df)
    pattern_res = detect_chart_patterns(df)

    swing_low = float(df['Low'].tail(15).min())
    swing_high = float(df['High'].tail(15).max())

    # Stochastic 14 3 3 & Fibonacci
    stoch_data = analyze_stochastic(df, 14, 3, 3)
    fib_data = calculate_fibonacci(df, latest_atr)

    # Regime-Adaptive & BTC-Gated Comprehensive Signal
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
    regime_info = comp_signal.get("regime_context", {})
    btc_gate = comp_signal.get("btc_gate", {})
    sfp_info = comp_signal.get("sfp_info", pattern_res.get("sfp_info", {}))

    # Execution & Risk Plan (0% Maker Fee, Split TP1/TP2, FAIR_PRICE SL, Net EV, Half-Kelly)
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
    )

    # Circuit Breaker Enforcement: Jika data stale atau BTC Gate memblokir sinyal
    if not data_status.get("is_tradable", True):
        tp_sl["trade_validity"] = "HALTED_DATA_STALE"
    elif comp_signal.get("btc_blocked"):
        tp_sl["trade_validity"] = "BLOCKED_BY_BTC_DUMP"

    target_zones = calculate_target_zones(
        df, latest_atr, trade_direction, latest_close, fib=fib_data
    )
    confluence = build_confluence(
        df, latest_rsi, float(hist.iloc[-1]), stoch_data, fib_data,
        signal_type, trade_direction
    )
    signal_summary = calculate_signal_summary_and_backtest(
        df=df,
        direction=trade_direction,
        tp_sl=tp_sl,
        stoch_data=stoch_data,
        fib_data=fib_data,
        pattern_res=pattern_res,
        atr_val=latest_atr,
        timeframe=period,
    )

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
        "data_status": data_status,
    }

    repo_target = CRYPTO_GITHUB_REPOS.get(resolved_sym, "bitcoin/bitcoin")
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

    ai_summary, scalping_analysis, swing_analysis, investing_analysis, scenarios_analysis = await asyncio.gather(
        generate_ai_analysis(mode="overview", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=mexc_derivatives),
        generate_ai_analysis(mode="scalping", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=mexc_derivatives),
        generate_ai_analysis(mode="swing", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=mexc_derivatives),
        generate_ai_analysis(mode="investing", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=mexc_derivatives),
        generate_ai_analysis(mode="scenarios", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=mexc_derivatives),
    )

    return {
        "symbol": resolved_sym,
        "exchange": "MEXC_FUTURES_USDT_M",
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
