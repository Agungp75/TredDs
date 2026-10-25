import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  LineStyle,
} from 'lightweight-charts';

function normalizeTime(t) {
  if (t === null || t === undefined) return 0;
  if (typeof t === 'number') {
    return Math.floor(t);
  }
  const str = String(t).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const num = parseFloat(str);
  if (!isNaN(num) && num > 100000) {
    return Math.floor(num);
  }
  const parsed = Math.floor(new Date(str).getTime() / 1000);
  return isNaN(parsed) ? str : parsed;
}

function roundFloat(val, decimals = 2) {
  const p = Math.pow(10, decimals);
  return Math.round(val * p) / p;
}

function calculateEMA(candles, period) {
  if (!candles || candles.length < period) return [];
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((acc, c) => acc + c.close, 0) / period;
  const res = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i >= period - 1) {
      if (i === period - 1) {
        res.push({ time: c.time, value: roundFloat(ema, 4) });
      } else {
        ema = c.close * k + ema * (1 - k);
        res.push({ time: c.time, value: roundFloat(ema, 4) });
      }
    }
  }
  return res;
}

// Stochastic Slow (TradingView "Stoch 14 3 3"): %K = SMA(rawK, 3), %D = SMA(%K, 3)
function calculateStochastic(candles, kPeriod = 14, kSmooth = 3, dPeriod = 3) {
  if (!candles || candles.length < kPeriod) return { k: [], d: [] };
  const raw = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j].high);
      ll = Math.min(ll, candles[j].low);
    }
    const rng = hh - ll;
    raw.push({ time: candles[i].time, value: rng > 0 ? ((candles[i].close - ll) / rng) * 100 : 50 });
  }
  const sma = (arr, n) =>
    arr.map((p, i) => {
      const s = arr.slice(Math.max(0, i - n + 1), i + 1);
      return { time: p.time, value: roundFloat(s.reduce((a, b) => a + b.value, 0) / s.length, 2) };
    });
  const k = sma(raw, kSmooth);
  const d = sma(k, dPeriod);
  return { k, d };
}

function formatVolShort(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

// Sistem Warna Konsisten (perbaikan analisa.md - Bagian 1.4):
// Satu warna = satu makna:
// - Merah (#ef4444)  : Stop Loss / Risiko
// - Hijau (#10b981)  : Take Profit / Target
// - Biru (#3b82f6)   : Entry
// - Abu-abu (#94a3b8): Referensi (Fib, EMA, Tren)
const COLOR_SEMANTICS = {
  SL: '#ef4444',      // Merah = Stop Loss / Risiko
  TP: '#10b981',      // Hijau = Take Profit / Target
  ENTRY: '#3b82f6',   // Biru  = Entry
  REF: '#94a3b8',     // Abu-abu = Referensi (EMA, Fib, Trend)
  REF_DIM: '#64748b', // Abu-abu redup untuk garis pendukung
};

const TradingViewChart = React.memo(function TradingViewChart({
  data = [],
  ohlcvData = null,
  trendlines = {},
  tpSl = null,
  levels = null,
  liveTick = null,
  height = 500,
  chartHeight = null,
  fibonacci = null,
  targets = [],
  priceZones = [],
}) {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const ema20SeriesRef = useRef(null);
  const ema50SeriesRef = useRef(null);
  const lastCandleRef = useRef(null);

  const [hoverInfo, setHoverInfo] = useState(null);
  const [hoveredLevel, setHoveredLevel] = useState(null);
  const [overlayRects, setOverlayRects] = useState({ zones: [], badges: [] });

  // Fase 3 - Interaktivitas & Default Minimal:
  // Default hanya menampilkan layer inti: Entry, SL, TP, dan EMA 20.
  // Mode "Simple" vs "Detail" untuk memilih kepadatan informasi.
  const [viewMode, setViewMode] = useState('simple'); // 'simple' | 'detail'
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(false);
  const [showTrendlines, setShowTrendlines] = useState(false);
  const [showFib, setShowFib] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  const [showStoch, setShowStoch] = useState(false);
  const [showZones, setShowZones] = useState(true);

  // Berganti mode Simple <-> Detail secara instan
  const handleSelectMode = (mode) => {
    setViewMode(mode);
    if (mode === 'simple') {
      setShowEma20(true);
      setShowEma50(false);
      setShowTrendlines(false);
      setShowFib(false);
      setShowTargets(false);
      setShowStoch(false);
      setShowZones(true);
    } else {
      setShowEma20(true);
      setShowTrendlines(true);
      setShowFib(true);
      setShowTargets(true);
      setShowStoch(true);
      setShowZones(true);
    }
  };

  const candlesSource = (ohlcvData && ohlcvData.length > 0) ? ohlcvData : data;
  const activeTpSl = tpSl || levels;
  const activeHeight = chartHeight || height;

  const isForex = useMemo(() => {
    return candlesSource.some((d) => d.close < 10 && d.close > 0) || (trendlines?.upper_line?.[0]?.price < 10);
  }, [candlesSource, trendlines]);

  const decimals = isForex ? 4 : 2;
  const minMove = isForex ? 0.0001 : 0.01;

  const formattedCandles = useMemo(() => {
    return candlesSource.map((d) => ({
      time: normalizeTime(d.time),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
    }));
  }, [candlesSource]);

  const formattedVolume = useMemo(() => {
    return candlesSource.map((d) => ({
      time: normalizeTime(d.time),
      value: Number(d.volume) || 0,
      color: Number(d.close) >= Number(d.open) ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
    }));
  }, [candlesSource]);

  const lastCandle = formattedCandles.length > 0 ? formattedCandles[formattedCandles.length - 1] : null;
  const currentClose = lastCandle ? lastCandle.close : 0;

  // Hitung daftar level horizontal dengan aturan Fase 1:
  // - Hierarki 3 tingkat (Utama: Entry/SL/TP, Pendukung: EMA/Trend, Opsional: Fib/Targets)
  // - Batasi maksimal 6 garis horizontal pada tampilan
  // - Gabungkan / saring level yang terlalu dekat (< ~0.5% dari rentang harga) agar tidak bertabrakan
  // - Format seragam: `Entry 100.69`, `SL 101.68`, `TP 98.98`, `TP1 100.24`, `Fib 0.618`
  const curatedHorizontalLevels = useMemo(() => {
    if (!formattedCandles.length) return [];

    const highs = formattedCandles.map((c) => c.high);
    const lows = formattedCandles.map((c) => c.low);
    const span = Math.max(Math.max(...highs) - Math.min(...lows), currentClose * 0.01, 1e-6);
    const minPriceGap = Math.max(span * 0.032, isForex ? 0.0005 : 0.35);

    const coreLevels = [];
    if (activeTpSl) {
      const entryVal = Number(activeTpSl.breakout_price);
      const slVal = Number(activeTpSl.sl);
      const tpVal = Number(activeTpSl.tp);
      const isShort = Boolean(
        activeTpSl.is_bearish ||
        activeTpSl.direction === 'SHORT' ||
        (tpVal && entryVal && tpVal < entryVal)
      );

      if (!isNaN(entryVal) && entryVal > 0) {
        coreLevels.push({
          id: 'entry',
          tier: 1,
          category: 'ENTRY',
          price: entryVal,
          color: COLOR_SEMANTICS.ENTRY,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          label: `Entry ${entryVal.toFixed(decimals)}`,
          shortTag: 'Entry',
          reason: `Titik eksekusi ${isShort ? 'Short' : 'Long'} mengacu pada harga penutupan / breakout aktif.`,
        });
      }
      if (!isNaN(slVal) && slVal > 0) {
        coreLevels.push({
          id: 'sl',
          tier: 1,
          category: 'SL',
          price: slVal,
          color: COLOR_SEMANTICS.SL,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          label: `SL ${slVal.toFixed(decimals)}`,
          shortTag: 'SL',
          reason: `Batas pembatalan analisa (Stop Loss) berbasis swing ${isShort ? 'high' : 'low'} + 1.5x ATR.`,
        });
      }
      if (!isNaN(tpVal) && tpVal > 0) {
        coreLevels.push({
          id: 'tp',
          tier: 1,
          category: 'TP',
          price: tpVal,
          color: COLOR_SEMANTICS.TP,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          label: `TP ${tpVal.toFixed(decimals)}`,
          shortTag: 'TP',
          reason: `Target utama Take Profit berdasarkan proyeksi tinggi pola geometris & volatilitas ATR.`,
        });
      }
    }

    const optionalCandidates = [];

    // Targets (TP1, TP2) -> Warna Hijau (Target), garis tipis putus-putus
    if (showTargets && Array.isArray(targets)) {
      targets.slice(0, 2).forEach((t, idx) => {
        const p = Number(t.price);
        if (!isNaN(p) && p > 0) {
          const cleanLbl = String(t.label || `TP${idx + 1}`).replace(/^T(\d)$/i, 'TP$1');
          optionalCandidates.push({
            id: `target-${idx}`,
            tier: 3,
            category: 'TP',
            price: p,
            color: COLOR_SEMANTICS.TP,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            label: `${cleanLbl} ${p.toFixed(decimals)}`,
            shortTag: cleanLbl,
            reason: `Target konfluensi (${(t.sources || []).join(' + ') || 'Support/Resistance'}) kekuatan ${t.strength || 60}%.`,
          });
        }
      });
    }

    // Fibonacci levels -> Warna Abu-abu (Referensi), hanya tampil saat toggle FIBO aktif
    // Catatan 1.6: Hapus garis Ext 1.272 yang menggantung di luar area harga, pastikan Fib 1 tidak terpotong
    if (showFib && fibonacci?.levels?.length) {
      fibonacci.levels.forEach((lv) => {
        const p = Number(lv.price);
        if (!isNaN(p) && p > 0) {
          optionalCandidates.push({
            id: `fib-${lv.label}`,
            tier: 3,
            category: 'REF',
            price: p,
            color: COLOR_SEMANTICS.REF,
            lineWidth: lv.label === '0.618' || lv.label === '0.5' ? 1.5 : 1,
            lineStyle: LineStyle.Dashed,
            label: `Fib ${lv.label} ${p.toFixed(decimals)}`,
            shortTag: `Fib ${lv.label}`,
            reason: lv.label === '0.618'
              ? 'Golden Ratio Retracement (0.618) — area pantulan institusional terkuat.'
              : lv.label === '0.5'
              ? 'Level Ekuilibrium 50% (0.5) dari rentang swing harga.'
              : `Batas struktur ayunan Fibonacci (${lv.label}).`,
          });
        }
      });
    }

    // Urutkan kandidat opsional berdasarkan kedekatan dengan harga saat ini (pilih yang paling dekat)
    optionalCandidates.sort((a, b) => Math.abs(a.price - currentClose) - Math.abs(b.price - currentClose));

    // Maksimal 6 garis horizontal ditampilkan sekaligus, anti-tabrakan dengan level yang sudah terpilih
    const selected = [...coreLevels];
    for (const cand of optionalCandidates) {
      if (selected.length >= 6) break;
      const tooClose = selected.some((existing) => Math.abs(existing.price - cand.price) < minPriceGap);
      if (!tooClose) {
        selected.push(cand);
      }
    }

    return selected;
  }, [formattedCandles, activeTpSl, showTargets, targets, showFib, fibonacci, currentClose, decimals, isForex]);

  // Zona Konfluensi S/R (Fase 1.3: Gunakan zona kotak semi-transparan untuk level berdekatan)
  const computedZones = useMemo(() => {
    if (!showZones || !formattedCandles.length) return [];
    if (Array.isArray(priceZones) && priceZones.length > 0) {
      return priceZones;
    }
    // Fallback otomatis jika backend tidak mengirim price_zones: buat dari Golden Pocket Fib 0.5 - 0.618
    if (fibonacci?.golden_pocket) {
      const low = Number(fibonacci.golden_pocket.bottom);
      const high = Number(fibonacci.golden_pocket.top);
      if (!isNaN(low) && !isNaN(high) && high > low) {
        const isRes = (low + high) / 2 >= currentClose;
        return [
          {
            title: isRes ? 'Zona Resistance' : 'Zona Support',
            type: isRes ? 'resistance' : 'support',
            low,
            high,
            components: ['Fib 0.5', 'Fib 0.618'],
          },
        ];
      }
    }
    return [];
  }, [showZones, priceZones, fibonacci, formattedCandles.length, currentClose]);

  // Fungsi sinkronisasi koordinat Y untuk menggambar Zona Kotak & Label Anti-Tabrakan di sisi kanan
  const syncOverlays = useCallback(() => {
    const series = candleSeriesRef.current;
    const container = chartContainerRef.current;
    if (!series || !container) return;

    const mainPaneMaxY = showStoch ? Math.round(activeHeight * 0.72) : activeHeight - 28;

    // 1. Hitung kotak Zona S/R
    const zoneBoxes = [];
    computedZones.forEach((z, idx) => {
      const yTopRaw = series.priceToCoordinate(Number(z.high));
      const yBotRaw = series.priceToCoordinate(Number(z.low));
      if (yTopRaw === null || yBotRaw === null) return;
      const top = Math.max(8, Math.min(yTopRaw, yBotRaw));
      const bottom = Math.min(mainPaneMaxY - 4, Math.max(yTopRaw, yBotRaw));
      if (bottom <= 8 || top >= mainPaneMaxY - 8) return;
      const boxHeight = Math.max(18, bottom - top);
      zoneBoxes.push({
        id: `zone-${idx}`,
        title: z.title || (z.type === 'resistance' ? 'Zona Resistance' : 'Zona Support'),
        type: z.type || 'resistance',
        low: Number(z.low),
        high: Number(z.high),
        components: z.components || [],
        top,
        height: boxHeight,
      });
    });

    // 2. Hitung posisi Y untuk badge label di sisi kanan dengan algoritma anti-tabrakan (min gap 22px)
    const rawBadges = [];
    curatedHorizontalLevels.forEach((lv) => {
      const yCoord = series.priceToCoordinate(lv.price);
      if (yCoord === null || yCoord < 10 || yCoord > mainPaneMaxY - 10) return;
      rawBadges.push({
        ...lv,
        rawY: yCoord,
        y: yCoord,
      });
    });

    // Sort dari atas ke bawah (Y kecil ke Y besar)
    rawBadges.sort((a, b) => a.rawY - b.rawY);
    const minBadgeDist = 23;
    for (let i = 1; i < rawBadges.length; i++) {
      if (rawBadges[i].y - rawBadges[i - 1].y < minBadgeDist) {
        // Jika bertabrakan dan salah satu adalah tier 3 sedangkan lainnya tier 1, sembunyikan tier 3 atau geser
        rawBadges[i].y = rawBadges[i - 1].y + minBadgeDist;
      }
    }
    // Clamp agar tidak melewati batas bawah pane utama
    for (let i = rawBadges.length - 1; i >= 0; i--) {
      if (rawBadges[i].y > mainPaneMaxY - 14) {
        rawBadges[i].y = mainPaneMaxY - 14;
      }
      if (i > 0 && rawBadges[i].y - rawBadges[i - 1].y < minBadgeDist) {
        rawBadges[i - 1].y = Math.max(14, rawBadges[i].y - minBadgeDist);
      }
    }

    setOverlayRects({ zones: zoneBoxes, badges: rawBadges });
  }, [computedZones, curatedHorizontalLevels, activeHeight, showStoch]);

  // Render chart canvas
  useEffect(() => {
    if (!chartContainerRef.current || formattedCandles.length === 0) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: activeHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: 'rgba(39, 39, 42, 0.35)' },
        horzLines: { color: 'rgba(39, 39, 42, 0.35)' },
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: '#52525b',
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: '#52525b',
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      timeScale: {
        borderColor: '#27272a',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
      },
      rightPriceScale: {
        borderColor: '#27272a',
        autoScale: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.14, // beri margin agar level bawah seperti Fib 1 tidak terpotong
        },
      },
    });

    chartInstanceRef.current = chart;

    // 1. Series Candlestick
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: true,
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      lastValueVisible: true,
      priceLineVisible: false,
      priceFormat: {
        type: 'price',
        precision: decimals,
        minMove: minMove,
      },
    });
    candleSeriesRef.current = candleSeries;
    candleSeries.setData(formattedCandles);

    if (formattedCandles.length > 0) {
      lastCandleRef.current = { ...formattedCandles[formattedCandles.length - 1] };
    }

    // 2. Series Volume (Fase 1.6: Matikan lastValueVisible & priceLineVisible agar tidak muncul kotak "2.02B" tanpa konteks)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#64748b',
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'vol_scale',
    });
    volumeSeriesRef.current = volumeSeries;

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.84,
        bottom: 0,
      },
      visible: false,
    });

    volumeSeries.setData(formattedVolume);

    // 3. EMA 20 Overlay (Tingkat 2 - Pendukung: Garis tipis, putus-putus, warna Abu-abu Referensi, tanpa label sumbu Y agar tidak menabrak Entry/SL)
    const ema20Data = calculateEMA(formattedCandles, 20);
    const ema20Series = chart.addSeries(LineSeries, {
      color: COLOR_SEMANTICS.REF,
      lineWidth: 1.5,
      lineStyle: LineStyle.Dashed,
      title: '',
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      visible: showEma20,
    });
    ema20Series.setData(ema20Data);
    ema20SeriesRef.current = ema20Series;

    // 4. EMA 50 Overlay (Opsional - Referensi Abu-abu redup)
    const ema50Data = calculateEMA(formattedCandles, 50);
    const ema50Series = chart.addSeries(LineSeries, {
      color: COLOR_SEMANTICS.REF_DIM,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      title: '',
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      visible: showEma50,
    });
    ema50Series.setData(ema50Data);
    ema50SeriesRef.current = ema50Series;

    // 5. Geometric Trendlines (Tingkat 2 - Pendukung: warna Abu-abu referensi, tipis putus-putus, tidak kusut)
    if (showTrendlines && trendlines) {
      if (Array.isArray(trendlines.upper_line) && trendlines.upper_line.length >= 2) {
        const uPts = trendlines.upper_line
          .map((pt) => ({ time: normalizeTime(pt.time), value: Number(pt.price) }))
          .filter((pt) => pt.time && !isNaN(pt.value));
        if (uPts.length >= 2 && uPts[0].time !== uPts[uPts.length - 1].time) {
          const upperSeries = chart.addSeries(LineSeries, {
            color: COLOR_SEMANTICS.REF,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            title: '',
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });
          upperSeries.setData(uPts);
        }
      }
      if (Array.isArray(trendlines.lower_line) && trendlines.lower_line.length >= 2) {
        const lPts = trendlines.lower_line
          .map((pt) => ({ time: normalizeTime(pt.time), value: Number(pt.price) }))
          .filter((pt) => pt.time && !isNaN(pt.value));
        if (lPts.length >= 2 && lPts[0].time !== lPts[lPts.length - 1].time) {
          const lowerSeries = chart.addSeries(LineSeries, {
            color: COLOR_SEMANTICS.REF,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            title: '',
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });
          lowerSeries.setData(lPts);
        }
      }
    }

    // 6. Render Maksimal 6 Garis Horizontal Terkurasi (Entry, SL, TP, dan Opsional terpilih)
    // Matikan axisLabelVisible bawaan agar kita menggambar badge di sisi kanan yang dijamin anti-tabrakan & memiliki tooltip alasan
    curatedHorizontalLevels.forEach((lv) => {
      candleSeries.createPriceLine({
        price: lv.price,
        color: lv.color,
        lineWidth: lv.lineWidth,
        lineStyle: lv.lineStyle,
        axisLabelVisible: false,
        title: '',
      });
    });

    // 7. Stochastic 14 3 3 di panel terpisah (pane 1) - Hanya saat toggle STOCH aktif, tinggi proporsional
    if (showStoch) {
      const { k, d } = calculateStochastic(formattedCandles, 14, 3, 3);
      if (k.length) {
        const kSeries = chart.addSeries(
          LineSeries,
          { color: COLOR_SEMANTICS.ENTRY, lineWidth: 1.5, title: '%K', priceLineVisible: false, lastValueVisible: false },
          1
        );
        const dSeries = chart.addSeries(
          LineSeries,
          { color: COLOR_SEMANTICS.REF, lineWidth: 1.2, lineStyle: LineStyle.Dashed, title: '%D', priceLineVisible: false, lastValueVisible: false },
          1
        );
        kSeries.setData(k);
        dSeries.setData(d);
        [80, 20].forEach((lvl) =>
          kSeries.createPriceLine({
            price: lvl,
            color: lvl === 80 ? 'rgba(239,68,68,0.45)' : 'rgba(16,185,129,0.45)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: lvl === 80 ? 'OB 80' : 'OS 20',
          })
        );
        try {
          const panes = chart.panes();
          if (panes[1]) panes[1].setHeight(Math.round(activeHeight * 0.22));
        } catch {
          /* pane API fallback */
        }
      }
    }

    chart.timeScale().fitContent();

    // Sinkronkan posisi Zona S/R & Label Anti-Tabrakan setelah render dan saat scroll/zoom
    const rafId = requestAnimationFrame(() => syncOverlays());
    const handleTimeRangeChange = () => syncOverlays();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleTimeRangeChange);

    // Crosshair hover listener untuk OHLCV Legend Bar
    chart.subscribeCrosshairMove((param) => {
      syncOverlays();
      if (!param.time || !param.seriesData) {
        setHoverInfo(null);
        return;
      }
      const c = param.seriesData.get(candleSeries);
      const v = param.seriesData.get(volumeSeries);
      if (c) {
        const change = c.open ? ((c.close - c.open) / c.open) * 100 : 0;
        setHoverInfo({
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          change,
          volume: v?.value || 0,
        });
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
        syncOverlays();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
        ema20SeriesRef.current = null;
        ema50SeriesRef.current = null;
      }
    };
  }, [
    formattedCandles,
    formattedVolume,
    trendlines,
    activeHeight,
    decimals,
    minMove,
    curatedHorizontalLevels,
    showTrendlines,
    showStoch,
    showEma20,
    showEma50,
    syncOverlays,
  ]);

  // Real-time live tick update handler
  useEffect(() => {
    if (!candleSeriesRef.current || !liveTick || !lastCandleRef.current) return;
    const p = Number(liveTick.price);
    if (isNaN(p) || p <= 0) return;

    const last = lastCandleRef.current;
    const updatedCandle = {
      time: last.time,
      open: last.open,
      high: Math.max(last.high, p),
      low: Math.min(last.low, p),
      close: p,
    };
    lastCandleRef.current = updatedCandle;
    candleSeriesRef.current.update(updatedCandle);

    if (volumeSeriesRef.current && liveTick.volume) {
      volumeSeriesRef.current.update({
        time: last.time,
        value: liveTick.volume,
        color: p >= last.open ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
      });
    }
    syncOverlays();
  }, [liveTick, syncOverlays]);

  const displayOhlc = hoverInfo || (lastCandle ? {
    open: lastCandle.open,
    high: lastCandle.high,
    low: lastCandle.low,
    close: lastCandle.close,
    change: lastCandle.open ? ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100 : 0,
    volume: candlesSource[candlesSource.length - 1]?.volume || 0,
  } : null);

  const formatPrice = (v) => {
    if (v === null || v === undefined) return '-';
    return Number(v).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  // Maksimal 4 gaya latar untuk badge label sesuai Fase 1.4:
  // 1. Merah (SL), 2. Hijau (TP), 3. Biru (Entry), 4. Abu-abu (Referensi)
  const getBadgeStyle = (category) => {
    switch (category) {
      case 'SL':
        return 'bg-red-950/95 text-red-200 border-red-500/80 shadow-red-950/50';
      case 'TP':
        return 'bg-emerald-950/95 text-emerald-200 border-emerald-500/80 shadow-emerald-950/50';
      case 'ENTRY':
        return 'bg-blue-950/95 text-blue-200 border-blue-500/80 shadow-blue-950/50';
      default:
        return 'bg-slate-900/95 text-slate-300 border-slate-600/80 shadow-slate-950/50';
    }
  };

  return (
    <div className="w-full relative rounded-2xl overflow-hidden border border-slate-800/80 bg-[#090d16] shadow-2xl">
      {/* Top Toolbar: OHLCV + Volume dengan Konteks + Mode Simple/Detail & Toggle Layer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/95 border-b border-slate-800/80 backdrop-blur-md">
        {/* OHLCV Legend dengan keterangan Volume eksplisit (menggantikan kotak "2.02B" tanpa konteks) */}
        {displayOhlc ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono">
            <span className="text-slate-400">
              O <strong className="text-slate-200 font-semibold">{formatPrice(displayOhlc.open)}</strong>
            </span>
            <span className="text-slate-400">
              H <strong className="text-slate-200 font-semibold">{formatPrice(displayOhlc.high)}</strong>
            </span>
            <span className="text-slate-400">
              L <strong className="text-slate-200 font-semibold">{formatPrice(displayOhlc.low)}</strong>
            </span>
            <span className="text-slate-400">
              C{' '}
              <strong
                className={`font-semibold ${
                  displayOhlc.close >= displayOhlc.open ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatPrice(displayOhlc.close)}
              </strong>
            </span>
            <span
              className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                displayOhlc.change >= 0
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-rose-500/15 text-rose-400'
              }`}
            >
              {displayOhlc.change >= 0 ? '+' : ''}
              {displayOhlc.change.toFixed(2)}%
            </span>
            {displayOhlc.volume > 0 && (
              <span
                className="text-slate-400 pl-2 border-l border-slate-800"
                title="Volume transaksi pada candle yang dipilih"
              >
                Vol Bar: <strong className="text-slate-200">{formatVolShort(displayOhlc.volume)}</strong>
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-500">Arahkan kursor ke grafik untuk melihat OHLCV</span>
        )}

        {/* Mode Simple/Detail & Layer Toggles (Fase 3) */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
          {/* Simple vs Detail Mode Switch */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 mr-1">
            <button
              type="button"
              onClick={() => handleSelectMode('simple')}
              className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                viewMode === 'simple'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mode Simple: Hanya menampilkan Entry, SL, TP, EMA 20, dan Zona S/R utama"
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => handleSelectMode('detail')}
              className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                viewMode === 'detail'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mode Detail: Menampilkan konfluensi Trendline, Fibonacci, Target, dan Stochastic"
            >
              Detail
            </button>
          </div>

          {/* Toggle per Layer: EMA, TREND, FIBO, TARGET, STOCH */}
          <button
            type="button"
            onClick={() => setShowEma20((prev) => !prev)}
            className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
              showEma20
                ? 'bg-slate-700/80 text-slate-100 border border-slate-500/60'
                : 'bg-slate-800/60 text-slate-500 border border-transparent hover:text-slate-300'
            }`}
            title="EMA 20 (Indikator Pendukung Tren Dinamis)"
          >
            EMA
          </button>

          <button
            type="button"
            onClick={() => setShowTrendlines((prev) => !prev)}
            className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
              showTrendlines
                ? 'bg-slate-700/80 text-slate-100 border border-slate-500/60'
                : 'bg-slate-800/60 text-slate-500 border border-transparent hover:text-slate-300'
            }`}
            title="Garis Trendline Support & Resistance (Regresi Polyfit SciPy)"
          >
            TREND
          </button>

          <button
            type="button"
            onClick={() => setShowFib((prev) => !prev)}
            className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
              showFib
                ? 'bg-slate-700/80 text-slate-100 border border-slate-500/60'
                : 'bg-slate-800/60 text-slate-500 border border-transparent hover:text-slate-300'
            }`}
            title="Level Retracement Fibonacci (0, 0.5, 0.618, 1)"
          >
            FIBO
          </button>

          <button
            type="button"
            onClick={() => setShowTargets((prev) => !prev)}
            className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
              showTargets
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800/60 text-slate-500 border border-transparent hover:text-slate-300'
            }`}
            title="Target Bertahap TP1 / TP2"
          >
            TARGET
          </button>

          <button
            type="button"
            onClick={() => setShowStoch((prev) => !prev)}
            className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
              showStoch
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                : 'bg-slate-800/60 text-slate-500 border border-transparent hover:text-slate-300'
            }`}
            title="Panel Stochastic Slow (14, 3, 3)"
          >
            STOCH
          </button>
        </div>
      </div>

      {/* Sub-Bar Legenda Sistem Warna Konsisten (Satu Warna = Satu Makna, Fase 1.4) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-slate-950/90 border-b border-slate-800/60 text-[11px] font-mono text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-blue-500 inline-block rounded" />
            <span className="text-blue-300 font-semibold">Biru:</span> Entry
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-red-500 inline-block rounded" />
            <span className="text-red-300 font-semibold">Merah:</span> Stop Loss (Risiko)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-emerald-500 inline-block rounded" />
            <span className="text-emerald-300 font-semibold">Hijau:</span> Take Profit (Target)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-slate-400 inline-block rounded border-b border-dashed" />
            <span className="text-slate-300 font-semibold">Abu-abu:</span> Referensi (EMA 20, Fib, Tren)
          </span>
        </div>
        <span className="text-[10px] text-slate-500 hidden md:inline">
          Arahkan kursor pada label di kanan chart untuk melihat alasan level
        </span>
      </div>

      {/* Area Chart Utama + Overlay Zona S/R & Label Anti-Tabrakan */}
      <div className="relative w-full" style={{ height: `${activeHeight}px` }}>
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* 1. Overlay Kotak Zona Support / Resistance (Fase 1.3) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {overlayRects.zones.map((z) => {
            const isRes = z.type === 'resistance';
            return (
              <div
                key={z.id}
                style={{
                  top: `${z.top}px`,
                  height: `${z.height}px`,
                  left: '12px',
                  right: '76px',
                }}
                className={`absolute rounded border transition-all ${
                  isRes
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-emerald-500/10 border-emerald-500/30'
                }`}
              >
                <div
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-semibold rounded-br ${
                    isRes
                      ? 'bg-red-950/80 text-red-300'
                      : 'bg-emerald-950/80 text-emerald-300'
                  }`}
                >
                  <span>{z.title}</span>
                  <span className="opacity-80">
                    ({formatPrice(z.low)} – {formatPrice(z.high)})
                  </span>
                </div>
              </div>
            );
          })}

          {/* Garis Pemisah Visual & Label Panel Stochastic saat STOCH aktif (Fase 1.6) */}
          {showStoch && (
            <div
              style={{ top: `${Math.round(activeHeight * 0.76)}px` }}
              className="absolute left-3 px-2 py-0.5 rounded bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-slate-400"
            >
              Stochastic (14, 3, 3) • <span className="text-blue-400">%K</span> / <span className="text-slate-400">%D</span>
            </div>
          )}
        </div>

        {/* 2. Label Sisi Kanan yang Ringkas, Seragam, Anti-Tabrakan + Tooltip Hover (Fase 1.5 & Fase 3) */}
        <div className="pointer-events-none absolute inset-y-0 right-[72px] w-44 overflow-visible">
          {overlayRects.badges.map((b) => (
            <div
              key={b.id}
              style={{ top: `${b.y - 10}px` }}
              onMouseEnter={() => setHoveredLevel(b)}
              onMouseLeave={() => setHoveredLevel((prev) => (prev?.id === b.id ? null : prev))}
              className={`pointer-events-auto absolute right-1 px-2 py-0.5 rounded border text-[11px] font-mono font-semibold shadow-md cursor-help transition-transform hover:scale-105 whitespace-nowrap ${getBadgeStyle(
                b.category
              )}`}
            >
              {b.label}
            </div>
          ))}
        </div>

        {/* 3. Tooltip Interaktif Saat Hover pada Label Garis (Fase 3: nama level, harga, alasan) */}
        {hoveredLevel && (
          <div
            style={{
              top: `${Math.min(Math.max(16, hoveredLevel.y - 24), activeHeight - 110)}px`,
              right: '215px',
            }}
            className="pointer-events-none absolute z-30 w-72 p-3 rounded-xl bg-slate-950/95 border border-slate-700 shadow-2xl text-xs font-mono space-y-1 backdrop-blur-md"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-1">
              <span className="font-bold text-white">{hoveredLevel.shortTag}</span>
              <span className="font-bold text-sky-400">{formatPrice(hoveredLevel.price)}</span>
            </div>
            <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
              {hoveredLevel.reason}
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

export default TradingViewChart;
