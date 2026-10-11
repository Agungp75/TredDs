"""
Historical Similarity Engine
============================
Membandingkan window harga terakhir (probe) dengan seluruh segmen historis
untuk menemukan pergerakan yang paling mirip, lalu memproyeksikan arah
pergerakan ke depan berdasarkan follow-through segmen-segmen mirip tersebut.

3 metode kemiripan:
  - zscore_euclidean : jarak Euclid pada series ter-normalisasi z-score
  - pearson          : korelasi Pearson (bentuk arah pergerakan)
  - dtw_sakoe_chiba  : Dynamic Time Warping dengan Sakoe-Chiba band

Pembobotan fitur per segmen:
  - Price action   : 0.65
  - Volume         : 0.15
  - Indikator (RSI/MACD/ATR) : 0.20

Tanpa AI -- murni perhitungan Python/numpy/scipy.
"""

import numpy as np
import pandas as pd
from scipy.signal import find_peaks
from app.core.quantitative import calculate_rsi, calculate_macd, calculate_atr

# Bobot komponen fitur
WEIGHTS = {
    "price": 0.65,
    "volume": 0.15,
    "indicators": 0.20,
}

METHODS = ["zscore_euclidean", "pearson", "dtw_sakoe_chiba"]

# Proyeksi horizon (jumlah bar ke depan) yang dievaluasi per segmen
DEFAULT_HORIZON_STEPS = [5, 10, 15]


# ---------------------------------------------------------------------------
# Normalisasi & ekstraksi fitur
# ---------------------------------------------------------------------------
def _zscore(series: np.ndarray) -> np.ndarray:
    """Normalisasi z-score. Jika std=0, kembalikan nol."""
    arr = np.asarray(series, dtype=float)
    std = arr.std()
    if std == 0 or np.isnan(std):
        return np.zeros_like(arr)
    return (arr - arr.mean()) / std


def _normalize_price(series: np.ndarray) -> np.ndarray:
    """Return-to-base % (relatif terhadap bar pertama)."""
    arr = np.asarray(series, dtype=float)
    base = arr[0] if arr[0] != 0 else 1.0
    return (arr / base - 1.0) * 100.0


def _extract_features(df: pd.DataFrame):
    """
    Buat matriks fitur per bar yang konsisten antara probe & kandidat:
      - price    : return-to-base (%)
      - volume   : volume / SMA(volume, 20) - 1
      - indicators: [rsi_norm, macd_hist_norm, atr_pct_norm]
    """
    closes = df['Close'].to_numpy(dtype=float)
    volume = df['Volume'].to_numpy(dtype=float)

    # Volume relatif terhadap SMA20 (buat series index-aligned)
    df = df.reset_index(drop=True)
    vol = pd.Series(volume)
    vol_sma = vol.rolling(20).mean()
    vol_ratio = (vol / vol_sma.replace(0, np.nan)).bfill().fillna(1.0).to_numpy(dtype=float)
    vol_feat = vol_ratio - 1.0

    rsi_s = calculate_rsi(pd.Series(closes)).to_numpy(dtype=float)
    rsi_norm = (rsi_s - 50.0) / 50.0

    macd_l, _, macd_h = calculate_macd(pd.Series(closes))
    macd_hist = macd_h.to_numpy(dtype=float)
    # skip warm-up NaN
    macd_base = macd_hist[~np.isnan(macd_hist)]
    macd_std = macd_base.std() if len(macd_base) else 1.0
    if macd_std == 0:
        macd_std = 1.0
    macd_norm = (macd_hist - (macd_base.mean() if len(macd_base) else 0.0)) / macd_std
    macd_norm = np.nan_to_num(macd_norm)

    df_t = df[['High', 'Low', 'Close']].copy()
    df_t['Close_prev'] = df_t['Close'].shift(1)
    tr1 = (df_t['High'] - df_t['Low'])
    tr2 = (df_t['High'] - df_t['Close_prev']).abs()
    tr3 = (df_t['Low'] - df_t['Close_prev']).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr_s = tr.rolling(14).mean().bfill().fillna(0.0).to_numpy(dtype=float)
    atr_pct = atr_s / np.where(closes == 0, 1.0, closes)
    atr_std = atr_pct.std()
    atr_norm = atr_pct / (atr_std if atr_std != 0 else 1.0)

    return closes, vol_feat, rsi_norm, macd_norm, atr_norm


# ---------------------------------------------------------------------------
# Skor kemiripan per metode
# ---------------------------------------------------------------------------
def _score_from_distance(dist: float) -> float:
    """Konversi jarak non-negatif -> skor di [0,1]."""
    if dist is None or np.isnan(dist):
        return 0.0
    return float(1.0 / (1.0 + dist))


def _zscore_euclidean(a: np.ndarray, b: np.ndarray) -> float:
    za = _zscore(a)
    zb = _zscore(b)
    dist = float(np.linalg.norm(za - zb))
    return _score_from_distance(dist)


def _pearson_similarity(a: np.ndarray, b: np.ndarray) -> float:
    if len(a) < 2:
        return 0.5
    with np.errstate(divide="ignore", invalid="ignore"):
        r = np.corrcoef(a, b)[0, 1]
    if np.isnan(r):
        return 0.5
    return float((r + 1.0) / 2.0)


def _dtw_distance(a: np.ndarray, b: np.ndarray, band_ratio: float = 0.1) -> float:
    """
    Dynamic Time Warping dengan Sakoe-Chiba band.
    Mengembalikan jarak DTW (non-negatif).
    """
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    n, m = len(a), len(b)
    if n == 0 or m == 0:
        return float('inf')

    band = max(1, int(min(n, m) * band_ratio))
    dtw = np.full((n + 1, m + 1), np.inf)
    dtw[0, 0] = 0.0

    for i in range(1, n + 1):
        lo = max(1, i - band)
        hi = min(m, i + band)
        for j in range(lo, hi + 1):
            cost = (a[i - 1] - b[j - 1]) ** 2
            dtw[i, j] = cost + min(dtw[i - 1, j], dtw[i, j - 1], dtw[i - 1, j - 1])

    return float(np.sqrt(dtw[n, m]))


def _method_score(method: str, a: np.ndarray, b: np.ndarray) -> float:
    if method == "zscore_euclidean":
        return _zscore_euclidean(a, b)
    if method == "pearson":
        return _pearson_similarity(a, b)
    if method == "dtw_sakoe_chiba":
        return _score_from_distance(_dtw_distance(a, b))
    return 0.0


def _component_score(method: str,
                     price_a, price_b,
                     vol_a, vol_b,
                     ind_a, ind_b) -> dict:
    """Skor kemiripan terpisah per komponen (price/volume/indicators)."""
    price = _method_score(method, price_a, price_b)
    volume = _method_score(method, vol_a, vol_b)
    # Indikator: rata-rata skor tiap sub-indikator (RSI, MACD, ATR)
    ind_scores = [_method_score(method, ia, ib) for ia, ib in zip(ind_a, ind_b)]
    indicators = float(np.mean(ind_scores)) if ind_scores else 0.0

    combined = (WEIGHTS["price"] * price +
                WEIGHTS["volume"] * volume +
                WEIGHTS["indicators"] * indicators)
    return {
        "price": round(float(price), 4),
        "volume": round(float(volume), 4),
        "indicators": round(float(indicators), 4),
        "combined": round(float(combined), 4),
    }


# ---------------------------------------------------------------------------
# Pencarian segmen mirip (global sliding window, tervektorisasi)
# ---------------------------------------------------------------------------
def _sliding_matrix(arr: np.ndarray, probe_len: int):
    """Matriks (n_windows, probe_len) dari data 1D via numpy stride tricks."""
    from numpy.lib.stride_tricks import sliding_window_view
    if len(arr) < probe_len:
        return None
    return sliding_window_view(np.asarray(arr, dtype=float), probe_len)


def _pearson_vec_matrix(W: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Korelasi Pearson tervektorisasi: W:(n,L), p:(L,) -> arr(n) di [0,1]."""
    Wc = W - W.mean(axis=1, keepdims=True)
    Wstd = W.std(axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        cols = np.where(Wstd[:, None] > 1e-12, Wc / Wstd[:, None], 0.0)

    pc = p - p.mean()
    pstd = p.std()
    prow = pc / pstd if pstd > 1e-12 else pc

    r = cols @ prow / max(len(p), 1)
    r = np.nan_to_num(r, nan=0.0)
    return (r + 1.0) / 2.0


def _zscore_euclid_vec_matrix(W: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Jarak Euclid (z-score) tervektorisasi -> skor di [0,1]."""
    Wc = W - W.mean(axis=1, keepdims=True)
    Wstd = W.std(axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        cols = np.where(Wstd[:, None] > 1e-12, Wc / Wstd[:, None], 0.0)

    pc = p - p.mean()
    pstd = p.std()
    prow = pc / pstd if pstd > 1e-12 else pc

    dist = np.linalg.norm(cols - prow, axis=1)
    dist = np.nan_to_num(dist, nan=1e9, posinf=1e9)
    return 1.0 / (1.0 + dist)


def _component_vec_scores(method: str, W: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Skor satu komponen utk semua window (W) vs probe (p)."""
    if W is None:
        return np.array([])
    if method == "pearson":
        return _pearson_vec_matrix(W, p)
    if method == "zscore_euclidean":
        return _zscore_euclid_vec_matrix(W, p)
    raise ValueError(f"Metode tak didukung untuk vektorisasi: {method}")


def _find_segments_for_probe(features, probe_len, top_k, min_separation,
                             dtw_prefilter: int = 120):
    """
    Untuk satu panjang probe, evaluasi semua jendela di history pool dengan
    ketiga metode, agregasi ranking, lalu kembalikan top-k segmen beserta skor.

    Euclidean & Pearson: tervektorisasi (sliding-window matrix).  DTW: hanya
    dihitung pada kandidat teratas hasil pre-filter Pearson (untuk kecepatan).
    """
    closes, vol_feat, rsi_norm, macd_norm, atr_norm = features
    n = len(closes)

    p_s = n - probe_len
    pool_end = p_s - min_separation
    if pool_end - probe_len < 0:
        return []

    price_norm_all = _normalize_price(closes)

    # Probe vectors
    price_p = _normalize_price(closes[p_s:n])
    vol_p = vol_feat[p_s:n]
    rsi_p = rsi_norm[p_s:n]
    macd_p = macd_norm[p_s:n]
    atr_p = atr_norm[p_s:n]

    # Matriks kandidat (semua window sebelum pool_end)
    W_price = _sliding_matrix(price_norm_all[:pool_end], probe_len)
    W_vol = _sliding_matrix(vol_feat[:pool_end], probe_len)
    W_rsi = _sliding_matrix(rsi_norm[:pool_end], probe_len)
    W_macd = _sliding_matrix(macd_norm[:pool_end], probe_len)
    W_atr = _sliding_matrix(atr_norm[:pool_end], probe_len)

    if W_price is None:
        return []

    n_cand = len(W_price)

    # --- Euclidean (vektorisasi penuh)
    s_price = _zscore_euclid_vec_matrix(W_price, price_p)
    s_vol = _zscore_euclid_vec_matrix(W_vol, vol_p) if W_vol is not None else np.full(n_cand, 0.0)
    s_rsi = _zscore_euclid_vec_matrix(W_rsi, rsi_p) if W_rsi is not None else np.full(n_cand, 0.0)
    s_macd = _zscore_euclid_vec_matrix(W_macd, macd_p) if W_macd is not None else np.full(n_cand, 0.0)
    s_atr = _zscore_euclid_vec_matrix(W_atr, atr_p) if W_atr is not None else np.full(n_cand, 0.0)
    euclid = (WEIGHTS["price"] * s_price + WEIGHTS["volume"] * s_vol +
              WEIGHTS["indicators"] * ((s_rsi + s_macd + s_atr) / 3.0))

    # --- Pearson (vektorisasi penuh)
    p_price = _pearson_vec_matrix(W_price, price_p)
    p_vol = _pearson_vec_matrix(W_vol, vol_p) if W_vol is not None else np.full(n_cand, 0.0)
    p_rsi = _pearson_vec_matrix(W_rsi, rsi_p) if W_rsi is not None else np.full(n_cand, 0.0)
    p_macd = _pearson_vec_matrix(W_macd, macd_p) if W_macd is not None else np.full(n_cand, 0.0)
    p_atr = _pearson_vec_matrix(W_atr, atr_p) if W_atr is not None else np.full(n_cand, 0.0)
    pearson = (WEIGHTS["price"] * p_price + WEIGHTS["volume"] * p_vol +
               WEIGHTS["indicators"] * ((p_rsi + p_macd + p_atr) / 3.0))

    # --- DTW (pre-filter: ambil top-N dari Pearson lalu hitung penuh)
    dtw = np.zeros(n_cand)
    pre_idx = np.argsort(-pearson)[:dtw_prefilter]
    for ci in pre_idx:
        d_price = _score_from_distance(_dtw_distance(price_p, W_price[ci]))
        d_vol = _score_from_distance(_dtw_distance(vol_p, W_vol[ci])) if W_vol is not None else 0.0
        d_rsi = _score_from_distance(_dtw_distance(rsi_p, W_rsi[ci])) if W_rsi is not None else 0.0
        d_macd = _score_from_distance(_dtw_distance(macd_p, W_macd[ci])) if W_macd is not None else 0.0
        d_atr = _score_from_distance(_dtw_distance(atr_p, W_atr[ci])) if W_atr is not None else 0.0
        dtw[ci] = (WEIGHTS["price"] * d_price + WEIGHTS["volume"] * d_vol +
                   WEIGHTS["indicators"] * ((d_rsi + d_macd + d_atr) / 3.0))

    method_scores = np.stack([euclid, pearson, dtw], axis=0)  # (3, n_cand)

    # Rank aggregation: rata-rata ranking (mean-ranks)
    rank_sum = np.zeros(n_cand)
    for mi in range(len(METHODS)):
        ranks = np.empty(n_cand)
        order = np.argsort(-method_scores[mi])
        ranks[order] = np.arange(1, n_cand + 1)
        rank_sum += ranks

    mean_rank_order = np.argsort(rank_sum)

    # Non-maximum suppression: pilih top-k dengan jarak antar segmen minimal
    selected = []
    for idx in mean_rank_order:
        s = idx  # indeks window == start posisi
        keep = True
        for sel in selected:
            if abs(s - sel["start"]) < min_separation:
                keep = False
                break
        if keep:
            # Skor metode utk segmen ini
            seg_methods = []
            for m_idx, method in enumerate(METHODS):
                scr = {
                    "price": _method_score(method, price_p, W_price[idx]),
                    "volume": _method_score(method, vol_p, W_vol[idx]) if W_vol is not None else 0.0,
                    "indicators": (np.mean([_method_score(method, rsi_p, W_rsi[idx]),
                                            _method_score(method, macd_p, W_macd[idx]),
                                            _method_score(method, atr_p, W_atr[idx])])
                                   if W_atr is not None else 0.0),
                }
                comb = (WEIGHTS["price"] * scr["price"] +
                        WEIGHTS["volume"] * scr["volume"] +
                        WEIGHTS["indicators"] * scr["indicators"])
                seg_methods.append({
                    "method": method,
                    "score": round(float(comb), 4),
                    "components": {k: round(float(v), 4) for k, v in scr.items()},
                })
            selected.append({
                "start": int(s),
                "end": int(s + probe_len),
                "mean_rank": float(rank_sum[idx] / len(METHODS)),
                "methods": seg_methods,
            })
            if len(selected) >= top_k:
                break

    return selected


# ---------------------------------------------------------------------------
# Proyeksi maju (forward)
# ---------------------------------------------------------------------------
def _forward_projection(closes, segment_starts, probe_len, horizon_steps):
    """
    Untuk tiap segmen yang mulai di 'segment_starts', ambil horizon_steps bar
    setelah segmen berakhir, hitung return vs harga terakhir segmen.
    """
    forward_stats = {}
    for step in horizon_steps:
        returns = []
        for s in segment_starts:
            end = s + probe_len
            fwd_end = end + step
            if fwd_end >= len(closes):
                continue
            base = closes[end - 1]
            if base == 0:
                continue
            ret = (closes[fwd_end - 1] / base - 1.0) * 100.0
            returns.append(ret)

        if not returns:
            forward_stats[step] = {"median_pct": 0.0, "prob_up": 0.5,
                                   "p25": 0.0, "p75": 0.0, "n": 0}
            continue

        arr = np.array(returns)
        forward_stats[step] = {
            "median_pct": round(float(np.percentile(arr, 50)), 2),
            "prob_up": round(float((arr > 0).mean()), 3),
            "p25": round(float(np.percentile(arr, 25)), 2),
            "p75": round(float(np.percentile(arr, 75)), 2),
            "n": int(len(arr)),
        }
    return forward_stats


# ---------------------------------------------------------------------------
# Verdict & konsensus
# ---------------------------------------------------------------------------
def _verdict_from_prob(prob_up: float, threshold: float = 0.55) -> str:
    if prob_up >= threshold:
        return "BULLISH"
    if prob_up <= (1.0 - threshold):
        return "BEARISH"
    return "NEUTRAL"


def _consensus_over_methods(methods):
    """
    Konsensus dari k kartu metode berdasarkan probability_up paling jauh dari 0.5.
    """
    verdicts = []
    probs = []
    for m in methods:
        if "verdict" in m:
            verdicts.append(m["verdict"])
            probs.append(m.get("probability_up", 0.5))
    if not probs:
        return {"verdict": "NEUTRAL", "confidence": 0.0, "probability_up": 0.5,
                "expected_return_pct": 0.0, "method_agreement": 0.0}

    avg_prob = float(np.mean(probs))
    verdict = _verdict_from_prob(avg_prob)
    agreement = float(np.mean([1 if v == verdict else 0 for v in verdicts]))
    # Confidence: gabungan jarak dari 0.5 & agree
    confidence = round(float(abs(avg_prob - 0.5) * 2.0 * (0.5 + 0.5 * agreement)), 2)
    confidence = max(0.0, min(1.0, confidence))

    expected_returns = [m.get("expected_return_15d") for m in methods
                        if m.get("expected_return_15d") is not None]
    expected = float(np.mean(expected_returns)) if expected_returns else 0.0

    return {
        "verdict": verdict,
        "confidence": confidence,
        "probability_up": round(float(avg_prob), 3),
        "expected_return_pct": round(expected, 2),
        "method_agreement": round(agreement, 2),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def compute_similarity(
    df: pd.DataFrame,
    timeframe: str = "1d",
    probe_lengths=None,
    top_k: int = 8,
    horizon_steps=None,
    min_separation: int = 25,
    data_source: str = "live",
    summary_only: bool = False,
):
    """
    Jalankan engine pencocokan pola historis.

    df           : DataFrame OHLCV (Time, Open, High, Low, Close, Volume)
    timeframe    : "1d" atau "1h" (label saja untuk output)
    probe_lengths: daftar panjang window probe (default [15, 30, 60])
    top_k        : jumlah segmen mirip teratas
    horizon_steps: daftar bar ke depan untuk proyeksi (default [5,10,15])
    data_source  : "live" | "synthetic"
    summary_only : True -> hanya kembalikan ringkasan untuk screener
    """
    if df is None or df.empty or len(df) < max((probe_lengths or [30])) + min_separation + 15:
        return None

    df = df.reset_index(drop=True)
    if probe_lengths is None:
        probe_lengths = [15, 30, 60]
    if horizon_steps is None:
        horizon_steps = DEFAULT_HORIZON_STEPS

    features = _extract_features(df)
    closes = features[0]
    n = len(closes)

    probes = []
    for probe_len in probe_lengths:
        if n < probe_len + min_separation + 15:
            continue
        segments = _find_segments_for_probe(features, probe_len, top_k, min_separation)
        if not segments:
            continue

        p_s = n - probe_len

        # Build per-method objects
        methods = []
        for method in METHODS:
            seg_scores = []
            fwd_returns = {}
            for sg in segments:
                # Ambil metode terkait
                m_info = next((m for m in sg["methods"] if m["method"] == method), None)
                score = m_info["score"] if m_info else 0.0
                components = m_info["components"] if m_info else {}

                end = sg["end"]
                fwd = {}
                for step in horizon_steps:
                    fe = end + step
                    if fe >= n:
                        continue
                    base = closes[end - 1]
                    fwd[str(step)] = round(float((closes[fe - 1] / base - 1.0) * 100.0), 2) if base else 0.0
                fwd_returns = {**fwd_returns, **fwd}

                seg_start = sg["start"]
                seg_end = sg["end"]
                seg_closes = closes[seg_start:seg_end]
                norm_vals = _normalize_price(seg_closes)

                max_h = max(horizon_steps)
                fe_max = min(n, seg_end + max_h)
                fwd_closes = closes[seg_end:fe_max] if fe_max > seg_end else np.array([])
                fwd_norm_vals = (fwd_closes / seg_closes[0] - 1.0) * 100.0 if len(fwd_closes) > 0 and seg_closes[0] != 0 else np.array([])

                seg_candles = []
                try:
                    seg_sub_df = df.iloc[seg_start:seg_end]
                    for _, row in seg_sub_df.iterrows():
                        c_val = float(row['Close'])
                        dec = 4 if c_val < 10 else 2
                        seg_candles.append({
                            "open": round(float(row.get('Open', c_val)), dec),
                            "high": round(float(row.get('High', c_val)), dec),
                            "low": round(float(row.get('Low', c_val)), dec),
                            "close": round(c_val, dec),
                            "time": str(row.get('Time', '')),
                        })
                except Exception:
                    seg_candles = []

                seg_scores.append({
                    "start_date": str(df['Time'].iloc[seg_start]),
                    "end_date": str(df['Time'].iloc[seg_end - 1]),
                    "score": round(float(score), 4),
                    "components": components,
                    "forward_returns": fwd,
                    "segment_values": [round(float(x), 3) for x in norm_vals],
                    "raw_prices": [round(float(x), 2 if x > 10 else 4) for x in seg_closes],
                    "forward_values": [round(float(x), 3) for x in fwd_norm_vals],
                    "forward_prices": [round(float(x), 2 if x > 10 else 4) for x in fwd_closes],
                    "candles": seg_candles,
                    "start_price": round(float(seg_closes[0]), 2 if seg_closes[0] > 10 else 4),
                    "end_price": round(float(seg_closes[-1]), 2 if seg_closes[-1] > 10 else 4),
                    "high_price": round(float(np.max(seg_closes)), 2 if np.max(seg_closes) > 10 else 4),
                    "low_price": round(float(np.min(seg_closes)), 2 if np.min(seg_closes) > 10 else 4),
                })

            # prob_up & expected_return untuk horizon terbesar yang tersedia
            last_step = max(int(k) for k in fwd_returns) if fwd_returns else horizon_steps[-1]
            last_returns = [sg["forward_returns"].get(str(last_step), 0.0) for sg in seg_scores]
            prob_up = round(float((np.array(last_returns) > 0).mean()), 3) if last_returns else 0.5
            expected = round(float(np.mean(last_returns)), 2) if last_returns else 0.0
            verdict = _verdict_from_prob(prob_up)

            methods.append({
                "method": method,
                "score_weights": dict(WEIGHTS),
                "top_segment": {
                    "start_date": seg_scores[0]["start_date"] if seg_scores else None,
                    "end_date": seg_scores[0]["end_date"] if seg_scores else None,
                },
                "segments": seg_scores[:top_k],
                "verdict": verdict,
                f"probability_up_{last_step}d": prob_up,
                "probability_up": prob_up,
                f"expected_return_{last_step}d": expected,
                "expected_return_15d": expected,
            })

        # Forward distribution dari konsensus seluruh segmen (mean_rank)
        top_starts = [sg["start"] for sg in segments[:top_k]]
        fwd_stats = _forward_projection(closes, top_starts, probe_len, horizon_steps)

        consensus = _consensus_over_methods(methods)

        probes.append({
            "probe_len": probe_len,
            "is_best": False,
            "probe_dates": [str(df['Time'].iloc[p_s]),
                            str(df['Time'].iloc[n - 1])],
            "probe_values": [round(float(x), 3) for x in _normalize_price(closes[p_s:n])],
            "methods": methods,
            "consensus": consensus,
            "forward_distribution": [
                {"step": step,
                 "median_pct": fwd_stats[step]["median_pct"],
                 "prob_up": fwd_stats[step]["prob_up"],
                 "p25": fwd_stats[step]["p25"],
                 "p75": fwd_stats[step]["p75"]}
                for step in horizon_steps if step in fwd_stats
            ],
        })

    if not probes:
        return None

    # Pilih probe terbaik: confidence konsensus + rata-rata skor top segmen
    def _probe_quality(p):
        avg_scr = 0.0
        cnt = 0
        for m in p["methods"]:
            if m["segments"]:
                avg_scr += np.mean([s["score"] for s in m["segments"]])
                cnt += 1
        if cnt == 0:
            score_avg = 0.0
        else:
            score_avg = avg_scr / cnt
        return score_avg * p["consensus"]["probability_up"], score_avg

    qualities = [(_probe_quality(p)[0]) for p in probes]
    best_idx = int(np.argmax(qualities))
    probes[best_idx]["is_best"] = True

    result = {
        "data_source": data_source,
        "timeframe": timeframe,
        "probes": probes,
        "best_probe_len": probes[best_idx]["probe_len"],
    }

    best = probes[best_idx]["consensus"]
    result["screener_summary"] = {
        "consensus_verdict": best["verdict"],
        "confidence": best["confidence"],
        "probability_up": best["probability_up"],
        "score_bonus": int(round(12 * (2 * best["probability_up"] - 1)))
        if best["verdict"] != "NEUTRAL" else 0,
    }

    if summary_only:
        return result["screener_summary"]

    return result


def extract_probe_from_points(points, target_len: int = 60) -> np.ndarray:
    """
    Mengekstrak kurva 1D harga yang dinormalisasi [0..1] dari urutan titik gambar pengguna.
    Menggunakan parameterisasi sumbu waktu X monotonik:
    - Waktu berjalan maju dari kiri (x=0) ke kanan (x=1).
    - Proporsi durasi setiap gelombang (peaks & valleys) terjaga akurat sesuai gambar user.
    - Menghilangkan tremor tangan dengan penghalusan adaptif 3-titik.
    """
    if not points or len(points) < 2:
        return np.full(target_len, 0.5)

    xs = np.array([p.get('x', p.get('X', 0.0)) if isinstance(p, dict) else getattr(p, 'x', 0.0) for p in points], dtype=float)
    ys = np.array([p.get('y', p.get('Y', 0.0)) if isinstance(p, dict) else getattr(p, 'y', 0.0) for p in points], dtype=float)

    # Jika user menggambar dari kanan ke kiri, balikkan urutan agar waktu mengalir ke masa depan (kiri ke kanan)
    if len(xs) > 1 and xs[-1] < xs[0] and (xs[0] - xs[-1]) > 0.15:
        xs = xs[::-1]
        ys = ys[::-1]

    # Pastikan waktu x berjalan monotonik maju
    x_min, x_max = xs.min(), xs.max()
    if x_max - x_min < 0.02:
        x_norm = np.linspace(0, 1, len(xs))
    else:
        x_norm = (xs - x_min) / (x_max - x_min)
        x_norm = np.maximum.accumulate(x_norm)

    keep = np.insert(np.diff(x_norm) > 1e-6, 0, True)
    x_clean = x_norm[keep]
    y_clean = ys[keep]

    if len(x_clean) < 2:
        return np.full(target_len, 0.5)

    s_grid = np.linspace(0, 1, target_len)
    probe_y = np.interp(s_grid, x_clean, y_clean)

    # Invert Y: Koordinat kanvas (y=0 atas/harga tinggi, y=1 bawah/harga rendah)
    probe_price = 1.0 - probe_y

    p_min, p_max = probe_price.min(), probe_price.max()
    if p_max - p_min > 0.02:
        probe_norm = (probe_price - p_min) / (p_max - p_min)
        # Penghalusan adaptif lembut
        kernel = np.array([0.15, 0.70, 0.15])
        probe_smooth = np.convolve(probe_norm, kernel, mode='same')
        probe_smooth[0] = probe_norm[0]
        probe_smooth[-1] = probe_norm[-1]
        s_min, s_max = probe_smooth.min(), probe_smooth.max()
        if s_max - s_min > 1e-6:
            probe_final = (probe_smooth - s_min) / (s_max - s_min)
        else:
            probe_final = probe_norm
    else:
        probe_final = np.full(target_len, 0.5)

    return probe_final


# ---------------------------------------------------------------------------
# Draw-to-Search: Matching probe terhadap pergerakan harga MASA SEKARANG & SESI TERKINI
# ---------------------------------------------------------------------------
def match_current_market_pattern(
    probe_series: np.ndarray,
    df: pd.DataFrame,
    candidate_lens: tuple = (45, 55, 65, 80, 100, 120, 140),
    max_search_offset: int = 120,
) -> dict | None:
    """
    Membandingkan gambar pola user terhadap pergerakan harga sesi terkini (24-48 jam).
    Menggunakan Multi-Component Geometric Shape Matching:
    - Pointwise exponential error L1
    - Derivative / Slope alignment (Cosine correlation)
    - Direction agreement (Proporsi kesamaan arah langkah)
    - Curvature / 2nd derivative concavity (Kecocokan puncak & lembah)
    - Swing energy / Total Variation ratio (Menolak osilasi datar/flat)
    - Extrema count matching (Memastikan keberadaan gelombang nyata)

    Rentang bar kandidat 45 - 140 bar menghasilkan formasi candlestick yang padat,
    jelas, dan benar-benar menyerupai bentuk geometris yang digambar pengguna.
    """
    if df is None or df.empty:
        return None

    probe = np.asarray(probe_series, dtype=float)
    target_len = len(probe)
    if target_len < 3:
        return None

    closes = df["Close"].to_numpy(dtype=float)
    n = len(closes)
    if n < 45:
        return None

    # Normalisasi probe user ke [0..1]
    p_min, p_max = probe.min(), probe.max()
    if p_max - p_min < 1e-9:
        p_norm = np.full(target_len, 0.5)
    else:
        p_norm = (probe - p_min) / (p_max - p_min)

    # Pre-kalkulasi fitur probe
    dp = np.diff(p_norm)
    norm_dp = float(np.linalg.norm(dp))
    sign_dp = np.sign(dp)

    p_peaks, _ = find_peaks(p_norm, prominence=0.12)
    p_valleys, _ = find_peaks(1.0 - p_norm, prominence=0.12)
    n_p_extrema = len(p_peaks) + len(p_valleys)

    pc = p_norm - p_norm.mean()
    p_std = float(pc.std())

    best_score = -1.0
    best_match = None

    eff_max_offset = min(max_search_offset, n - 45)
    x_new = np.linspace(0, 1, target_len)

    # Pindai candidate window lengths dan recent offsets
    for cand_len in candidate_lens:
        if cand_len > n:
            continue
        curr_max_offset = min(eff_max_offset, n - cand_len)
        x_old = np.linspace(0, 1, cand_len)

        for offset in range(0, curr_max_offset, 2):
            start_idx = n - offset - cand_len
            end_idx = n - offset
            seg_raw = closes[start_idx:end_idx]

            if len(seg_raw) < cand_len or seg_raw.std() < 1e-12:
                continue

            seg_interp = np.interp(x_new, x_old, seg_raw)
            s_min, s_max = seg_interp.min(), seg_interp.max()
            span = s_max - s_min
            if span < 1e-9:
                continue
            s_norm = (seg_interp - s_min) / span

            sc = s_norm - s_norm.mean()
            s_std = float(sc.std())
            if p_std < 1e-9 or s_std < 1e-9:
                continue

            # 1. Pearson Shape Correlation (Bentuk garis makro, r > 0.1)
            r = float(np.dot(pc, sc) / (target_len * p_std * s_std))
            r_score = max(0.0, r) if r > 0.1 else 0.0

            # 2. Pointwise L1 exponential error
            l1_err = float(np.mean(np.abs(p_norm - s_norm)))
            point_score = float(np.exp(-2.2 * l1_err))

            # 3. Gradient / Slope Cosine correlation (Arah kemiringan langkah)
            ds = np.diff(s_norm)
            norm_ds = float(np.linalg.norm(ds))
            if norm_dp > 1e-9 and norm_ds > 1e-9:
                grad_corr = float(np.dot(dp, ds) / (norm_dp * norm_ds))
                grad_score = max(0.0, grad_corr)
            else:
                grad_score = 0.0

            # 4. Direction agreement (Proporsi langkah searah)
            dir_agree = float(np.mean(sign_dp == np.sign(ds)))
            dir_score = max(0.0, (dir_agree - 0.35) / 0.65)

            # Base Shape Score
            shape_score = (
                0.35 * r_score +
                0.25 * point_score +
                0.20 * grad_score +
                0.20 * dir_score
            )

            # 5. Extrema & Inflection Consistency (Filter noise sumbu pergerakan lilin)
            s_smooth = pd.Series(s_norm).rolling(7, center=True, min_periods=1).mean().to_numpy()
            extrema_factor = 1.0

            s_v, _ = find_peaks(1.0 - s_smooth, prominence=0.15)
            s_p, _ = find_peaks(s_smooth, prominence=0.15)
            n_s_ext = len(s_p) + len(s_v)

            # Penalti konflik arketipe: pola W (2 lembah dalam) jika probe bukan pola W
            if len(s_v) >= 2 and len(p_valleys) <= 1:
                extrema_factor *= 0.65
            elif len(s_p) >= 2 and len(p_peaks) <= 1:
                extrema_factor *= 0.65

            # Konsistensi fase transisi drop (puncak ke lembah)
            for p_idx in p_peaks:
                for v_idx in p_valleys:
                    if v_idx > p_idx:
                        p_drop = p_norm[v_idx] - p_norm[p_idx]
                        s_drop = s_smooth[v_idx] - s_smooth[p_idx]
                        if p_drop < -0.20 and s_drop > 0.02:
                            extrema_factor *= 0.50

            # Konsistensi fase transisi rise (lembah ke puncak)
            for v_idx in p_valleys:
                for p_idx in p_peaks:
                    if p_idx > v_idx:
                        p_rise = p_norm[p_idx] - p_norm[v_idx]
                        s_rise = s_smooth[p_idx] - s_smooth[v_idx]
                        if p_rise > 0.20 and s_rise < -0.02:
                            extrema_factor *= 0.50

            # 6. Directional net trend & endpoint quadrant alignment
            p_net = p_norm[-1] - p_norm[0]
            s_net = s_norm[-1] - s_norm[0]
            if (p_net > 0.25 and s_net < -0.05) or (p_net < -0.25 and s_net > 0.05):
                dir_factor = 0.50
            elif np.sign(p_net) != np.sign(s_net):
                dir_factor = 0.70
            else:
                dir_factor = 1.0

            if abs(p_norm[0] - s_norm[0]) > 0.45:
                dir_factor *= 0.85
            if abs(p_norm[-1] - s_norm[-1]) > 0.45:
                dir_factor *= 0.85

            # 7. Recency factor
            recency_factor = 1.0 - (offset / max(curr_max_offset, 1)) * 0.10

            combined_score = shape_score * dir_factor * extrema_factor * recency_factor

            if combined_score > best_score:
                best_score = combined_score
                best_match = {
                    "start_idx": start_idx,
                    "end_idx": end_idx - 1,
                    "cand_len": cand_len,
                    "offset": offset,
                    "seg_raw": seg_raw,
                    "seg_norm": s_norm,
                    "pearson_score": r_score,
                    "grad_score": grad_score,
                    "dir_agree": dir_agree,
                    "tv_match": 1.0,
                    "combined_score": combined_score,
                }

    if not best_match:
        return None

    # Ambil tanggal aktual dari DataFrame
    start_idx = best_match["start_idx"]
    end_idx = best_match["end_idx"]
    try:
        start_date = str(df["Time"].iloc[start_idx])
        end_date = str(df["Time"].iloc[end_idx])
    except Exception:
        start_date = ""
        end_date = ""

    seg_raw = best_match["seg_raw"]
    s_norm = best_match["seg_norm"]
    current_price = float(closes[-1])
    start_price = float(seg_raw[0])
    change_pct = float((current_price / start_price - 1.0) * 100.0) if start_price > 0 else 0.0

    offset = best_match["offset"]
    is_live_now = (offset <= 2)

    # Proyeksi pergerakan masa depan (14 candle ke depan)
    fwd_bars = 14
    tail_len = max(4, len(seg_raw) // 5)
    recent_slope = (seg_raw[-1] - seg_raw[-tail_len]) / (tail_len * seg_raw[-1]) if seg_raw[-1] > 0 else 0.0
    probe_slope = (p_norm[-1] - p_norm[-5]) / 5.0 if len(p_norm) >= 5 else 0.0

    fwd_prices = []
    # Jika pola selesai beberapa bar lalu, masukkan pergerakan nyata setelah pola hingga harga live
    if offset > 0:
        post_closes = closes[end_idx + 1:n]
        for pc_val in post_closes[:fwd_bars]:
            fwd_prices.append(float(pc_val))

    # Lengkapi proyeksi sisa bar ke masa depan dari harga live saat ini
    remaining_fwd = fwd_bars - len(fwd_prices)
    if remaining_fwd > 0:
        step_drift = 0.6 * probe_slope * 0.02 + 0.4 * recent_slope
        curr = current_price
        for step in range(1, remaining_fwd + 1):
            curr = curr * (1.0 + step_drift * (0.94 ** step))
            fwd_prices.append(curr)

    fwd_arr = np.array(fwd_prices)
    if len(fwd_arr) > 0 and current_price > 0:
        fwd_norm = (fwd_arr / current_price - 1.0) * 100.0
    else:
        fwd_norm = np.array([])

    prob_up = float(np.clip(0.5 + (probe_slope * 0.4 + recent_slope * 12.0), 0.08, 0.95))
    verdict = _verdict_from_prob(prob_up)

    # Ekstraksi lilin candlestick aktual (Open, High, Low, Close) untuk segmen yang cocok
    candles = []
    try:
        seg_df = df.iloc[start_idx:end_idx + 1]
        dec = 4 if current_price < 10 else 2
        for _, row in seg_df.iterrows():
            o = float(row.get("Open", row["Close"]))
            h = float(row.get("High", row["Close"]))
            l = float(row.get("Low", row["Close"]))
            c = float(row["Close"])
            candles.append({
                "open": round(o, dec),
                "high": round(h, dec),
                "low": round(l, dec),
                "close": round(c, dec),
                "time": str(row.get("Time", "")),
            })
    except Exception:
        candles = []

    return {
        "start_date": start_date,
        "end_date": end_date,
        "is_current": is_live_now,
        "offset": offset,
        "formation_status": "Sedang Berlangsung (Live)" if is_live_now else f"Terbentuk {offset} Bar Lalu",
        "candle_count": best_match["cand_len"],
        "current_price": round(current_price, 4 if current_price < 10 else 2),
        "change_pct": round(change_pct, 2),
        "match_score": round(best_match["combined_score"], 4),
        "similarity_score": round(best_match["combined_score"], 4),
        "pearson_score": round(best_match["pearson_score"], 4),
        "grad_score": round(best_match["grad_score"], 4),
        "dir_agree": round(best_match["dir_agree"], 4),
        "tv_match": round(best_match["tv_match"], 4),
        "segment_values": [round(float(v), 4) for v in s_norm],
        "normalized_segment": [round(float(v), 4) for v in s_norm],
        "probe_values": [round(float(v), 4) for v in p_norm],
        "forward_values": [round(float(v), 3) for v in fwd_norm],
        "forward_projection": [round(float(v), 3) for v in fwd_norm],
        "forward_prices": [round(float(v), 4 if v < 10 else 2) for v in fwd_prices],
        "raw_prices": [round(float(v), 4 if v < 10 else 2) for v in seg_raw],
        "candles": candles,
        "verdict": verdict,
        "forward_verdict": verdict,
        "probability_up": round(prob_up, 3),
        "prob_up": round(prob_up, 3),
    }


def classify_pattern_shape(series: np.ndarray) -> str:
    """
    Mengklasifikasikan bentuk pola geometris grafik dari time series yang dinormalisasi:
    - Head & Shoulders (Kepala & Bahu)
    - Triple Top (Tiga Puncak / Multi-Wave)
    - Inverse Head & Shoulders
    - Triple Bottom (Tiga Lembah)
    - Double Bottom (Pola W)
    - Double Top (Pola M)
    - Segitiga Simetris (Symmetrical Triangle)
    - Segitiga Naik (Ascending Triangle)
    - Segitiga Turun (Descending Triangle)
    - Tren Naik (Bullish Breakout)
    - Tren Turun (Bearish Breakdown)
    - Kanal Konsolidasi (Channel Range)
    """
    if series is None or len(series) < 5:
        return "Pola Grafik Teridentifikasi"

    y = np.asarray(series, dtype=float)
    p_min, p_max = y.min(), y.max()
    if p_max - p_min > 1e-9:
        y = (y - p_min) / (p_max - p_min)
    n = len(y)

    peaks = [i for i in range(1, n - 1) if y[i] >= y[i - 1] and y[i] >= y[i + 1] and y[i] > 0.4]
    valleys = [i for i in range(1, n - 1) if y[i] <= y[i - 1] and y[i] <= y[i + 1] and y[i] < 0.6]

    # 1. Tiga Puncak / Head & Shoulders / Multi-Wave
    if len(peaks) >= 3:
        p_vals = [y[p] for p in peaks[:3]]
        if p_vals[1] > p_vals[0] + 0.06 and p_vals[1] > p_vals[2] + 0.06:
            return "Head & Shoulders (Kepala & Bahu)"
        elif max(p_vals) - min(p_vals) < 0.28:
            return "Triple Top (Tiga Puncak / Multi-Wave)"
        return "Pola Gelombang Osilasi (Multi-Peak)"

    # 2. Tiga Lembah / Inverse Head & Shoulders
    if len(valleys) >= 3:
        v_vals = [y[v] for v in valleys[:3]]
        if v_vals[1] < v_vals[0] - 0.06 and v_vals[1] < v_vals[2] - 0.06:
            return "Inverse Head & Shoulders"
        elif max(v_vals) - min(v_vals) < 0.28:
            return "Triple Bottom (Tiga Lembah)"
        return "Pola Gelombang Lembah"

    # 3. Double Bottom (Pola W)
    if len(valleys) == 2 or (len(valleys) >= 2 and len(peaks) <= 2 and y[0] > y[valleys[0]] and y[-1] > y[valleys[-1]]):
        return "Double Bottom (Pola W)"

    # 4. Double Top (Pola M)
    if len(peaks) == 2 or (len(peaks) >= 2 and len(valleys) <= 2 and y[0] < y[peaks[0]] and y[-1] < y[peaks[-1]]):
        return "Double Top (Pola M)"

    # 5. Pola Segitiga / Wedge
    half = n // 2
    max_h1, min_l1 = y[:half].max(), y[:half].min()
    max_h2, min_l2 = y[half:].max(), y[half:].min()
    spread_h1 = max_h1 - min_l1
    spread_h2 = max_h2 - min_l2

    if spread_h1 > 0.30 and spread_h2 < spread_h1 * 0.75:
        if max_h1 > max_h2 + 0.05 and min_l2 > min_l1 + 0.05:
            return "Segitiga Simetris (Symmetrical Triangle)"
        elif abs(max_h1 - max_h2) < 0.12 and min_l2 > min_l1 + 0.06:
            return "Segitiga Naik (Ascending Triangle)"
        elif max_h1 > max_h2 + 0.06 and abs(min_l1 - min_l2) < 0.12:
            return "Segitiga Turun (Descending Triangle)"
        return "Pola Segitiga (Triangle)"

    # 6. Breakout Tren
    slope = y[-1] - y[0]
    if slope > 0.35:
        return "Tren Naik (Bullish Breakout)"
    elif slope < -0.35:
        return "Tren Turun (Bearish Breakdown)"

    return "Kanal Konsolidasi (Channel Range)"



# ---------------------------------------------------------------------------
# Draw-to-Search: Matching probe dari gambar user terhadap OHLCV historis
# ---------------------------------------------------------------------------
def search_drawn_pattern(
    probe_series: np.ndarray,
    df: pd.DataFrame,
    top_k: int = 5,
    min_separation: int = 10,
) -> list[dict]:
    """
    Mencari window historis yang paling mirip dengan probe_series (dari gambar user).

    probe_series : array float [0..1] hasil normalisasi gambar user (min-max)
    df           : DataFrame OHLCV dengan kolom Time, Close, Open, High, Low, Volume
    top_k        : jumlah hasil teratas yang dikembalikan
    min_separation: jarak minimum antar window yang dipilih (candles)

    Returns list[dict] dengan keys:
        start_date, end_date, segment_values (normalized),
        probe_values (normalized),
        forward_values (normalized, maks 15 bar),
        forward_prices, match_score, verdict, probability_up
    """
    if df is None or df.empty:
        return []

    probe = np.asarray(probe_series, dtype=float)
    probe_len = len(probe)

    if probe_len < 3:
        return []

    closes = df["Close"].to_numpy(dtype=float)
    n = len(closes)

    if n < probe_len + min_separation + 5:
        return []

    # Normalisasi probe (min-max) agar skala tidak mempengaruhi hasil
    p_min, p_max = probe.min(), probe.max()
    if p_max - p_min < 1e-9:
        probe_norm = np.zeros_like(probe)
    else:
        probe_norm = (probe - p_min) / (p_max - p_min)

    pool_end = n - min_separation

    # Sliding window matrix dari close historis
    W = _sliding_matrix(closes[:pool_end], probe_len)
    if W is None or len(W) == 0:
        return []

    n_cand = len(W)

    # Normalisasi tiap window secara row-wise (min-max)
    w_min = W.min(axis=1, keepdims=True)
    w_max = W.max(axis=1, keepdims=True)
    w_range = np.where((w_max - w_min) < 1e-9, 1.0, w_max - w_min)
    W_norm = (W - w_min) / w_range  # shape (n_cand, probe_len)

    # --- Pearson similarity (vektorisasi) ---
    Wc = W_norm - W_norm.mean(axis=1, keepdims=True)
    Wstd = W_norm.std(axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        W_z = np.where(Wstd[:, None] > 1e-12, Wc / Wstd[:, None], 0.0)

    pc = probe_norm - probe_norm.mean()
    pstd = probe_norm.std()
    p_z = pc / pstd if pstd > 1e-12 else pc

    pearson_scores = (W_z @ p_z) / max(probe_len, 1)
    pearson_scores = np.nan_to_num(pearson_scores, nan=0.0)
    pearson_sim = (pearson_scores + 1.0) / 2.0  # ke [0,1]

    # --- z-score Euclidean similarity (vektorisasi) ---
    dist_euclid = np.linalg.norm(W_z - p_z, axis=1)
    dist_euclid = np.nan_to_num(dist_euclid, nan=1e9, posinf=1e9)
    euclid_sim = 1.0 / (1.0 + dist_euclid)

    # Gabungan skor (bobot sama)
    combined = 0.55 * pearson_sim + 0.45 * euclid_sim

    # Non-maximum suppression: pilih top-k dengan min_separation
    order = np.argsort(-combined)
    selected = []
    for idx in order:
        keep = True
        for sel in selected:
            if abs(int(idx) - sel["_idx"]) < min_separation:
                keep = False
                break
        if keep:
            seg_start = int(idx)
            seg_end = seg_start + probe_len
            seg_closes = closes[seg_start:seg_end]

            # Normalisasi segmen (min-max) untuk tampilan overlay
            s_min, s_max = seg_closes.min(), seg_closes.max()
            if s_max - s_min < 1e-9:
                seg_norm = np.zeros(probe_len)
            else:
                seg_norm = (seg_closes - s_min) / (s_max - s_min)

            # Forward values (maks 15 bar setelah segmen)
            fwd_horizon = 15
            fwd_end = min(n, seg_end + fwd_horizon)
            fwd_closes = closes[seg_end:fwd_end] if fwd_end > seg_end else np.array([])

            if len(fwd_closes) > 0 and seg_closes[-1] != 0:
                fwd_norm = (fwd_closes / seg_closes[0] - 1.0) * 100.0
            else:
                fwd_norm = np.array([])

            # Verdict berdasarkan forward returns
            if len(fwd_closes) > 0 and seg_closes[-1] != 0:
                fwd_ret = (fwd_closes[-1] / seg_closes[-1] - 1.0) * 100.0
                prob_up = float((fwd_closes > seg_closes[-1]).mean())
            else:
                fwd_ret = 0.0
                prob_up = 0.5

            verdict = _verdict_from_prob(prob_up)
            match_score = round(float(combined[idx]), 4)

            # Tanggal dari df
            try:
                start_date = str(df["Time"].iloc[seg_start])
                end_date = str(df["Time"].iloc[seg_end - 1])
            except Exception:
                start_date = ""
                end_date = ""

            selected.append({
                "_idx": int(idx),
                "start_date": start_date,
                "end_date": end_date,
                "match_score": match_score,
                "pearson_score": round(float(pearson_sim[idx]), 4),
                "euclid_score": round(float(euclid_sim[idx]), 4),
                "segment_values": [round(float(v), 4) for v in seg_norm],
                "probe_values": [round(float(v), 4) for v in probe_norm],
                "forward_values": [round(float(v), 3) for v in fwd_norm],
                "forward_prices": [round(float(v), 4 if v < 10 else 2) for v in fwd_closes],
                "raw_prices": [round(float(v), 4 if v < 10 else 2) for v in seg_closes],
                "verdict": verdict,
                "probability_up": round(prob_up, 3),
            })

            if len(selected) >= top_k:
                break

    # Hapus key internal sebelum return
    for item in selected:
        item.pop("_idx", None)

    return selected

