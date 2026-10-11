import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Sparkles, TrendingUp, TrendingDown, Eye, Layers, ArrowRight } from 'lucide-react';

function smoothSeries(arr, window = 5) {
  const result = [];
  const half = Math.floor(window / 2);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j];
      count++;
    }
    result.push(sum / count);
  }
  return result;
}

function formatPrice(val, decimals = 2) {
  if (typeof val !== 'number' || isNaN(val)) return '—';
  const dec = val < 0.1 ? 6 : val < 10 ? 4 : decimals;
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function formatTime(t) {
  if (!t) return '';
  const num = Number(t);
  if (!isNaN(num) && num > 10000000) {
    const ms = num < 10000000000 ? num * 1000 : num;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
  }
  if (typeof t === 'string') {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return t;
  }
  return String(t);
}

export default function PatternMatchLargeChart({
  patternResult = null,
  probeValues = [],
  height = 520,
  showControls = true,
  className = '',
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  const [showPatternLine, setShowPatternLine] = useState(true);
  const [showChannels, setShowChannels] = useState(true);
  const [showProjection, setShowProjection] = useState(true);
  const [hoverData, setHoverData] = useState(null);

  const candles = Array.isArray(patternResult?.candles) ? patternResult.candles : [];
  const rawPrices = Array.isArray(patternResult?.raw_prices) ? patternResult.raw_prices : [];
  const forwardPrices = Array.isArray(patternResult?.forward_prices) ? patternResult.forward_prices : [];
  const activeProbe = Array.isArray(probeValues) && probeValues.length > 1
    ? probeValues
    : (Array.isArray(patternResult?.probe_values) && patternResult.probe_values.length > 1
        ? patternResult.probe_values
        : (patternResult?.segment_values || []));

  // Resolved candle list
  let candData = candles.length >= 2 ? [...candles] : [];
  if (candData.length === 0 && rawPrices.length >= 2) {
    candData = rawPrices.map((close, i) => {
      const prev = i > 0 ? rawPrices[i - 1] : close;
      const spread = Math.abs(close - prev) || close * 0.003;
      const open = prev;
      const high = Math.max(open, close) + spread * 0.4;
      const low = Math.min(open, close) - spread * 0.4;
      return { open, high, low, close, time: '' };
    });
  }

  const N = candData.length;
  const lastClose = N > 0 ? candData[N - 1].close : (patternResult?.current_price || 100);

  // Forward projection
  let projPrices = forwardPrices.length > 0 ? [...forwardPrices] : [];
  if (projPrices.length === 0 && Array.isArray(patternResult?.forward_values) && patternResult.forward_values.length > 0) {
    projPrices = patternResult.forward_values.map((pct) => lastClose * (1 + pct / 100));
  }
  const M = showProjection ? projPrices.length : 0;
  const totalSlots = Math.max(1, N + M);

  // Bounds
  const candLows = candData.map((c) => c.low);
  const candHighs = candData.map((c) => c.high);
  const cMin = candLows.length > 0 ? Math.min(...candLows) : 0;
  const cMax = candHighs.length > 0 ? Math.max(...candHighs) : 100;
  const fMin = M > 0 ? Math.min(...projPrices) : cMin;
  const fMax = M > 0 ? Math.max(...projPrices) : cMax;
  const globalMin = Math.min(cMin, fMin);
  const globalMax = Math.max(cMax, fMax);
  const pRange = globalMax - globalMin || 1;
  const padPrice = pRange * 0.10;
  const minY = globalMin - padPrice;
  const maxY = globalMax + padPrice;
  const priceSpan = maxY - minY;

  const padLeft = 14;
  const padRight = 65; // space for price axis
  const padTop = 26;
  const padBot = 28;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || N < 2) return;

    const rect = container.getBoundingClientRect();
    const W = rect.width || 720;
    const H = height;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Dark sleek background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0e0e1c');
    bgGrad.addColorStop(0.5, '#0a0a14');
    bgGrad.addColorStop(1, '#05050d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const innerW = Math.max(10, W - padLeft - padRight);
    const innerH = Math.max(10, H - padTop - padBot);

    const toY = (price) => padTop + innerH - ((price - minY) / priceSpan) * innerH;
    const stepX = innerW / totalSlots;

    // 1. Grid & Price Axis
    ctx.lineWidth = 0.5;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';

    const numTicks = 6;
    for (let i = 0; i <= numTicks; i++) {
      const pVal = minY + (priceSpan / numTicks) * i;
      const y = toY(pVal);

      // Horizontal grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + innerW, y);
      ctx.stroke();

      // Right axis label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillText(formatPrice(pVal), padLeft + innerW + 6, y + 3.5);
    }

    // Time Axis (X) Grid & Labels
    const timeTickInterval = Math.max(1, Math.floor(N / 5));
    ctx.textAlign = 'center';
    for (let i = 0; i < N; i += timeTickInterval) {
      const cx = padLeft + (i + 0.5) * stepX;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.beginPath();
      ctx.moveTo(cx, padTop);
      ctx.lineTo(cx, padTop + innerH);
      ctx.stroke();

      if (candData[i].time) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
        ctx.fillText(formatTime(candData[i].time), cx, padTop + innerH + 16);
      }
    }

    // 2. Channel Envelopes
    if (showChannels) {
      const smoothWindow = Math.max(4, Math.floor(N / 7));
      const highArr = candData.map((c) => c.high);
      const lowArr = candData.map((c) => c.low);
      const smoothedHighs = smoothSeries(highArr, smoothWindow);
      const smoothedLows = smoothSeries(lowArr, smoothWindow);
      const avgRange = highArr.reduce((s, h, i) => s + (h - lowArr[i]), 0) / N;
      const envelopeFactor = avgRange * 0.65;

      const upperEnvelope = smoothedHighs.map((h) => h + envelopeFactor);
      const lowerEnvelope = smoothedLows.map((l) => l - envelopeFactor);

      // Corridor fill
      ctx.save();
      ctx.globalAlpha = 0.035;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const cx = padLeft + (i + 0.5) * stepX;
        const uy = toY(upperEnvelope[i]);
        if (i === 0) ctx.moveTo(cx, uy);
        else ctx.lineTo(cx, uy);
      }
      for (let i = N - 1; i >= 0; i--) {
        const cx = padLeft + (i + 0.5) * stepX;
        const ly = toY(lowerEnvelope[i]);
        ctx.lineTo(cx, ly);
      }
      ctx.closePath();
      ctx.fillStyle = '#6366f1';
      ctx.fill();
      ctx.restore();

      // Upper red dashed line
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#e74c4c';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(231, 76, 76, 0.4)';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const cx = padLeft + (i + 0.5) * stepX;
        const uy = toY(upperEnvelope[i]);
        if (i === 0) ctx.moveTo(cx, uy);
        else ctx.lineTo(cx, uy);
      }
      ctx.stroke();
      ctx.restore();

      // Lower green dashed line
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#2ecc71';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(46, 204, 113, 0.4)';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const cx = padLeft + (i + 0.5) * stepX;
        const ly = toY(lowerEnvelope[i]);
        if (i === 0) ctx.moveTo(cx, ly);
        else ctx.lineTo(cx, ly);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 3. Candlesticks (Market Data)
    const candleW = Math.max(2, Math.min(10, stepX * 0.74));
    const wickW = Math.max(1, Math.min(2, candleW * 0.28));

    candData.forEach((c, i) => {
      const cx = padLeft + (i + 0.5) * stepX;
      const yOpen = toY(c.open);
      const yClose = toY(c.close);
      const yHigh = toY(c.high);
      const yLow = toY(c.low);
      const isBull = c.close >= c.open;

      const bodyColor = isBull ? '#26a69a' : '#ef5350';
      const wickColor = isBull ? 'rgba(38, 166, 154, 0.95)' : 'rgba(239, 83, 80, 0.95)';

      // Wick
      ctx.beginPath();
      ctx.strokeStyle = wickColor;
      ctx.lineWidth = wickW;
      ctx.moveTo(cx, yHigh);
      ctx.lineTo(cx, yLow);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(1.8, Math.abs(yClose - yOpen));
      ctx.fillStyle = bodyColor;
      ctx.fillRect(cx - candleW / 2, bodyTop, candleW, bodyH);

      // Body border
      ctx.strokeStyle = isBull ? 'rgba(38, 166, 154, 0.8)' : 'rgba(239, 83, 80, 0.8)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(cx - candleW / 2, bodyTop, candleW, bodyH);
    });

    // 4. Yellow Drawn Pattern Overlay
    if (showPatternLine && activeProbe.length > 1) {
      ctx.save();
      // Outer neon yellow glow
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3.2;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.85)';
      ctx.shadowBlur = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      activeProbe.forEach((pv, k) => {
        const u = k / (activeProbe.length - 1);
        const px = padLeft + (u * (N - 1) + 0.5) * stepX;
        const mappedPrice = cMin + pv * (cMax - cMin);
        const py = toY(mappedPrice);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // Secondary brighter glow pass
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 235, 59, 0.4)';
      ctx.lineWidth = 6.0;
      ctx.stroke();

      // Core crisp line
      ctx.strokeStyle = '#FFF59D';
      ctx.lineWidth = 2.0;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.9)';
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.restore();
    }

    // 5. Divider between live match and forward projection
    if (M > 0) {
      const divX = padLeft + N * stepX;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(divX, padTop);
      ctx.lineTo(divX, padTop + innerH);
      ctx.stroke();
      ctx.restore();

      // Label
      ctx.save();
      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.textAlign = 'left';
      ctx.fillText('PROYEKSI LANJUTAN ▸', divX + 6, padTop + 14);
      ctx.restore();

      // Forward Projection Path
      const startX = padLeft + (N - 1 + 0.5) * stepX;
      const startY = toY(lastClose);
      const endPrice = projPrices[projPrices.length - 1];
      const isBullFwd = endPrice >= lastClose;
      const fwdColor = isBullFwd ? '#2ecc71' : '#e74c4c';

      // Gradient fill below
      ctx.save();
      const fwdGrad = ctx.createLinearGradient(startX, padTop, padLeft + (N + M - 0.5) * stepX, padTop + innerH);
      fwdGrad.addColorStop(0, isBullFwd ? 'rgba(46, 204, 113, 0.12)' : 'rgba(231, 76, 76, 0.12)');
      fwdGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fwdGrad;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      projPrices.forEach((fp, j) => {
        const fx = padLeft + (N + j + 0.5) * stepX;
        ctx.lineTo(fx, toY(fp));
      });
      ctx.lineTo(padLeft + (N + M - 0.5) * stepX, startY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Dashed line
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = fwdColor;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = fwdColor;
      ctx.shadowBlur = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      projPrices.forEach((fp, j) => {
        const fx = padLeft + (N + j + 0.5) * stepX;
        ctx.lineTo(fx, toY(fp));
      });
      ctx.stroke();
      ctx.restore();

      // End target dot
      const endX = padLeft + (N + projPrices.length - 1 + 0.5) * stepX;
      const endY = toY(endPrice);
      ctx.save();
      ctx.beginPath();
      ctx.arc(endX, endY, 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = fwdColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(endX, endY, 3, 0, Math.PI * 2);
      ctx.fillStyle = fwdColor;
      ctx.shadowColor = fwdColor;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();

      // Live anchor dot
      ctx.save();
      ctx.beginPath();
      ctx.arc(startX, startY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();
    }

    // Top Label
    ctx.save();
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.textAlign = 'left';
    ctx.fillText('POLA MATCH TERKONFIRMASI', padLeft + 6, padTop + 14);
    ctx.restore();

    // 6. Interactive Crosshair Hover
    if (hoverData) {
      const hX = hoverData.x;
      const hY = hoverData.y;

      // Vertical crosshair
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hX, padTop);
      ctx.lineTo(hX, padTop + innerH);
      ctx.stroke();

      // Horizontal price line
      ctx.beginPath();
      ctx.moveTo(padLeft, hY);
      ctx.lineTo(padLeft + innerW, hY);
      ctx.stroke();
      ctx.restore();

      // Highlight point
      ctx.save();
      ctx.beginPath();
      ctx.arc(hX, hY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    }

  }, [candData, N, totalSlots, M, cMin, cMax, minY, priceSpan, padLeft, padRight, padTop, padBot, height, showChannels, showPatternLine, showProjection, activeProbe, projPrices, lastClose, hoverData]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Pointer Move for Crosshair
  const handlePointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || N < 2) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const innerW = rect.width - padLeft - padRight;
    const stepX = innerW / totalSlots;
    const relX = clientX - padLeft;
    if (relX < 0 || relX > innerW) {
      setHoverData(null);
      return;
    }

    const idx = Math.floor(relX / stepX);
    if (idx >= 0 && idx < N) {
      const c = candData[idx];
      const cx = padLeft + (idx + 0.5) * stepX;
      const cy = padTop + (rect.height - padTop - padBot) - ((c.close - minY) / priceSpan) * (rect.height - padTop - padBot);
      setHoverData({
        idx,
        x: cx,
        y: cy,
        candle: c,
        isProjection: false,
      });
    } else if (idx >= N && idx < totalSlots) {
      const fIdx = idx - N;
      const fPrice = projPrices[fIdx];
      const cx = padLeft + (idx + 0.5) * stepX;
      const cy = padTop + (rect.height - padTop - padBot) - ((fPrice - minY) / priceSpan) * (rect.height - padTop - padBot);
      setHoverData({
        idx,
        x: cx,
        y: cy,
        price: fPrice,
        isProjection: true,
        step: fIdx + 1,
      });
    } else {
      setHoverData(null);
    }
  };

  const handlePointerLeave = () => {
    setHoverData(null);
  };

  return (
    <div className={`space-y-3 font-body ${className}`}>
      {/* 1. Header Toolbar & Real-Time Hover Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2 rounded-lg bg-surface-container-high border border-outline-variant/50 text-xs font-mono">
        {hoverData ? (
          <div className="flex flex-wrap items-center gap-3">
            {hoverData.isProjection ? (
              <span className="text-secondary font-semibold">
                Proyeksi Bar +{hoverData.step}: <strong className="text-on-surface">{formatPrice(hoverData.price)}</strong>
              </span>
            ) : (
              <>
                <span className="text-secondary">
                  Waktu: <strong className="text-on-surface">{formatTime(hoverData.candle.time) || `Bar #${hoverData.idx + 1}`}</strong>
                </span>
                <span>O: <strong className="text-on-surface">{formatPrice(hoverData.candle.open)}</strong></span>
                <span>H: <strong className="text-tertiary">{formatPrice(hoverData.candle.high)}</strong></span>
                <span>L: <strong className="text-error">{formatPrice(hoverData.candle.low)}</strong></span>
                <span>C: <strong className={hoverData.candle.close >= hoverData.candle.open ? 'text-tertiary' : 'text-error'}>{formatPrice(hoverData.candle.close)}</strong></span>
                <span className={hoverData.candle.close >= hoverData.candle.open ? 'text-tertiary' : 'text-error'}>
                  {(((hoverData.candle.close / (hoverData.candle.open || 1)) - 1) * 100).toFixed(2)}%
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-on-surface-variant">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Formasi: <strong className="text-on-surface">{patternResult?.pattern_name || 'Pola Geometris'}</strong></span>
            <span>•</span>
            <span>Jumlah Lilin: <strong className="text-primary">{N} Bar</strong></span>
            <span>•</span>
            <span>Akurasi: <strong className="text-tertiary">{Math.round((patternResult?.match_score || 0.75) * 100)}%</strong></span>
          </div>
        )}

        {/* Layer Toggles */}
        {showControls && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowPatternLine(!showPatternLine)}
              className={`px-2 py-1 rounded text-[11px] transition-colors flex items-center gap-1 ${
                showPatternLine
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/30'
              }`}
              title="Tampilkan / Sembunyikan Pola Input Gambaran Anda"
            >
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              <span>Garis Pola</span>
            </button>

            <button
              onClick={() => setShowChannels(!showChannels)}
              className={`px-2 py-1 rounded text-[11px] transition-colors flex items-center gap-1 ${
                showChannels
                  ? 'bg-primary-container/20 text-primary border border-primary/40'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/30'
              }`}
              title="Tampilkan / Sembunyikan Channel Atas & Bawah"
            >
              <Layers className="w-3 h-3" />
              <span>Channel</span>
            </button>

            {projPrices.length > 0 && (
              <button
                onClick={() => setShowProjection(!showProjection)}
                className={`px-2 py-1 rounded text-[11px] transition-colors flex items-center gap-1 ${
                  showProjection
                    ? 'bg-tertiary-container/30 text-tertiary border border-tertiary/40'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/30'
                }`}
                title="Tampilkan / Sembunyikan Proyeksi Masa Depan"
              >
                <TrendingUp className="w-3 h-3" />
                <span>Proyeksi</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. Interactive Canvas Container */}
      <div
        ref={containerRef}
        className="w-full relative rounded-xl overflow-hidden shadow-2xl border border-white/[0.08] cursor-crosshair select-none"
        style={{ height: `${height}px`, background: '#0a0a14' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* 3. Legend & Action Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-[11px] font-mono text-on-surface-variant">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5">
              <span className="w-1.5 h-3 rounded-xs" style={{ background: '#26a69a' }} />
              <span className="w-1.5 h-2 rounded-xs" style={{ background: '#ef5350' }} />
            </span>
            <span className="text-white/80">Lilin Pasar ({N} Bar)</span>
          </span>

          <span className="flex items-center gap-1.5">
            <span className="w-4 h-[2.5px] rounded-full" style={{ background: '#FFD700', boxShadow: '0 0 6px #FFD700' }} />
            <span style={{ color: '#FFD700' }}>Pola Input Gambar Anda</span>
          </span>

          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0 border-b-[2px] border-dashed" style={{ borderColor: '#e74c4c' }} />
            <span style={{ color: '#e74c4c' }}>Batas Atas (Resistance)</span>
          </span>

          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0 border-b-[2px] border-dashed" style={{ borderColor: '#2ecc71' }} />
            <span style={{ color: '#2ecc71' }}>Batas Bawah (Support)</span>
          </span>

          {M > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0 border-b-[2px] border-dashed border-tertiary" />
              <span className="text-tertiary">Proyeksi {M} Bar</span>
            </span>
          )}
        </div>

        {patternResult?.formation_status && (
          <span className="text-primary font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>{patternResult.formation_status}</span>
          </span>
        )}
      </div>
    </div>
  );
}
