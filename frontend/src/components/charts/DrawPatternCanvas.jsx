import React, { useRef, useState, useEffect, useCallback } from 'react';
import { PenLine, X, Search, Sparkles } from 'lucide-react';

/**
 * DrawPatternCanvas
 * Canvas interaktif berbasis sistem Obsidian ("Precision in Darkness").
 * Titik-titik yang digambar dikirimkan ke parent via onSearch(points).
 */
export default function DrawPatternCanvas({ onSearch, isSearching }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [hasDrawing, setHasDrawing] = useState(false);

  // Palet Obsidian
  const GRID_COLOR = 'rgba(167, 139, 250, 0.07)';
  const LINE_COLOR = '#a78bfa';
  const GLOW_COLOR = 'rgba(167, 139, 250, 0.5)';
  const DOT_COLOR = '#ede9fe';
  const AXIS_COLOR = 'rgba(161, 161, 170, 0.35)';

  const getCanvasPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    }
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1))),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / (rect.height || 1))),
    };
  };

  const drawCanvas = useCallback((pts) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const W = rect.width || canvas.width;
    const H = rect.height || canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Dynamic grid density
    const numCols = Math.max(6, Math.min(18, Math.floor(W / 110)));
    const numRows = Math.max(4, Math.min(9, Math.floor(H / 45)));

    // Grid lines (horizontal)
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let i = 1; i < numRows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (H / numRows) * i);
      ctx.lineTo(W, (H / numRows) * i);
      ctx.stroke();
    }
    // Grid lines (vertical)
    for (let i = 1; i < numCols; i++) {
      ctx.beginPath();
      ctx.moveTo((W / numCols) * i, 0);
      ctx.lineTo((W / numCols) * i, H);
      ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = AXIS_COLOR;
    ctx.font = `${W > 900 ? '11px' : '10px'} "JetBrains Mono", monospace`;
    ctx.fillText('Price ↑', 8, 16);
    ctx.fillText('Time →', Math.max(10, W - 60), H - 8);

    if (pts.length < 2) return;

    // Glowing stroke
    ctx.save();
    ctx.shadowColor = GLOW_COLOR;
    ctx.shadowBlur = W > 900 ? 18 : 12;
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = W > 900 ? 3.0 : 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x * W, pts[0].y * H);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x * W, pts[i].y * H);
    }
    ctx.stroke();
    ctx.restore();

    // Dots on path
    const dotRadius = W > 900 ? 3.0 : 2.5;
    pts.forEach((p, i) => {
      if (i % Math.max(1, Math.floor(pts.length / 24)) === 0) {
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = DOT_COLOR;
        ctx.fill();
      }
    });

    // Pulsing end indicator dot
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x * W, last.y * H, W > 900 ? 6 : 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ede9fe';
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur = 12;
    ctx.fill();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCanvas(points);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(canvas);
    handleResize();

    return () => observer.disconnect();
  }, [drawCanvas, points]);

  useEffect(() => {
    drawCanvas(points);
  }, [points, drawCanvas]);

  const handlePointerDown = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const pos = getCanvasPos(e, canvas);
    setIsDrawing(true);
    setPoints([pos]);
    setHasDrawing(false);
  };

  const handlePointerMove = (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const pos = getCanvasPos(e, canvas);
    setPoints((prev) => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        const dx = pos.x - last.x;
        const dy = pos.y - last.y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.005) return prev;
      }
      return [...prev, pos];
    });
  };

  const handlePointerUp = (e) => {
    e.preventDefault();
    setIsDrawing(false);
    if (points.length >= 3) setHasDrawing(true);
  };

  const handleClear = () => {
    setPoints([]);
    setHasDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawCanvas([]);
  };

  const handleSearch = () => {
    if (points.length < 3 || isSearching) return;
    onSearch(points);
  };

  return (
    <div className="space-y-3.5 font-body">
      {/* Instruction hint */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container border border-outline-variant/60 text-on-surface-variant text-xs sm:text-sm">
        <Sparkles className="w-4 h-4 xl:w-5 xl:h-5 mt-0.5 shrink-0 text-primary" />
        <span className="leading-relaxed">
          Gambar bentuk grafik yang ingin dicari (misal: <strong className="text-on-surface">Segitiga Simetris, Double Bottom W, atau Bullish Breakout</strong>).
          Sistem <strong className="text-primary font-semibold">otomatis menguji timeframe tercepat (15m / 1h dalam 24 jam terakhir)</strong> yang paling presisi membentuk pola.
        </span>
      </div>

      {/* Canvas area */}
      <div className="relative rounded-xl overflow-hidden border border-outline-variant/80 bg-surface-container-lowest h-44 sm:h-52 md:h-64 lg:h-72 xl:h-80 shadow-inner">
        {/* Empty state hint */}
        {points.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none px-4 text-center">
            <PenLine className="w-8 h-8 sm:w-10 sm:h-10 text-primary/30 mb-2 sm:mb-2.5" />
            <span className="text-on-surface-variant text-xs sm:text-sm font-medium">Gambar pola di sini...</span>
            <span className="text-secondary text-[11px] sm:text-xs mt-0.5 font-mono">
              Klik & seret kursor atau sentuh layar untuk mulai
            </span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ cursor: 'crosshair', touchAction: 'none' }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleClear}
            disabled={points.length === 0 || isSearching}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright border border-outline-variant/60 text-on-surface text-xs font-mono font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm"
          >
            <X className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          <button
            onClick={handleSearch}
            disabled={!hasDrawing || isSearching}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-semibold text-xs transition-all bg-primary hover:bg-primary-container text-on-primary shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          >
            {isSearching ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                <span>Memindai Fraktal...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Cari Pola Serupa</span>
              </>
            )}
          </button>
        </div>

        {hasDrawing && !isSearching && (
          <span className="text-secondary text-xs ml-auto font-mono">
            {points.length} titik koordinat normalisasi terdaftar
          </span>
        )}
      </div>
    </div>
  );
}
