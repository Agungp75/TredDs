"""
Test Suite Fase 1: Native MEXC Data Layer & Data Stale Circuit Breaker
"""
from app.services.market_data import (
    resolve_symbol,
    fetch_live_quote,
    fetch_ohlcv,
    build_data_status,
    DEFAULT_ASSETS,
)


def test_fase_1():
    print("=== [TEST 1.1] Symbol Normalization ===")
    assert resolve_symbol("BTC-USD", "futures") == "BTC_USDT"
    assert resolve_symbol("BTCUSDT", "futures") == "BTC_USDT"
    assert resolve_symbol("BTC_USDT", "spot") == "BTCUSDT"
    assert resolve_symbol("PEPE", "futures") == "PEPE_USDT"
    assert resolve_symbol("ETH-USD", "spot") == "ETHUSDT"
    print("OK: resolve_symbol passed for futures and spot!")

    print(f"=== [TEST 1.2] Default Assets Count: {len(DEFAULT_ASSETS)} ===")
    assert len(DEFAULT_ASSETS) >= 35
    assert "BTC_USDT" in DEFAULT_ASSETS
    assert "PEPE_USDT" in DEFAULT_ASSETS

    print("=== [TEST 1.3] Fetch Live Quote (BTC_USDT, SOL_USDT, PEPE_USDT) ===")
    for sym in ["BTC_USDT", "SOL_USDT", "PEPE_USDT"]:
        q = fetch_live_quote(sym)
        print(
            f"  {sym}: price={q['price']}, fair_price={q['fair_price']}, "
            f"funding_rate={q['funding_rate']}, status={q['data_status']}, tradable={q['is_tradable']}"
        )
        assert q["price"] > 0, f"Price must be > 0 for {sym}"
        assert q["symbol"] == sym
        assert "data_status" in q

    print("=== [TEST 1.4] Fetch Real OHLCV (BTC_USDT 1h) ===")
    df = fetch_ohlcv("BTC_USDT", timeframe="1h", limit=120)
    print(f"  BTC_USDT 1h rows={len(df)}, last_close={df['Close'].iloc[-1]:.2f}, status={df.attrs.get('data_status')}")
    assert len(df) >= 50
    assert df.attrs.get("data_source") != "synthetic"

    print("=== [TEST 1.5] Circuit Breaker Verification ===")
    status_ok = build_data_status("mexc_futures", 5.0)
    assert status_ok["status"] == "LIVE_OK" and status_ok["is_tradable"] is True

    status_stale = build_data_status("mexc_futures", 120.0)
    assert status_stale["status"] == "STALE_HALTED" and status_stale["is_tradable"] is False
    print("OK: Circuit Breaker LIVE_OK / STALE_HALTED verified!")


if __name__ == "__main__":
    test_fase_1()
    print("\nALL FASE 1 TESTS PASSED SUCCESSFULLY!")
