"""
Test Suite Fase 2 & Fase 3:
- Layer 2: MEXC Derivatives & Orderflow Microstructure (OBI 20-level, CVD, OI Matrix, Slippage Guard)
- Layer 1: RANSAC/Huber Robust Trendlines, SFP Stop-Hunt, Market Regime (ADX + Hurst), BTC Gate
- Execution Engine: 0% Maker Fee Limit Entry, Split TP1/TP2, FAIR_PRICE SL, Net EV, Half-Kelly, Safe Max Leverage
- Layer 3: Similarity Engine K=30, EMA-200 Regime Pre-Filter, Wilcoxon/t-test p-value < 0.05
"""
from app.services.market_data import fetch_ohlcv
from app.services.mexc_orderflow import analyze_mexc_derivatives
from app.services.pattern_engine import detect_chart_patterns
from app.core.quantitative import (
    detect_market_regime,
    check_btc_gate,
    calculate_dynamic_tp_sl,
    calculate_atr,
)
from app.services.similarity_engine import compute_similarity, compute_statistical_significance


def test_fase_2_and_3():
    print("=== [TEST 2.1] Layer 2 MEXC Derivatives & Orderflow (BTC_USDT) ===")
    df = fetch_ohlcv("BTC_USDT", interval="15m", limit=240)
    deriv = analyze_mexc_derivatives("BTC_USDT", df=df, timeframe="15m")
    print(
        f"  OBI={deriv['obi_20_level']} ({deriv['obi_status']}), "
        f"OI_Regime={deriv['oi_regime']}, CVD={deriv['cvd_trend']}, "
        f"MaxZeroSlippageUSDT=${deriv['max_zero_slippage_position_usdt']}"
    )
    assert -1.0 <= deriv["obi_20_level"] <= 1.0
    assert deriv["max_zero_slippage_position_usdt"] > 0

    print("=== [TEST 3.1] RANSAC/Huber Trendlines, SFP & Market Regime ===")
    pat = detect_chart_patterns(df)
    regime = detect_market_regime(df)
    btc_gate = check_btc_gate(df, "SOL_USDT")
    print(
        f"  Pattern={pat['pattern']}, WickOutliersIgnored={pat['wick_outliers_ignored']}, "
        f"SFP={pat['sfp_detected']}"
    )
    print(
        f"  Regime={regime['market_regime']} (ADX={regime['adx_14']}, Hurst={regime['hurst_exponent']}), "
        f"BTC_Gate={btc_gate['btc_gate_status']}"
    )
    assert "wick_outliers_ignored" in pat
    assert regime["market_regime"] in ("TRENDING", "MEAN_REVERTING", "TRANSITIONAL")

    print("=== [TEST 3.2] Execution Engine (0% Maker Fee, Split TP1/TP2, Net EV, Half-Kelly) ===")
    close_p = float(df["Close"].iloc[-1])
    atr_v = float(calculate_atr(df, 14).iloc[-1])
    exec_plan = calculate_dynamic_tp_sl(
        breakout_price=close_p,
        pattern_height=atr_v * 3.2,
        swing_low=float(df["Low"].tail(20).min()),
        atr_14=atr_v,
        swing_high=float(df["High"].tail(20).max()),
        direction="LONG",
        win_rate_pct=62.0,
        adx_val=regime["adx_14"],
        obi_val=deriv["obi_20_level"],
        spread_pct=0.01,
        funding_rate_pct=deriv["funding_rate_pct"],
        max_zero_slippage_usdt=deriv["max_zero_slippage_position_usdt"],
    )
    print(
        f"  EntryType={exec_plan['recommended_entry_type']}, MakerEntry={exec_plan['maker_limit_entry']}, "
        f"TP1={exec_plan['tp1']}, TP2={exec_plan['tp2']}, SL={exec_plan['sl']} ({exec_plan['sl_trigger_type']})"
    )
    print(
        f"  GrossRR={exec_plan['gross_rr']}, NetRR={exec_plan['net_rr_after_mexc_fees']}, "
        f"NetEV={exec_plan['net_expected_value_pct']}%, Validity={exec_plan['trade_validity']}, "
        f"HalfKelly={exec_plan['position_sizing']['half_kelly_capital_fraction_pct']}%, "
        f"SafeLev={exec_plan['position_sizing']['safe_max_leverage']}"
    )
    assert exec_plan["sl_trigger_type"] == "FAIR_PRICE"
    assert "take_profit_1" in exec_plan and "take_profit_2" in exec_plan

    print("=== [TEST 3.3] Layer 3 Similarity Engine (K=30 & p-value Statistical Test) ===")
    df_long = fetch_ohlcv("BTC_USDT", interval="1h", limit=500)
    sim = compute_similarity(df_long, timeframe="1h", top_k=30, min_separation=12)
    assert sim is not None
    summary = sim["screener_summary"]
    print(
        f"  SampleSize={summary['sample_size']}, ProbUp={summary['probability_up']}, "
        f"p_value={summary['p_value']}, StatSig={summary['is_statistically_significant']}, "
        f"Verdict={summary['statistical_verdict']}"
    )
    # Test non-significant random noise returns -> must force NEUTRAL (NO STATISTICAL EDGE)
    noise_stat = compute_statistical_significance([1.2, -1.1, 0.8, -0.9, 0.3, -0.4, 0.2, -0.1])
    assert noise_stat["is_statistically_significant"] is False
    assert noise_stat["statistical_verdict"] == "NEUTRAL (NO STATISTICAL EDGE)"
    print("OK: Statistical significance gate verified!")


if __name__ == "__main__":
    test_fase_2_and_3()
    print("\nALL FASE 2 & FASE 3 TESTS PASSED SUCCESSFULLY!")
