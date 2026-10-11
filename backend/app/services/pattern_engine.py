import numpy as np
import pandas as pd
from app.core.quantitative import detect_pivots, calculate_trendlines

def detect_chart_patterns(df: pd.DataFrame):
    """
    Mendeteksi pola geometrik grafik (Triangles, Channel, Double Bottom/Top)
    dan pola candlestick.
    """
    if len(df) < 15:
        return {
            "pattern": "Analyzing",
            "type": "Neutral",
            "confidence": 50,
            "trendlines": {},
            "candlestick_patterns": []
        }

    high_peaks, low_peaks = detect_pivots(df, distance=max(3, len(df)//20))
    trendlines = calculate_trendlines(df, high_peaks, low_peaks)
    
    upper_slope = trendlines["upper_slope"]
    lower_slope = trendlines["lower_slope"]
    
    # Normalisasi slope terhadap harga rata-rata
    avg_price = df['Close'].mean()
    norm_upper_slope = upper_slope / avg_price if avg_price > 0 else upper_slope
    norm_lower_slope = lower_slope / avg_price if avg_price > 0 else lower_slope
    
    pattern = "Channel / Range"
    signal_type = "Neutral"
    confidence = 65

    # Logika klasifikasi sesuai spesifikasi dokumen plan.md
    if norm_upper_slope < -0.0005 and norm_lower_slope > 0.0005:
        pattern = "Symmetrical Triangle"
        signal_type = "Consolidation / Breakout"
        confidence = 82
    elif abs(norm_upper_slope) < 0.0003 and norm_lower_slope > 0.0005:
        pattern = "Ascending Triangle"
        signal_type = "Bullish"
        confidence = 88
    elif norm_upper_slope < -0.0005 and abs(norm_lower_slope) < 0.0003:
        pattern = "Descending Triangle"
        signal_type = "Bearish"
        confidence = 85
    elif abs(norm_upper_slope - norm_lower_slope) < 0.0004:
        if norm_upper_slope > 0.0005:
            pattern = "Bull Flag / Upward Channel"
            signal_type = "Bullish"
            confidence = 78
        elif norm_upper_slope < -0.0005:
            pattern = "Bear Flag / Downward Channel"
            signal_type = "Bearish"
            confidence = 76
        else:
            pattern = "Horizontal Channel / Accumulation"
            signal_type = "Neutral"
            confidence = 70

    # Cek Double Bottom / Double Top jika ada setidaknya 2 peak
    if len(low_peaks) >= 2:
        last_two_lows = df['Low'].iloc[low_peaks[-2:]].values
        if abs(last_two_lows[0] - last_two_lows[1]) / last_two_lows[0] < 0.015:
            pattern = "Double Bottom (W-Pattern)"
            signal_type = "Strong Bullish"
            confidence = 90
            
    if len(high_peaks) >= 2:
        last_two_highs = df['High'].iloc[high_peaks[-2:]].values
        if abs(last_two_highs[0] - last_two_highs[1]) / last_two_highs[0] < 0.015:
            pattern = "Double Top (M-Pattern)"
            signal_type = "Strong Bearish"
            confidence = 90

    # Candlestick Pattern Recognition
    candle_patterns = detect_candlestick_patterns(df)

    pattern_height = float(df['High'].tail(30).max() - df['Low'].tail(30).min())
    if pattern == "Double Top (M-Pattern)" and len(high_peaks) >= 2:
        idx_start = min(high_peaks[-2], high_peaks[-1])
        idx_end = max(high_peaks[-2], high_peaks[-1])
        valley = float(df['Low'].iloc[idx_start:idx_end+1].min())
        avg_peak = float(np.mean(last_two_highs))
        if avg_peak > valley:
            pattern_height = avg_peak - valley
    elif pattern == "Double Bottom (W-Pattern)" and len(low_peaks) >= 2:
        idx_start = min(low_peaks[-2], low_peaks[-1])
        idx_end = max(low_peaks[-2], low_peaks[-1])
        peak_mid = float(df['High'].iloc[idx_start:idx_end+1].max())
        avg_low = float(np.mean(last_two_lows))
        if peak_mid > avg_low:
            pattern_height = peak_mid - avg_low

    return {
        "pattern": pattern,
        "type": signal_type,
        "confidence": confidence,
        "trendlines": trendlines,
        "candlestick_patterns": candle_patterns,
        "pattern_height": pattern_height
    }

def detect_candlestick_patterns(df: pd.DataFrame) -> list[dict]:
    patterns = []
    if len(df) < 3:
        return patterns
        
    latest = df.iloc[-1]
    prev = df.iloc[-2]
    
    body = abs(latest['Close'] - latest['Open'])
    candle_range = latest['High'] - latest['Low']
    upper_wick = latest['High'] - max(latest['Close'], latest['Open'])
    lower_wick = min(latest['Close'], latest['Open']) - latest['Low']
    
    # 1. Hammer: Small body at upper end, long lower shadow (>= 2x body)
    if candle_range > 0 and lower_wick >= 2 * body and upper_wick <= 0.2 * body:
        patterns.append({
            "name": "Hammer",
            "bias": "Bullish",
            "desc": "Penolakan harga rendah yang kuat, mengindikasikan potensi reversal naik."
        })
        
    # 2. Shooting Star: Small body at lower end, long upper shadow
    if candle_range > 0 and upper_wick >= 2 * body and lower_wick <= 0.2 * body:
        patterns.append({
            "name": "Shooting Star",
            "bias": "Bearish",
            "desc": "Penolakan harga tinggi, sinyal potensi koreksi ke bawah."
        })
        
    # 3. Bullish Engulfing
    if prev['Close'] < prev['Open'] and latest['Close'] > latest['Open']:
        if latest['Open'] <= prev['Close'] and latest['Close'] >= prev['Open']:
            patterns.append({
                "name": "Bullish Engulfing",
                "bias": "Bullish",
                "desc": "Candle hijau menelan penuh candle merah sebelumnya, sinyal momentum buyer dominan."
            })
            
    # 4. Bearish Engulfing
    if prev['Close'] > prev['Open'] and latest['Close'] < latest['Open']:
        if latest['Open'] >= prev['Close'] and latest['Close'] <= prev['Open']:
            patterns.append({
                "name": "Bearish Engulfing",
                "bias": "Bearish",
                "desc": "Candle merah menelan candle hijau sebelumnya, sinyal momentum seller dominan."
            })

    # 5. Doji
    if candle_range > 0 and (body / candle_range) < 0.1:
        patterns.append({
            "name": "Doji",
            "bias": "Neutral",
            "desc": "Keseimbangan sempurna antara buyer dan seller, menandakan konsolidasi atau transisi tren."
        })
        
    return patterns
