"""
ATRED v3.0 - Layer 2: MEXC Derivatives & Orderbook Microstructure Engine
Mengolah data mikrostruktur orderbook L2 (20-level depth), Open Interest (holdVol),
Funding Rate, Fair Price vs Last Price Basis Guard, Cumulative Volume Delta (CVD),
dan Liquidity Slippage Guard.
"""
import time
import numpy as np
import pandas as pd
from app.core.config import settings
from app.services.market_data import (
    resolve_symbol,
    fetch_live_quote,
    fetch_ohlcv,
    price_decimals,
    _client,
)
import app.services.market_data as md_module

_depth_cache: dict[str, tuple[dict, float]] = {}
_oi_history_cache: dict[str, list[tuple[float, float, float]]] = {}


def fetch_orderbook_depth(symbol: str, limit: int = 20) -> dict:
    """
    Mengambil 20-level Orderbook L2 (Bids & Asks) dari MEXC Contract API v1
    (/depth/{symbol}?limit=20) atau fallback cepat ke Live Crypto Mirror (/depth?symbol={spot}&limit=20).
    """
    f_sym = resolve_symbol(symbol, "futures")
    spot_sym = resolve_symbol(symbol, "spot")
    now_ts = time.time()

    if f_sym in _depth_cache:
        cached, ts = _depth_cache[f_sym]
        if now_ts - ts < 3.0:
            return cached

    bids: list[tuple[float, float]] = []
    asks: list[tuple[float, float]] = []
    source = "LIVE_OK"

    # 1. Coba MEXC Contract API v1 (/depth/{symbol}?limit=20)
    if now_ts >= md_module._mexc_direct_unreachable_until:
        try:
            url = f"{settings.MEXC_CONTRACT_BASE_URL}/depth/{f_sym}?limit={limit}"
            resp = _client.get(url, timeout=1.5)
            if resp.status_code == 200:
                payload = resp.json()
                data = payload.get("data", {})
                raw_bids = data.get("bids", [])
                raw_asks = data.get("asks", [])
                if raw_bids and raw_asks:
                    bids = [(float(b[0]), float(b[1])) for b in raw_bids[:limit] if float(b[0]) > 0]
                    asks = [(float(a[0]), float(a[1])) for a in raw_asks[:limit] if float(a[0]) > 0]
                    source = "MEXC_FUTURES_L2"
        except Exception:
            md_module._mexc_direct_unreachable_until = now_ts + 120.0

    # 2. Live Crypto Mirror API v3 (/depth?symbol=BTCUSDT&limit=20)
    if not bids or not asks:
        try:
            url = f"{settings.LIVE_CRYPTO_MIRROR_URL}/depth?symbol={spot_sym}&limit={limit}"
            resp = _client.get(url, timeout=2.5)
            if resp.status_code == 200:
                data = resp.json()
                raw_bids = data.get("bids", [])
                raw_asks = data.get("asks", [])
                if raw_bids and raw_asks:
                    bids = [(float(b[0]), float(b[1])) for b in raw_bids[:limit] if float(b[0]) > 0]
                    asks = [(float(a[0]), float(a[1])) for a in raw_asks[:limit] if float(a[0]) > 0]
                    source = "LIVE_L2_MIRROR"
        except Exception:
            pass

    result = {
        "symbol": f_sym,
        "bids": bids,
        "asks": asks,
        "levels": min(len(bids), len(asks)),
        "timestamp": now_ts,
        "source": source if (bids and asks) else "UNAVAILABLE",
    }
    if bids and asks:
        _depth_cache[f_sym] = (result, now_ts)
    return result


def compute_orderbook_metrics(depth_data: dict, fallback_price: float = 0.0) -> dict:
    """
    Menghitung:
    1. Distance-Weighted 20-Level Orderbook Imbalance (OBI):
       w_i = exp(-0.1 * (i - 1))
       OBI = (V_bid - V_ask) / (V_bid + V_ask)  in [-1.0, +1.0]
    2. Top-5 Level Notional Depth (USDT) & Max Zero-Slippage Position Size (20% x Depth_5L)
    3. Wall Detection (Bid Wall / Ask Wall level harga terkuat)
    """
    bids = depth_data.get("bids", [])
    asks = depth_data.get("asks", [])

    if not bids or not asks:
        default_depth_5l = max(5000.0, fallback_price * 25.0)
        return {
            "obi_20_level": 0.0,
            "obi_status": "BALANCED_BOOK",
            "weighted_bid_vol_usdt": 0.0,
            "weighted_ask_vol_usdt": 0.0,
            "top5_bid_depth_usdt": round(default_depth_5l, 2),
            "top5_ask_depth_usdt": round(default_depth_5l, 2),
            "top5_depth_usdt": round(default_depth_5l, 2),
            "max_zero_slippage_position_usdt": round(default_depth_5l * 0.20, 2),
            "strongest_bid_wall": None,
            "strongest_ask_wall": None,
            "levels_analyzed": 0,
        }

    n_levels = min(20, len(bids), len(asks))
    weights = np.array([np.exp(-0.1 * i) for i in range(n_levels)], dtype=float)

    # Notional USDT per level (Price_i * Vol_i) agar adil lintas semua harga koin
    bid_notionals = np.array([bids[i][0] * bids[i][1] for i in range(n_levels)], dtype=float)
    ask_notionals = np.array([asks[i][0] * asks[i][1] for i in range(n_levels)], dtype=float)

    v_bid = float(np.sum(weights * bid_notionals))
    v_ask = float(np.sum(weights * ask_notionals))
    denom = v_bid + v_ask
    obi = (v_bid - v_ask) / denom if denom > 0 else 0.0
    obi = float(np.clip(obi, -1.0, 1.0))

    if obi > 0.25:
        obi_status = "HEAVY_BID_WALL_SUPPORT"
    elif obi < -0.25:
        obi_status = "HEAVY_ASK_WALL_RESISTANCE"
    else:
        obi_status = "BALANCED_BOOK"

    # Top-5 Level Notional Depth (USDT)
    n5 = min(5, n_levels)
    top5_bid_usdt = float(np.sum(bid_notionals[:n5]))
    top5_ask_usdt = float(np.sum(ask_notionals[:n5]))
    top5_avg_usdt = (top5_bid_usdt + top5_ask_usdt) / 2.0

    # Aturan Likuiditas: Max Zero-Slippage Position = 20% dari kedalaman 5 level
    max_pos_usdt = top5_avg_usdt * 0.20

    # Cari level harga dengan dinding order terbesar
    max_bid_idx = int(np.argmax(bid_notionals))
    max_ask_idx = int(np.argmax(ask_notionals))
    dec = price_decimals(bids[0][0])

    return {
        "obi_20_level": round(obi, 4),
        "obi_status": obi_status,
        "weighted_bid_vol_usdt": round(v_bid, 2),
        "weighted_ask_vol_usdt": round(v_ask, 2),
        "top5_bid_depth_usdt": round(top5_bid_usdt, 2),
        "top5_ask_depth_usdt": round(top5_ask_usdt, 2),
        "top5_depth_usdt": round(top5_avg_usdt, 2),
        "max_zero_slippage_position_usdt": round(max_pos_usdt, 2),
        "strongest_bid_wall": {
            "price": round(bids[max_bid_idx][0], dec),
            "notional_usdt": round(float(bid_notionals[max_bid_idx]), 2),
        },
        "strongest_ask_wall": {
            "price": round(asks[max_ask_idx][0], dec),
            "notional_usdt": round(float(ask_notionals[max_ask_idx]), 2),
        },
        "levels_analyzed": n_levels,
    }


def compute_cvd_metrics(df: pd.DataFrame) -> dict:
    """
    Menghitung Cumulative Volume Delta (CVD) Approximation per candle:
      Delta_t = Volume_t * ((Close_t - Low_t) - (High_t - Close_t)) / (High_t - Low_t + eps)
    Serta mendeteksi divergensi absorpsi antara Harga vs CVD pada 16 bar terakhir.
    """
    if df is None or len(df) < 10:
        return {
            "cvd_trend": "NEUTRAL",
            "cvd_divergence": "NONE",
            "cvd_slope_norm": 0.0,
            "net_delta_last_10": 0.0,
        }

    high = df["High"].values.astype(float)
    low = df["Low"].values.astype(float)
    close = df["Close"].values.astype(float)
    vol = df["Volume"].values.astype(float)

    eps = 1e-9
    bar_range = np.maximum(high - low, eps)
    buying_pressure = (close - low) - (high - close)
    bar_delta = vol * (buying_pressure / bar_range)
    cvd = np.cumsum(bar_delta)

    lookback = min(16, len(df))
    recent_cvd = cvd[-lookback:]
    recent_close = close[-lookback:]

    price_change_pct = ((recent_close[-1] - recent_close[0]) / recent_close[0]) * 100.0 if recent_close[0] > 0 else 0.0
    cvd_change = float(recent_cvd[-1] - recent_cvd[0])
    avg_vol = float(np.mean(vol[-lookback:])) if np.mean(vol[-lookback:]) > 0 else 1.0
    cvd_slope_norm = cvd_change / (avg_vol * lookback)

    if cvd_slope_norm > 0.08:
        cvd_trend = "BULLISH_ACCUMULATION"
    elif cvd_slope_norm < -0.08:
        cvd_trend = "BEARISH_DISTRIBUTION"
    else:
        cvd_trend = "NEUTRAL"

    # Deteksi CVD Absorption Divergence:
    # - Harga turun (<-0.35%) tetapi CVD naik signifikan (>+0.05) -> Limit Buy Absorption
    # - Harga naik (>+0.35%) tetapi CVD turun signifikan (<-0.05) -> Limit Sell Exhaustion
    if price_change_pct < -0.35 and cvd_slope_norm > 0.05:
        cvd_divergence = "BULLISH_CVD_ABSORPTION"
        cvd_trend = "BULLISH_ABSORPTION"
    elif price_change_pct > 0.35 and cvd_slope_norm < -0.05:
        cvd_divergence = "BEARISH_CVD_EXHAUSTION"
        cvd_trend = "BEARISH_EXHAUSTION"
    else:
        cvd_divergence = "NONE"

    return {
        "cvd_trend": cvd_trend,
        "cvd_divergence": cvd_divergence,
        "cvd_slope_norm": round(float(cvd_slope_norm), 4),
        "net_delta_last_10": round(float(np.sum(bar_delta[-min(10, len(bar_delta)):])), 2),
    }


def compute_oi_and_funding_regime(symbol: str, quote: dict, df: pd.DataFrame = None) -> dict:
    """
    Menghitung:
    1. Matriks Open Interest (holdVol) & Price Action:
       - Harga Naik + OI Naik   -> NEW_LONG_BUILDUP (Strong Bullish Trend)
       - Harga Naik + OI Turun  -> SHORT_COVERING_RALLY (Weak Bullish / Fakeout Risk)
       - Harga Turun + OI Naik  -> NEW_SHORT_BUILDUP (Strong Bearish Trend)
       - Harga Turun + OI Turun -> LONG_CAPITULATION (Long Squeeze / Bottom Reversal)
    2. Funding Rate & Squeeze Detection:
       - Funding > +0.05% (0.0005) -> OVERCROWDED_LONG_RISK
       - Funding < -0.02% (-0.0002) & Harga naik -> SHORT_SQUEEZE_FUEL
       - Lainnya -> NEUTRAL_FUNDING
    """
    f_sym = resolve_symbol(symbol, "futures")
    now_ts = time.time()

    price = float(quote.get("price") or 0.0)
    current_oi = float(quote.get("open_interest") or 0.0)
    funding_rate = float(quote.get("funding_rate") or 0.0)
    funding_rate_pct = round(funding_rate * 100.0, 4)

    # Catat riwayat OI di memori & estimasi perubahan OI dari momentum volume 4 jam jika snapshot baru pertama kali
    hist = _oi_history_cache.setdefault(f_sym, [])
    hist.append((now_ts, price, current_oi))
    if len(hist) > 60:
        hist.pop(0)

    price_delta_pct = float(quote.get("change_pct") or 0.0)
    oi_delta_pct = 0.0

    if len(hist) >= 2 and hist[0][2] > 0 and abs(current_oi - hist[0][2]) / hist[0][2] > 0.0005:
        oi_delta_pct = ((current_oi - hist[0][2]) / hist[0][2]) * 100.0
        price_delta_pct = ((price - hist[0][1]) / hist[0][1]) * 100.0 if hist[0][1] > 0 else price_delta_pct
    elif df is not None and len(df) >= 16:
        # Gunakan rasio ekspansi volume 8 bar terakhir vs 8 bar sebelumnya sebagai proksi perubahan partisipasi OI
        v_recent = float(df["Volume"].iloc[-8:].mean())
        v_prev = float(df["Volume"].iloc[-16:-8].mean())
        c_recent = float(df["Close"].iloc[-1])
        c_prev = float(df["Close"].iloc[-8])
        price_delta_pct = ((c_recent - c_prev) / c_prev) * 100.0 if c_prev > 0 else price_delta_pct
        oi_delta_pct = ((v_recent - v_prev) / v_prev) * 12.0 if v_prev > 0 else 0.0
        oi_delta_pct = float(np.clip(oi_delta_pct, -25.0, 35.0))

    # Matriks 4 Kuadran OI vs Harga
    if price_delta_pct >= 0 and oi_delta_pct >= 0:
        oi_regime = "NEW_LONG_BUILDUP"
        oi_Signal_desc = "Strong Bullish Trend (Arus Modal Baru Masuk ke Posisi Long)"
    elif price_delta_pct >= 0 and oi_delta_pct < 0:
        oi_regime = "SHORT_COVERING_RALLY"
        oi_Signal_desc = "Short Covering Rally (Kenaikan karena Likuidasi/Tutup Short, Rawan Fakeout)"
    elif price_delta_pct < 0 and oi_delta_pct >= 0:
        oi_regime = "NEW_SHORT_BUILDUP"
        oi_Signal_desc = "Strong Bearish Trend (Agresi Pembukaan Posisi Short Baru)"
    else:
        oi_regime = "LONG_CAPITULATION"
        oi_Signal_desc = "Long Capitulation / Flush (Likuidasi Long Beruntun, Potensi Reversal)"

    # Analisis Funding Rate & Potensi Squeeze
    if funding_rate > 0.0005:  # > +0.05% per 8h
        funding_regime = "OVERCROWDED_LONG_RISK"
        squeeze_risk = "LONG_SQUEEZE_WARNING"
    elif funding_rate < -0.0002:  # < -0.02% per 8h
        if price_delta_pct > 0:
            funding_regime = "SHORT_SQUEEZE_FUEL"
            squeeze_risk = "ACTIVE_SHORT_SQUEEZE"
        else:
            funding_regime = "HEAVY_SHORT_BIAS"
            squeeze_risk = "SHORT_SQUEEZE_POTENTIAL"
    else:
        funding_regime = "NEUTRAL_FUNDING"
        squeeze_risk = "LOW_SQUEEZE_RISK"

    return {
        "open_interest": round(current_oi, 2),
        "oi_change_4h_pct": round(oi_delta_pct, 2),
        "price_change_ref_pct": round(price_delta_pct, 2),
        "oi_regime": oi_regime,
        "oi_description": oi_Signal_desc,
        "funding_rate": funding_rate,
        "funding_rate_pct": funding_rate_pct,
        "funding_regime": funding_regime,
        "squeeze_status": squeeze_risk,
    }


def analyze_mexc_derivatives(symbol: str, df: pd.DataFrame = None, timeframe: str = "15m") -> dict:
    """
    Fungsi utama Layer 2: Menggabungkan seluruh intelijen Derivatif & Orderflow MEXC:
      - Fair Price vs Last Price Basis Deviation Guard
      - Funding Rate & Squeeze Detector
      - Open Interest (holdVol) & Price Action Matrix
      - 20-Level Orderbook Imbalance (OBI)
      - Cumulative Volume Delta (CVD) & Absorption Divergence
      - Liquidity Slippage Guard (20% dari Top-5 Level Depth USDT)
    """
    f_sym = resolve_symbol(symbol, "futures")
    quote = fetch_live_quote(f_sym)
    if df is None or len(df) < 15:
        df = fetch_ohlcv(f_sym, interval=timeframe, limit=120)

    depth = fetch_orderbook_depth(f_sym, limit=20)
    ob_metrics = compute_orderbook_metrics(depth, fallback_price=float(quote.get("price") or 1.0))
    cvd_metrics = compute_cvd_metrics(df)
    oi_funding = compute_oi_and_funding_regime(f_sym, quote, df)

    last_price = float(quote.get("price") or 0.0)
    fair_price = float(quote.get("fair_price") or last_price)
    index_price = float(quote.get("index_price") or last_price)
    fair_last_spread_pct = round((abs(last_price - fair_price) / fair_price) * 100.0, 4) if fair_price > 0 else 0.0
    wick_warning = fair_last_spread_pct > settings.MAX_FAIR_LAST_DEVIATION_PCT

    # Hitung Skor Konfluensi Layer 2 (-100 s/d +100, serta skala 0-100 untuk Opportunity Score)
    directional_score = 0.0
    if oi_funding["oi_regime"] == "NEW_LONG_BUILDUP":
        directional_score += 30.0
    elif oi_funding["oi_regime"] == "NEW_SHORT_BUILDUP":
        directional_score -= 30.0
    elif oi_funding["oi_regime"] == "SHORT_COVERING_RALLY":
        directional_score += 10.0
    elif oi_funding["oi_regime"] == "LONG_CAPITULATION":
        directional_score += 15.0  # Potensi pantulan pasca flush

    # Kontribusi OBI (-35 s/d +35)
    directional_score += ob_metrics["obi_20_level"] * 35.0

    # Kontribusi CVD (-25 s/d +25)
    if "BULLISH" in cvd_metrics["cvd_trend"]:
        directional_score += 25.0
    elif "BEARISH" in cvd_metrics["cvd_trend"]:
        directional_score -= 25.0

    # Kontribusi Funding Squeeze (-15 s/d +20)
    if oi_funding["funding_regime"] == "SHORT_SQUEEZE_FUEL":
        directional_score += 20.0
    elif oi_funding["funding_regime"] == "OVERCROWDED_LONG_RISK":
        directional_score -= 15.0

    directional_score = float(np.clip(directional_score, -100.0, 100.0))
    bias = "BULLISH" if directional_score >= 15 else ("BEARISH" if directional_score <= -15 else "NEUTRAL")

    return {
        "symbol": f_sym,
        "spot_symbol": quote.get("spot_symbol"),
        "last_price": last_price,
        "fair_price": fair_price,
        "index_price": index_price,
        "fair_last_spread_pct": fair_last_spread_pct,
        "wick_manipulation_warning": wick_warning,
        "funding_rate": oi_funding["funding_rate"],
        "funding_rate_pct": oi_funding["funding_rate_pct"],
        "funding_regime": oi_funding["funding_regime"],
        "squeeze_status": oi_funding["squeeze_status"],
        "open_interest": oi_funding["open_interest"],
        "oi_change_4h_pct": oi_funding["oi_change_4h_pct"],
        "oi_regime": oi_funding["oi_regime"],
        "oi_description": oi_funding["oi_description"],
        "obi_20_level": ob_metrics["obi_20_level"],
        "obi_status": ob_metrics["obi_status"],
        "weighted_bid_vol_usdt": ob_metrics["weighted_bid_vol_usdt"],
        "weighted_ask_vol_usdt": ob_metrics["weighted_ask_vol_usdt"],
        "top5_bid_depth_usdt": ob_metrics["top5_bid_depth_usdt"],
        "top5_ask_depth_usdt": ob_metrics["top5_ask_depth_usdt"],
        "top5_depth_usdt": ob_metrics["top5_depth_usdt"],
        "max_zero_slippage_position_usdt": ob_metrics["max_zero_slippage_position_usdt"],
        "strongest_bid_wall": ob_metrics["strongest_bid_wall"],
        "strongest_ask_wall": ob_metrics["strongest_ask_wall"],
        "cvd_trend": cvd_metrics["cvd_trend"],
        "cvd_divergence": cvd_metrics["cvd_divergence"],
        "cvd_slope_norm": cvd_metrics["cvd_slope_norm"],
        "net_delta_last_10": cvd_metrics["net_delta_last_10"],
        "orderflow_bias": bias,
        "orderflow_score": round(directional_score, 1),
        "orderflow_strength": round(min(100.0, 50.0 + abs(directional_score) * 0.5), 1),
        "depth_source": depth.get("source", "LIVE_OK"),
        "timestamp": time.time(),
    }
