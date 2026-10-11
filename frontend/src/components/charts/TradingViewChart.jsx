import React, { useEffect, useRef, useState, useMemo } from 'react';
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

function roundFloat(val, decimals = 2) {
  const p = Math.pow(10, decimals);
  return Math.round(val * p) / p;
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

const FIB_COLORS = {
  '0': '#94a3b8',
  '0.5': '#22d3ee',
  '0.618': '#facc15',
  '1': '#94a3b8',
  '1.272': '#f472b6',
  '1.618': '#c084fc',
};

const TradingViewChart = React.memo(function TradingViewChart({
  data = [],
  ohlcvData = null,
  trendlines = {},
  tpSl = null,
  levels = null,
  liveTick = null,
  height = 460,
  chartHeight = null,
  fibonacci = null,
  targets = [],
}) {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const ema20SeriesRef = useRef(null);
  const ema50SeriesRef = useRef(null);
  const lastCandleRef = useRef(null);

  const [hoverInfo, setHoverInfo] = useState(null);
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(false);
  const [showFib, setShowFib] = useState(true);
  const [showTargets, setShowTargets] = useState(true);
  const [showStoch, setShowStoch] = useState(true);

  // Fallback to alias props
  const candlesSource = (ohlcvData && ohlcvData.length > 0) ? ohlcvData : data;
  const activeTpSl = tpSl || levels;
  const activeHeight = chartHeight || height;

  // Deteksi format desimal aset (forex 4 desimal, saham/crypto 2 desimal)
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

  const lastCandle = formattedCandles.length > 0 ? formattedCandles[formattedCandles.length - 1] : null;

  // Render chart canvas
  useEffect(() => {
    if (!chartContainerRef.current || !candlesSource || candlesSource.length === 0) return;

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
        vertLines: { color: 'rgba(39, 39, 42, 0.45)' },
        horzLines: { color: 'rgba(39, 39, 42, 0.45)' },
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
      },
      rightPriceScale: {
        borderColor: '#27272a',
        autoScale: true,
      },
    });

    chartInstanceRef.current = chart;

    // Series Candlestick (TradingView authentic look)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#ef4444',
      borderVisible: true,
      borderUpColor: '#34d399',
      borderDownColor: '#ef4444',
      wickUpColor: '#34d399',
      wickDownColor: '#ef4444',
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

    // Series Volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#3b82f6',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });
    volumeSeriesRef.current = volumeSeries;

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    const formattedVolume = data.map((d) => ({
      time: normalizeTime(d.time),
      value: Number(d.volume) || 0,
      color: Number(d.close) >= Number(d.open) ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)',
    }));
    volumeSeries.setData(formattedVolume);

    // EMA 20 Overlay
    const ema20Data = calculateEMA(formattedCandles, 20);
    const ema20Series = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1.5,
      lineStyle: LineStyle.Solid,
      title: 'EMA 20',
      visible: showEma20,
    });
    ema20Series.setData(ema20Data);
    ema20SeriesRef.current = ema20Series;

    // EMA 50 Overlay
    const ema50Data = calculateEMA(formattedCandles, 50);
    const ema50Series = chart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 1.5,
      lineStyle: LineStyle.Solid,
      title: 'EMA 50',
      visible: showEma50,
    });
    ema50Series.setData(ema50Data);
    ema50SeriesRef.current = ema50Series;

    // Dynamic TP / SL Price Lines
    if (tpSl) {
      const isShort = Boolean(
        tpSl.is_bearish ||
        tpSl.direction === 'SHORT' ||
        (tpSl.tp && tpSl.breakout_price && Number(tpSl.tp) < Number(tpSl.breakout_price))
      );
      const entryLabel = isShort ? `Short Entry $${tpSl.breakout_price}` : `Long Entry $${tpSl.breakout_price}`;
      const tpLabel = isShort ? `TP (Short) $${tpSl.tp}` : `TP (Long) $${tpSl.tp}`;
      const slLabel = isShort ? `SL (Short) $${tpSl.sl}` : `SL (Long) $${tpSl.sl}`;

      if (tpSl.tp) {
        candleSeries.createPriceLine({
          price: Number(tpSl.tp),
          color: '#10b981',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: tpLabel,
        });
      }
      if (tpSl.sl) {
        candleSeries.createPriceLine({
          price: Number(tpSl.sl),
          color: '#ef4444',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: slLabel,
        });
      }
      if (tpSl.breakout_price) {
        candleSeries.createPriceLine({
          price: Number(tpSl.breakout_price),
          color: '#3b82f6',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: entryLabel,
        });
      }
    }

    const firstTime = formattedCandles.length ? formattedCandles[0].time : null;
    const lastTime = formattedCandles.length ? formattedCandles[formattedCandles.length - 1].time : null;
    const timeKey = (t) => (typeof t === 'number' ? t : new Date(t).getTime() / 1000);
    const clampTime = (t) => {
      const nt = normalizeTime(t);
      if (firstTime === null) return nt;
      return timeKey(nt) < timeKey(firstTime) ? firstTime : nt;
    };

    // Fibonacci Retracement (anchor Swing Low -> Swing High / Swing High -> Swing Low)
    if (showFib && fibonacci?.levels?.length && fibonacci.start && fibonacci.end && lastTime !== null) {
      const startT = clampTime(fibonacci.start.time);
      const endT = clampTime(fibonacci.end.time);
      if (timeKey(startT) < timeKey(lastTime)) {
        // Garis anchor diagonal (arah tarikan fibo)
        if (timeKey(startT) < timeKey(endT)) {
          const anchor = chart.addSeries(LineSeries, {
            color: 'rgba(250, 204, 21, 0.55)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });
          anchor.setData([
            { time: startT, value: Number(fibonacci.start.price) },
            { time: endT, value: Number(fibonacci.end.price) },
          ]);
        }
        fibonacci.levels.forEach((lv) => {
          const s = chart.addSeries(LineSeries, {
            color: FIB_COLORS[lv.label] || '#94a3b8',
            lineWidth: lv.label === '0.618' || lv.label === '0.5' ? 2 : 1,
            lineStyle: LineStyle.Solid,
            title: `Fib ${lv.label}`,
            lastValueVisible: true,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });
          s.setData([
            { time: startT, value: Number(lv.price) },
            { time: lastTime, value: Number(lv.price) },
          ]);
        });
        // Extension (target lanjutan searah tren) mulai dari titik akhir leg
        (fibonacci.extensions || []).forEach((ex) => {
          if (timeKey(endT) >= timeKey(lastTime)) return;
          const s = chart.addSeries(LineSeries, {
            color: FIB_COLORS[ex.label] || '#f472b6',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: `Ext ${ex.label}`,
            lastValueVisible: true,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });
          s.setData([
            { time: endT, value: Number(ex.price) },
            { time: lastTime, value: Number(ex.price) },
          ]);
        });
      }
    }

    // Target Zones (garis horizontal "harga akan menuju ke sini")
    if (showTargets && Array.isArray(targets)) {
      targets.forEach((t) => {
        candleSeries.createPriceLine({
          price: Number(t.price),
          color: '#38bdf8',
          lineWidth: 2,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: `🎯 ${t.label} ${Number(t.price).toFixed(decimals)}`,
        });
      });
    }

    // Stochastic 14 3 3 di panel terpisah (pane 1)
    if (showStoch) {
      const { k, d } = calculateStochastic(formattedCandles, 14, 3, 3);
      if (k.length) {
        const kSeries = chart.addSeries(
          LineSeries,
          { color: '#3b82f6', lineWidth: 1.5, title: '%K', priceLineVisible: false },
          1
        );
        const dSeries = chart.addSeries(
          LineSeries,
          { color: '#f97316', lineWidth: 1.5, title: '%D', priceLineVisible: false },
          1
        );
        kSeries.setData(k);
        dSeries.setData(d);
        [80, 20].forEach((lvl) =>
          kSeries.createPriceLine({
            price: lvl,
            color: lvl === 80 ? 'rgba(239,68,68,0.6)' : 'rgba(16,185,129,0.6)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: lvl === 80 ? 'OB' : 'OS',
          })
        );
        try {
          const panes = chart.panes();
          if (panes[1]) panes[1].setHeight(Math.round(activeHeight * 0.22));
        } catch (e) {
          /* pane API tidak tersedia */
        }
      }
    }

    chart.timeScale().fitContent();

    // Crosshair hover listener untuk OHLCV Legend Bar
    chart.subscribeCrosshairMove((param) => {
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

    // Resize observer
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
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
  }, [formattedCandles, trendlines, tpSl, height, decimals, minMove, fibonacci, targets, showFib, showTargets, showStoch]);

  // Update EMA visibility saat toggle berubah
  useEffect(() => {
    if (ema20SeriesRef.current) {
      ema20SeriesRef.current.applyOptions({ visible: showEma20 });
    }
  }, [showEma20]);

  useEffect(() => {
    if (ema50SeriesRef.current) {
      ema50SeriesRef.current.applyOptions({ visible: showEma50 });
    }
  }, [showEma50]);

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
        color: p >= last.open ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)',
      });
    }
  }, [liveTick]);

  // Nilai yang ditampilkan di header legend (hoverInfo jika ada, atau last candle)
  const displayOhlc = hoverInfo || (lastCandle ? {
    open: lastCandle.open,
    high: lastCandle.high,
    low: lastCandle.low,
    close: lastCandle.close,
    change: lastCandle.open ? ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100 : 0,
    volume: data[data.length - 1]?.volume || 0,
  } : null);

  const formatPrice = (v) => {
    if (v === null || v === undefined) return '-';
    return Number(v).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  return (
    <div className="w-full relative rounded-2xl overflow-hidden border border-slate-800/80 bg-[#090d16] shadow-2xl">
      {/* Top Toolbar: OHLCV Legend & Quick Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md">
        {/* OHLCV Legend */}
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
              className={`font-bold px-1.5 py-0.2 rounded text-[11px] ${
                displayOhlc.change >= 0
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-rose-500/15 text-rose-400'
              }`}
            >
              {displayOhlc.change >= 0 ? '+' : ''}
              {displayOhlc.change.toFixed(2)}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-slate-500">Arahkan kursor ke grafik untuk melihat OHLCV</span>
        )}

        {/* Indicator Toggles & Legend Badges */}
        <div className="flex items-center space-x-2 text-[11px]">
          {/* EMA 20 Toggle */}
          <button
            onClick={() => setShowEma20((prev) => !prev)}
            className={`px-2 py-0.5 rounded font-mono font-medium transition-all ${
              showEma20
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-500 border border-transparent hover:text-slate-300'
            }`}
          >
            EMA 20
          </button>

          {/* EMA 50 Toggle */}
          <button
            onClick={() => setShowEma50((prev) => !prev)}
            className={`px-2 py-0.5 rounded font-mono font-medium transition-all ${
              showEma50
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-500 border border-transparent hover:text-slate-300'
            }`}
          >
            EMA 50
          </button>

          {/* Fibonacci Toggle */}
          <button
            onClick={() => setShowFib((prev) => !prev)}
            className={`px-2 py-0.5 rounded font-mono font-medium transition-all ${
              showFib
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-500 border border-transparent hover:text-slate-300'
            }`}
            title="Fibonacci 0 / 0.5 / 0.618 / 1 + Extension 1.272 / 1.618"
          >
            FIBO
          </button>

          {/* Target Toggle */}
          <button
            onClick={() => setShowTargets((prev) => !prev)}
            className={`px-2 py-0.5 rounded font-mono font-medium transition-all ${
              showTargets
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-500 border border-transparent hover:text-slate-300'
            }`}
            title="Zona target teknikal (konfluensi Fibonacci + Support/Resistance)"
          >
            TARGET
          </button>

          {/* Stoch Toggle */}
          <button
            onClick={() => setShowStoch((prev) => !prev)}
            className={`px-2 py-0.5 rounded font-mono font-medium transition-all ${
              showStoch
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-500 border border-transparent hover:text-slate-300'
            }`}
            title="Stochastic 14 3 3"
          >
            STOCH
          </button>

          <div className="hidden sm:flex items-center space-x-2 pl-2 border-l border-slate-800 text-slate-400">
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>TP</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>SL</span>
            </span>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
    </div>
  );
});

export default TradingViewChart;
