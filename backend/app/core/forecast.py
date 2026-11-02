"""
ATRED Forward Forecast Engine (Prediksi Fase Berikutnya)
=========================================================

Masalah yang diselesaikan:
  Engine eksekusi lama (`calculate_dynamic_tp_sl`) mengukur struktur dari RANGE 45 candle
  terakhir. Setelah terjadi pump/dump vertikal, entry jatuh di dasar range lama dan TP
  jatuh di high/low yang SUDAH tercetak -> sinyal menggambarkan fase yang sudah selesai.

Pendekatan:
  1. Identifikasi IMPULSE TERAKHIR (swing awal -> ekstrem terbaru) termasuk candle live.
  2. Klasifikasi FASE pasar saat ini terhadap impulse tersebut:
       - EXHAUSTION_AFTER_PUMP / EXHAUSTION_AFTER_DUMP  (jenuh -> rawan koreksi)
       - MOMENTUM_CONTINUATION_UP / _DOWN               (momentum masih kuat)
       - CONSOLIDATION_AFTER_IMPULSE                     (seimbang)
       - PULLBACK_AT_ZONE                                (koreksi sedang berlangsung di zona Fib)
       - RANGE_OR_DEVELOPING                             (tidak ada impulse signifikan)
  3. Skor teknikal koreksi vs lanjut dari faktor nyata (RSI, Stoch, jarak ke EMA20 dalam ATR,
     klimaks volume, rejection wick, divergence RSI, ADX/DI, kekuatan close) + base-rate
     historis dari kejadian serupa di data koin yang sama (bukan angka sintetis).
  4. Proyeksi jalur skenario utama & alternatif N candle ke depan (area masa depan chart).
  5. Rencana trading BARU yang selalu berada DI DEPAN harga (TP tidak pernah di level yang
     sudah tersentuh).
"""

from typing import Optional

import numpy as np
import pandas as pd

from app.core.quantitative import (
    calculate_rsi,
    calculate_ema,
    calculate_atr,
    calculate_stochastic,
    calculate_adx,
    _dec,
)


PHASE_LABELS = {
    "EXHAUSTION_AFTER_PUMP": "Jenuh Setelah Pump (Rawan Koreksi)",
    "EXHAUSTION_AFTER_DUMP": "Jenuh Setelah Dump (Rawan Pantulan)",
    "MOMENTUM_CONTINUATION_UP": "Momentum Naik Masih Kuat",
    "MOMENTUM_CONTINUATION_DOWN": "Momentum Turun Masih Kuat",
    "CONSOLIDATION_AFTER_IMPULSE": "Konsolidasi Setelah Impulse",
    "PULLBACK_AT_ZONE": "Koreksi Sedang Menguji Zona Fibonacci",
    "RANGE_OR_DEVELOPING": "Sideways / Struktur Masih Berkembang",
}


def _wick_ratio(o: float, h: float, l: float, c: float, up: bool) -> float:
    rng = h - l
    if rng <= 0:
        return 0.0
    if up:
        return (h - max(o, c)) / rng  # upper wick = penolakan setelah pump
    return (min(o, c) - l) / rng      # lower wick = penolakan setelah dump


def _close_strength(o: float, h: float, l: float, c: float, up: bool) -> float:
    rng = h - l
    if rng <= 0:
        return 0.5
    return (c - l) / rng if up else (h - c) / rng


def _historical_exhaustion_stats(
    highs: np.ndarray,
    lows: np.ndarray,
    rsi: np.ndarray,
    atr: np.ndarray,
    up: bool,
    horizon: int,
) -> dict:
    """
    Base-rate historis dari data koin yang sama: setiap kali terjadi impulse >= 3 ATR dengan
    RSI ekstrem (>=68 untuk pump / <=32 untuk dump), apa yang terjadi lebih dulu dalam
    `horizon` candle berikutnya: koreksi 0.382 dari impulse, atau perpanjangan +0.272?
    """
    n = len(highs)
    samples = pull_first = cont_first = 0
    t = 25
    while t < n - horizon - 1:
        a_t = max(float(atr[t]), 1e-12)
        if up:
            is_ext = highs[t] >= np.max(highs[t - 20:t + 1])
            leg = highs[t] - float(np.min(lows[t - 20:t]))
            cond = is_ext and (leg / a_t) >= 3.0 and rsi[t] >= 68
        else:
            is_ext = lows[t] <= np.min(lows[t - 20:t + 1])
            leg = float(np.max(highs[t - 20:t])) - lows[t]
            cond = is_ext and (leg / a_t) >= 3.0 and rsi[t] <= 32

        if not cond or leg <= 0:
            t += 1
            continue

        if up:
            retr_lvl = highs[t] - 0.382 * leg
            ext_lvl = highs[t] + 0.272 * leg
        else:
            retr_lvl = lows[t] + 0.382 * leg
            ext_lvl = lows[t] - 0.272 * leg

        outcome = None
        for j in range(t + 1, min(t + 1 + horizon, n)):
            hit_r = (lows[j] <= retr_lvl) if up else (highs[j] >= retr_lvl)
            hit_e = (highs[j] >= ext_lvl) if up else (lows[j] <= ext_lvl)
            if hit_r:
                outcome = "PULL"
                break
            if hit_e:
                outcome = "CONT"
                break
        samples += 1
        if outcome == "PULL":
            pull_first += 1
        elif outcome == "CONT":
            cont_first += 1
        t += 6  # hindari sampel tumpang-tindih dari impulse yang sama

    return {
        "samples": int(samples),
        "pullback_first": int(pull_first),
        "continuation_first": int(cont_first),
        "pullback_first_pct": round(pull_first / samples * 100.0, 1) if samples > 0 else None,
        "horizon_bars": int(horizon),
    }


def forecast_next_move(
    df: pd.DataFrame,
    base_direction: str,
    base_plan: dict,
    base_confidence: float = 58.0,
    timeframe: str = "15m",
    horizon_bars: int = 12,
) -> dict:
    """
    Prediksi fase berikutnya setelah formasi grafik saat ini (dipakai untuk area masa depan chart).

    Args:
        df: OHLCV LENGKAP termasuk candle live (agar ekstrem impulse terbaru ikut terbaca).
        base_direction: arah sinyal dari mesin skor (`determine_comprehensive_signal`).
        base_plan: rencana eksekusi lama (`calculate_dynamic_tp_sl`) untuk cek kedaluwarsa.
    """
    n = len(df)
    if n < 40:
        return {"available": False}

    opens = df['Open'].astype(float).values
    highs = df['High'].astype(float).values
    lows = df['Low'].astype(float).values
    closes = df['Close'].astype(float).values
    vols = df['Volume'].astype(float).values
    close_s = df['Close'].astype(float)

    live = float(closes[-1])
    dec = _dec(live)

    atr_s = calculate_atr(df, 14).bfill().fillna(live * 0.005)
    atr_now = max(float(atr_s.iloc[-1]), live * 0.002)
    # ATR "normal" (median 60 bar) agar ukuran impulse tidak terdistorsi oleh candle spike itu sendiri
    atr_base = max(float(np.nanmedian(atr_s.tail(60).values)), live * 0.0015)

    rsi_s = calculate_rsi(close_s, 14).bfill().fillna(50.0)
    rsi_vals = rsi_s.values
    rsi_now = float(rsi_vals[-1])
    ema20_s = calculate_ema(close_s, 20)
    ema50_s = calculate_ema(close_s, 50)
    ema20 = float(ema20_s.iloc[-1])
    ema50 = float(ema50_s.iloc[-1])
    k_s, _d_s = calculate_stochastic(df, 14, 3, 3)
    k_now = float(k_s.iloc[-1])
    adx_info = calculate_adx(df, 14)

    # ------------------------------------------------------------------
    # 1. Impulse terakhir (40 candle, termasuk candle live)
    # ------------------------------------------------------------------
    W = min(40, n - 1)
    off = n - W
    wh, wl = highs[off:], lows[off:]
    i_hi, i_lo = int(np.argmax(wh)), int(np.argmin(wl))
    up = i_hi > i_lo
    if up:
        abs_start, abs_end = off + i_lo, off + i_hi
        start_p, end_p = float(wl[i_lo]), float(wh[i_hi])
    else:
        abs_start, abs_end = off + i_hi, off + i_lo
        start_p, end_p = float(wh[i_hi]), float(wl[i_lo])

    sgn = 1.0 if up else -1.0
    leg = max(abs(end_p - start_p), atr_base * 0.5)
    leg_atr = leg / atr_base
    bars_since = n - 1 - abs_end
    retrace_now = float(np.clip(sgn * (end_p - live) / leg, -0.5, 1.5))

    def retr(r: float) -> float:
        return end_p - sgn * r * leg

    def ext(r: float) -> float:
        return start_p + sgn * r * leg

    lv = {
        "r236": retr(0.236), "r382": retr(0.382), "r5": retr(0.5),
        "r618": retr(0.618), "r786": retr(0.786),
        "e1272": ext(1.272), "e1618": ext(1.618),
    }

    # ------------------------------------------------------------------
    # 2. Faktor teknikal koreksi vs lanjut
    # ------------------------------------------------------------------
    factors = []
    ex_pts = 0.0
    cont_pts = 0.0

    def add(label: str, side: str, pts: float):
        nonlocal ex_pts, cont_pts
        if side == "reversal":
            ex_pts += pts
        else:
            cont_pts += pts
        factors.append({"label": label, "side": side, "weight": round(pts, 1)})

    move_word = "pump" if up else "dump"
    rsi_ex = rsi_now if up else 100.0 - rsi_now
    if rsi_ex >= 75:
        add(f"RSI(14) ekstrem {rsi_now:.1f} setelah {move_word}", "reversal", 2.0)
    elif rsi_ex >= 70:
        add(f"RSI(14) jenuh {rsi_now:.1f}", "reversal", 1.0)

    k_ex = k_now if up else 100.0 - k_now
    if k_ex >= 85:
        add(f"Stoch %K {k_now:.1f} di zona {'overbought' if up else 'oversold'} ekstrem", "reversal", 1.5)
    elif k_ex >= 80:
        add(f"Stoch %K {k_now:.1f} {'overbought' if up else 'oversold'}", "reversal", 1.0)

    ext_atr = sgn * (live - ema20) / atr_base
    if ext_atr >= 3.0:
        add(f"Harga {ext_atr:.1f}x ATR dari EMA20 (overextended)", "reversal", 2.0)
    elif ext_atr >= 2.0:
        add(f"Harga {ext_atr:.1f}x ATR dari EMA20", "reversal", 1.0)

    vol_ref = float(np.mean(vols[-23:-3])) if n >= 25 else float(np.mean(vols))
    vol_climax = float(np.max(vols[-3:])) / vol_ref if vol_ref > 0 else 1.0
    if vol_climax >= 2.5 and bars_since <= 3:
        add(f"Klimaks volume {vol_climax:.1f}x rata-rata di ujung impulse", "reversal", 1.0)

    wick = max(
        _wick_ratio(opens[-1], highs[-1], lows[-1], closes[-1], up),
        _wick_ratio(opens[-2], highs[-2], lows[-2], closes[-2], up),
    )
    if wick >= 0.40:
        add(f"Rejection wick {'atas' if up else 'bawah'} {wick * 100:.0f}% dari range candle", "reversal", 1.5)

    divergence = False
    w0, w1 = max(0, abs_end - 35), max(0, abs_end - 4)
    if w1 - w0 >= 5:
        if up:
            p_i = w0 + int(np.argmax(highs[w0:w1]))
            divergence = highs[abs_end] > highs[p_i] and rsi_vals[abs_end] < rsi_vals[p_i] - 2.0
        else:
            p_i = w0 + int(np.argmin(lows[w0:w1]))
            divergence = lows[abs_end] < lows[p_i] and rsi_vals[abs_end] > rsi_vals[p_i] + 2.0
    if divergence:
        add(f"{'Bearish' if up else 'Bullish'} divergence RSI pada ekstrem baru", "reversal", 2.0)

    if bars_since >= 2 and retrace_now >= 0.15:
        add(f"Gagal mencetak ekstrem baru selama {bars_since} candle", "reversal", 1.0)

    di_aligned = (adx_info["plus_di"] > adx_info["minus_di"]) if up else (adx_info["minus_di"] > adx_info["plus_di"])
    if adx_info["adx"] >= 30 and di_aligned:
        add(f"ADX {adx_info['adx']:.1f} kuat & DI searah {move_word}", "continuation", 1.5)
    elif adx_info["adx"] >= 23 and di_aligned:
        add(f"ADX {adx_info['adx']:.1f} mendukung tren", "continuation", 0.75)

    strength = _close_strength(opens[-1], highs[-1], lows[-1], closes[-1], up)
    if strength >= 0.75 and wick < 0.25:
        add(f"Candle terakhir close kuat ({strength * 100:.0f}% dari range)", "continuation", 1.0)

    if bars_since == 0:
        add("Harga masih mencetak ekstrem baru di candle ini", "continuation", 1.0)

    ema_aligned = (ema20 > ema50) if up else (ema20 < ema50)
    if ema_aligned:
        add(f"EMA20 {'di atas' if up else 'di bawah'} EMA50 (struktur tren searah)", "continuation", 1.0)

    if not divergence and rsi_ex >= 60:
        add("Tidak ada divergence RSI (momentum terkonfirmasi)", "continuation", 0.5)

    score = 50.0 + (ex_pts - cont_pts) * 6.0
    reversal_score = float(np.clip(score, 18.0, 82.0))

    hist = _historical_exhaustion_stats(highs, lows, rsi_vals, atr_s.values, up, horizon_bars)
    if hist["samples"] >= 5 and hist["pullback_first_pct"] is not None:
        reversal_score = 0.65 * reversal_score + 0.35 * float(hist["pullback_first_pct"])
    reversal_score = round(float(np.clip(reversal_score, 15.0, 85.0)), 1)

    # ------------------------------------------------------------------
    # 3. Klasifikasi fase
    # ------------------------------------------------------------------
    recent_impulse = leg_atr >= 3.0 and bars_since <= 8 and retrace_now < 0.33
    pullback_zone_active = leg_atr >= 3.0 and bars_since <= 24 and 0.33 <= retrace_now <= 0.70

    if recent_impulse:
        if reversal_score >= 55:
            phase = "EXHAUSTION_AFTER_PUMP" if up else "EXHAUSTION_AFTER_DUMP"
        elif reversal_score <= 45:
            phase = "MOMENTUM_CONTINUATION_UP" if up else "MOMENTUM_CONTINUATION_DOWN"
        else:
            phase = "CONSOLIDATION_AFTER_IMPULSE"
    elif pullback_zone_active:
        phase = "PULLBACK_AT_ZONE"
    else:
        phase = "RANGE_OR_DEVELOPING"

    # ------------------------------------------------------------------
    # 4. Cek apakah rencana lama sudah kedaluwarsa (TP sudah tersentuh / harga lewat)
    # ------------------------------------------------------------------
    stale = False
    stale_reason = None
    try:
        b_dir = str(base_plan.get("direction") or base_direction).upper()
        b_tp1 = float(base_plan.get("tp1") or 0)
        b_tp2 = float(base_plan.get("tp2") or base_plan.get("tp") or 0)
        recent_hi = float(np.max(highs[-3:]))
        recent_lo = float(np.min(lows[-3:]))
        if b_dir == "LONG" and b_tp1 > 0 and (live >= b_tp1 or recent_hi >= b_tp2 > 0):
            stale = True
            stale_reason = f"Target lama (TP1 {b_tp1:.{dec}f} / TP2 {b_tp2:.{dec}f}) sudah tersentuh - fase itu sudah selesai."
        elif b_dir == "SHORT" and b_tp1 > 0 and (live <= b_tp1 or (b_tp2 > 0 and recent_lo <= b_tp2)):
            stale = True
            stale_reason = f"Target lama (TP1 {b_tp1:.{dec}f} / TP2 {b_tp2:.{dec}f}) sudah tersentuh - fase itu sudah selesai."
    except Exception:
        pass

    if stale and phase == "RANGE_OR_DEVELOPING":
        phase = "CONSOLIDATION_AFTER_IMPULSE"

    # ------------------------------------------------------------------
    # 5. Skenario & jalur proyeksi ke depan
    # ------------------------------------------------------------------
    zone_a, zone_b = sorted([lv["r382"], lv["r5"]])
    zone_mid = (lv["r382"] + lv["r5"]) / 2.0
    trend_word_with = "naik" if up else "turun"
    trend_word_against = "turun" if up else "naik"

    def P(v: float) -> float:
        return round(float(v), dec)

    def path(*pts):
        return [{"bars_ahead": int(b), "price": P(p)} for b, p in pts]

    primary = alternate = None
    if phase in ("EXHAUSTION_AFTER_PUMP", "EXHAUSTION_AFTER_DUMP"):
        deep = divergence or reversal_score >= 70
        if deep:
            primary = {
                "key": "DEEP_CORRECTION",
                "bias": "DOWN" if up else "UP",
                "title": f"Koreksi {trend_word_against} dalam ke Fib 0.5-0.618",
                "path": path((0, live), (4, lv["r382"]), (horizon_bars - 2, lv["r618"])),
                "target_low": P(min(lv["r5"], lv["r618"])),
                "target_high": P(max(lv["r5"], lv["r618"])),
            }
        else:
            primary = {
                "key": "HEALTHY_PULLBACK",
                "bias": "DOWN" if up else "UP",
                "title": f"Koreksi {trend_word_against} dulu ke Fib 0.382-0.5, lalu memantul",
                "path": path((0, live), (5, zone_mid), (horizon_bars, lv["r236"])),
                "target_low": P(zone_a),
                "target_high": P(zone_b),
            }
        alternate = {
            "key": "EXTENSION",
            "bias": "UP" if up else "DOWN",
            "title": f"Lanjut {trend_word_with} menembus {P(end_p)} menuju Fib Ext 1.272",
            "path": path((0, live), (max(3, horizon_bars // 2), lv["e1272"])),
            "target_low": P(min(end_p, lv["e1272"])),
            "target_high": P(max(end_p, lv["e1272"])),
        }
        primary["probability"] = reversal_score
        alternate["probability"] = round(100.0 - reversal_score, 1)

    elif phase in ("MOMENTUM_CONTINUATION_UP", "MOMENTUM_CONTINUATION_DOWN"):
        primary = {
            "key": "CONTINUATION",
            "bias": "UP" if up else "DOWN",
            "title": f"Lanjut {trend_word_with} setelah retest dangkal ke Fib 0.236",
            "path": path((0, live), (3, lv["r236"]), (horizon_bars, lv["e1272"])),
            "target_low": P(min(lv["e1272"], lv["e1618"])),
            "target_high": P(max(lv["e1272"], lv["e1618"])),
            "probability": round(100.0 - reversal_score, 1),
        }
        alternate = {
            "key": "PULLBACK",
            "bias": "DOWN" if up else "UP",
            "title": f"Gagal lanjut, koreksi {trend_word_against} ke Fib 0.382-0.5",
            "path": path((0, live), (horizon_bars - 3, zone_mid)),
            "target_low": P(zone_a),
            "target_high": P(zone_b),
            "probability": reversal_score,
        }

    elif phase == "CONSOLIDATION_AFTER_IMPULSE":
        primary = {
            "key": "CONSOLIDATION",
            "bias": "SIDEWAYS",
            "title": f"Konsolidasi di antara Fib 0.382 dan high impulse ({P(end_p)})",
            "path": path((0, live), (4, lv["r236"]), (8, end_p - sgn * 0.08 * leg), (horizon_bars, lv["r382"])),
            "target_low": P(min(lv["r382"], end_p)),
            "target_high": P(max(lv["r382"], end_p)),
            "probability": round(max(reversal_score, 100.0 - reversal_score), 1),
        }
        alternate = {
            "key": "PULLBACK",
            "bias": "DOWN" if up else "UP",
            "title": f"Koreksi {trend_word_against} lebih dalam ke Fib 0.5",
            "path": path((0, live), (horizon_bars - 2, lv["r5"])),
            "target_low": P(min(lv["r5"], lv["r618"])),
            "target_high": P(max(lv["r5"], lv["r618"])),
            "probability": round(min(reversal_score, 100.0 - reversal_score), 1),
        }

    elif phase == "PULLBACK_AT_ZONE":
        bounce_p = 58.0 if ema_aligned else 50.0
        if k_ex <= 35:
            bounce_p += 6.0  # Stoch sudah reset -> ruang pantulan
        bounce_p = round(float(np.clip(bounce_p, 40.0, 70.0)), 1)
        primary = {
            "key": "BOUNCE",
            "bias": "UP" if up else "DOWN",
            "title": f"Memantul dari zona Fib dan kembali {trend_word_with} menguji {P(end_p)}",
            "path": path((0, live), (horizon_bars, end_p)),
            "target_low": P(min(lv["r236"], end_p)),
            "target_high": P(max(lv["r236"], end_p)),
            "probability": bounce_p,
        }
        alternate = {
            "key": "BREAKDOWN",
            "bias": "DOWN" if up else "UP",
            "title": f"Zona Fib jebol, lanjut {trend_word_against} ke Fib 0.786",
            "path": path((0, live), (horizon_bars - 3, lv["r786"])),
            "target_low": P(min(lv["r786"], start_p)),
            "target_high": P(max(lv["r786"], start_p)),
            "probability": round(100.0 - bounce_p, 1),
        }

    else:  # RANGE_OR_DEVELOPING -> ikuti rencana dasar
        b_dir = str(base_plan.get("direction") or base_direction).upper()
        b_entry = float(base_plan.get("maker_limit_entry") or live)
        b_tp1 = float(base_plan.get("tp1") or live)
        b_sl = float(base_plan.get("sl") or live)
        conf = round(float(np.clip(base_confidence, 50.0, 70.0)), 1)
        primary = {
            "key": "RANGE_PLAN",
            "bias": "UP" if b_dir == "LONG" else "DOWN",
            "title": f"Retest {P(b_entry)} lalu bergerak {'naik' if b_dir == 'LONG' else 'turun'} ke {P(b_tp1)}",
            "path": path((0, live), (4, b_entry), (horizon_bars, b_tp1)),
            "target_low": P(min(b_entry, b_tp1)),
            "target_high": P(max(b_entry, b_tp1)),
            "probability": conf,
        }
        alternate = {
            "key": "RANGE_FAIL",
            "bias": "DOWN" if b_dir == "LONG" else "UP",
            "title": f"Setup gagal, harga menembus {P(b_sl)}",
            "path": path((0, live), (horizon_bars - 3, b_sl)),
            "target_low": P(min(live, b_sl)),
            "target_high": P(max(live, b_sl)),
            "probability": round(100.0 - conf, 1),
        }

    # ------------------------------------------------------------------
    # 6. Rencana trading ke depan (selalu diikat ke struktur harga saat ini & target di masa depan)
    #    - Tidak pernah menempatkan Entry di swing lama 8-15 candle lalu yang sudah lewat.
    #    - Tidak pernah menempatkan TP1 pada `end_p` yang sudah disentuh harga saat ini (`live`).
    # ------------------------------------------------------------------
    with_dir = "LONG" if up else "SHORT"
    against_dir = "SHORT" if up else "LONG"
    tf = timeframe.upper()
    plan = None

    recent_3_span = float(np.max(highs[-3:]) - np.min(lows[-3:])) if n >= 3 else atr_now
    is_pausing_now = (recent_3_span <= 1.65 * atr_now) or (bars_since >= 1) or (phase == "PULLBACK_AT_ZONE")

    if phase in ("EXHAUSTION_AFTER_PUMP", "EXHAUSTION_AFTER_DUMP"):
        reversal_evidence = divergence or wick >= 0.40 or (bars_since >= 2 and retrace_now >= 0.15)
        if reversal_score >= 68 and reversal_evidence:
            # Kontra-tren dengan konfirmasi dekat harga saat ini
            raw_trigger = float(lows[-2]) if up else float(highs[-2])
            max_trig_dist = 0.35 * atr_now
            if abs(raw_trigger - live) > max_trig_dist:
                trigger = live - sgn * 0.20 * atr_now
            else:
                trigger = raw_trigger
            entry = trigger
            sl_dist = max(abs(end_p - entry) + 0.35 * atr_now, 1.15 * atr_now)
            sl_dist = min(sl_dist, 1.90 * atr_now)
            sl = entry + sgn * sl_dist  # Di atas end_p jika up (SHORT reversal), di bawah end_p jika down (LONG reversal)
            base_rev = min(live, entry) if up else max(live, entry)
            tp1 = ( min(lv["r382"], base_rev - max(1.25 * atr_now, 1.05 * sl_dist))
                    if up else
                    max(lv["r382"], base_rev + max(1.25 * atr_now, 1.05 * sl_dist)) )
            tp2 = ( min(lv["r618"], tp1 - max(1.05 * atr_now, 0.90 * sl_dist))
                    if up else
                    max(lv["r618"], tp1 + max(1.05 * atr_now, 0.90 * sl_dist)) )
            plan = {
                "direction": against_dir,
                "plan_type": "REVERSAL_CONFIRMATION",
                "label": f"{against_dir} reversal (konfirmasi)",
                "entry": entry,
                "zone": sorted([entry - sgn * 0.12 * atr_now, entry + sgn * 0.22 * atr_now]),
                "sl": sl, "tp1": tp1, "tp2": tp2,
                "trigger": (
                    f"SINYAL REVERSAL BARU: Entry {against_dir} di sekitar {P(entry)} jika candle {tf} konfirmasi berbalik arah "
                    f"menuju TP1 {P(tp1)} & TP2 {P(tp2)}."
                ),
                "moment_status": "WAIT_CONFIRMATION",
            }

    if plan is None and phase != "RANGE_OR_DEVELOPING":
        # Skenario searah tren / kelanjutan yang selalu mengacu pada harga sekarang (`live`),
        # BUKAN mengacu pada Fib 0.5 lama yang sudah lewat 8 candle lalu!
        if is_pausing_now:
            entry = live - sgn * 0.06 * atr_now
            za, zb = sorted([live - sgn * 0.24 * atr_now, live + sgn * 0.10 * atr_now])
            m_status = "ACTIVE_NOW"
            p_type = "ZONE_ACTIVE"
            p_label = f"{with_dir} aktif sekarang"
        else:
            entry = live - sgn * 0.28 * atr_now
            za, zb = sorted([live - sgn * 0.42 * atr_now, live - sgn * 0.08 * atr_now])
            m_status = "WAITING_RETEST"
            p_type = "LIMIT_RETEST"
            p_label = f"{with_dir} order baru (di depan)"

        recent_op = float(np.min(lows[-5:])) if up else float(np.max(highs[-5:]))
        sl_dist = float(np.clip(abs(entry - recent_op) + 0.30 * atr_now, 1.15 * atr_now, 1.90 * atr_now))
        sl = entry - sgn * sl_dist

        # Target TP1 & TP2 WAJIB berada di depan harga live dan entry (tidak pernah di `end_p` yang sudah disentuh!)
        base_tip = max(live, end_p, entry) if up else min(live, end_p, entry)
        tp1 = base_tip + sgn * max(1.25 * atr_now, 1.05 * sl_dist)
        tp2 = tp1 + sgn * max(1.10 * atr_now, 0.95 * sl_dist)

        if m_status == "ACTIVE_NOW":
            trig_msg = (
                f"SINYAL AKTIF SEKARANG (BELUM LEWAT): Pasang posisi {with_dir} di area lingkaran sinyal "
                f"{P(za)} - {P(zb)} (optimal {P(entry)}) menuju TP1 {P(tp1)} & TP2 {P(tp2)}."
            )
        else:
            trig_msg = (
                f"SINYAL BARU (BELUM LEWAT): Pasang Limit {with_dir} di retest mikro {P(za)} - {P(zb)} "
                f"(optimal {P(entry)}) dengan target ke depan TP1 {P(tp1)} & TP2 {P(tp2)}."
            )

        plan = {
            "direction": with_dir,
            "plan_type": p_type,
            "label": p_label,
            "entry": entry,
            "zone": [za, zb],
            "sl": sl,
            "tp1": tp1,
            "tp2": tp2,
            "trigger": trig_msg,
            "moment_status": m_status,
        }

    override = plan is not None and (phase != "RANGE_OR_DEVELOPING" or stale)
    if plan:
        plan = {
            **plan,
            "entry": P(plan["entry"]),
            "zone": [P(min(plan["zone"])), P(max(plan["zone"]))],
            "sl": P(plan["sl"]),
            "tp1": P(plan["tp1"]),
            "tp2": P(plan["tp2"]),
        }

    primary_word = {"UP": "NAIK", "DOWN": "TURUN", "SIDEWAYS": "SIDEWAYS"}.get(primary["bias"], "")
    narrative = (
        f"Prediksi {horizon_bars} candle {tf} ke depan: {primary_word} - {primary['title']} "
        f"(skor {primary['probability']:.0f}%). Alternatif: {alternate['title']} ({alternate['probability']:.0f}%)."
    )

    return {
        "available": True,
        "timeframe": tf,
        "horizon_bars": int(horizon_bars),
        "phase": phase,
        "phase_label": PHASE_LABELS.get(phase, phase),
        "current_price": P(live),
        "impulse": {
            "direction": "UP" if up else "DOWN",
            "start_price": P(start_p),
            "end_price": P(end_p),
            "start_bars_ago": int(n - 1 - abs_start),
            "end_bars_ago": int(bars_since),
            "size_atr": round(float(leg_atr), 2),
            "retracement_now": round(retrace_now, 3),
        },
        "levels": {k: P(v) for k, v in lv.items()},
        "primary": primary,
        "alternate": alternate,
        "reversal_score": reversal_score,
        "factors": factors,
        "historical": hist,
        "indicators": {
            "rsi": round(rsi_now, 1),
            "stoch_k": round(k_now, 1),
            "ext_atr_from_ema20": round(float(ext_atr), 2),
            "volume_climax_x": round(float(vol_climax), 2),
            "rejection_wick_pct": round(float(wick) * 100.0, 1),
            "divergence": bool(divergence),
            "adx": adx_info["adx"],
        },
        "base_plan_stale": bool(stale),
        "stale_reason": stale_reason,
        "override_plan": bool(override),
        "trade_plan": plan,
        "narrative": narrative,
    }


def apply_forward_plan(tp_sl: dict, forecast: dict, win_rate_pct: float = 56.0) -> dict:
    """
    Mengganti level eksekusi lama dengan rencana ke depan dari `forecast_next_move`,
    lalu menghitung ulang RR, EV bersih, leverage aman, dan koordinat lingkaran sinyal (`signal_circles`).
    """
    plan = forecast.get("trade_plan") if forecast else None
    if not plan or not forecast.get("override_plan"):
        return tp_sl

    live = float(forecast.get("current_price") or tp_sl.get("breakout_price") or plan["entry"])
    dec = _dec(live)
    is_short = plan["direction"] == "SHORT"
    entry, sl, tp1, tp2 = float(plan["entry"]), float(plan["sl"]), float(plan["tp1"]), float(plan["tp2"])

    risk = max(abs(sl - entry), live * 0.001)
    reward_tp1 = max((entry - tp1) if is_short else (tp1 - entry), 0.0)
    reward_tp2 = max((entry - tp2) if is_short else (tp2 - entry), 0.0)
    gross_rr = round(reward_tp2 / risk, 2) if risk > 0 else 0.0

    fee_rt_pct = float(tp_sl.get("round_trip_fee_pct") or 0.03)
    risk_pct = risk / entry * 100.0 if entry > 0 else 1.0
    reward_tp2_pct = reward_tp2 / entry * 100.0 if entry > 0 else 0.0
    blended_pct = (0.5 * reward_tp1 + 0.5 * reward_tp2) / entry * 100.0 if entry > 0 else 0.0
    net_rr = round(max(0.0, reward_tp2_pct - fee_rt_pct) / (risk_pct + fee_rt_pct), 2) if (risk_pct + fee_rt_pct) > 0 else 0.0

    p = float(np.clip((forecast.get("primary") or {}).get("probability", win_rate_pct) / 100.0, 0.30, 0.85))
    ev_net = round(p * blended_pct - (1.0 - p) * risk_pct - fee_rt_pct, 3)

    from app.core.config import settings
    validity = "EXECUTABLE_HIGH_EDGE" if (ev_net > settings.MIN_NET_EV_PCT and net_rr >= settings.MIN_NET_RR) else "SKIP_LOW_EV"

    b = max(net_rr, 0.1)
    full_kelly = max(0.0, (p * b - (1.0 - p)) / b)
    half_kelly_pct = round(float(np.clip(0.5 * full_kelly * 100.0, 1.0, 25.0)), 2)
    safe_lev = int(np.clip(np.floor(1.0 / max(risk_pct + 0.15, 0.05)), 1, 20))

    moment_labels = {
        "WAITING_RETEST": f"🟡 BARU MEMASUKI: TUNGGU RETEST KE {round(entry, dec)}",
        "WAIT_CONFIRMATION": f"🟠 BARU MEMASUKI: TUNGGU KONFIRMASI DI {round(entry, dec)}",
        "ACTIVE_NOW": f"🟢 PASANG POSISI SEKARANG (Area Sinyal Aktif @ {round(entry, dec)})",
    }
    status = plan.get("moment_status", "WAITING_RETEST")
    safe_atr = max(float(tp_sl.get("atr") or live * 0.005), 1e-12)
    dist_atr = abs(entry - live) / safe_atr
    is_active_now = (status == "ACTIVE_NOW") or (dist_atr <= 0.25)
    if is_active_now:
        status = "ACTIVE_NOW"

    existing_circles = dict(tp_sl.get("signal_circles") or {})
    prev_active = dict(existing_circles.get("active") or {})
    direction_str = "SHORT" if is_short else "LONG"
    existing_circles["active"] = {
        **prev_active,
        "price": round(entry, dec),
        "bars_offset": 0 if is_active_now else 2,
        "status": "ACTIVE_NOW" if is_active_now else "UPCOMING",
        "status_label": "PASANG SEKARANG (AKTIF)" if is_active_now else "BARU MEMASUKI (DI DEPAN)",
        "badge_tag": f"🟢 Pasang {direction_str}" if is_active_now else f"🟡 Order {direction_str} Baru",
        "direction": direction_str,
    }

    updated = dict(tp_sl)
    updated.update({
        "direction": plan["direction"],
        "is_bearish": is_short,
        "maker_limit_entry": round(entry, dec),
        "aggressive_market_entry": round(live, dec),
        "recommended_entry_type": "STOP_ENTRY_CONFIRMATION" if plan["plan_type"] == "REVERSAL_CONFIRMATION" else "MAKER_LIMIT_0_FEE",
        "entry_zone": {
            "low": plan["zone"][0],
            "high": plan["zone"][1],
            "optimal": round(entry, dec),
            "label": plan["label"],
        },
        "signal_circles": existing_circles,
        "sl": round(sl, dec),
        "stop_loss": round(sl, dec),
        "tp": round(tp2, dec),
        "tp1": round(tp1, dec),
        "tp2": round(tp2, dec),
        "take_profit_1": {**(tp_sl.get("take_profit_1") or {}), "price": round(tp1, dec)},
        "take_profit_2": {**(tp_sl.get("take_profit_2") or {}), "price": round(tp2, dec)},
        "risk_reward": gross_rr,
        "gross_rr": gross_rr,
        "net_rr_after_mexc_fees": net_rr,
        "net_expected_value_pct": ev_net,
        "trade_validity": validity,
        "is_chasing_dangerous": bool(dist_atr >= 0.35),
        "entry_warning": plan["trigger"],
        "plan_type": plan["plan_type"],
        "forward_plan_applied": True,
        "liquidity_sweep_level": round(sl, dec),
        "major_structure_level": forecast["impulse"]["end_price"],
        "position_sizing": {
            **(tp_sl.get("position_sizing") or {}),
            "half_kelly_capital_fraction_pct": half_kelly_pct,
            "safe_max_leverage": f"{safe_lev}x",
            "safe_max_leverage_num": safe_lev,
        },
        "pivot_context": {
            **(tp_sl.get("pivot_context") or {}),
            "moment_status": status,
            "moment_label": moment_labels.get(status, status),
        },
    })
    return updated
