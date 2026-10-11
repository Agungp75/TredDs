import React, { useRef, useEffect, useCallback, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, ArrowRight, Sparkles, Maximize2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PatternMatchLargeChart from './PatternMatchLargeChart';

const VERDICT_CONFIG = {
  BULLISH: {
    label: 'Bullish',
    color: 'text-tertiary',
    bg: 'bg-tertiary-container/30 text-tertiary border-tertiary/20',
    Icon: TrendingUp,
  },
  BEARISH: {
    label: 'Bearish',
    color: 'text-error',
    bg: 'bg-error-container text-error border-error/20',
    Icon: TrendingDown,
  },
  NEUTRAL: {
    label: 'Neutral',
    color: 'text-on-surface-variant',
    bg: 'bg-surface-container-highest text-on-surface-variant border-outline-variant',
    Icon: Minus,
  },
};

function formatMatchDate(val) {
  if (!val) return 'Kemarin';
  const num = Number(val);
  if (!isNaN(num) && num > 10000000) {
    const ms = num < 10000000000 ? num * 1000 : num;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    }
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    }
    return val.split(' ')[0] || val;
  }
  return 'Kemarin';
}

/**
 * OverlayCandleSparkline — Premium Pattern Match Chart
 * =====================================================
 * Referensi visual:
 *   - Garis KUNING SOLID  = Pola yang digambar user (input pattern)
 *   - CANDLESTICK          = Data pasar aktual yang ditemukan sistem
 *   - Garis MERAH PUTUS    = Envelope atas (upper channel / Bollinger-like)
 *   - Garis HIJAU PUTUS    = Envelope bawah (lower channel / Bollinger-like)
 *   - Garis PROYEKSI       = Proyeksi masa depan (dashed forward)
 */

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

function OverlayCandleSparkline({
  candles = [],
  probeValues = [],
  segmentValues = [],
  forwardValues = [],
  forwardPrices = [],
  currentPrice = null,
  rawPrices = [],
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const W = rect.width || 360;
    const H = rect.height || 180;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // --- Dark gradient background ---
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0d0d1a');
    bgGrad.addColorStop(0.5, '#0a0a14');
    bgGrad.addColorStop(1, '#060610');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 1. Resolve Candle Data (OHLC)
    let candData = Array.isArray(candles) && candles.length >= 2 ? [...candles] : [];

    if (candData.length === 0) {
      if (Array.isArray(rawPrices) && rawPrices.length >= 2) {
        candData = rawPrices.map((close, i) => {
          const prev = i > 0 ? rawPrices[i - 1] : close;
          const bodySpread = Math.abs(close - prev) || close * 0.003;
          const open = prev;
          const high = Math.max(open, close) + bodySpread * (0.3 + ((i * 7) % 5) * 0.1);
          const low = Math.min(open, close) - bodySpread * (0.3 + ((i * 11) % 5) * 0.1);
          return { open, high, low, close, time: '' };
        });
      } else if (Array.isArray(segmentValues) && segmentValues.length >= 2) {
        const base = typeof currentPrice === 'number' && currentPrice > 0 ? currentPrice : 100;
        candData = segmentValues.map((v, i) => {
          const close = base * (0.88 + v * 0.24);
          const prev = i > 0 ? base * (0.88 + segmentValues[i - 1] * 0.24) : close;
          const open = prev;
          const high = Math.max(open, close) * 1.006;
          const low = Math.min(open, close) * 0.994;
          return { open, high, low, close, time: '' };
        });
      } else if (Array.isArray(probeValues) && probeValues.length >= 2) {
        const base = typeof currentPrice === 'number' && currentPrice > 0 ? currentPrice : 100;
        candData = probeValues.map((v, i) => {
          const close = base * (0.88 + v * 0.24);
          const prev = i > 0 ? base * (0.88 + probeValues[i - 1] * 0.24) : close;
          const open = prev;
          const high = Math.max(open, close) * 1.005;
          const low = Math.min(open, close) * 0.995;
          return { open, high, low, close, time: '' };
        });
      }
    }

    if (candData.length < 2) return;

    const N = candData.length;
    const lastCandle = candData[N - 1];
    const lastClose = lastCandle.close;

    // 2. Forward projection prices
    let projPrices = Array.isArray(forwardPrices) && forwardPrices.length > 0 ? [...forwardPrices] : [];
    if (projPrices.length === 0) {
      if (Array.isArray(forwardValues) && forwardValues.length > 0) {
        projPrices = forwardValues.map((pct) => lastClose * (1 + pct / 100));
      } else {
        const trend = (lastClose - candData[Math.max(0, N - 6)].close) / 5;
        projPrices = Array.from({ length: 10 }, (_, idx) => lastClose + trend * (idx + 1));
      }
    }
    const M = projPrices.length;
    const totalSlots = N + M;

    // 3. Price scale bounds
    const candLows = candData.map((c) => c.low);
    const candHighs = candData.map((c) => c.high);
    const cMin = Math.min(...candLows);
    const cMax = Math.max(...candHighs);
    const fMin = Math.min(...projPrices);
    const fMax = Math.max(...projPrices);
    const globalMin = Math.min(cMin, fMin);
    const globalMax = Math.max(cMax, fMax);
    const pRange = globalMax - globalMin || 1;
    const padPrice = pRange * 0.12;
    const minY = globalMin - padPrice;
    const maxY = globalMax + padPrice;
    const priceSpan = maxY - minY;

    const padX = 8;
    const padTop = 10;
    const padBot = 10;
    const innerW = Math.max(10, W - padX * 2);
    const innerH = Math.max(10, H - padTop - padBot);

    const toY = (price) => padTop + innerH - ((price - minY) / priceSpan) * innerH;
    const stepX = innerW / totalSlots;

    // 4. Subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 4; i++) {
      const gy = padTop + (innerH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padX, gy);
      ctx.lineTo(padX + innerW, gy);
      ctx.stroke();
    }
    // Vertical grid
    const vGridCount = Math.min(8, Math.floor(N / 4));
    for (let i = 1; i <= vGridCount; i++) {
      const gx = padX + (innerW * i) / (vGridCount + 1);
      ctx.beginPath();
      ctx.moveTo(gx, padTop);
      ctx.lineTo(gx, padTop + innerH);
      ctx.stroke();
    }

    // 5. LAYER 1: ENVELOPE CHANNELS (Red upper dashed, Green lower dashed)
    const smoothWindow = Math.max(3, Math.floor(N / 8));
    const highArr = candData.map((c) => c.high);
    const lowArr = candData.map((c) => c.low);
    const smoothedHighs = smoothSeries(highArr, smoothWindow);
    const smoothedLows = smoothSeries(lowArr, smoothWindow);

    // Calculate envelope expansion factor (channel width)
    const avgRange = highArr.reduce((s, h, i) => s + (h - lowArr[i]), 0) / N;
    const envelopeFactor = avgRange * 0.6;

    const upperEnvelope = smoothedHighs.map((h) => h + envelopeFactor);
    const lowerEnvelope = smoothedLows.map((l) => l - envelopeFactor);

    // Draw filled area between envelopes (very subtle)
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const cx = padX + (i + 0.5) * stepX;
      const uy = toY(upperEnvelope[i]);
      if (i === 0) ctx.moveTo(cx, uy);
      else ctx.lineTo(cx, uy);
    }
    for (let i = N - 1; i >= 0; i--) {
      const cx = padX + (i + 0.5) * stepX;
      const ly = toY(lowerEnvelope[i]);
      ctx.lineTo(cx, ly);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(128, 128, 200, 0.3)';
    ctx.fill();
    ctx.restore();

    // Upper envelope (Red dashed)
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#e74c4c';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = 'rgba(231, 76, 76, 0.3)';
    ctx.shadowBlur = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const cx = padX + (i + 0.5) * stepX;
      const uy = toY(upperEnvelope[i]);
      if (i === 0) ctx.moveTo(cx, uy);
      else ctx.lineTo(cx, uy);
    }
    ctx.stroke();
    ctx.restore();

    // Lower envelope (Green dashed)
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = 'rgba(46, 204, 113, 0.3)';
    ctx.shadowBlur = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const cx = padX + (i + 0.5) * stepX;
      const ly = toY(lowerEnvelope[i]);
      if (i === 0) ctx.moveTo(cx, ly);
      else ctx.lineTo(cx, ly);
    }
    ctx.stroke();
    ctx.restore();

    // 6. LAYER 2: CANDLESTICKS (Market Data)
    const candleW = Math.max(1.5, Math.min(6.5, stepX * 0.72));
    const wickW = Math.max(0.8, Math.min(1.4, candleW * 0.28));
    candData.forEach((c, i) => {
      const cx = padX + (i + 0.5) * stepX;
      const yOpen = toY(c.open);
      const yClose = toY(c.close);
      const yHigh = toY(c.high);
      const yLow = toY(c.low);
      const isBull = c.close >= c.open;

      const bodyColor = isBull ? '#26a69a' : '#ef5350';
      const wickColor = isBull ? 'rgba(38, 166, 154, 0.9)' : 'rgba(239, 83, 80, 0.9)';

      // Wick
      ctx.beginPath();
      ctx.strokeStyle = wickColor;
      ctx.lineWidth = wickW;
      ctx.moveTo(cx, yHigh);
      ctx.lineTo(cx, yLow);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
      ctx.fillStyle = bodyColor;
      ctx.fillRect(cx - candleW / 2, bodyTop, candleW, bodyH);

      // Body border for definition
      ctx.strokeStyle = isBull ? 'rgba(38, 166, 154, 0.7)' : 'rgba(239, 83, 80, 0.7)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx - candleW / 2, bodyTop, candleW, bodyH);
    });

    // 7. LAYER 3: POLA INPUT GAMBAR (Yellow Solid Line — drawn pattern overlay)
    const activeProbe = Array.isArray(probeValues) && probeValues.length > 1
      ? probeValues
      : (Array.isArray(segmentValues) && segmentValues.length > 1 ? segmentValues : []);

    if (activeProbe.length > 1) {
      ctx.save();
      // Glow effect for yellow line
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2.6;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
      ctx.shadowBlur = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      activeProbe.forEach((pv, k) => {
        const u = k / (activeProbe.length - 1);
        const px = padX + (u * (N - 1) + 0.5) * stepX;
        // Map normalized probe (0..1) to candle price range [cMin, cMax]
        const mappedPrice = cMin + pv * (cMax - cMin);
        const py = toY(mappedPrice);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });

      ctx.stroke();

      // Second pass for brightness
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 235, 59, 0.4)';
      ctx.lineWidth = 4.5;
      ctx.stroke();

      // Core line on top
      ctx.strokeStyle = '#FFF176';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.9)';
      ctx.shadowBlur = 3;
      ctx.stroke();

      ctx.restore();
    }

    // 8. Divider between live and projection
    const divX = padX + N * stepX;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(divX, padTop + 2);
    ctx.lineTo(divX, padTop + innerH);
    ctx.stroke();
    ctx.restore();

    // 9. LAYER 4: PROYEKSI LANJUTAN (Forward Projection)
    if (projPrices.length > 0) {
      const startX = padX + (N - 1 + 0.5) * stepX;
      const startY = toY(lastClose);
      const endPrice = projPrices[projPrices.length - 1];
      const isBullFwd = endPrice >= lastClose;
      const fwdColor = isBullFwd ? '#2ecc71' : '#e74c4c';

      // Gradient fill under projection
      ctx.save();
      const fwdGrad = ctx.createLinearGradient(startX, padTop, padX + (N + M - 0.5) * stepX, padTop + innerH);
      fwdGrad.addColorStop(0, isBullFwd ? 'rgba(46, 204, 113, 0.10)' : 'rgba(231, 76, 76, 0.10)');
      fwdGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fwdGrad;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      projPrices.forEach((fp, j) => {
        const fx = padX + (N + j + 0.5) * stepX;
        ctx.lineTo(fx, toY(fp));
      });
      ctx.lineTo(padX + (N + M - 0.5) * stepX, startY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Projection dashed line
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = fwdColor;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = fwdColor;
      ctx.shadowBlur = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      projPrices.forEach((fp, j) => {
        const fx = padX + (N + j + 0.5) * stepX;
        ctx.lineTo(fx, toY(fp));
      });
      ctx.stroke();
      ctx.restore();

      // End dot
      const endX = padX + (N + projPrices.length - 1 + 0.5) * stepX;
      const endY = toY(endPrice);
      ctx.save();
      ctx.beginPath();
      ctx.arc(endX, endY, 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = fwdColor;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(endX, endY, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = fwdColor;
      ctx.shadowColor = fwdColor;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();

      // Live anchor dot
      ctx.save();
      ctx.beginPath();
      ctx.arc(startX, startY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 5;
      ctx.fill();
      ctx.restore();
    }

    // 10. Corner labels
    ctx.save();
    ctx.font = '7px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillText('POLA MATCH', padX + 2, padTop + 8);
    if (M > 0) {
      ctx.fillText('PROYEKSI ▸', divX + 3, padTop + 8);
    }
    ctx.restore();

  }, [candles, probeValues, segmentValues, forwardValues, forwardPrices, currentPrice, rawPrices]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="w-full relative rounded-lg overflow-hidden shadow-lg border border-white/[0.06]"
      style={{ height: '180px', background: '#0a0a14' }}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}

export default function PatternSearchResults({
  results = [],
  probeValues = [],
  probePatternName = '',
  timeframe = 'auto',
  onSelectToken,
}) {
  const navigate = useNavigate();
  const [selectedMatchForModal, setSelectedMatchForModal] = useState(null);

  if (!results || results.length === 0) return null;

  const handleOpenAnalysis = (item) => {
    const activeTf = item.timeframe || item.timeframe_used || (timeframe === 'auto' ? '15m' : timeframe);
    const patternName = item.pattern_name || probePatternName || 'Pola Geometris';
    const effectiveProbe = Array.isArray(probeValues) && probeValues.length > 0 ? probeValues : (item.probe_values || []);

    const payload = {
      patternResult: item,
      probeValues: effectiveProbe,
      symbol: item.symbol,
      timeframe: activeTf,
    };

    try {
      sessionStorage.setItem('active_pattern_match', JSON.stringify(payload));
    } catch (e) {
      console.error('Failed to cache pattern match in sessionStorage', e);
    }

    if (onSelectToken) {
      onSelectToken(item.symbol);
    }

    navigate(
      `/analysis/${encodeURIComponent(item.symbol)}?timeframe=${encodeURIComponent(activeTf)}&pattern=${encodeURIComponent(patternName)}`,
      { state: payload }
    );
  };

  return (
    <div className="space-y-4 font-body">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-headline font-bold text-on-surface">
                Hasil Pencarian Pola Real-Time
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-tertiary-container text-tertiary-fixed border border-tertiary/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                Masa Sekarang (Live)
              </span>
            </div>
            <p className="text-xs text-on-surface-variant font-mono mt-0.5">
              {results.length} token terdeteksi membentuk pola geometri serupa pada aksi pasar 24 jam terakhir.
            </p>
          </div>
        </div>

        {probePatternName && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-container/20 border border-primary/30 text-primary text-xs font-mono font-semibold self-start sm:self-auto">
            <span>✨ Pola Dikenali:</span>
            <span className="text-on-surface font-bold">{probePatternName}</span>
          </div>
        )}
      </div>

      {/* Grid kartu hasil pencarian */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {results.map((item, idx) => {
          // Robust calculation to prevent NaN%
          const rawScore = item.similarity_score ?? item.match_score ?? item.score ?? 0.75;
          const simPct = isNaN(rawScore) ? 75 : Math.min(100, Math.max(0, Math.round(rawScore * 100)));

          const verdict = (item.forward_verdict || item.verdict || 'NEUTRAL').toUpperCase();
          const vConf = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.NEUTRAL;
          const VIcon = vConf.Icon;

          const activeTf = item.timeframe || item.timeframe_used || (timeframe === 'auto' ? '15m' : timeframe);
          const tfLabel = item.timeframe_label || (activeTf === '15m' ? '15 Menit (24 Jam)' : `${activeTf.toUpperCase()} (24 Jam)`);
          const patternName = item.pattern_name || probePatternName || 'Pola Geometris';

          const formattedPrice =
            typeof item.current_price === 'number'
              ? item.current_price.toLocaleString('en-US', {
                  minimumFractionDigits: item.current_price < 1 ? 4 : 2,
                  maximumFractionDigits: item.current_price < 1 ? 6 : 2,
                })
              : item.current_price || '—';

          return (
            <div
              key={`${item.symbol}-${idx}`}
              className="bg-surface-container rounded-xl p-4 border border-outline-variant/60 shadow-md flex flex-col justify-between hover:border-primary/50 transition-all group relative overflow-hidden"
            >
              {/* Header kartu */}
              <div className="space-y-2.5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-surface-container-highest flex items-center justify-center text-xs font-mono font-bold text-on-surface-variant">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-headline font-bold text-on-surface">
                          {item.symbol.replace('-USD', '')}
                        </span>
                        <span className="text-[10px] font-mono text-on-surface-variant">
                          {item.name || item.token_name || item.symbol}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Timeframe pill */}
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-surface-container-highest text-primary border border-outline-variant">
                    ⚡ {tfLabel}
                  </span>
                </div>

                {/* Pattern Classification Badge */}
                <div className="px-2.5 py-1 rounded-md bg-primary-container/10 border border-primary/20 text-primary text-[11px] font-mono font-medium flex items-center justify-between">
                  <span className="truncate">Formasi: {patternName}</span>
                  <span className="text-[10px] text-tertiary shrink-0 ml-1">
                    {item.formation_status || (item.is_current ? 'Live' : 'Terkini')}
                  </span>
                </div>

                {/* Live Price & Change */}
                <div className="flex items-baseline justify-between pt-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-mono font-bold text-on-surface">
                      ${formattedPrice}
                    </span>
                    {typeof item.change_pct === 'number' && (
                      <span className={`text-xs font-mono font-semibold ${item.change_pct >= 0 ? 'text-tertiary' : 'text-error'}`}>
                        {item.change_pct >= 0 ? `+${item.change_pct.toFixed(2)}%` : `${item.change_pct.toFixed(2)}%`}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-tertiary flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                    Masa Sekarang
                  </span>
                </div>

                {/* Date range metadata & bar count */}
                <div className="text-[10px] font-mono text-on-surface-variant flex items-center justify-between">
                  <span>Mulai: {formatMatchDate(item.start_date || item.match_date_start)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-container-highest text-primary font-bold border border-outline-variant/40">
                    {item.candle_count || (item.candles ? item.candles.length : 60)} Bar
                  </span>
                  <span>→ Hari Ini</span>
                </div>

                {/* Multi-layer Candlestick + Probe Line + Projection Canvas (Clickable to Enlarge) */}
                <div
                  className="relative group/chart cursor-pointer rounded-lg overflow-hidden"
                  onClick={() => setSelectedMatchForModal(item)}
                  title="Klik untuk membuka grafik ukuran penuh dengan rincian interaktif"
                >
                  <OverlayCandleSparkline
                    candles={item.candles || []}
                    probeValues={probeValues && probeValues.length > 0 ? probeValues : (item.probe_values || [])}
                    segmentValues={item.segment_values || item.normalized_segment || []}
                    forwardValues={item.forward_values || item.forward_projection || []}
                    forwardPrices={item.forward_prices || []}
                    currentPrice={item.current_price}
                    rawPrices={item.raw_prices || []}
                  />
                  <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/75 text-white/90 text-[10px] font-mono flex items-center gap-1 opacity-0 group-hover/chart:opacity-100 transition-opacity pointer-events-none backdrop-blur-xs border border-white/10 shadow-md">
                    <Maximize2 className="w-3 h-3 text-primary" />
                    <span>Perbesar</span>
                  </div>
                </div>

                {/* Sparkline Legend - 4 Layers */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-on-surface-variant px-2 py-1.5 rounded-md border border-outline-variant/30" style={{ background: 'rgba(10,10,20,0.6)' }}>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-0.5">
                      <span className="w-1 h-3 rounded-xs" style={{ background: '#26a69a' }} />
                      <span className="w-1 h-2 rounded-xs" style={{ background: '#ef5350' }} />
                    </span>
                    <span className="text-[10px] text-white/70">Candlestick</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-[2px] rounded-full" style={{ background: '#FFD700', boxShadow: '0 0 4px #FFD700' }} />
                    <span className="text-[10px]" style={{ color: '#FFD700' }}>Pola Input</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-0 border-b-[1.5px] border-dashed" style={{ borderColor: '#e74c4c' }} />
                    <span className="text-[10px]" style={{ color: '#e74c4c' }}>Upper Channel</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-0 border-b-[1.5px] border-dashed" style={{ borderColor: '#2ecc71' }} />
                    <span className="text-[10px]" style={{ color: '#2ecc71' }}>Lower Channel</span>
                  </span>
                </div>

                {/* Similarity Score Bar */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-on-surface-variant text-[11px]">Skor Kemiripan Vektor:</span>
                    <span className={`font-bold ${simPct >= 70 ? 'text-tertiary' : simPct >= 50 ? 'text-primary' : 'text-on-surface-variant'}`}>
                      {simPct}%
                    </span>
                  </div>
                  <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        simPct >= 70 ? 'bg-tertiary' : simPct >= 50 ? 'bg-primary' : 'bg-outline'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, simPct))}%` }}
                    />
                  </div>
                </div>

                {/* Verdict & Probability */}
                <div className="flex items-center justify-between pt-1">
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${vConf.bg}`}>
                    <VIcon className="w-3 h-3" />
                    <span>{vConf.label}</span>
                  </div>

                  {typeof item.prob_up === 'number' && (
                    <span className="text-[11px] font-mono text-on-surface-variant">
                      P(Naik): <strong className="text-on-surface font-semibold">{Math.round(item.prob_up * 100)}%</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons: Direct Large Chart View + Deep Analysis */}
              <div className="pt-3.5 mt-2 border-t border-outline-variant/40 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMatchForModal(item)}
                  className="w-full px-2.5 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-[11px] font-mono font-semibold transition-all flex items-center justify-center gap-1.5 border border-outline-variant/60 shadow-xs cursor-pointer"
                  title="Buka tampilan grafik berukuran besar dengan candlestick & kurva pola lengkap"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-primary" />
                  <span>Buka Grafik</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenAnalysis(item)}
                  className="w-full px-2.5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-[11px] font-mono font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  title={`Buka analisis 3-layer dan grafik pola di timeframe ${activeTf.toUpperCase()}`}
                >
                  <span>Analisis {activeTf.toUpperCase()}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. Pattern Detail Modal — Tampilan Grafik Penuh Sesuai Hasil Pencocokan */}
      {selectedMatchForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-5xl bg-surface-container rounded-2xl border border-outline-variant/80 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-outline-variant/60 bg-surface-container-high">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary font-bold text-sm font-mono shadow-inner border border-outline-variant/40">
                  {selectedMatchForModal.symbol.replace('-USD', '')}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-headline font-bold text-on-surface">
                      {selectedMatchForModal.symbol.replace('-USD', '')} — Grafik Hasil Pencocokan Pola
                    </h3>
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-tertiary-container text-tertiary border border-tertiary/20">
                      ⚡ {(selectedMatchForModal.timeframe || '15m').toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant font-mono mt-0.5">
                    Formasi: <strong className="text-on-surface">{selectedMatchForModal.pattern_name || probePatternName || 'Pola Geometris'}</strong> • {selectedMatchForModal.candle_count || selectedMatchForModal.candles?.length || 60} Bar Candlestick • Skor Kemiripan {Math.round((selectedMatchForModal.match_score || 0.75) * 100)}%
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMatchForModal(null)}
                className="w-8 h-8 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest flex items-center justify-center transition-colors cursor-pointer"
                title="Tutup (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: High-Definition Pattern Match Chart */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              <PatternMatchLargeChart
                patternResult={selectedMatchForModal}
                probeValues={Array.isArray(probeValues) && probeValues.length > 0 ? probeValues : (selectedMatchForModal.probe_values || [])}
                height={460}
                showControls={true}
              />
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-outline-variant/60 bg-surface-container-high flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-on-surface-variant">
                <span>Rentang Waktu: <strong>{formatMatchDate(selectedMatchForModal.start_date)} → Hari Ini</strong></span>
                <span>Status: <strong className="text-tertiary">{selectedMatchForModal.formation_status || 'Live'}</strong></span>
                <span>Harga Terkini: <strong className="text-on-surface">${selectedMatchForModal.current_price}</strong></span>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSelectedMatchForModal(null)}
                  className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface text-xs font-mono font-medium transition-colors border border-outline-variant/40 cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const it = selectedMatchForModal;
                    setSelectedMatchForModal(null);
                    handleOpenAnalysis(it);
                  }}
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-mono font-semibold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Buka di Deep Analysis</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
