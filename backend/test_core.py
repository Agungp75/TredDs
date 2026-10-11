import asyncio
import pandas as pd
import numpy as np
from app.core.quantitative import (
    calculate_rsi, calculate_atr, calculate_macd,
    detect_pivots, calculate_trendlines, check_volume_anomaly,
    calculate_dynamic_tp_sl
)
from app.services.pattern_engine import detect_chart_patterns
from app.services.market_data import fetch_ohlcv, DEFAULT_ASSETS
from app.services.dev_analytics import calculate_dev_score

def test_quantitative_functions():
    print("Testing quantitative functions...")
    
    # 1. Test data generator
    df = fetch_ohlcv("BTC-USD", period="3mo")
    assert not df.empty, "Data OHLCV kosong"
    assert len(df) >= 20, "Data OHLCV kurang dari 20 baris"
    print(f"  [OK] OHLCV fetched: {len(df)} rows for BTC-USD")
    
    # 2. Test RSI
    rsi = calculate_rsi(df['Close'])
    assert len(rsi) == len(df), "Panjang RSI tidak sesuai"
    assert 0 <= rsi.iloc[-1] <= 100, f"RSI di luar batas: {rsi.iloc[-1]}"
    print(f"  [OK] RSI calculated: {rsi.iloc[-1]:.2f}")
    
    # 3. Test ATR
    atr = calculate_atr(df)
    assert len(atr) == len(df), "Panjang ATR tidak sesuai"
    assert atr.iloc[-1] > 0, "ATR tidak boleh <= 0"
    print(f"  [OK] ATR calculated: {atr.iloc[-1]:.2f}")
    
    # 4. Test Volume Anomaly
    vol_anom = check_volume_anomaly(df)
    print(f"  [OK] Volume anomaly checked: {vol_anom}")
    
    # 5. Test Pivots and Patterns
    patterns = detect_chart_patterns(df)
    assert "pattern" in patterns, "Pattern tidak terdeteksi"
    assert "confidence" in patterns, "Confidence tidak ada"
    print(f"  [OK] Pattern detected: {patterns['pattern']} ({patterns['type']}) - Confidence: {patterns['confidence']}%")
    
    # 6. Test Dynamic TP/SL (Bullish & Bearish)
    tpsl = calculate_dynamic_tp_sl(
        breakout_price=float(df['Close'].iloc[-1]),
        pattern_height=patterns.get("pattern_height", 100),
        swing_low=float(df['Low'].min()),
        atr_14=float(atr.iloc[-1]),
        signal_type="Bullish"
    )
    assert tpsl["tp"] > tpsl["breakout_price"], "TP Long harus di atas breakout price"
    assert tpsl["sl"] < tpsl["breakout_price"], "SL Long harus di bawah breakout price"
    print(f"  [OK] Dynamic TP/SL (Bullish): Entry={tpsl['breakout_price']} | TP={tpsl['tp']} | SL={tpsl['sl']} | RR=1:{tpsl['risk_reward']}")

    tpsl_bear = calculate_dynamic_tp_sl(
        breakout_price=float(df['Close'].iloc[-1]),
        pattern_height=patterns.get("pattern_height", 100),
        swing_low=float(df['Low'].min()),
        atr_14=float(atr.iloc[-1]),
        swing_high=float(df['High'].max()),
        signal_type="Strong Bearish"
    )
    assert tpsl_bear["tp"] < tpsl_bear["breakout_price"], "TP Bearish harus di bawah breakout price"
    assert tpsl_bear["sl"] > tpsl_bear["breakout_price"], "SL Bearish harus di atas breakout price"
    print(f"  [OK] Dynamic TP/SL (Bearish): Entry={tpsl_bear['breakout_price']} | TP={tpsl_bear['tp']} | SL={tpsl_bear['sl']} | RR=1:{tpsl_bear['risk_reward']}")
    
    # 7. Test Dev Score
    dev_score = calculate_dev_score(100, 30, 20)
    assert 0 <= dev_score <= 100, "Dev score di luar rentang"
    print(f"  [OK] Dev score calculated: {dev_score}/100")
    
    print("\nAll quantitative tests passed successfully!")

if __name__ == "__main__":
    test_quantitative_functions()
