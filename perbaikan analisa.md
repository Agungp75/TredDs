# Plan Perbaikan Tampilan Chart Analisa Teknikal

Dokumen ini berisi rencana perbaikan agar hasil analisa pada sistem trading lebih rapi, mudah dibaca, dan kredibel. Berdasarkan chart yang ada (contoh: setup Short dengan Entry 100.69, SL 101.68, TP 98.98).

---

## 1. Tujuan

- Chart mudah dibaca dalam waktu kurang dari 5 detik.
- Trader langsung tahu: **arah, entry, stop loss, target, dan alasan sinyal**.
- Tidak ada label yang bertabrakan atau elemen tanpa konteks.
- Hasil analisa terlihat meyakinkan karena **isinya jelas dan transparan**, bukan hanya karena tampilannya.

---

## 2. Masalah yang Ditemukan

| No | Masalah | Dampak |
|----|---------|--------|
| 1 | Level harga menumpuk di rentang 100.08 - 100.88 (EMA 20, Resistance Trend, Entry, Fib 0.5, T1, T2, Fib 0.618) | Label bertabrakan, sulit dibaca |
| 2 | Terlalu banyak garis horizontal bergaya mirip (putus-putus biru, kuning, cyan, hijau) | Tidak ada hierarki, tidak jelas mana yang penting |
| 3 | Dua trendline (merah dan hijau) ditambah garis oranye tipis | Area tengah chart terlihat kusut |
| 4 | Format label tidak konsisten dan warna latar terlalu banyak | Terlihat tidak profesional |
| 5 | Elemen tanpa konteks: kotak "2.02B", garis Ext 1.272 menggantung, "Fib 1" terpotong | Membingungkan |
| 6 | Tidak ada ringkasan arah, risk/reward, dan alasan sinyal | Trader harus menyimpulkan sendiri |

---

## 3. Rencana Perbaikan

### Fase 1 - Rapikan Chart (Prioritas Tinggi)

**1.1 Hierarki visual 3 tingkat**

| Tingkat | Elemen | Gaya |
|---------|--------|------|
| Utama | Entry, Stop Loss, Take Profit | Garis tebal, solid, label jelas |
| Pendukung | EMA 20, trendline, support/resistance | Garis tipis, putus-putus, label kecil |
| Opsional | Fibonacci, ekstensi, T1/T2/T3 | Hanya tampil saat toggle aktif |

**1.2 Batasi jumlah level**
- Maksimal **5-6 garis horizontal** ditampilkan sekaligus.
- Pilih level yang paling dekat dengan harga saat ini.
- Level yang berselisih kurang dari ~0.5 poin digabung menjadi satu zona.

**1.3 Gunakan zona, bukan garis, untuk level berdekatan**
- Contoh: area 100.57 - 100.88 digambar sebagai satu kotak semi-transparan berlabel "Zona Resistance".

**1.4 Sistem warna konsisten**

| Warna | Arti |
|-------|------|
| Merah | Stop loss / risiko |
| Hijau | Take profit / target |
| Biru | Entry |
| Abu-abu | Referensi (Fib, EMA, tren) |

Satu warna = satu makna. Kurangi warna latar label menjadi maksimal 4.

**1.5 Label ringkas dan tidak bertabrakan**
- Posisi label di sisi kanan, dengan jarak minimum antar-label.
- Label yang terlalu dekat dengan label lain disembunyikan atau digabung.
- Format seragam: `Entry 100.69`, `SL 101.68`, `TP1 100.24`, `TP2 100.08`.

**1.6 Bersihkan elemen kecil**
- Hapus atau beri keterangan pada kotak "2.02B".
- Hapus garis Ext 1.272 yang menggantung, atau tampilkan hanya saat layer FIBO aktif.
- Pastikan "Fib 1" tidak terpotong di tepi bawah.
- Atur tinggi panel Stochastic agar proporsional dan beri jarak dari chart utama.

---

### Fase 2 - Panel Ringkasan Analisa (Prioritas Tinggi)

Tambahkan panel di luar area chart (kanan atau bawah) dengan isi berikut:

| Item | Contoh Isi |
|------|-----------|
| Arah | Short (bias bearish) |
| Entry / SL / TP | 100.69 / 101.68 / 98.98 |
| Risk : Reward | dihitung otomatis |
| Konfirmasi indikator | EMA 20 di atas harga; Stoch %K 34 / %D 42 |
| Alasan singkat | 2-3 poin, bukan paragraf panjang |
| Kondisi batal (invalidation) | Invalid jika close di atas 101.68 |
| Tingkat keyakinan | Rendah / Sedang / Tinggi (berdasarkan jumlah indikator yang sejalan) |

**Rumus Risk:Reward (untuk Short):**
```
Risk   = SL - Entry
Reward = Entry - TP
RR     = Reward / Risk
```

**Contoh tingkat keyakinan berbasis skor:**
- Tren searah timeframe utama: +1
- Harga di bawah EMA 20: +1
- Stochastic searah sinyal: +1
- Ada penolakan di level resistance: +1
- Skor 0-1 = Rendah, 2-3 = Sedang, 4 = Tinggi

---

### Fase 3 - Interaktivitas (Prioritas Sedang)

- Toggle per layer: EMA, TREND, FIBO, TARGET, STOCH.
- **Default hanya menampilkan layer inti:** Entry, SL, TP, dan EMA 20.
- Layer lain dinyalakan manual oleh pengguna.
- Tooltip saat hover pada setiap garis (nama level, harga, alasan).
- Mode "Simple" dan "Detail" untuk memilih kepadatan informasi.

---

### Fase 4 - Kredibilitas Analisa (Prioritas Sedang)

- Tampilkan **alasan sinyal** secara eksplisit.
- Tampilkan **kondisi pembatalan** analisa.
- Tampilkan **disclaimer**: alat bantu analisa, bukan jaminan hasil.
- Lakukan **backtest** dan tampilkan statistik historis (win rate, rata-rata RR, drawdown) jika data tersedia.
- Tampilkan **waktu dan timeframe** analisa dibuat agar tidak dianggap kedaluwarsa.

---

## 4. Urutan Pengerjaan

| Langkah | Pekerjaan | Perkiraan Usaha |
|---------|-----------|-----------------|
| 1 | Audit semua garis dan label yang ada, tentukan mana yang dipertahankan | Kecil |
| 2 | Buat aturan hierarki, warna, dan format label | Kecil |
| 3 | Implementasi penggabungan level menjadi zona dan anti-tabrakan label | Sedang |
| 4 | Bersihkan elemen kecil (2.02B, Ext 1.272, Fib 1) | Kecil |
| 5 | Buat panel ringkasan + hitung RR otomatis | Sedang |
| 6 | Tambah toggle layer dan default tampilan minimal | Sedang |
| 7 | Tambah skor keyakinan, invalidation, disclaimer | Sedang |
| 8 | Backtest dan tampilkan statistik | Besar |
| 9 | Uji dengan beberapa pasangan/timeframe, kumpulkan masukan | Sedang |

---

## 5. Checklist Penerimaan

- [x] Tidak ada label yang saling menimpa.
- [x] Garis horizontal yang tampil maksimal 6 pada tampilan default.
- [x] Setiap warna hanya punya satu makna.
- [x] Entry, SL, dan TP terlihat jelas dalam sekali pandang.
- [x] Panel ringkasan menampilkan arah, RR, alasan, dan invalidation.
- [x] Tidak ada elemen yang terpotong atau tanpa keterangan.
- [x] Toggle layer berfungsi dan default hanya layer inti.
- [x] Disclaimer tampil pada setiap hasil analisa.

---

## 6. Catatan

Tampilan yang rapi membantu pembacaan, tetapi kepercayaan pengguna lebih ditentukan oleh **transparansi alasan, kondisi batal, dan data pendukung (backtest)**. Pastikan sistem tidak menampilkan tingkat keyakinan tinggi tanpa dasar yang bisa dijelaskan.

Langkah teknis selanjutnya bergantung pada platform yang dipakai (Pine Script di TradingView, Python dengan library chart, atau aplikasi web sendiri).
