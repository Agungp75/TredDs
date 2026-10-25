import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  LineStyle,
} from 'lightweight-charts';
import { Settings, X, RotateCcw } from 'lucide-react';

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

/**
 * Stochastic Slow sesuai standar TradingView ("Stoch"):
 * Inputs default sesuai gambar:
 *   - %K Length    = 14
 *   - %K Smoothing = 3
 *   - %D Smoothing = 3
 * Rumus PineScript TradingView:
 *   rawK = 100 * (close - lowest(low, kLength)) / (highest(high, kLength) - lowest(low, kLength))
 *   %K   = SMA(rawK, kSmoothing)
 *   %D   = SMA(%K, dSmoothing)
 */
function calculateStochastic(candles, kLength = 14, kSmoothing = 3, dSmoothing = 3) {
  const kLen = Math.max(1, Number(kLength) || 14);
  const kSm = Math.max(1, Number(kSmoothing) || 3);
  const dSm = Math.max(1, Number(dSmoothing) || 3);

  if (!candles || candles.length < kLen) return { k: [], d: [] };

  const raw = [];
  for (let i = kLen - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kLen + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j].high);
      ll = Math.min(ll, candles[j].low);
    }
    const rng = hh - ll;
    raw.push({
      time: candles[i].time,
      value: rng > 0 ? ((candles[i].close - ll) / rng) * 100 : 50,
    });
  }

  const smaRaw = (arr, period) => {
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += arr[j].value;
      }
      out.push({ time: arr[i].time, value: sum / period });
    }
    return out;
  };

  const kUnrounded = smaRaw(raw, kSm);
  const dUnrounded = smaRaw(kUnrounded, dSm);

  return {
    k: kUnrounded.map((p) => ({ time: p.time, value: roundFloat(p.value, 2) })),
    d: dUnrounded.map((p) => ({ time: p.time, value: roundFloat(p.value, 2) })),
  };
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

const DEFAULT_STOCH_CONFIG = {
  kLength: 14,
  kSmoothing: 3,
  dSmoothing: 3,
  kColor: '#2962FF',
  dColor: '#FF6D00',
  showK: true,
  showD: true,
  upperBand: 80,
  lowerBand: 20,
};

const TradingViewChart = React.memo(function TradingViewChart({
  data = [],
  ohlcvData = null,
  trendlines = {},
  tpSl = null,
  levels = null,
  liveTick = null,
  height = 540,
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
  const stochKSeriesRef = useRef(null);
  const stochDSeriesRef = useRef(null);
  const lastCandleRef = useRef(null);

  const [hoverInfo, setHoverInfo] = useState(null);
  const [hoverStoch, setHoverStoch] = useState(null);
  const [hoveredLevel, setHoveredLevel] = useState(null);
  const [overlayRects, setOverlayRects] = useState({ zones: [], badges: [] });

  // Konfigurasi Stochastic sesuai gambar TradingView:
  // %K Length = 14, %K Smoothing = 3, %D Smoothing = 3
  const [stochConfig, setStochConfig] = useState(DEFAULT_STOCH_CONFIG);
  const [showStochModal, setShowStochModal] = useState(false);
  const [stochModalTab, setStochModalTab] = useState('inputs'); // 'inputs' | 'style' | 'visibility'
  const [draftStoch, setDraftStoch] = useState(DEFAULT_STOCH_CONFIG);

  // Fase 3 - Interaktivitas & Default Minimal:
  // Panel Stochastic (14, 3, 3) aktif secara default agar sesuai dengan indikator utama yang diminta.
  const [viewMode, setViewMode] = useState('simple'); // 'simple' | 'detail'
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(false);
  const [showTrendlines, setShowTrendlines] = useState(false);
  const [showFib, setShowFib] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  const [showStoch, setShowStoch] = useState(true);
  const [showZones, setShowZones] = useState(true);

  const handleSelectMode = (mode) => {
    setViewMode(mode);
    if (mode === 'simple') {
      setShowEma20(true);
      setShowEma50(false);
      setShowTrendlines(false);
      setShowFib(false);
      setShowTargets(false);
      setShowStoch(true);
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

  const decimals = useMemo(() => {
    const sampleP =
      candlesSource.length > 0
        ? Math.abs(Number(candlesSource[candlesSource.length - 1].close) || 1)
        : 1;
    if (sampleP > 0 && sampleP < 0.0001) return 8;
    if (sampleP > 0 && sampleP < 0.01) return 6;
    if (sampleP > 0 && sampleP < 10) return 4;
    return 2;
  }, [candlesSource]);
  const minMove = useMemo(() => Math.pow(10, -decimals), [decimals]);
  const isForex = decimals >= 4;

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

  // Kalkulasi data Stochastic berdasarkan input (%K Length: 14, %K Smoothing: 3, %D Smoothing: 3)
  const stochData = useMemo(() => {
    return calculateStochastic(
      formattedCandles,
      stochConfig.kLength,
      stochConfig.kSmoothing,
      stochConfig.dSmoothing
    );
  }, [formattedCandles, stochConfig.kLength, stochConfig.kSmoothing, stochConfig.dSmoothing]);

  const latestStoch = useMemo(() => {
    const kArr = stochData.k || [];
    const dArr = stochData.d || [];
    return {
      k: kArr.length > 0 ? kArr[kArr.length - 1].value : null,
      d: dArr.length > 0 ? dArr[dArr.length - 1].value : null,
    };
  }, [stochData]);

  const lastCandle = formattedCandles.length > 0 ? formattedCandles[formattedCandles.length - 1] : null;
  const currentClose = lastCandle ? lastCandle.close : 0;

  // Hitung daftar level horizontal dengan aturan Fase 1:
  // - Hierarki 3 tingkat (Utama: Entry/SL/TP, Pendukung: EMA/Trend, Opsional: Fib/Targets)
  // - Batasi maksimal 6 garis horizontal pada tampilan
  // - Gabungkan / saring level yang terlalu dekat agar tidak bertabrakan
  // - Format seragam: `Entry 100.69`, `SL 101.68`, `TP 98.98`, `TP1 100.24`, `Fib 0.618`
  const curatedHorizontalLevels = useMemo(() => {
    if (!formattedCandles.length) return [];

    const highs = formattedCandles.map((c) => c.high);
    const lows = formattedCandles.map((c) => c.low);
    const span = Math.max(Math.max(...highs) - Math.min(...lows), currentClose * 0.01, 1e-6);
    const minPriceGap = Math.max(span * 0.032, isForex ? 0.0005 : 0.35);

    const coreLevels = [];
    if (activeTpSl) {
      const entryVal = Number(activeTpSl.maker_limit_entry || activeTpSl.breakout_price);
      const slVal = Number(activeTpSl.sl);
      const tp1Val = Number(activeTpSl.tp1);
      const tpVal = Number(activeTpSl.tp2 || activeTpSl.tp);
      const isShort = Boolean(
        activeTpSl.is_bearish ||
        activeTpSl.direction === 'SHORT' ||
        (tpVal && entryVal && tpVal < entryVal)
      );

      if (!isNaN(entryVal) && entryVal > 0) {
        const isMaker = Boolean(activeTpSl.maker_limit_entry);
        coreLevels.push({
          id: 'entry',
          tier: 1,
          category: 'ENTRY',
          price: entryVal,
          color: COLOR_SEMANTICS.ENTRY,
          lineWidth: 2,
          lineStyle: isMaker ? LineStyle.Dashed : LineStyle.Solid,
          label: `${isMaker ? 'Maker 0%' : 'Entry'} ${entryVal.toFixed(decimals)}`,
          shortTag: isMaker ? 'Maker 0%' : 'Entry',
          reason: `Titik eksekusi ${isShort ? 'Short' : 'Long'} menggunakan Limit Order MEXC (0% Maker Fee) pada pullback ATR.`,
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
          label: `SL (Fair) ${slVal.toFixed(decimals)}`,
          shortTag: 'SL (Fair)',
          reason: `Stop Loss berbasis MEXC FAIR_PRICE (anti-scam wick) di balik swing ${isShort ? 'high' : 'low'} + 1.5x ATR.`,
        });
      }
      if (!isNaN(tp1Val) && tp1Val > 0 && Math.abs(tp1Val - tpVal) >= minPriceGap * 0.5) {
        coreLevels.push({
          id: 'tp1',
          tier: 1,
          category: 'TP',
          price: tp1Val,
          color: COLOR_SEMANTICS.TP,
          lineWidth: 1.5,
          lineStyle: LineStyle.Dashed,
          label: `TP1 (50%) ${tp1Val.toFixed(decimals)}`,
          shortTag: 'TP1 (50%)',
          reason: 'Target Take Profit 1 (1.5x ATR): Tutup 50% posisi & geser Stop Loss ke Breakeven (BEP).',
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
          label: `TP2 ${tpVal.toFixed(decimals)}`,
          shortTag: 'TP2',
          reason: `Target utama Take Profit Runner (50% sisa posisi) berdasarkan struktur likuiditas & proyeksi ATR.`,
        });
      }
    }

    const optionalCandidates = [];

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

    optionalCandidates.sort((a, b) => Math.abs(a.price - currentClose) - Math.abs(b.price - currentClose));

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

  // Zona Konfluensi S/R (Fase 1.3)
  const computedZones = useMemo(() => {
    if (!showZones || !formattedCandles.length) return [];
    if (Array.isArray(priceZones) && priceZones.length > 0) {
      return priceZones;
    }
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

  const stochPaneHeight = Math.round(activeHeight * 0.24);
  const mainPaneMaxY = showStoch ? activeHeight - stochPaneHeight - 28 : activeHeight - 28;

  // Sinkronisasi koordinat Y untuk menggambar Zona Kotak & Label Anti-Tabrakan di sisi kanan
  const syncOverlays = useCallback(() => {
    const series = candleSeriesRef.current;
    const container = chartContainerRef.current;
    if (!series || !container) return;

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

    rawBadges.sort((a, b) => a.rawY - b.rawY);
    const minBadgeDist = 23;
    for (let i = 1; i < rawBadges.length; i++) {
      if (rawBadges[i].y - rawBadges[i - 1].y < minBadgeDist) {
        rawBadges[i].y = rawBadges[i - 1].y + minBadgeDist;
      }
    }
    for (let i = rawBadges.length - 1; i >= 0; i--) {
      if (rawBadges[i].y > mainPaneMaxY - 14) {
        rawBadges[i].y = mainPaneMaxY - 14;
      }
      if (i > 0 && rawBadges[i].y - rawBadges[i - 1].y < minBadgeDist) {
        rawBadges[i - 1].y = Math.max(14, rawBadges[i].y - minBadgeDist);
      }
    }

    setOverlayRects({ zones: zoneBoxes, badges: rawBadges });
  }, [computedZones, curatedHorizontalLevels, mainPaneMaxY]);

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
          bottom: 0.14,
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

    // 2. Series Volume (Matikan lastValueVisible & priceLineVisible agar tidak muncul kotak "2.02B" tanpa konteks)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#64748b',
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });
    volumeSeriesRef.current = volumeSeries;

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.84,
        bottom: 0,
      },
    });

    volumeSeries.setData(formattedVolume);

    // 3. EMA 20 Overlay
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

    // 4. EMA 50 Overlay
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

    // 5. Geometric Trendlines
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

    // 6. Render Maksimal 6 Garis Horizontal Terkurasi
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

    // 7. Stochastic Slow (Inputs: %K Length=14, %K Smoothing=3, %D Smoothing=3) di Panel Terpisah (Pane 1)
    stochKSeriesRef.current = null;
    stochDSeriesRef.current = null;
    if (showStoch && stochData.k.length > 0) {
      const kSeries = chart.addSeries(
        LineSeries,
        {
          color: stochConfig.kColor,
          lineWidth: 1.5,
          lineStyle: LineStyle.Solid,
          title: '%K',
          visible: stochConfig.showK,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        },
        1
      );
      const dSeries = chart.addSeries(
        LineSeries,
        {
          color: stochConfig.dColor,
          lineWidth: 1.5,
          lineStyle: LineStyle.Solid,
          title: '%D',
          visible: stochConfig.showD,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        },
        1
      );
      kSeries.setData(stochData.k);
      dSeries.setData(stochData.d);
      stochKSeriesRef.current = kSeries;
      stochDSeriesRef.current = dSeries;

      // Garis batas Upper Band (80), Middle Band (50), Lower Band (20) standar TradingView Stoch
      kSeries.createPriceLine({
        price: stochConfig.upperBand,
        color: 'rgba(148, 163, 184, 0.45)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      });
      kSeries.createPriceLine({
        price: 50,
        color: 'rgba(148, 163, 184, 0.22)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: '',
      });
      kSeries.createPriceLine({
        price: stochConfig.lowerBand,
        color: 'rgba(148, 163, 184, 0.45)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      });

      try {
        kSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.12, bottom: 0.10 },
        });
        const panes = chart.panes();
        if (panes[1]) panes[1].setHeight(stochPaneHeight);
      } catch {
        /* fallback */
      }
    }

    chart.timeScale().fitContent();

    const rafId = requestAnimationFrame(() => syncOverlays());
    const handleTimeRangeChange = () => syncOverlays();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleTimeRangeChange);

    // Crosshair hover listener untuk OHLCV & Stochastic Legend Bar
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoverInfo(null);
        setHoverStoch(null);
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
      if (stochKSeriesRef.current || stochDSeriesRef.current) {
        const kPoint = stochKSeriesRef.current ? param.seriesData.get(stochKSeriesRef.current) : null;
        const dPoint = stochDSeriesRef.current ? param.seriesData.get(stochDSeriesRef.current) : null;
        if (kPoint || dPoint) {
          setHoverStoch({
            k: kPoint?.value ?? null,
            d: dPoint?.value ?? null,
          });
        } else {
          setHoverStoch(null);
        }
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
        stochKSeriesRef.current = null;
        stochDSeriesRef.current = null;
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
    stochData,
    stochConfig,
    stochPaneHeight,
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

  const activeStochValues = hoverStoch || latestStoch;

  const formatPrice = (v) => {
    if (v === null || v === undefined) return '-';
    return Number(v).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

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

  const openStochModal = () => {
    setDraftStoch({ ...stochConfig });
    setStochModalTab('inputs');
    setShowStochModal(true);
  };

  const applyStochSettings = (e) => {
    if (e) e.preventDefault();
    setStochConfig({
      ...draftStoch,
      kLength: Math.max(1, Number(draftStoch.kLength) || 14),
      kSmoothing: Math.max(1, Number(draftStoch.kSmoothing) || 3),
      dSmoothing: Math.max(1, Number(draftStoch.dSmoothing) || 3),
    });
    setShowStochModal(false);
  };

  const resetStochDefaults = () => {
    setDraftStoch({ ...DEFAULT_STOCH_CONFIG });
  };

  return (
    <div className="w-full relative rounded-2xl overflow-hidden border border-slate-800/80 bg-[#090d16] shadow-2xl">
      {/* Top Toolbar: OHLCV + Volume dengan Konteks + Mode Simple/Detail & Toggle Layer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/95 border-b border-slate-800/80 backdrop-blur-md">
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

        {/* Mode Simple/Detail & Layer Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 mr-1">
            <button
              type="button"
              onClick={() => handleSelectMode('simple')}
              className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                viewMode === 'simple'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mode Simple: Menampilkan Entry, SL, TP, EMA 20, Zona S/R, dan Stoch (14, 3, 3)"
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
              title="Mode Detail: Menampilkan seluruh layer konfluensi (Trendline, Fibonacci, Target, Stoch)"
            >
              Detail
            </button>
          </div>

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

          <div className="inline-flex items-center rounded overflow-hidden border border-blue-500/40 bg-blue-500/15">
            <button
              type="button"
              onClick={() => setShowStoch((prev) => !prev)}
              className={`px-2 py-0.5 font-medium transition-all cursor-pointer ${
                showStoch
                  ? 'text-blue-300'
                  : 'bg-slate-800/80 text-slate-500 hover:text-slate-300'
              }`}
              title={`Toggle Stoch (${stochConfig.kLength}, ${stochConfig.kSmoothing}, ${stochConfig.dSmoothing})`}
            >
              STOCH ({stochConfig.kLength},{stochConfig.kSmoothing},{stochConfig.dSmoothing})
            </button>
            <button
              type="button"
              onClick={openStochModal}
              className="px-1.5 py-0.5 text-blue-300 hover:text-white hover:bg-blue-500/30 border-l border-blue-500/30 transition-colors cursor-pointer"
              title="Pengaturan Inputs Stoch (%K Length, %K Smoothing, %D Smoothing)"
            >
              <Settings className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Bar Legenda Sistem Warna Konsisten (Satu Warna = Satu Makna) */}
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

        {/* 1. Overlay Kotak Zona Support / Resistance */}
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
        </div>

        {/* Header Bar Indikator Stoch (14, 3, 3) ala TradingView pada Pane Stochastic */}
        {showStoch && (
          <div
            style={{ top: `${activeHeight - stochPaneHeight - 22}px` }}
            className="absolute left-3 z-20 flex items-center gap-2.5 px-2.5 py-1 rounded-md bg-[#0e111a]/95 border border-slate-800/90 text-[11px] font-mono shadow-md"
          >
            <span className="font-bold text-slate-200">Stoch</span>
            <span className="text-slate-400">
              {stochConfig.kLength} {stochConfig.kSmoothing} {stochConfig.dSmoothing}
            </span>
            <span className="font-semibold" style={{ color: stochConfig.kColor }}>
              %K {activeStochValues.k !== null && activeStochValues.k !== undefined ? activeStochValues.k.toFixed(2) : '-'}
            </span>
            <span className="font-semibold" style={{ color: stochConfig.dColor }}>
              %D {activeStochValues.d !== null && activeStochValues.d !== undefined ? activeStochValues.d.toFixed(2) : '-'}
            </span>
            <button
              type="button"
              onClick={openStochModal}
              className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Buka Pengaturan Stoch (Inputs: %K Length 14, %K Smoothing 3, %D Smoothing 3)"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 2. Label Sisi Kanan yang Ringkas, Seragam, Anti-Tabrakan + Tooltip Hover */}
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

        {/* 3. Tooltip Interaktif Saat Hover pada Label Garis */}
        {hoveredLevel && (
          <div
            style={{
              top: `${Math.min(Math.max(16, hoveredLevel.y - 24), mainPaneMaxY - 90)}px`,
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

        {/* 4. Modal Pengaturan Stoch (Persis Sesuai Gambar TradingView: Inputs / Style / Visibility) */}
        {showStochModal && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-xs">
            <div className="w-[360px] rounded-xl bg-[#131722] border border-[#2a2e39] shadow-2xl text-slate-200 font-sans overflow-hidden">
              {/* Header Modal: "Stoch" */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <h3 className="text-lg font-bold text-white tracking-tight">Stoch</h3>
                <button
                  type="button"
                  onClick={() => setShowStochModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs: Inputs | Style | Visibility */}
              <div className="flex items-center gap-6 px-5 border-b border-[#2a2e39] text-sm font-semibold">
                {[
                  { id: 'inputs', label: 'Inputs' },
                  { id: 'style', label: 'Style' },
                  { id: 'visibility', label: 'Visibility' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStochModalTab(tab.id)}
                    className={`py-2.5 border-b-2 transition-colors cursor-pointer ${
                      stochModalTab === tab.id
                        ? 'border-white text-white'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Body Modal */}
              <form onSubmit={applyStochSettings} className="p-5 space-y-4">
                {stochModalTab === 'inputs' && (
                  <div className="space-y-4 text-sm">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 font-medium">%K Length</label>
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={draftStoch.kLength}
                        onChange={(e) =>
                          setDraftStoch((prev) => ({ ...prev, kLength: e.target.value }))
                        }
                        className="w-28 px-3 py-1.5 rounded-md bg-[#1e222d] border border-[#363a45] text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 font-medium">%K Smoothing</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={draftStoch.kSmoothing}
                        onChange={(e) =>
                          setDraftStoch((prev) => ({ ...prev, kSmoothing: e.target.value }))
                        }
                        className="w-28 px-3 py-1.5 rounded-md bg-[#1e222d] border border-[#363a45] text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 font-medium">%D Smoothing</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={draftStoch.dSmoothing}
                        onChange={(e) =>
                          setDraftStoch((prev) => ({ ...prev, dSmoothing: e.target.value }))
                        }
                        className="w-28 px-3 py-1.5 rounded-md bg-[#1e222d] border border-[#363a45] text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}

                {stochModalTab === 'style' && (
                  <div className="space-y-3.5 text-sm">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-slate-300">
                        <input
                          type="checkbox"
                          checked={draftStoch.showK}
                          onChange={(e) =>
                            setDraftStoch((prev) => ({ ...prev, showK: e.target.checked }))
                          }
                          className="rounded accent-blue-500"
                        />
                        <span>%K Line</span>
                      </label>
                      <input
                        type="color"
                        value={draftStoch.kColor}
                        onChange={(e) =>
                          setDraftStoch((prev) => ({ ...prev, kColor: e.target.value }))
                        }
                        className="w-8 h-7 rounded bg-transparent border border-[#363a45] cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-slate-300">
                        <input
                          type="checkbox"
                          checked={draftStoch.showD}
                          onChange={(e) =>
                            setDraftStoch((prev) => ({ ...prev, showD: e.target.checked }))
                          }
                          className="rounded accent-blue-500"
                        />
                        <span>%D Line</span>
                      </label>
                      <input
                        type="color"
                        value={draftStoch.dColor}
                        onChange={(e) =>
                          setDraftStoch((prev) => ({ ...prev, dColor: e.target.value }))
                        }
                        className="w-8 h-7 rounded bg-transparent border border-[#363a45] cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-slate-300">Upper Band</label>
                      <input
                        type="number"
                        value={draftStoch.upperBand}
                        onChange={(e) =>
                          setDraftStoch((prev) => ({ ...prev, upperBand: Number(e.target.value) || 80 }))
                        }
                        className="w-24 px-2.5 py-1 rounded bg-[#1e222d] border border-[#363a45] text-white font-mono text-xs"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-slate-300">Lower Band</label>
                      <input
                        type="number"
                        value={draftStoch.lowerBand}
                        onChange={(e) =>
                          setDraftStoch((prev) => ({ ...prev, lowerBand: Number(e.target.value) || 20 }))
                        }
                        className="w-24 px-2.5 py-1 rounded bg-[#1e222d] border border-[#363a45] text-white font-mono text-xs"
                      />
                    </div>
                  </div>
                )}

                {stochModalTab === 'visibility' && (
                  <div className="space-y-2.5 text-xs text-slate-300">
                    {['Seconds', 'Minutes', 'Hours', 'Days', 'Weeks', 'Months'].map((tf) => (
                      <label key={tf} className="flex items-center justify-between py-1">
                        <span className="flex items-center gap-2">
                          <input type="checkbox" defaultChecked className="rounded accent-blue-500" />
                          <span>{tf}</span>
                        </span>
                        <span className="text-slate-500 font-mono">Aktif</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-[#2a2e39]">
                  <button
                    type="button"
                    onClick={resetStochDefaults}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Defaults (14, 3, 3)</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowStochModal(false)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:bg-white/5 border border-[#363a45] cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default TradingViewChart;
