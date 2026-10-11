# System Architecture & Technical Plan: Multi-Asset Trading Analysis Platform

Dokumen ini berisi rancangan arsitektur sistem, skema data, alur algoritma berbasis **Python Engine (Backend)** dan **React Frontend**, serta rencana implementasi teknis untuk pengembangan platform analitik perdagangan terpadu (**Saham**, **Kripto**, dan **Forex**).

---

## 1. Ikhtisar Sistem (System Overview)

Platform ini dirancang sebagai **Trading Analysis Assistant** berbasis web yang independen dari eksekusi order (non-execution). Sistem mengombinasikan **React** untuk antarmuka pengguna (UI/UX) yang interaktif & responsif dengan **Python (FastAPI)** sebagai *core engine* utama untuk pemrosesan matematika, perhitungan kuantitatif, analisis data *time-series*, *chart pattern recognition*, serta pengolahan AI.

```
+-----------------------------------------------------------------------+
|                       FRONTEND (SPA / REACT)                          |
|   (React.js + Vite + TailwindCSS + TradingView Lightweight Charts)    |
+-----------------------------------------------------------------------+
                                   ^
                                   | REST API / WebSockets (JSON)
                                   v
+-----------------------------------------------------------------------+
|                         PYTHON BACKEND ENGINE                         |
|             (Python FastAPI + Celery / Redis + Asyncio)               |
+-----------------------------------------------------------------------+
   |                  |                    |                  |
   v                  v                    v                  v
[ Data Fetcher ]  [ Python Quantitative ]  [ Dev & On-Chain ]  [ Macro & AI ]
- YFinance/CCXT   - TA-Lib / SciPy         - PyGithub API     - FRED / Pandas
- DexScreener     - NumPy / Pandas         - Web3.py          - LangChain/OpenAI
- Alpha Vantage   - Scikit-learn (Shapes)  - Solscan API      - News NLP (TextBlob)
```

---

## 2. Struktur Frontend (React Architecture & Component Tree)

Frontend dibangun menggunakan **React (Vite)** untuk memastikan waktu muat (*load time*) ultra-cepat dan rendering komponen yang efisien.

### 2.1. Arsitektur Folder Frontend (React App)
```text
src/
├── assets/             # Logo, icon, & static assets
├── components/         # Reusable UI Components
│   ├── common/         # Navbar, Sidebar, Modal, Badge, Tooltip
│   ├── charts/         # TradingView Lightweight Charts Wrapper
│   ├── screener/       # Opportunity Finder & Filters Table
│   ├── analysis/       # Technical, On-Chain, & Macro Detail Widgets
│   └── macro/          # Fed Rates & Economic Calendar Widgets
├── context/            # React Context (AuthContext, MarketDataContext, ThemeContext)
├── hooks/              # Custom React Hooks (useWebSocket, useMarketData, usePatternDetector)
├── pages/              # Main Route Views
│   ├── StockDashboard.jsx
│   ├── CryptoDashboard.jsx
│   ├── ForexDashboard.jsx
│   └── AssetDetail.jsx
├── services/           # Axios REST API & WebSocket Connectors
├── utils/              # Math helpers, formatters (Currency, Date)
├── App.jsx             # React Router Setup
└── main.jsx            # Entry point
```

### 2.2. Ekosistem Frontend (React Ecosystem & Libraries)
* **Build Tool:** Vite (performa *HMR - Hot Module Replacement* instan).
* **State Management:** React Context API + TanStack Query (React Query) untuk menangani *caching* & *auto-refetching* data API.
* **Charting Engine:** `lightweight-charts` (by TradingView) untuk render canvas grafik harga real-time berkinerja tinggi.
* **Styling:** TailwindCSS + Lucide React Icons.
* **Real-time Engine:** WebSocket Client (`socket.io-client` atau *native WebSocket* API) untuk *streaming* harga dan sinyal dari backend Python.

---

## 3. Pilihan Menu & Ekosistem Data (Python Engine)

Setiap instrumen pasar ditangani oleh modul Python *async* backend untuk menyedot data dan dikonsumsi oleh komponen React Frontend:

### A. Saham (Stocks)
* **Python Engine:** `yfinance`, `alpha_vantage`, `FinancialModelingPrep API`.
* **Tampilan React:** Ringkasan Indeks (IHSG, S&P 500), tabel screener saham *breakout*, widget rasio keuangan fundamental.

### B. Kripto (Crypto)
* **Python Engine:** `ccxt`, `httpx` (DexScreener API), `PyGithub`, `web3.py`.
* **Tampilan React:** Chart harga token, indicator *Whale Concentration*, *Developer Commit Graph*, dan status *Liquidity Lock*.

### C. Forex (Foreign Exchange)
* **Python Engine:** `oandapy20`, `twelvedata`.
* **Tampilan React:** Grid pasangan *Major/Minor Pairs*, Matriks Korelasi Mata Uang, dan Kalender Dampak Berita Ekonomi (*High Impact Alerts*).

---

## 4. Spesifikasi Perhitungan Backend Python & Visualisasi React

### 4.1. Market Screener Engine (Python Calculation -> React Table)
1. **Extraction Pivot Points (`SciPy.signal`):**
   Backend Python memproses data OHLCV menggunakan `scipy.signal.find_peaks` untuk mendeteksi *Swing High* dan *Swing Low*.
2. **Breakout & Volume Anomaly Filter (`Pandas`):**
   $$	ext{Volume Anomaly} = Volume_t > 1.5 	imes 	ext{SMA}(Volume, 20)$$
3. **Penyajian Data di React:**
   Komponen React (`<ScreenerTable />`) menampilkan daftar aset berpotensi dengan skor $0 - 100$, indikator visual sinyal (*Bullish/Bearish*), dan rekomendasi *entry level*.

---

### 4.2. Single Asset Deep Analysis (Modul Python 3-Layer)

```
+------------------------------------------------------------------------+
|                      PYTHON DEEP ANALYSIS ENGINE                       |
+------------------------------------------------------------------------+
   |                                |                               |
   v                                v                               v
[ Layer 1: Technical Pattern ]   [ Layer 2: Dev & On-Chain ]      [ Layer 3: Macro & AI Engine ]
- TA-Lib Indicator Engine        - PyGithub API Analytics         - FRED API Data Processing
- SciPy / NumPy Geometry Fit     - Dev Activity Score Calculator  - Pandas Correlation Matrix
- Dynamic TP/SL Engine (ATR)     - On-Chain Holder Concentration  - LangChain / LLM Summarizer
```

#### Layer 1: Analisis Teknikal Grafik & Matematika Presisi
* **Candlestick Pattern Recognition:** Backend menjalankan `TA-Lib` (`TA_CDLENGULFING`, `TA_CDLHAMMER`, dll.).
* **Regresi Linear Trendline (`NumPy.polyfit`):** Python menghitung koordinat garis tren *Support* dan *Resistance*, kemudian mengirimkan array koordinat tersebut via API untuk digambar otomatis di atas chart React oleh TradingView Lightweight Charts.
* **Auto TP/SL Logic (Calculated by Python, Rendered by React):**
  Menggunakan nilai **ATR (Average True Range)**:
  $$	ext{Target Price (TP)} = 	ext{Breakout Price} + 	ext{Height of Pattern}$$
  $$	ext{Stop Loss (SL)} = 	ext{Swing Low} - (1.5 	imes 	ext{ATR}_{14})$$

#### Layer 2: Developer Activity & On-Chain Analytics
* **GitHub Metric (`PyGithub`):**
  Python mengalkulasi skor keaktifan proyek:
  $$	ext{Dev Score} = w_1 \cdot 	ext{Commits}_{30d} + w_2 \cdot 	ext{ActiveContributors} + w_3 \cdot 	ext{MergedPRs}$$
* **Visualisasi React:** `<DevActivityChart />` menampilkan grafik tren *commit* bulanan menggunakan Recharts / Chart.js di React.

#### Layer 3: Fundamental Makro & AI Summarizer
* **Macro Engine (`FRED API` + `Pandas`):**
  Menyajikan statistik suku bunga The Fed, Inflasi (CPI), dan Tenaga Kerja.
* **AI Summary Component:** Component React `<AISummaryCard />` menerima teks ringkasan otomatis dari LangChain/OpenAI yang memadukan data teknik, dev, dan makro menjadi rekomendasi naratif.

---

## 5. Algoritma Deteksi Pola Grafik (Contoh Python Code Engine)

```python
import numpy as np
import pandas as pd
from scipy.signal import find_peaks

def detect_chart_patterns(df_ohlc):
    # 1. Deteksi Pivot High & Low
    highs, _ = find_peaks(df_ohlc['High'], distance=5)
    lows, _ = find_peaks(-df_ohlc['Low'], distance=5)
    
    # 2. Fit Tren Regresi Linear untuk Support/Resistance
    upper_slope, upper_intercept = np.polyfit(highs, df_ohlc['High'].iloc[highs], 1)
    lower_slope, lower_intercept = np.polyfit(lows, df_ohlc['Low'].iloc[lows], 1)
    
    # 3. Klasifikasi Geometri Pola
    pattern = "UNKNOWN"
    if upper_slope < -0.01 and lower_slope > 0.01:
        pattern = "Symmetrical Triangle"
    elif abs(upper_slope) < 0.005 and lower_slope > 0.01:
        pattern = "Ascending Triangle (Bullish)"
    elif upper_slope < -0.01 and abs(lower_slope) < 0.005:
        pattern = "Descending Triangle (Bearish)"
    elif abs(upper_slope - lower_slope) < 0.002:
        pattern = "Channel / Flag Pattern"
        
    return {
        "pattern": pattern,
        "upper_line": {"slope": upper_slope, "intercept": upper_intercept},
        "lower_line": {"slope": lower_slope, "intercept": lower_intercept}
    }
```

---

## 6. Full Tech Stack Summary

| Layer | Teknologi / Library | Fungsi & Peran |
|---|---|---|
| **Frontend Framework** | **React.js (Vite)** | UI Dashboard Single Page Application (SPA). |
| **Styling & UI** | TailwindCSS + Lucide Icons | Styling komponen UI modern, cepat, dan responsif. |
| **Chart Visualization** | TradingView Lightweight Charts | Rendering chart canvas interaktif & garis analisis. |
| **State & Data Fetching** | TanStack Query (React Query) + Axios | Pengelolaan state server, caching API, & re-fetching. |
| **Backend API Framework** | **Python FastAPI** | Server REST API & WebSocket berperforma tinggi berbasis `asyncio`. |
| **Quantitative & TA Libraries** | **TA-Lib, NumPy, Pandas, SciPy** | Engine kalkulasi indikator, regresi statistik, & pola grafik. |
| **Data Ingestion** | CCXT, YFinance, PyGithub, Web3.py | Library Python penarik data saham, kripto, DEX, & GitHub. |
| **Queue & Worker** | Celery + Redis | Pemrosesan background job pemindaian *screener* harian/real-time. |
| **Database** | PostgreSQL + TimescaleDB | Penyimpanan data historis harga & hasil analisis. |
| **AI Processing** | LangChain / OpenAI Python SDK | Generasi narasi ringkasan analisis untuk dipasang di React UI. |

---

## 7. Tahapan Pengembangan (Roadmap & Implementation Schedule)

### Fase 1: Setup React Project & Backend Python Core (Minggu 1 - 4)
* [ ] Setup struktur React Vite + TailwindCSS + React Router.
* [ ] Setup FastAPI backend (Python) & database PostgreSQL/TimescaleDB.
* [ ] Integrasi library Python `TA-Lib`, `NumPy`, `SciPy` untuk kalkulasi indikator dasar.
* [ ] Pembuatan komponen React `<TradingViewChart />` dasar.

### Fase 2: Implementasi Screener & Multi-Asset Views di React (Minggu 5 - 8)
* [ ] Pembangunan halaman React: **Saham**, **Kripto**, dan **Forex**.
* [ ] Pembuatan background worker (Celery) di Python untuk *Market Screener*.
* [ ] Integrasi React Query untuk memuat data tabel *Opportunity Screener* secara real-time.
* [ ] Kalkulasi dinamis Target Price (TP) & Stop Loss (SL) di Python & visualisasi garisnya di React Chart.

### Fase 3: Layer Analytics Developer, On-Chain, & AI Widget (Minggu 9 - 12)
* [ ] Pembuatan komponen React `<DeveloperMetrics />` (Integrasi `PyGithub`).
* [ ] Integrasi widget Kalender Ekonomi & Makro (FRED API).
* [ ] Integrasi AI Summarizer (OpenAI API) dan pembuatan UI card rangkuman analisis di React.

### Fase 4: Testing, Optimization & Deployment (Minggu 13 - 16)
* [ ] Optimalisasi performa React (Code splitting, memoization) dan Python async query caching via Redis.
* [ ] Testing koneksi WebSocket real-time antara React & FastAPI.
* [ ] Testing responsivitas UI di Mobile & Desktop.
* [ ] Final Deployment (Frontend ke Vercel/Netlify, Backend ke Server VPS/Cloud).

---

## 8. Catatan Risk & Mitigation

1. **Re-rendering Berlebihan pada React Charting:**
   * *Mitigasi:* Isolasi komponen Chart menggunakan `React.memo` dan batasi update state React hanya saat ada *tick* harga atau data baru dari WebSocket.
2. **Kinerja Python pada Perhitungan Real-Time:**
   * *Mitigasi:* Manfaatkan operasi ter-vektorisasi (*vectorized operations*) NumPy/Pandas dan cache data harga di Redis.
3. **Financial Disclaimer:**
   * Wajib menampilkan banner *Financial Disclaimer* di bagian footer React bahwa platform ini adalah **alat bantu analisis** dan bukan ajakan/saran investasi (*Not Financial Advice - NFA*).
