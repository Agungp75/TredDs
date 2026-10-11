# PLAN PERBAIKAN ATRED
> Tujuan: ATRED menjadi alat bantu keputusan manual (entry dilakukan sendiri di device/broker lain) yang datanya jujur, sinyalnya teruji, dan risikonya terkontrol.
> Prinsip: **validasi dulu, fitur baru belakangan.** Tidak ada sistem yang menjamin profit.

---

## Ringkasan Prioritas

| Fase | Fokus | Perkiraan | Hasil Akhir |
|---|---|---|---|
| 0 | Kejujuran data | 2-3 hari | Tidak ada angka karangan yang tampil seperti data asli |
| 1 | Backtest | 1-2 minggu | Tahu apakah sinyal punya edge atau tidak |
| 2 | Perbaikan kebocoran data | 3-5 hari | Hasil analisa live = hasil backtest |
| 3 | Penyederhanaan strategi | 1 minggu | Satu strategi jelas dengan aturan angka pasti |
| 4 | Perbaikan Similarity Engine | 3-5 hari | Klaim statistik yang bisa dipertanggungjawabkan |
| 5 | Alat bantu keputusan manual | 1 minggu | Journal, checklist pra-entry, peringatan risiko |
| 6 | Forward test | 2-3 bulan | Bukti nyata di akun demo / modal kecil |
| 7 | Fitur lanjutan (opsional) | - | GARCH, HMM, LightGBM, Redis, dsb. |

---

## FASE 0 - Kejujuran Data (Wajib Pertama)

**Masalah:** data sintetis dan simulasi tampil seperti data pasar asli.

Tugas:
- [ ] `market_data.py`: tandai setiap respons dengan field `data_source` (`live` / `delayed` / `cache` / `synthetic`) dan `last_updated` (timestamp).
- [ ] Jika `data_source == synthetic`: **blokir sinyal, screener, dan TP/SL**; tampilkan banner merah "DATA SIMULASI - JANGAN DIPAKAI UNTUK ENTRY".
- [ ] `ws.py`: hapus micro-tick buatan (+/-0.03%). Ganti dengan feed asli (mis. WebSocket Binance untuk kripto), atau tampilkan harga terakhir apa adanya beserta timestamp.
- [ ] `dev_analytics.py` dan metrik on-chain (whale, staking lock): jika tidak ada sumber API nyata, hapus atau beri label "ESTIMASI / DUMMY" dan keluarkan dari perhitungan skor.
- [ ] Frontend: badge status di setiap panel (LIVE / TERTUNDA ~15 MENIT / CACHE / SIMULASI) dan umur data ("diperbarui 12 detik lalu").
- [ ] Catat keterbatasan sumber data di UI/README:
  - Saham IDX via Yahoo tertunda ~15 menit.
  - `GC=F` adalah futures, bukan spot XAUUSD (ada gap rollover).
  - Volume forex tidak bermakna: nonaktifkan "anomali volume" untuk forex.
  - Intraday 5m/15m Yahoo hanya ~60 hari: batasi similarity engine di timeframe kecil.
- [ ] Kurangi risiko rate-limit: turunkan `max_workers`, tambah jeda/retry dengan backoff, perpanjang cache.

**Kriteria selesai:** tidak ada satu pun angka di layar yang tidak jelas asal-usulnya.

---

## FASE 1 - Mesin Backtest

**Masalah:** semua bobot dan "confidence" adalah tebakan; belum pernah diuji.

Tugas:
- [ ] Buat modul `backend/backtest/` (pandas/NumPy murni atau VectorBT).
- [ ] Simpan data historis ke file (Parquet/CSV) agar backtest bisa diulang dan tidak bergantung API live.
- [ ] Simulasi eksekusi realistis:
  - Entry di open candle **berikutnya** setelah sinyal (bukan close candle sinyal).
  - Spread, fee, slippage, dan funding rate (kripto) dimasukkan.
  - Jika SL dan TP tersentuh di candle yang sama, asumsikan SL kena lebih dulu (konservatif).
- [ ] Metrik wajib: jumlah trade, win rate, profit factor, expectancy per trade (dalam R), max drawdown, Sharpe/Sortino, rata-rata RR realisasi, rangkaian kalah beruntun terpanjang.
- [ ] Metode validasi:
  - Pisahkan data **in-sample** dan **out-of-sample** (mis. 70/30).
  - **Walk-forward**: optimasi di jendela lama, uji di jendela berikutnya, geser, ulangi.
  - Minimal beberapa ratus trade agar hasil tidak kebetulan.
  - Uji di beberapa aset dan beberapa periode (tren, sideways, krisis).
- [ ] Uji `determine_comprehensive_signal` apa adanya sebagai **baseline**, lalu bandingkan dengan strategi sederhana (Fase 3).
- [ ] Bandingkan juga dengan benchmark: buy & hold dan sinyal acak.

**Kriteria selesai:** ada laporan angka untuk tiap aset/timeframe. Jika expectancy setelah biaya <= 0, sinyal tersebut tidak dipakai.

---

## FASE 2 - Perbaikan Kebocoran Data Masa Depan (Look-Ahead)

Tugas:
- [ ] `find_peaks`: pivot hanya dianggap valid setelah `d` bar konfirmasi di kanan; pada saat sinyal, jangan gunakan pivot yang belum terkonfirmasi. Tandai pivot terakhir sebagai "belum terkonfirmasi".
- [ ] Hitung ulang sinyal secara **bar-by-bar** (hanya data sampai bar t) dan pastikan hasilnya sama dengan hasil tampilan live (tes anti-repainting).
- [ ] Similarity engine: mean/std untuk z-score MACD dan ATR harus dihitung hanya dari data **sebelum** window, bukan seluruh histori.
- [ ] Fibonacci dan trendline: pastikan titik anchor tidak memakai bar setelah waktu sinyal.
- [ ] Tambah unit test: sinyal pada bar t tidak berubah jika data setelah t dihapus.

**Kriteria selesai:** tes anti-repainting lulus untuk semua modul sinyal.

---

## FASE 3 - Penyederhanaan Strategi

**Masalah:** indikator momentum saling tumpang tindih (EMA, MACD, RSI, Stochastic) sehingga satu informasi terhitung berkali-kali.

Tugas:
- [ ] Pangkas ke satu indikator per fungsi:
  - Tren: harga vs EMA 200 (timeframe besar) + EMA 50
  - Volatilitas: ATR 14
  - Timing: satu saja (RSI pendek atau MACD)
  - Struktur: swing high/low, high/low hari/minggu sebelumnya
  - Volume (saham/kripto): volume relatif
- [ ] Tulis **satu strategi dengan aturan angka pasti**, contoh kandidat:
  - Tren: filter arah dengan EMA 200 di 4H/1D.
  - Entry: pullback ke EMA 50 / support dengan RSI pendek konfirmasi.
  - SL: 1.5-2x ATR dari entry atau di bawah swing terakhir (pilih salah satu, uji keduanya).
  - TP: minimal 2R atau level struktur berikutnya.
  - Filter: tolak sinyal jika RR < 1.5, jika ada berita berdampak tinggi dalam beberapa jam ke depan, atau jika spread terlalu lebar.
- [ ] Ganti ambang pola tetap (mis. 1.5% untuk double top) dengan ambang berbasis ATR.
- [ ] Hapus "confidence" karangan (88%, 90%, `50 + |score|/2`). Ganti dengan statistik hasil backtest: "setup ini secara historis: win rate X%, expectancy Y R, n = Z trade".
- [ ] Fibonacci dan pola chart klasik: jadikan opsional / informasi visual saja, bukan penentu skor, kecuali terbukti menambah edge di backtest.
- [ ] Screener: perbaiki skoring
  - Pisahkan "arah" dan "kualitas setup".
  - RSI < 30 tidak otomatis +15; hanya bila sejalan dengan tren timeframe besar.
  - Naikkan timeframe minimum scalping (rekomendasi >= 1 jam; 5m-15m sangat sensitif terhadap spread/fee).
- [ ] Tambah filter rezim pasar sederhana (tren vs sideways, mis. via ADX atau lebar Bollinger) dan konfirmasi multi-timeframe.

**Kriteria selesai:** strategi sederhana mengalahkan baseline Fase 1 di out-of-sample, atau dibuang dan diganti kandidat lain.

---

## FASE 4 - Similarity Engine yang Valid Secara Statistik

Tugas:
- [ ] Perbesar sampel: K = 30-50 segmen (bukan 8), dengan jarak NMS tetap agar tidak tumpang tindih.
- [ ] Hitung **base rate** aset (persentase naik/turun tanpa sinyal) dan bandingkan.
- [ ] Tambah uji signifikansi (binomial atau bootstrap) dan tampilkan **interval kepercayaan**. Verdict BULLISH/BEARISH hanya muncul jika signifikan.
- [ ] Naikkan ambang verdict; jangan memakai 55%/45% dari 8 sampel.
- [ ] Panjang probe 15 bar sangat noise; pertimbangkan minimum 30 bar atau tampilkan peringatan.
- [ ] Backtest engine ini: apakah verdict historisnya benar-benar memprediksi return berikutnya (out-of-sample)?
- [ ] Jika tidak terbukti, turunkan statusnya menjadi "alat eksplorasi visual" dan keluarkan dari skor screener (-12/+12).

**Kriteria selesai:** setiap angka probabilitas di UI disertai n, interval kepercayaan, dan perbandingan dengan base rate.

---

## FASE 5 - Alat Bantu Keputusan Manual

Karena entry dilakukan sendiri di device lain:

- [ ] **Level sebagai zona**, bukan angka tunggal (entry zone, SL zone) untuk mengakomodasi selisih harga dengan broker.
- [ ] **Checklist pra-entry** dalam satu panel:
  - Data LIVE dan umur data
  - RR >= minimum
  - Spread/fee estimasi vs jarak SL
  - Berita berdampak tinggi dalam N jam
  - Arah timeframe lebih besar sejalan
  - Risiko per trade <= batas (mis. 1% modal)
- [ ] **Kalkulator posisi** diperluas:
  - Forex: pip value dan lot size
  - Kripto: leverage, margin, likuidasi
  - Saham IDX: lot (100 lembar) dan fee beli/jual
  - Peringatan merah jika risiko per trade > batas
- [ ] **Trade journal**: catat tiap entry (aset, waktu, sinyal sistem saat itu, entry/SL/TP, hasil, alasan, kondisi emosi). Sediakan rekap mingguan: win rate, expectancy, kesalahan paling sering.
- [ ] **Batas disiplin**: peringatan setelah N kerugian beruntun atau batas rugi harian tercapai.
- [ ] Ganti teks "confidence" di UI dengan data statistik dari Fase 1.
- [ ] Pertahankan `DisclaimerFooter` (bukan saran finansial).

---

## FASE 6 - Forward Test

- [ ] Jalankan strategi hasil Fase 3 di **akun demo** atau modal sangat kecil selama 2-3 bulan (minimal 50-100 trade bila memungkinkan).
- [ ] Bandingkan hasilnya dengan hasil backtest. Selisih besar = ada masalah (biaya, leakage, atau overfitting).
- [ ] Syarat naik ke modal lebih besar: hasil forward test konsisten dengan backtest, drawdown masih dalam batas yang bisa diterima, dan aturan dijalankan disiplin.
- [ ] Risiko per trade tetap kecil (sekitar 1% modal atau kurang).

---

## FASE 7 - Fitur Lanjutan (Hanya Jika Fase 0-6 Lulus)

Dicoret dari roadmap karena entry manual:
- Konektor eksekusi order (CCXT, MT5), enkripsi API key bursa.

Opsional, prioritas rendah untuk penggunaan pribadi:
- GARCH / HMM untuk deteksi rezim dan volatilitas
- LightGBM dengan validasi walk-forward ketat dan kalibrasi probabilitas
- Redis, Celery, TimescaleDB (hanya bila skala membutuhkan)
- Data tambahan: funding rate, open interest, likuidasi (kripto); DXY, yield, sesi pasar (forex/emas); net foreign flow (IDX)

---

## Keamanan & Kebersihan Teknis (Berjalan Paralel)

- [ ] API key AI: kirim lewat HTTPS, jangan di-log, jangan disimpan di repo.
- [ ] Data makro (Fed rate, CPI, dll.): sertakan tanggal dan sumber; jika statis/usang, tampilkan peringatan sebelum dikirim ke LLM.
- [ ] Ubah klaim "zero hallucination" menjadi lebih akurat: hanya berlaku untuk heuristic engine, bukan jalur LLM.
- [ ] Tambah test untuk setiap perubahan di atas (`test_core.py`, `test_api.py`, `test_similarity.py`, plus test backtest dan anti-repainting).

---

## Aturan Kerja

1. Satu fase selesai dan teruji sebelum lanjut ke fase berikutnya.
2. Setiap perubahan bobot/parameter harus dibuktikan di backtest out-of-sample, bukan dari intuisi.
3. Jika sebuah indikator tidak menambah hasil di backtest, hapus.
4. Hasil backtest yang terlalu bagus patut dicurigai (periksa leakage dan biaya).
5. Keputusan akhir entry tetap di tangan Anda; sistem hanya memberi informasi, bukan jaminan.

## Langkah Berikutnya (Minggu Ini)

1. Kerjakan Fase 0: kirim `market_data.py` dan `ws.py` untuk dicari titik fallback sintetisnya.
2. Siapkan data historis 3-5 tahun untuk aset utama yang Anda trading.
3. Tentukan aset dan timeframe utama (menentukan strategi mana yang paling cocok untuk Fase 3).
