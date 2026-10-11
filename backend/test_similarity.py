"""
Unit test untuk Historical Similarity Engine.
Jalankan: python test_similarity.py
(Cukup memakai data 1y agar cepat, tanpa perlu app/test framework.)
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from app.services.market_data import fetch_ohlcv
from app.services.similarity_engine import compute_similarity, _zscore_euclidean, _pearson_similarity, _dtw_distance


def test_quantitative():
    # 1. Skor zscore euclidden dalam [0,1]
    import numpy as np
    a = np.array([0.0, 1.0, 2.0, 1.0, 0.0])
    b = np.array([-0.1, 1.1, 2.1, 1.0, -0.2])
    assert 0 <= _zscore_euclidean(a, b) <= 1, "zscore_euclidean di luar [0,1]"

    # 2. Pearson dalam [0,1]
    r = _pearson_similarity(a, a)
    assert 0 <= r <= 1 and r > 0.99, "Pearson identik harus ~1"

    # 3. DTW jarak non-negatif
    d = _dtw_distance(a, b)
    assert d >= 0, "DTW distance negatif"
    assert abs(_dtw_distance(a, a)) < 1e-6, "DTW identik harus 0"
    print("[OK] Metode kemiripan dasar (euclidean/pearson/dtw)")


def test_similarity_pipeline():
    df = fetch_ohlcv("BTC-USD", period="1y", interval="1d", force_live=True)
    assert df is not None and len(df) > 60, "Data 1y tidak mencukupi"

    result = compute_similarity(df, timeframe="1d", data_source="live")
    assert result is not None, "compute_similarity mengembalikan None"

    # Multi-probe
    assert "probes" in result, "Tidak ada probes"
    assert "best_probe_len" in result, "Tidak ada best_probe_len"

    best = None
    for probe in result["probes"]:
        assert "probe_len" in probe
        assert "methods" in probe and len(probe["methods"]) == 3, "Harus ada 3 metode"
        for m in probe["methods"]:
            assert m["verdict"] in ("BULLISH", "BEARISH", "NEUTRAL"), "Verdict invalid"
            assert len(m["segments"]) <= 8, "Terlalu banyak segmen"
            for seg in m["segments"]:
                assert 0 <= seg["score"] <= 1, f"Score segmen di luar [0,1]: {seg['score']}"
                assert "start_date" in seg and "end_date" in seg
        assert "consensus" in probe
        assert len(probe["forward_distribution"]) >= 1, "Forward distribution kosong"
        if probe.get("is_best"):
            best = probe

    assert best is not None, "Tidak ada probe terbaik terpilih"
    print(f"[OK] Pipeline kemiripan: {len(result['probes'])} probe, "
          f"best={best['probe_len']} bar, "
          f"consensus={best['consensus']['verdict']} "
          f"(conf={best['consensus']['confidence']})")

    # Summary screener
    summ = compute_similarity(df, probe_lengths=[30], top_k=5, summary_only=True)
    assert summ is not None
    assert "consensus_verdict" in summ and "confidence" in summ and "score_bonus" in summ
    print(f"[OK] Summary screener: {summ['consensus_verdict']} bonus={summ['score_bonus']}")


def test_forward_distribution_shape():
    df = fetch_ohlcv("AAPL", period="1y", interval="1d", force_live=True)
    result = compute_similarity(df, timeframe="1d", probe_lengths=[30], top_k=8, data_source="live")
    assert result is not None
    probe = result["probes"][0]
    for fd in probe["forward_distribution"]:
        for key in ("step", "median_pct", "prob_up", "p25", "p75"):
            assert key in fd, f"Missing key {key} di forward distribution"
        assert 0 <= fd["prob_up"] <= 1, "prob_up di luar [0,1]"
    print("[OK] Forward distribution shape valid (5/10/15 bar)")


if __name__ == "__main__":
    for fn in (test_quantitative, test_similarity_pipeline, test_forward_distribution_shape):
        fn()
    print("\nSemua test lulus.")
