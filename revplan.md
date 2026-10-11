# Rencana Implementasi Final: Historical Similarity Engine

## Ringkasan Kebutuhan
- **Tanpa AI** — murni perhitungan Python
- **Data real yfinance** — `period="max"` (harian) + `period="730d"` (jam)
- **3 metode kemiripan**: Euclidean z-score, Pearson, DTW (Sakoe-Chiba band)
- **Multi-probe**: `[15, 30, 60]` bar, auto-select terbaik
- **Multi-timeframe**: harian + jam (pilihan di UI)
- **Pembobotan**: Harga 65%, Volume 15%, Indikator 20%
- **K=8** segmen mirip, min-separation 25 bar
- **Forward projection**: `[5, 10, 15]` bar
- **Integrasi**: panel detail + kolom di screener
- **Screener**: tetap data harian untuk kecepatan

---

## Algoritma Inti (`similarity_engine.py`)

### Flow
```
For each probe_len in [15, 30, 60]:
  probe_window = df[-probe_len:]
  history_pool = df[0 : -probe_len - separation]

  For each candidate window of size probe_len in history_pool (sliding step=1):
    ├─ price_sim = weighted_calc(probe, candidate, method)
    ├─ vol_sim   = weighted_calc(probe_vol, candidate_vol, method)
    ├─ ind_sim   = weighted_calc(probe_rsi, candidate_rsi, method)
    └─ combined_score = 0.65×price + 0.15×vol + 0.20×ind

  Rank candidates by combined_score per method (desc)
  Aggregate: mean_rank across 3 methods → top-8
  Forward: for each top-8, extract next [5,10,15] bars → prob_up, median, p25/p75

Pick best probe_len = highest mean score of top-8 consensus.
Return all 3 probe results + best winner.
```

### Metode per komponen

**Euclidean**: `dist = ||zscore(a) - zscore(b)||₂` → `score = 1 / (1 + dist)`

**Pearson**: `r = corrcoef(a, b)` → `score = (r + 1) / 2`

**DTW (Sakoe-Chiba band)**: Dynamic time warping dengan window constraint `r = int(len×0.1)` → `score = 1 / (1 + dist)`

### Fitur normalisasi per bar
- `price[t] = (close[t] / close[0] - 1) × 100`
- `vol[t] = volume[t] / SMA(volume, 20)[t]` (0-1, di-zscore per window)
- `rsi[t] = (RSI(t) - 50) / 50` (normalize ke -1..1)
- Indikator stack: `[rsi_norm, macd_hist_norm, atr_pct_norm]` — kolom fitur 3D

### Output struktur
```json
{
  "data_source": "live",
  "timeframe": "1d",
  "probes": [
    {
      "probe_len": 30,
      "probe_values": [...],
      "probe_dates": [...],
      "is_best": true,
      "methods": [
        {
          "method": "zscore_euclidean",
          "score_weights": {"price": 0.65, "volume": 0.15, "indicators": 0.20},
          "segments": [
            {
              "start_date": "...",
              "end_date": "...",
              "score": 0.92,
              "component_scores": {"price": 0.95, "volume": 0.88, "indicators": 0.91},
              "forward_returns": {"5d": 2.1, "10d": 3.4, "15d": 5.2}
            }
          ],
          "verdict": "BULLISH",
          "probability_up_15d": 0.625,
          "expected_return_15d": 3.8
        }
      ],
      "consensus": {
        "verdict": "BULLISH",
        "confidence": 0.71,
        "probability_up": 0.65,
        "expected_return_pct": 3.5,
        "method_agreement": 0.67
      },
      "forward_distribution": [
        {"step": 5, "median_pct": 1.2, "prob_up": 0.625, "p25": -0.5, "p75": 2.8},
        {"step": 10, "median_pct": 2.8, "prob_up": 0.625, "p25": -0.3, "p75": 5.1},
        {"step": 15, "median_pct": 3.5, "prob_up": 0.65, "p25": -0.1, "p75": 6.2}
      ]
    }
  ],
  "screener_summary": {
    "consensus_verdict": "BULLISH",
    "confidence": 0.71,
    "score_bonus": 12
  }
}
```

---

## Daftar File & Perubahan

### Backend (5 file)

| File | Status | Perubahan |
|------|--------|-----------|
| `app/services/similarity_engine.py` | **BARU** | Core engine: `compute_similarity()` + internal: `_extract_features()`, `_zscore_euclidean()`, `_pearson_similarity()`, `_dtw_sakoe_chiba()`, `_rank_aggregate()`, `_forward_projection()`, `_select_best_probe()` |
| `app/api/routers/similarity.py` | **BARU** | `GET /api/analysis/{symbol}/similarity?timeframe=1d&period=max` |
| `app/api/api_router.py` | Ubah | `include_router(similarity.router)` |
| `app/services/market_data.py` | Ubah | (1) `fetch_ohlcv()` default path → live-first + synthetic fallback + `data_source` flag; (2) tambah param `interval="1d"`; (3) fix count mapping: max/730d/365d |
| `app/api/routers/screener.py` | Ubah | (1) Paralelisasi fetch 16 aset via `ThreadPoolExecutor(max_workers=6)`; (2) Tambah field `historical_signal` (summary_only mode); (3) Kontribusi skor: `+12` bullish / `-12` bearish; (4) Fix RSI>70 asymmetry |

### Frontend (5 file)

| File | Status | Perubahan |
|------|--------|-----------|
| `src/services/api.js` | Ubah | Tambah `getSimilarity(symbol, timeframe, period)` → `GET /analysis/{symbol}/similarity` |
| `src/components/analysis/SimilarityPanel.jsx` | **BARU** | Panel: timeframe selector (1d/1h), probe window switcher [15,30,60], 3 kartu metode, consensus badge, SVG forward fan chart, matched segments overlay |
| `src/pages/AssetDetail.jsx` | Ubah | Mount `<SimilarityPanel symbol={symbol} />` sebagai full-width section |
| `src/components/screener/ScreenerTable.jsx` | Ubah | Kolom baru **"Hist. Signal"** — badge verdict + confidence + data source |
| `src/utils/formatters.js` | Ubah | Tambah `formatDateShort()` helper |

### Test (1 file)

| File | Status | Perubahan |
|------|--------|-----------|
| `backend/test_similarity.py` | **BARU** | Plain-script tests: probe_len valid, top-K count, scores 0-1, verdict in set, forward array length, consensus consistency, multi-probe selection |

---

## UI Panel: `SimilarityPanel.jsx`

```
┌─────────────────────────────────────────────────────────┐
│  Historical Similarity Engine    [1d ▼] [15] [30] [60] │  ← timeframe + probe selectors
├─────────────────────────────────────────────────────────┤
│  ● CONSENSUS: BULLISH (65% prob ↑, +3.5% exp, 71% conf)│  ← consensus badge
├──────────────┬──────────────┬───────────────────────────┤
│  EUCLIDEAN   │  PEARSON     │  DTW                      │  ← 3 method cards
│  BULLISH 62% │  BULLISH 67% │  BULLISH 65%             │
│  +3.8% exp   │  +3.2% exp   │  +3.5% exp               │
│  Top match:  │  Top match:  │  Top match:              │
│  2024-11→12  │  2023-06→07  │  2025-01→02              │
├──────────────┴──────────────┴───────────────────────────┤
│  Forward Projection Fan                                 │
│  ┌──────────────────────────────┐                       │
│  │     ╱──── P75 ──────╲       │                       │  ← SVG fan chart
│  │   ╱─── median ───────╲      │     P25/P75 bands     │
│  │  ╱──── P25 ──────────╲      │                       │
│  │ ──┬──────┬──────┬──────     │                       │
│  │   5d    10d    15d          │                       │
│  └──────────────────────────────┘                       │
├─────────────────────────────────────────────────────────┤
│  Matched Segments (8)                                   │
│  #1  2024-11-15 → 2024-12-14  score=0.92  ret=+5.2%  │  ← segment table
│  #2  2023-06-20 → 2023-07-19  score=0.89  ret=+4.8%  │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
```

---

## Rincian Eksekusi Per File

### 1. `backend/app/services/similarity_engine.py` (BARU)
- `compute_similarity(df, timeframe, probe_lengths, top_k, horizon_steps, data_source)` → full output JSON
- `_extract_features(df)` → `(price_norm, vol_features, ind_features)` arrays
- `_zscore_euclidean(a, b)` → float 0-1
- `_pearson_similarity(a, b)` → float 0-1
- `_dtw_distance(a, b, band_ratio=0.1)` → float (distance), ditransform ke score 0-1
- `_rank_aggregate(method_scores, top_k)` → list of index
- `_forward_projection(df, match_indices, horizon_steps)` → list of step statistics
- `_select_best_probe(probe_results)` → index probe terbaik

### 2. `backend/app/api/routers/similarity.py` (BARU)
- Import `fetch_ohlcv`, `compute_similarity`
- `@router.get("/{symbol}/similarity")` — params: `timeframe` (1d/1h), `period` (max/1y/2y)
- Validasi symbol di DEFAULT_ASSETS
- Panggil `fetch_ohlcv(symbol, period, interval)` → `compute_similarity()` → return

### 3. `backend/app/services/market_data.py` (Ubah)
- `fetch_ohlcv()`: ubah default path → coba yfinance dulu (try/except), fallback synthetic → set `df.attrs['data_source'] = 'live'|'synthetic'`
- Mapping period → count: tambah `'max': None, '730d': None, '365d': None` (None =不限行数 dari yfinance)
- Mapping interval: tambah `'1h': '1h'`

### 4. `backend/app/api/routers/screener.py` (Ubah)
- Tambah import `compute_similarity`
- Dalam loop: panggil `compute_similarity(df, timeframe='1d', probe_lengths=[30], top_k=5, summary_only=True)` → ambil `screener_summary`
- Tambahkan `historical_signal` + `score += score_bonus` ke result item
- Paralelisasi: bungkus loop body di `ThreadPoolExecutor` dengan input dict

### 5. `frontend/src/services/api.js` (Ubah)
```js
getSimilarity: async (symbol, timeframe = '1d', period = 'max') => {
  const res = await apiClient.get(`/analysis/${encodeURIComponent(symbol)}/similarity`, {
    params: { timeframe, period }
  });
  return res.data;
}
```

### 6. `frontend/src/components/analysis/SimilarityPanel.jsx` (BARU)
- Props: `symbol` (dari parent)
- Internal state: `timeframe` (1d|1h), `probeLen` (15|30|60), `data`, `loading`, `error`
- useEffect: fetch `api.getSimilarity(symbol, timeframe)` on mount + symbol change
- Sub-components inline:
  - ConsensusBadge: verdict + confidence + prob_up
  - MethodCard ×3: method name, verdict, score, top segment dates, component score breakdown
  - ForwardFanChart: pure SVG, x-axis steps [5,10,15], 3 lines (P25, median, P75), fill area
  - MatchedSegmentsTable: 8 rows with rank, date range, combined score, forward return, component scores

### 7. `frontend/src/pages/AssetDetail.jsx` (Ubah)
- Import `SimilarityPanel`
- Tambah di bawah grid utama: `<SimilarityPanel symbol={symbol} />` sebagai full-width section dengan heading "Historical Similarity Analysis"

### 8. `frontend/src/components/screener/ScreenerTable.jsx` (Ubah)
- Kolom baru **"Hist. Signal"** setelah kolom "Opportunity Score"
- Render: badge verdict (green=bullish, red=bearish, gray=neutral) + `confidence%` kecil
- Tooltip (title attr) menampilkan `data_source` (live/synthetic)

### 9. `backend/test_similarity.py` (BARU)
- Input: `fetch_ohlcv("BTC-USD", period="1y")` (cukup untuk test cepat)
- Asserts: `len(probe["probes"])==3`, `probe["probes"][best_idx]["is_best"]==True`, scores in `[0,1]`, verdict in `{BULLISH, BEARISH, NEUTRAL}`, `len(segments)==8`, `len(forward)==3`, each step has `median_pct, prob_up, p25, p75`

---

## Urutan Eksekusi

1. `similarity_engine.py` — implementasi murni, test via unit functions
2. `similarity.py` router + registrasi di `api_router.py`
3. `market_data.py` — live-first + interval param
4. `test_similarity.py` — verifikasi backend
5. `api.js` — frontend service layer
6. `SimilarityPanel.jsx` — panel utama
7. `AssetDetail.jsx` — mount panel
8. `ScreenerTable.jsx` — kolom historis
9. `screener.py` — paralelisasi + integrasi skor
10. **Verifikasi**: `python test_similarity.py`, cek `/api/analysis/BTC-USD/similarity`, cek `/`, `npm run lint`

---

## Catatan Tambahan
- **Tanpa dependency baru** — DTW, Pearson, Euclidean diimplementasi manual menggunakan numpy/scipy yang sudah ada
- **Batas data**: yfinance `period="max"` harian (11k+ bar) & `period="730d"` jam (17k+ bar) — terverifikasi berfungsi
- **Data fallback**: bila yfinance gagal (no internet), sistem jatuh ke data sintetis dengan flag `data_source: "synthetic"`
- **Screener**: hanya menghitung probe_len=30 untuk kecepatan (summary_only mode), full detail tersedia di panel analisis
