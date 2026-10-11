# ATRED - Multi-Asset Quantitative Trading Analysis Platform

Platform analitik perdagangan multi-aset terpadu (**Saham**, **Kripto**, **Forex**) yang dibangun sesuai spesifikasi arsitektur teknis [plan.md](file:///d:/Atred/plan.md).

Sistem ini menggabungkan **Frontend React (Vite + TailwindCSS + TradingView Lightweight Charts)** dengan **Core Engine Backend Python (FastAPI + SciPy/NumPy/Pandas Quantitative Engine + WebSocket)**.

---

## Fitur Utama

1. **Market Screener Kuantitatif (Cross-Market Opportunity Finder)**:
   - Ekstraksi pivot high/low menggunakan `scipy.signal.find_peaks`.
   - Deteksi anomali volume: $\text{Volume}_t > 1.5 \times \text{SMA}(\text{Volume}, 20)$.
   - Perhitungan otomatis *Opportunity Score* ($0 - 100$).
   - Rekomendasi dinamis Entry, Target Price (TP), dan Stop Loss (SL) berbasis ATR.

2. **3-Layer Single Asset Deep Analysis**:
   - **Layer 1 (Technical & Geometry Pattern)**: Deteksi pola geometris (*Triangles, Flag/Channel, Double Bottom/Top*) via regresi linier `numpy.polyfit` yang digambar langsung di atas chart TradingView. Dilengkapi indikator RSI, ATR, MACD, Bollinger Bands, dan formasi candlestick (*Hammer, Shooting Star, Engulfing*).
   - **Layer 2 (Developer & On-Chain Analytics)**: Algoritma kalkulasi *Dev Score* aktivitas repositori GitHub ($\text{Commits} + \text{Contributors} + \text{PRs}$) dengan grafik tren bulanan, status *Liquidity Lock*, dan konsentrasi *Whale*.
   - **Layer 3 (Macro & AI Synthesis)**: Narasi rekomendasi eksekutif AI (OpenAI API / Heuristic Engine) yang mengintegrasikan konteks teknikal, dev, dan suku bunga The Fed / inflasi makro.

3. **Draw Pattern Search (Fitur Eksklusif Kripto - Real-Time Masa Sekarang)**:
   - **Kanvas Gambar Interaktif**: Pengguna dapat menggambar bentuk grafik apa saja secara bebas.
   - **Auto-Timeframe Cepat (15m / 1h / 4h dalam 24 Jam)**: Sistem secara otomatis memilih timeframe tercepat yang paling presisi tanpa perlu dipilih manual.
   - **Klasifikasi Pola Geometris**: Deteksi otomatis pola *Segitiga Simetris / Naik / Turun*, *Pola W (Double Bottom)*, *Pola M*, *Bullish Breakout*, dll.
   - **Pemindaian Koin Masa Sekarang (Live)**: Memindai 10 koin kripto likuiditas teratas dan mengurutkannya berdasarkan kemiripan harga live hari ini.
   - **Integrasi Analisis Sekali Klik**: Tombol langsung membuka halaman analisis pada timeframe dan formasi pola yang identik.

4. **Dashboard Khusus Instrumen**:
   - **Saham (Stocks)**: Ringkasan Indeks (IHSG, S&P 500, NASDAQ, Dow Jones), tabel fundamental (P/E, PBV, ROE, Market Cap, Dividend Yield), dan screener saham breakout.
   - **Kripto (Crypto)**: Grid token utama, metrik *Whale Concentration*, audit keamanan on-chain, grafik aktivitas developer, dan kanvas pencarian pola.
   - **Forex (Foreign Exchange)**: Grid pasangan mata uang dengan spread pips real-time, **Currency Correlation Matrix Heatmap**, dan **Kalender Berita Ekonomi High Impact**.

5. **Panduan UI/UX & Kepatuhan Finansial**:
   - Dilengkapi dokumen spesifikasi lengkap untuk tim desainer di [UI_UX_SPECIFICATION.md](file:///d:/Atred/UI_UX_SPECIFICATION.md).
   - Banner *Financial Disclaimer* (Not Financial Advice - NFA) sesuai regulasi pasar modal.

---

## Struktur Direktori

```
d:/Atred/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routers/
│   │   │   │   ├── stocks.py         # Endpoints saham, indeks, fundamental
│   │   │   │   ├── crypto.py         # Endpoints kripto, whale, dev score
│   │   │   │   ├── forex.py          # Endpoints forex, korelasi, kalender
│   │   │   │   ├── screener.py       # Screener engine & scoring 0-100
│   │   │   │   ├── analysis.py       # 3-Layer Deep Analysis
│   │   │   │   └── ws.py             # WebSocket streaming real-time
│   │   │   └── api_router.py
│   │   ├── core/
│   │   │   ├── config.py             # Setting & konfigurasi env
│   │   │   └── quantitative.py      # SciPy pivots, polyfit trendline, ATR TP/SL
│   │   ├── services/
│   │   │   ├── market_data.py        # Feed data OHLCV & cache
│   │   │   ├── pattern_engine.py     # Deteksi pola geometris & candlestick
│   │   │   ├── dev_analytics.py      # GitHub developer metrics & score
│   │   │   └── ai_summarizer.py      # AI narasi rekomendasi 3-layer
│   │   └── main.py                   # FastAPI application
│   ├── requirements.txt
│   ├── run_backend.py                # Runner backend
│   ├── test_core.py                  # Unit test kuantitatif
│   └── test_api.py                   # Integration test REST API
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/               # Navbar, DisclaimerFooter
│   │   │   ├── charts/               # TradingViewChart, DrawPatternCanvas, PatternSearchResults
│   │   │   ├── screener/             # ScreenerTable
│   │   │   ├── analysis/             # IndicatorsPanel, DevActivityChart, AISummaryCard
│   │   │   └── macro/                # EconomicCalendar, CurrencyCorrelation
│   │   ├── context/
│   │   │   └── MarketContext.jsx     # WebSocket & tick state
│   │   ├── pages/
│   │   │   ├── HomeDashboard.jsx     # Unified Market Screener
│   │   │   ├── StockDashboard.jsx    # Dashboard Saham
│   │   │   ├── CryptoDashboard.jsx   # Dashboard Kripto (dengan Draw Pattern Search)
│   │   │   ├── ForexDashboard.jsx    # Dashboard Forex
│   │   │   └── AssetDetail.jsx       # 3-Layer Deep Analysis View
│   │   ├── services/                 # Axios & WebSocket client
│   │   ├── utils/                    # Formatters
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── start_platform.bat                # 1-Klik runner backend + frontend
├── plan.md                           # Dokumen spesifikasi teknis acuan
└── UI_UX_SPECIFICATION.md            # Panduan & spesifikasi desain untuk tim UI/UX
```

---

## Cara Menjalankan

### Cara Cepat (Windows Batch Script):
Klik dua kali pada file:
```bash
start_platform.bat
```

### Cara Manual:

#### 1. Jalankan Backend (Python FastAPI):
```bash
cd backend
python run_backend.py
```
Backend akan aktif di: `http://localhost:8000` (Dokumentasi API interaktif di `http://localhost:8000/docs`).

#### 2. Jalankan Frontend (React Vite):
```bash
cd frontend
npm run dev
```
Frontend akan aktif di: `http://localhost:5173`.
