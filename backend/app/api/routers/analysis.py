from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import asyncio
import numpy as np
from app.core.config import settings
from app.services.market_data import (
    fetch_ohlcv, get_asset_overview, DEFAULT_ASSETS,
    resolve_symbol, df_data_status, is_volume_meaningless
)
from app.core.quantitative import (
    calculate_rsi, calculate_atr, calculate_macd,
    calculate_bollinger_bands, check_volume_anomaly,
    calculate_dynamic_tp_sl, analyze_stochastic, calculate_fibonacci,
    calculate_target_zones, build_confluence, determine_comprehensive_signal,
    calculate_signal_summary_and_backtest
)
from app.services.pattern_engine import detect_chart_patterns
from app.services.dev_analytics import get_github_metrics
from app.services.ai_summarizer import (
    generate_ai_narrative,
    generate_ai_analysis,
    verify_ai_connection,
    fetch_remote_models,
    AI_PROVIDERS
)

router = APIRouter(prefix="/analysis", tags=["Deep Analysis"])

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
    """
    Mengembalikan daftar penyedia AI yang didukung, model yang tersedia,
    serta status konfigurasi di sisi server (.env).
    """
    configured_providers = {
        "gemini": bool(settings.GEMINI_API_KEY),
        "openai": bool(settings.OPENAI_API_KEY),
        "deepseek": bool(settings.DEEPSEEK_API_KEY),
        "groq": bool(settings.GROQ_API_KEY),
        "custom": False
    }
    
    return {
        "providers": AI_PROVIDERS,
        "default_provider": settings.DEFAULT_AI_PROVIDER,
        "default_model": settings.DEFAULT_AI_MODEL,
        "server_configured": configured_providers
    }

@router.post("/ai/test-key")
async def test_ai_key(req: AIKeyTestRequest):
    """
    Menguji validitas dan latensi API Key AI untuk provider tertentu.
    Jika sukses, juga otomatis mengembalikan daftar model live dari API.
    """
    result = await verify_ai_connection(
        provider=req.provider,
        api_key=req.api_key,
        model=req.model,
        base_url=req.base_url
    )
    if result.get("success"):
        models_data = await fetch_remote_models(
            provider=req.provider,
            api_key=req.api_key,
            base_url=req.base_url
        )
        result["available_models"] = models_data.get("models", [])
    return result

@router.post("/ai/models")
async def get_provider_models(req: FetchModelsRequest):
    """
    Mengambil daftar model AI secara dinamis langsung dari API provider (Google Gemini, OpenAI, Groq, dll)
    atau mengembalikan katalog model komprehensif terkini.
    """
    result = await fetch_remote_models(
        provider=req.provider,
        api_key=req.api_key,
        base_url=req.base_url
    )
    return result

@router.post("/{symbol}/ai-query")
async def query_ai_analysis(symbol: str, req: AIQueryRequest):
    """
    Menghasilkan analisis AI kustom atau interaktif untuk simbol tertentu
    sesuai mode (scalping, swing, investing, scenarios, chat).
    """
    resolved_sym = resolve_symbol(symbol)
    eff_period = req.period or "15m"
    df = fetch_ohlcv(resolved_sym, period=eff_period)
    if df.empty or len(df) < 15:
        raise HTTPException(status_code=404, detail="Data time-series tidak ditemukan untuk simbol ini.")

    overview = get_asset_overview(resolved_sym)
    data_status = df_data_status(df, resolved_sym, eff_period)
    latest_close = float(df['Close'].iloc[-1])

    rsi_s = calculate_rsi(df['Close'])
    atr_s = calculate_atr(df)
    macd_line, sig_line, hist = calculate_macd(df['Close'])
    bb_upper, bb_mid, bb_lower = calculate_bollinger_bands(df['Close'])
    vol_anomaly = False if is_volume_meaningless(resolved_sym) else check_volume_anomaly(df)
    pattern_res = detect_chart_patterns(df)

    swing_low = float(df['Low'].tail(15).min())
    swing_high = float(df['High'].tail(15).max())
    latest_atr = round(float(atr_s.iloc[-1]), 4)
    latest_rsi = round(float(rsi_s.iloc[-1]), 2)

    stoch_data = analyze_stochastic(df, 14, 3, 3)
    fib_data = calculate_fibonacci(df, latest_atr)

    comp_signal = determine_comprehensive_signal(
        df=df,
        pattern_res=pattern_res,
        rsi_val=latest_rsi,
        macd_hist=float(hist.iloc[-1]),
        stoch_data=stoch_data,
        fib_data=fib_data
    )
    trade_direction = comp_signal["direction"]
    signal_type = comp_signal["signal_type"]

    tp_sl = calculate_dynamic_tp_sl(
        breakout_price=latest_close,
        pattern_height=pattern_res.get("pattern_height", latest_atr * 2),
        swing_low=swing_low,
        atr_14=latest_atr,
        swing_high=swing_high,
        signal_type=signal_type,
        direction=trade_direction
    )

    layer_1 = {
        "rsi": latest_rsi,
        "atr": latest_atr,
        "macd": {
            "macd": round(float(macd_line.iloc[-1]), 4),
            "signal": round(float(sig_line.iloc[-1]), 4),
            "histogram": round(float(hist.iloc[-1]), 4),
        },
        "bollinger_bands": {
            "upper": round(float(bb_upper.iloc[-1]), 2),
            "middle": round(float(bb_mid.iloc[-1]), 2),
            "lower": round(float(bb_lower.iloc[-1]), 2)
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

    repos = {
        "BTC-USD": "bitcoin/bitcoin",
        "ETH-USD": "ethereum/go-ethereum",
        "SOL-USD": "solana-labs/solana",
        "AVAX-USD": "ava-labs/avalanchego",
        "BNB-USD": "bnb-chain/bsc",
        "XRP-USD": "XRPLF/rippled",
        "ADA-USD": "IntersectMBO/cardano-node",
        "DOGE-USD": "dogecoin/dogecoin",
        "NEAR-USD": "near/nearcore",
        "LINK-USD": "smartcontractkit/chainlink",
    }
    repo_target = repos.get(resolved_sym, "bitcoin/bitcoin")
    dev_data = await get_github_metrics(repo_target)

    macro_data = {
        "fed_rate": "5.25% - 5.50%",
        "cpi_yoy": "3.1%",
        "unemployment_rate": "4.1%",
        "dxy_index": 104.25,
        "market_sentiment": "Greed (64/100)",
        "is_static_reference": True,
        "reference_note": "Data makro adalah nilai referensi baseline."
    }

    result = await generate_ai_analysis(
        mode=req.mode,
        asset_data=overview,
        technical_data=layer_1,
        dev_data=dev_data,
        macro_data=macro_data,
        custom_prompt=req.custom_prompt,
        provider=req.provider,
        api_key=req.api_key,
        model=req.model,
        base_url=req.base_url
    )

    return result

@router.get("/{symbol}")
async def get_deep_analysis(
    symbol: str,
    period: str = Query("15m", description="Scalping timeframe: 1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d")
):
    """
    3-Layer Deep Analysis Engine:
    - Layer 1: Technical Indicators, Pattern Recognition, Trendline Coordinates, Dynamic TP/SL
    - Layer 2: Developer Metrics & On-Chain Concentration
    - Layer 3: Macro Economic Context, AI Quantitative Narrative & Pre-calculated Analysis Options
    """
    resolved_sym = resolve_symbol(symbol)
    df = fetch_ohlcv(resolved_sym, period=period)
    if df.empty or len(df) < 15:
        raise HTTPException(status_code=404, detail="Data time-series tidak ditemukan untuk simbol ini.")
        
    overview = get_asset_overview(resolved_sym)
    data_status = df_data_status(df, resolved_sym, period)
    latest_close = float(df['Close'].iloc[-1])
    
    # 1. LAYER 1: Technical Indicators & Pattern Recognition
    rsi_s = calculate_rsi(df['Close'])
    atr_s = calculate_atr(df)
    macd_line, sig_line, hist = calculate_macd(df['Close'])
    bb_upper, bb_mid, bb_lower = calculate_bollinger_bands(df['Close'])
    
    latest_rsi = round(float(rsi_s.iloc[-1]), 2)
    latest_atr = round(float(atr_s.iloc[-1]), 4)
    vol_anomaly = False if is_volume_meaningless(resolved_sym) else check_volume_anomaly(df)
    pattern_res = detect_chart_patterns(df)
    
    swing_low = float(df['Low'].tail(15).min())
    swing_high = float(df['High'].tail(15).max())

    # Indikator lanjutan: Stochastic 14 3 3 & Fibonacci (pro anchor)
    stoch_data = analyze_stochastic(df, 14, 3, 3)
    fib_data = calculate_fibonacci(df, latest_atr)

    # Keputusan sinyal multi-faktor kuantitatif (eliminasi kontradiksi LONG vs SHORT)
    comp_signal = determine_comprehensive_signal(
        df=df,
        pattern_res=pattern_res,
        rsi_val=latest_rsi,
        macd_hist=float(hist.iloc[-1]),
        stoch_data=stoch_data,
        fib_data=fib_data
    )
    trade_direction = comp_signal["direction"]
    signal_type = comp_signal["signal_type"]
    
    tp_sl = calculate_dynamic_tp_sl(
        breakout_price=latest_close,
        pattern_height=pattern_res.get("pattern_height", latest_atr * 2),
        swing_low=swing_low,
        atr_14=latest_atr,
        swing_high=swing_high,
        signal_type=signal_type,
        direction=trade_direction
    )

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

    # Format OHLCV untuk Lightweight Charts: [{ time, open, high, low, close, volume }]
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
        
    # Map koordinat trendline ke tanggal nyata
    trendlines_data = {}
    if "trendlines" in pattern_res and "upper_line" in pattern_res["trendlines"]:
        tl = pattern_res["trendlines"]
        x_start_idx = min(tl["upper_line"][0]["x"], len(df)-1)
        x_end_idx = min(tl["upper_line"][1]["x"], len(df)-1)
        
        trendlines_data = {
            "upper_line": [
                {"time": _format_time_value(df['Time'].iloc[x_start_idx]), "price": tl["upper_line"][0]["price"]},
                {"time": _format_time_value(df['Time'].iloc[x_end_idx]), "price": tl["upper_line"][1]["price"]}
            ],
            "lower_line": [
                {"time": _format_time_value(df['Time'].iloc[x_start_idx]), "price": tl["lower_line"][0]["price"]},
                {"time": _format_time_value(df['Time'].iloc[x_end_idx]), "price": tl["lower_line"][1]["price"]}
            ]
        }

    layer_1 = {
        "rsi": latest_rsi,
        "atr": latest_atr,
        "macd": {
            "macd": round(float(macd_line.iloc[-1]), 4),
            "signal": round(float(sig_line.iloc[-1]), 4),
            "histogram": round(float(hist.iloc[-1]), 4),
        },
        "bollinger_bands": {
            "upper": round(float(bb_upper.iloc[-1]), 2),
            "middle": round(float(bb_mid.iloc[-1]), 2),
            "lower": round(float(bb_lower.iloc[-1]), 2)
        },
        "stochastic": stoch_data,
        "fibonacci": fib_data,
        "targets": target_zones,
        "confluence": confluence,
        "signal_summary": signal_summary,
        "price_zones": signal_summary.get("price_zones", []),
        "backtest": signal_summary.get("backtest", {}),
        "pattern": pattern_res["pattern"],
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
        "data_status": data_status,
    }

    # 2. LAYER 2: Developer & On-Chain Analytics
    repos = {
        "BTC-USD": "bitcoin/bitcoin",
        "ETH-USD": "ethereum/go-ethereum",
        "SOL-USD": "solana-labs/solana",
        "AVAX-USD": "ava-labs/avalanchego",
        "BNB-USD": "bnb-chain/bsc",
        "XRP-USD": "XRPLF/rippled",
        "ADA-USD": "IntersectMBO/cardano-node",
        "DOGE-USD": "dogecoin/dogecoin",
        "NEAR-USD": "near/nearcore",
        "LINK-USD": "smartcontractkit/chainlink",
        "AAPL": "apple/swift",
        "MSFT": "microsoft/vscode",
        "NVDA": "NVIDIA/cuda-samples"
    }
    repo_target = repos.get(resolved_sym, "bitcoin/bitcoin" if "USD" in resolved_sym else "microsoft/vscode")
    dev_data = await get_github_metrics(repo_target)
    
    layer_2 = {
        "dev_metrics": dev_data,
        "on_chain": {
            "whale_concentration": "24.5% (Est.)",
            "liquidity_health": "Healthy (>80% locked)",
            "liquidity_locked": "Healthy (>80% locked)",
            "circulating_supply": "Distributed",
            "top_10_holders": "31.2% (Est.)",
            "is_estimated": True
        }
    }

    # 3. LAYER 3: Macro & AI Engine
    macro_data = {
        "fed_rate": "5.25% - 5.50%",
        "cpi_yoy": "3.1%",
        "unemployment_rate": "4.1%",
        "dxy_index": 104.25,
        "market_sentiment": "Greed (64/100)",
        "is_static_reference": True,
        "reference_note": "Indikator makro adalah referensi baseline."
    }
    
    # Jalankan 5 analisis mode secara paralel dengan asyncio.gather untuk respons instan
    ai_summary, scalping_analysis, swing_analysis, investing_analysis, scenarios_analysis = await asyncio.gather(
        generate_ai_analysis(mode="overview", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=macro_data),
        generate_ai_analysis(mode="scalping", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=macro_data),
        generate_ai_analysis(mode="swing", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=macro_data),
        generate_ai_analysis(mode="investing", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=macro_data),
        generate_ai_analysis(mode="scenarios", asset_data=overview, technical_data=layer_1, dev_data=dev_data, macro_data=macro_data),
    )

    return {
        "overview": overview,
        "data_status": data_status,
        "ohlcv": ohlcv_chart_data,
        "layer_1_technical": layer_1,
        "layer_2_dev_onchain": layer_2,
        "layer_3_macro": macro_data,
        "ai_summary": ai_summary,
        "ai_options": {
            "scalping": scalping_analysis,
            "swing": swing_analysis,
            "investing": investing_analysis,
            "scenarios": scenarios_analysis
        }
    }
