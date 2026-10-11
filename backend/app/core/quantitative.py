import numpy as np
import pandas as pd
from scipy.signal import find_peaks
from typing import Optional

def calculate_sma(series: pd.Series, period: int = 20) -> pd.Series:
    return series.rolling(window=period).mean()

def calculate_ema(series: pd.Series, period: int = 20) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()

def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """
    Wilder's Smoothing RSI (RMA) sesuai standar TradingView
    """
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    
    # TradingView standard RMA (Wilder's EMA with alpha = 1 / period)
    avg_gain = gain.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    
    rs = avg_gain / (avg_loss.replace(0, np.nan))
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi.fillna(50.0)

def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = df['High']
    low = df['Low']
    close_prev = df['Close'].shift(1)
    
    tr1 = high - low
    tr2 = (high - close_prev).abs()
    tr3 = (low - close_prev).abs()
    
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    return atr.bfill().fillna(0.0)

def calculate_macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = calculate_ema(series, fast)
    ema_slow = calculate_ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = calculate_ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram

def calculate_bollinger_bands(series: pd.Series, period: int = 20, num_std: float = 2.0):
    sma = calculate_sma(series, period)
    std = series.rolling(window=period).std()
    upper = sma + (std * num_std)
    lower = sma - (std * num_std)
    return upper, sma, lower

def detect_pivots(df: pd.DataFrame, distance: int = 5):
    """
    Menggunakan scipy.signal.find_peaks untuk mendeteksi Swing Highs dan Swing Lows
    """
    high_vals = df['High'].values
    low_vals = df['Low'].values
    
    high_peaks, _ = find_peaks(high_vals, distance=distance)
    low_peaks, _ = find_peaks(-low_vals, distance=distance)
    
    return high_peaks, low_peaks

def calculate_trendlines(df: pd.DataFrame, high_peaks: np.ndarray, low_peaks: np.ndarray):
    """
    Regresi linier tren Support dan Resistance via NumPy polyfit dengan bounded non-crossing channel.
    Menjamin Resistance (upper) selalu berada di atas Support (lower) dan tidak menyilang terbalik.
    """
    n = len(df)
    
    if len(high_peaks) >= 2:
        high_x = high_peaks
        high_y = df['High'].iloc[high_peaks].values
        upper_slope, upper_intercept = np.polyfit(high_x, high_y, 1)
    else:
        upper_slope, upper_intercept = 0.0, float(df['High'].max())
        
    if len(low_peaks) >= 2:
        low_x = low_peaks
        low_y = df['Low'].iloc[low_peaks].values
        lower_slope, lower_intercept = np.polyfit(low_x, low_y, 1)
    else:
        lower_slope, lower_intercept = 0.0, float(df['Low'].min())

    x_start = 0
    x_end = max(1, n - 1)
    
    u_start = float(upper_slope * x_start + upper_intercept)
    u_end = float(upper_slope * x_end + upper_intercept)
    l_start = float(lower_slope * x_start + lower_intercept)
    l_end = float(lower_slope * x_end + lower_intercept)
    
    # Range harga keseluruhan
    max_h = float(df['High'].max())
    min_l = float(df['Low'].min())
    price_span = max(max_h - min_l, 0.01)
    min_margin = price_span * 0.015

    # Pastikan upper selalu >= lower + min_margin di kedua ujung rentang
    if u_start < l_start + min_margin:
        mid_s = (u_start + l_start) / 2
        u_start = mid_s + min_margin / 2
        l_start = mid_s - min_margin / 2
        
    if u_end < l_end + min_margin:
        mid_e = (u_end + l_end) / 2
        u_end = mid_e + min_margin / 2
        l_end = mid_e - min_margin / 2

    # Clamp batas agar garis tidak melesat jauh di luar range grafik
    u_start = min(max(u_start, min_l), max_h * 1.05)
    u_end = min(max(u_end, min_l), max_h * 1.05)
    l_start = max(min(l_start, max_h), min_l * 0.95)
    l_end = max(min(l_end, max_h), min_l * 0.95)
    
    # Validasi kepastian margin
    if u_start <= l_start:
        u_start = l_start + min_margin
    if u_end <= l_end:
        u_end = l_end + min_margin
        
    upper_line = [
        {"x": int(x_start), "price": round(u_start, 4)},
        {"x": int(x_end), "price": round(u_end, 4)}
    ]
    lower_line = [
        {"x": int(x_start), "price": round(l_start, 4)},
        {"x": int(x_end), "price": round(l_end, 4)}
    ]
    
    eff_upper_slope = (u_end - u_start) / x_end
    eff_lower_slope = (l_end - l_start) / x_end
    
    return {
        "upper_slope": float(eff_upper_slope),
        "upper_intercept": float(u_start),
        "lower_slope": float(eff_lower_slope),
        "lower_intercept": float(l_start),
        "upper_line": upper_line,
        "lower_line": lower_line
    }

def check_volume_anomaly(df: pd.DataFrame, window: int = 20, multiplier: float = 1.5) -> bool:
    """
    Volume Anomaly = Volume_t > 1.5 * SMA(Volume, 20)
    """
    if len(df) < window + 1:
        return False
    
    vol_sma = df['Volume'].rolling(window=window).mean()
    latest_vol = df['Volume'].iloc[-1]
    latest_sma = vol_sma.iloc[-1]
    
    if pd.isna(latest_sma) or latest_sma == 0:
        return False
        
    return bool(latest_vol > (multiplier * latest_sma))


# ---------------------------------------------------------------------------
# Stochastic Oscillator (TradingView "Stoch 14 3 3")
# ---------------------------------------------------------------------------
def calculate_stochastic(df: pd.DataFrame, k_period: int = 14, k_smooth: int = 3, d_period: int = 3):
    """
    Stochastic Slow standar TradingView (14, 3, 3):
      raw %K = 100 * (Close - LowestLow14) / (HighestHigh14 - LowestLow14)
      %K     = SMA(raw %K, 3)
      %D     = SMA(%K, 3)
    """
    low_min = df['Low'].rolling(window=k_period, min_periods=k_period).min()
    high_max = df['High'].rolling(window=k_period, min_periods=k_period).max()
    rng = (high_max - low_min).replace(0, np.nan)
    raw_k = 100.0 * (df['Close'] - low_min) / rng
    k = raw_k.rolling(window=k_smooth, min_periods=1).mean()
    d = k.rolling(window=d_period, min_periods=1).mean()
    return k.fillna(50.0), d.fillna(50.0)


def analyze_stochastic(df: pd.DataFrame, k_period: int = 14, k_smooth: int = 3, d_period: int = 3) -> dict:
    k, d = calculate_stochastic(df, k_period, k_smooth, d_period)
    k_now, d_now = float(k.iloc[-1]), float(d.iloc[-1])
    k_prev = float(k.iloc[-2]) if len(k) > 1 else k_now
    d_prev = float(d.iloc[-2]) if len(d) > 1 else d_now

    cross = None
    if k_prev <= d_prev and k_now > d_now:
        cross = "Bullish Cross"
    elif k_prev >= d_prev and k_now < d_now:
        cross = "Bearish Cross"

    if k_now >= 80:
        zone = "Overbought"
    elif k_now <= 20:
        zone = "Oversold"
    else:
        zone = "Neutral"

    # Bias: cross di zona ekstrem = sinyal kuat (cara trader pro membaca Stoch)
    if cross == "Bullish Cross" and k_now < 30:
        bias = "Strong Bullish"
    elif cross == "Bearish Cross" and k_now > 70:
        bias = "Strong Bearish"
    elif k_now > d_now:
        bias = "Bullish"
    elif k_now < d_now:
        bias = "Bearish"
    else:
        bias = "Neutral"

    return {
        "settings": f"{k_period} {k_smooth} {d_period}",
        "k": round(k_now, 2),
        "d": round(d_now, 2),
        "zone": zone,
        "cross": cross,
        "bias": bias,
    }


# ---------------------------------------------------------------------------
# Fibonacci Retracement — metode penarikan trader profesional
# ---------------------------------------------------------------------------
FIB_RETRACEMENT_LEVELS = [0.0, 0.5, 0.618, 1.0]
FIB_EXTENSION_LEVELS = [1.272, 1.618]


def _significant_pivots(df: pd.DataFrame, atr_val: float, distance: int = 3):
    """Pivot swing high/low yang signifikan (prominence >= 1x ATR) ala ZigZag."""
    prom = max(float(atr_val), 1e-9)
    highs, _ = find_peaks(df['High'].values, distance=distance, prominence=prom)
    lows, _ = find_peaks(-df['Low'].values, distance=distance, prominence=prom)
    return highs, lows


def calculate_fibonacci(df: pd.DataFrame, atr_val: float, lookback: int = 120) -> dict:
    """
    Penarikan Fibonacci seperti trader pro:
      1. Identifikasi IMPULSE LEG terakhir yang signifikan (swing low -> swing high
         atau swing high -> swing low) pada window lookback.
      2. Uptrend  : tarik dari Swing Low (100% / 1) ke Swing High (0%).
                    Level retracement berada DI BAWAH high (area buy-the-dip).
      3. Downtrend: tarik dari Swing High (1) ke Swing Low (0).
                    Level retracement berada DI ATAS low (area sell-the-rally).
      4. Jika harga sudah menembus titik awal leg (invalid), anchor diganti ke
         leg baru yang terbentuk setelahnya.
      5. Golden Pocket = zona 0.5 – 0.618. Extension 1.272 / 1.618 = target lanjutan.
    """
    n = len(df)
    if n < 20:
        return {}
    win = df.tail(min(lookback, n)).reset_index(drop=True)
    offset = n - len(win)
    highs = win['High'].values
    lows = win['Low'].values
    close = float(win['Close'].iloc[-1])

    idx_hi = int(np.argmax(highs))
    idx_lo = int(np.argmin(lows))

    if idx_hi > idx_lo:
        trend = "up"
        start_idx, end_idx = idx_lo, idx_hi
        start_price, end_price = float(lows[idx_lo]), float(highs[idx_hi])
    else:
        trend = "down"
        start_idx, end_idx = idx_hi, idx_lo
        start_price, end_price = float(highs[idx_hi]), float(lows[idx_lo])

    # Refinement: jika ekstrem terbaru terlalu dekat dengan bar terakhir dan ada leg
    # impulsif yang lebih baru & signifikan, gunakan pivot ZigZag terakhir.
    ph, pl = _significant_pivots(win, atr_val)
    if trend == "up" and len(pl) > 0:
        # Swing low signifikan terakhir sebelum high -> anchor impulse yang lebih relevan
        cands = [i for i in pl if i < end_idx and (end_idx - i) >= 5]
        if cands:
            last_low = cands[-1]
            leg = end_price - float(lows[last_low])
            full = end_price - start_price
            # gunakan leg terakhir bila mencakup >= 50% dari range penuh (impulse utama)
            if full > 0 and leg / full >= 0.5:
                start_idx, start_price = int(last_low), float(lows[last_low])
    elif trend == "down" and len(ph) > 0:
        cands = [i for i in ph if i < end_idx and (end_idx - i) >= 5]
        if cands:
            last_high = cands[-1]
            leg = float(highs[last_high]) - end_price
            full = start_price - end_price
            if full > 0 and leg / full >= 0.5:
                start_idx, start_price = int(last_high), float(highs[last_high])

    rng = abs(end_price - start_price)
    if rng <= 0:
        return {}

    def lvl_price(r: float) -> float:
        # Konvensi TradingView: 0 = titik akhir (end), 1 = titik awal (start)
        if trend == "up":
            return end_price - r * rng
        return end_price + r * rng

    def ext_price(r: float) -> float:
        # Extension diproyeksikan searah tren dari titik awal leg
        if trend == "up":
            return start_price + r * rng
        return start_price - r * rng

    levels = [{"ratio": r, "label": f"{r:g}", "price": round(lvl_price(r), 6)} for r in FIB_RETRACEMENT_LEVELS]
    extensions = [{"ratio": r, "label": f"{r:g}", "price": round(ext_price(r), 6)} for r in FIB_EXTENSION_LEVELS]

    gp_a, gp_b = lvl_price(0.5), lvl_price(0.618)
    golden_pocket = {"top": round(max(gp_a, gp_b), 6), "bottom": round(min(gp_a, gp_b), 6)}

    # Kedalaman retracement saat ini
    if trend == "up":
        retr = (end_price - close) / rng
    else:
        retr = (close - end_price) / rng
    retr = float(retr)

    if retr < 0:
        position = "Breakout melewati swing (lanjutan tren)"
    elif retr < 0.382:
        position = "Retracement dangkal (tren kuat)"
    elif retr <= 0.5:
        position = "Mendekati zona 0.5"
    elif retr <= 0.618:
        position = "Di dalam Golden Pocket (0.5 – 0.618)"
    elif retr <= 1.0:
        position = "Retracement dalam (> 0.618)"
    else:
        position = "Struktur invalid (melewati level 1)"

    times = df['Time'].values
    return {
        "trend": trend,
        "start": {"index": int(start_idx + offset), "time": _to_time(times[start_idx + offset]), "price": round(start_price, 6)},
        "end": {"index": int(end_idx + offset), "time": _to_time(times[end_idx + offset]), "price": round(end_price, 6)},
        "levels": levels,
        "extensions": extensions,
        "golden_pocket": golden_pocket,
        "retracement": round(retr, 4),
        "position": position,
    }


def _to_time(t):
    try:
        v = float(t)
        if v > 100000:
            return int(v)
    except Exception:
        pass
    return str(t)


# ---------------------------------------------------------------------------
# Target Zones (Technical Analysis Targets) — konfluensi Fib + S/R + TP
# ---------------------------------------------------------------------------
def calculate_target_zones(
    df: pd.DataFrame,
    atr_val: float,
    direction: str,
    entry: float,
    fib: Optional[dict] = None,
    max_targets: int = 3,
) -> list:
    """
    Menentukan zona target harga (garis horizontal) searah posisi trading.
    Kandidat diambil dari: pivot Support/Resistance signifikan, level Fibonacci
    retracement & extension. Level yang berdekatan (< 0.5 ATR) digabung menjadi
    satu zona konfluensi dengan skor kekuatan lebih tinggi.
    """
    is_short = str(direction).upper() == "SHORT"
    cands = []

    ph, pl = _significant_pivots(df, atr_val)
    for i in ph:
        cands.append((float(df['High'].iloc[i]), "Resistance"))
    for i in pl:
        cands.append((float(df['Low'].iloc[i]), "Support"))

    if fib:
        for lv in fib.get("levels", []):
            cands.append((float(lv["price"]), f"Fib {lv['label']}"))
        for ex in fib.get("extensions", []):
            cands.append((float(ex["price"]), f"Fib Ext {ex['label']}"))

    min_dist = max(atr_val * 0.5, entry * 0.0005)
    if is_short:
        cands = [c for c in cands if c[0] < entry - min_dist]
        cands.sort(key=lambda c: -c[0])
    else:
        cands = [c for c in cands if c[0] > entry + min_dist]
        cands.sort(key=lambda c: c[0])

    # Gabungkan level yang berdekatan menjadi zona konfluensi
    merge_tol = max(atr_val * 0.5, entry * 0.001)
    zones = []
    for price, src in cands:
        if zones and abs(zones[-1]["_prices"][-1] - price) <= merge_tol:
            zones[-1]["_prices"].append(price)
            if src not in zones[-1]["sources"]:
                zones[-1]["sources"].append(src)
        else:
            zones.append({"_prices": [price], "sources": [src]})

    results = []
    for i, z in enumerate(zones[:max_targets]):
        p = float(np.mean(z["_prices"]))
        strength = min(100, 40 + 20 * (len(z["sources"]) - 1) + (10 if any("0.618" in s or "Ext" in s for s in z["sources"]) else 0))
        dist_pct = (p - entry) / entry * 100 if entry else 0.0
        results.append({
            "label": f"T{i + 1}",
            "price": round(p, 6),
            "sources": z["sources"],
            "strength": int(strength),
            "distance_pct": round(dist_pct, 2),
            "atr_multiple": round(abs(p - entry) / atr_val, 2) if atr_val > 0 else None,
        })
    return results


def build_confluence(df: pd.DataFrame, rsi: float, macd_hist: float, stoch: dict, fib: dict, pattern_type: str, direction: str) -> dict:
    """
    Skor konfluensi multi-indikator (-100 .. +100). Setiap indikator memberi suara
    Bullish (+1) / Bearish (-1) / Netral (0), lalu dibandingkan dengan arah posisi
    agar trader tahu seberapa kuat setup didukung indikator lain.
    """
    close = float(df['Close'].iloc[-1])
    ema20 = float(calculate_ema(df['Close'], 20).iloc[-1])
    ema50 = float(calculate_ema(df['Close'], 50).iloc[-1])

    def vote(cond_bull, cond_bear):
        return 1 if cond_bull else (-1 if cond_bear else 0)

    stoch_bias = str(stoch.get("bias", ""))
    ptype = str(pattern_type or "")
    signals = [
        {"name": "Pola Chart", "vote": vote("Bull" in ptype, "Bear" in ptype), "detail": ptype or "Neutral"},
        {"name": "RSI (14)", "vote": vote(rsi > 55, rsi < 45), "detail": f"{rsi:.1f}"},
        {"name": "MACD Histogram", "vote": vote(macd_hist > 0, macd_hist < 0), "detail": f"{macd_hist:+.4f}"},
        {"name": "Stoch (14 3 3)", "vote": vote("Bull" in stoch_bias, "Bear" in stoch_bias),
         "detail": f"%K {stoch.get('k')} / %D {stoch.get('d')} ({stoch.get('zone')})"},
        {"name": "EMA 20 / 50", "vote": vote(close > ema20 > ema50, close < ema20 < ema50),
         "detail": f"Close {'>' if close > ema20 else '<'} EMA20, EMA20 {'>' if ema20 > ema50 else '<'} EMA50"},
        {"name": "Struktur Fibonacci", "vote": vote(fib.get("trend") == "up", fib.get("trend") == "down") if fib else 0,
         "detail": f"Tren {fib.get('trend', '-')}, retracement {fib.get('retracement', 0) * 100:.1f}%" if fib else "-"},
    ]
    total = sum(s["vote"] for s in signals)
    score = int(round(total / len(signals) * 100))
    if score >= 50:
        verdict = "Strong Bullish"
    elif score >= 17:
        verdict = "Bullish"
    elif score <= -50:
        verdict = "Strong Bearish"
    elif score <= -17:
        verdict = "Bearish"
    else:
        verdict = "Neutral"

    want = -1 if str(direction).upper() == "SHORT" else 1
    agree = sum(1 for s in signals if s["vote"] == want)
    return {
        "score": score,
        "verdict": verdict,
        "signals": signals,
        "agree_count": agree,
        "total": len(signals),
        "alignment_pct": int(round(agree / len(signals) * 100)),
    }


def determine_comprehensive_signal(
    df: pd.DataFrame,
    pattern_res: dict,
    rsi_val: float,
    macd_hist: float,
    stoch_data: dict,
    fib_data: dict,
) -> dict:
    """
    Evaluasi kuantitatif multi-faktor untuk menentukan arah sinyal (LONG vs SHORT)
    secara presisi dan selaras, mencegah kontradiksi antara indikator teknikal dan rekomendasi trading.
    """
    close = float(df['Close'].iloc[-1])
    ema20 = float(calculate_ema(df['Close'], 20).iloc[-1])
    ema50 = float(calculate_ema(df['Close'], 50).iloc[-1])
    
    score = 0
    reasons = []

    # 1. Pola Chart Geometri
    ptype = str(pattern_res.get("type", "")).upper()
    pname = pattern_res.get("pattern", "Channel")
    if "STRONG BULL" in ptype:
        score += 35
        reasons.append(f"Pola {pname} (Strong Bullish +35)")
    elif "BULL" in ptype:
        score += 25
        reasons.append(f"Pola {pname} (Bullish +25)")
    elif "STRONG BEAR" in ptype:
        score -= 35
        reasons.append(f"Pola {pname} (Strong Bearish -35)")
    elif "BEAR" in ptype:
        score -= 25
        reasons.append(f"Pola {pname} (Bearish -25)")
    else:
        # Pola Neutral / Channel: uji kemiringan slope
        upper_slope = pattern_res.get("trendlines", {}).get("upper_slope", 0)
        lower_slope = pattern_res.get("trendlines", {}).get("lower_slope", 0)
        if upper_slope < -0.0001 and lower_slope < -0.0001:
            score -= 10
            reasons.append("Channel miring ke bawah (-10)")
        elif upper_slope > 0.0001 and lower_slope > 0.0001:
            score += 10
            reasons.append("Channel miring ke atas (+10)")

    # 2. Struktur Tren Moving Average (EMA 20 & 50)
    if close < ema20 < ema50:
        score -= 25
        reasons.append("Harga di bawah EMA 20 & EMA 50 (Strong Downtrend -25)")
    elif close < ema20:
        score -= 15
        reasons.append("Harga di bawah EMA 20 (-15)")
    elif close > ema20 > ema50:
        score += 25
        reasons.append("Harga di atas EMA 20 & EMA 50 (Strong Uptrend +25)")
    elif close > ema20:
        score += 15
        reasons.append("Harga di atas EMA 20 (+15)")

    if ema20 < ema50:
        score -= 8
    elif ema20 > ema50:
        score += 8

    # 3. Momentum RSI & MACD
    rsi = float(rsi_val)
    hist = float(macd_hist)
    if rsi < 45:
        score -= 12
        reasons.append(f"RSI {rsi:.1f} di bawah 45 (-12)")
    elif rsi > 55:
        score += 12
        reasons.append(f"RSI {rsi:.1f} di atas 55 (+12)")

    if hist < 0:
        score -= 10
        reasons.append(f"MACD Hist negatif ({hist:+.4f}) (-10)")
    elif hist > 0:
        score += 10
        reasons.append(f"MACD Hist positif ({hist:+.4f}) (+10)")

    # 4. Stochastic (14 3 3)
    stoch_bias = str(stoch_data.get("bias", "")).upper()
    stoch_k = float(stoch_data.get("k", 50))
    stoch_d = float(stoch_data.get("d", 50))
    if "STRONG BEAR" in stoch_bias or (stoch_k < stoch_d and stoch_k > 70):
        score -= 20
        reasons.append(f"Stoch 14 3 3 Bearish Cross di zona overbought (%K={stoch_k:.1f}) (-20)")
    elif "BEAR" in stoch_bias or stoch_k < stoch_d:
        score -= 12
        reasons.append(f"Stoch 14 3 3 %K < %D (-12)")
    elif "STRONG BULL" in stoch_bias or (stoch_k > stoch_d and stoch_k < 30):
        score += 20
        reasons.append(f"Stoch 14 3 3 Bullish Cross di zona oversold (%K={stoch_k:.1f}) (+20)")
    elif "BULL" in stoch_bias or stoch_k > stoch_d:
        score += 12
        reasons.append(f"Stoch 14 3 3 %K > %D (+12)")

    # 5. Struktur Fibonacci
    fib_trend = str(fib_data.get("trend", "")).lower() if fib_data else ""
    if fib_trend == "down":
        score -= 15
        reasons.append("Struktur impulse Fibo turun (Swing High -> Low) (-15)")
    elif fib_trend == "up":
        score += 15
        reasons.append("Struktur impulse Fibo naik (Swing Low -> High) (+15)")

    # 6. Candlestick Formations
    for cp in pattern_res.get("candlestick_patterns", []):
        cp_bias = cp.get("bias")
        if cp_bias == "Bearish":
            score -= 10
            reasons.append(f"Candle {cp.get('name')} (-10)")
        elif cp_bias == "Bullish":
            score += 10
            reasons.append(f"Candle {cp.get('name')} (+10)")

    score = int(np.clip(score, -100, 100))

    if score <= -12:
        direction = "SHORT"
        is_bearish = True
        signal_type = "Strong Bearish" if score <= -40 else "Bearish"
    elif score >= 12:
        direction = "LONG"
        is_bearish = False
        signal_type = "Strong Bullish" if score >= 40 else "Bullish"
    else:
        # Netral: gunakan tie-breaker arah harga 5 candle terakhir & EMA20
        if close < ema20 or (len(df) >= 5 and float(df['Close'].iloc[-1]) < float(df['Close'].iloc[-5])):
            direction = "SHORT"
            is_bearish = True
            signal_type = "Bearish"
        else:
            direction = "LONG"
            is_bearish = False
            signal_type = "Bullish"

    confidence = min(95, max(60, 50 + abs(score) // 2))

    return {
        "direction": direction,
        "is_bearish": is_bearish,
        "signal_type": signal_type,
        "score": score,
        "confidence": confidence,
        "reasons": reasons
    }


def calculate_dynamic_tp_sl(
    breakout_price: float,
    pattern_height: float,
    swing_low: float,
    atr_14: float,
    swing_high: Optional[float] = None,
    signal_type: str = "Bullish",
    direction: Optional[str] = None
):
    """
    Kalkulasi target TP dan SL secara dinamis sesuai arah sinyal (Bullish/Long vs Bearish/Short).
    
    Posisi LONG (Bullish):
      - Entry: breakout_price
      - Take Profit (TP): di ATAS entry (breakout_price + target_height)
      - Stop Loss (SL): di BAWAH entry (swing_low - 1.5 * ATR_14)
      
    Posisi SHORT (Bearish):
      - Entry: breakout_price
      - Take Profit (TP): di BAWAH entry (breakout_price - target_height)
      - Stop Loss (SL): di ATAS entry (swing_high + 1.5 * ATR_14)
    """
    sig_str = str(signal_type or "").upper()
    if direction:
        is_bearish = (str(direction).upper() == "SHORT")
    else:
        is_bearish = any(w in sig_str for w in ["BEAR", "SHORT", "SELL", "DROP", "DOWN"])
    
    # Rasionalisasi target height (hindari nilai ekstrem)
    target_height = max(pattern_height, atr_14 * 2.0)
    max_height = max(atr_14 * 4.0, breakout_price * 0.05)
    if target_height > max_height:
        target_height = max_height
        
    if is_bearish:
        direction = "SHORT"
        tp = breakout_price - target_height
        if tp <= 0 or tp >= breakout_price:
            tp = breakout_price - (atr_14 * 2.0)
            if tp <= 0:
                tp = breakout_price * 0.95
                
        # SL posisi Short HARUS DI ATAS Entry
        if swing_high is not None and swing_high > breakout_price:
            sl = swing_high + (1.5 * atr_14)
        else:
            sl = breakout_price + (1.5 * atr_14)
            
        if sl <= breakout_price:
            sl = breakout_price + (1.5 * atr_14)
            
        risk = sl - breakout_price
        reward = breakout_price - tp
    else:
        direction = "LONG"
        tp = breakout_price + target_height
        
        # SL posisi Long HARUS DI BAWAH Entry
        if swing_low is not None and 0 < swing_low < breakout_price:
            sl = swing_low - (1.5 * atr_14)
        else:
            sl = breakout_price - (1.5 * atr_14)
            
        if sl <= 0 or sl >= breakout_price:
            sl = breakout_price - (1.5 * atr_14)
            if sl <= 0:
                sl = breakout_price * 0.95
                
        risk = breakout_price - sl
        reward = tp - breakout_price

    risk_reward = round(reward / risk, 2) if risk > 0 else 2.0
    
    return {
        "tp": round(float(tp), 4),
        "sl": round(float(sl), 4),
        "breakout_price": round(float(breakout_price), 4),
        "risk_reward": risk_reward,
        "atr": round(float(atr_14), 4),
        "direction": direction,
        "is_bearish": is_bearish
    }
