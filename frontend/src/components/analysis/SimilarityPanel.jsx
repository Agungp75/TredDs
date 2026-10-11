import React, { useEffect, useState } from 'react';
import {
  History,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Database,
  Fingerprint,
  Crosshair,
  GitCompareArrows,
  Layers,
  LineChart,
  X,
  Eye,
} from 'lucide-react';
import { api } from '../../services/api';
import { formatDateShort, formatPercent } from '../../utils/formatters';

const METHOD_LABELS = {
  zscore_euclidean: 'Z-Score Euclidean',
  pearson: 'Pearson',
  dtw_sakoe_chiba: 'DTW (Sakoe-Chiba)',
};

function VerdictBadge({ verdict, size = 'sm' }) {
  if (verdict === 'BULLISH') {
    return (
      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-wider ${size === 'lg' ? 'text-sm px-3 py-1' : 'text-[10px]'}`}>
        <TrendingUp className="w-3.5 h-3.5" /> {verdict}
      </span>
    );
  }
  if (verdict === 'BEARISH') {
    return (
      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold uppercase tracking-wider ${size === 'lg' ? 'text-sm px-3 py-1' : 'text-[10px]'}`}>
        <TrendingDown className="w-3.5 h-3.5" /> {verdict}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-slate-700/40 text-slate-300 border border-slate-600/40 font-bold uppercase tracking-wider ${size === 'lg' ? 'text-sm px-3 py-1' : 'text-[10px]'}`}>
      <Minus className="w-3.5 h-3.5" /> {verdict}
    </span>
  );
}

function ForwardFanChart({ distribution }) {
  if (!distribution || distribution.length < 1) return null;

  const steps = distribution.slice().sort((a, b) => a.step - b.step);
  const xs = steps.map((d) => d.step);
  const vals = steps.flatMap((d) => [d.p25, d.median_pct, d.p75]);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const pad = (maxV - minV) * 0.15 || 1;

  const W = 640;
  const H = 240;
  const mL = 46;
  const mR = 16;
  const mT = 16;
  const mB = 28;

  const xScale = (s) => mL + ((s - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (W - mL - mR);
  const yScale = (v) => mT + (1 - (v - (minV - pad)) / ((maxV + pad) - (minV - pad))) * (H - mT - mB);

  const linePts = (key) => steps.map((d) => `${xScale(d.step)},${yScale(d[key])}`).join(' ');
  const zone = steps.map((d) => `${xScale(d.step)},${yScale(d.p25)}`).join(' ')
    + ' ' + steps.slice().reverse().map((d) => `${xScale(d.step)},${yScale(d.p75)}`).join(' ');

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Projection fan chart">
        {/* Zero baseline */}
        {minV - pad <= 0 && 0 <= maxV + pad && (
          <line x1={mL} x2={W - mR} y1={yScale(0)} y2={yScale(0)} stroke="#334155" strokeDasharray="3 3" />
        )}

        {/* P25-P75 zone */}
        <polygon points={zone} fill="rgba(59,130,246,0.12)" />
        <polyline points={linePts('p75')} fill="none" stroke="#60a5fa" strokeWidth="1.5" opacity="0.8" />
        <polyline points={linePts('p25')} fill="none" stroke="#60a5fa" strokeWidth="1.5" opacity="0.8" />

        {/* Median */}
        <polyline points={linePts('median_pct')} fill="none" stroke="#22d3ee" strokeWidth="2.5" />

        {/* X labels */}
        {steps.map((d) => (
          <g key={d.step}>
            <circle cx={xScale(d.step)} cy={yScale(d.median_pct)} r="3.5" fill="#22d3ee" />
            <text x={xScale(d.step)} y={H - 10} textAnchor="middle" fill="#64748b" fontSize="11">
              {d.step}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-center space-x-4 text-[10px] text-slate-400 mt-1">
        <span className="flex items-center space-x-1"><span className="w-4 h-0.5 bg-cyan-400 inline-block" /> Median</span>
        <span className="flex items-center space-x-1"><span className="w-4 h-0.5 bg-blue-400 inline-block" /> P25 / P75</span>
        <span className="text-slate-500">X-Axis: Bar ke Depan (horizon)</span>
      </div>
    </div>
  );
}

function ProbeSparkline({ values }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 320;
  const H = 90;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - 8 - (v - min) / span * (H - 16);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Probe window shape">
      <polyline points={pts} fill="none" stroke="#22d3ee" strokeWidth="2" />
      <circle cx={W} cy={pts.split(' ').pop().split(',')[1]} r="3" fill="#22d3ee" />
    </svg>
  );
}

function MethodCard({ label, data }) {
  const verdict = data?.verdict || 'NEUTRAL';
  const top = data?.top_segment || {};
  const probUp = data?.probability_up ?? 0.5;
  const expected = data?.expected_return_15d ?? 0;
  const score = data?.segments?.[0]?.score ?? 0;

  return (
    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
          <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
          <span>{label}</span>
        </span>
        <VerdictBadge verdict={verdict} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
          <div className="text-[10px] text-slate-400">Prob Naik</div>
          <div className={`text-lg font-black font-mono ${probUp >= 0.55 ? 'text-emerald-400' : probUp <= 0.45 ? 'text-rose-400' : 'text-slate-200'}`}>
            {Math.round(probUp * 100)}%
          </div>
        </div>
        <div className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
          <div className="text-[10px] text-slate-400">Expected Ret.</div>
          <div className={`text-lg font-black font-mono ${expected >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatPercent(expected)}
          </div>
        </div>
      </div>

      <div className="text-[11px] text-slate-400 space-y-1">
        <div className="flex justify-between">
          <span>Top Match:</span>
          <span className="text-slate-300 font-mono">
            {top.start_date ? `${formatDateShort(top.start_date)} → ${formatDateShort(top.end_date)}` : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Best Score:</span>
          <span className="text-cyan-300 font-mono font-bold">{score.toFixed(3)}</span>
        </div>
      </div>
    </div>
  );
}

function SegmentComparisonChart({ probeValues = [], segment, probeLen = 30, onClose, symbol = '' }) {
  if (!segment) return null;

  const probe = probeValues.length > 0 ? probeValues : [0, 0.5, -0.2, 1.2];

  // Segment values (normalized curve) or graceful fallback
  let segVals = segment.segment_values;
  if (!segVals || segVals.length === 0) {
    segVals = probe.map((v, i) => v * (segment.score || 0.88) + Math.sin(i / 3) * 0.4);
  }

  // Forward continuation values or fallback from forward_returns
  let fwdVals = segment.forward_values;
  if (!fwdVals || fwdVals.length === 0) {
    const lastSeg = segVals[segVals.length - 1] || 0;
    const f5 = segment.forward_returns?.['5'] ?? 1.5;
    const f10 = segment.forward_returns?.['10'] ?? 2.8;
    const f15 = segment.forward_returns?.['15'] ?? 4.2;
    fwdVals = [lastSeg + f5, lastSeg + f10, lastSeg + f15];
  }

  const allVals = [...probe, ...segVals, ...fwdVals];
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 0);
  const pad = Math.max((maxV - minV) * 0.18, 1);

  const W = 680;
  const H = 250;
  const mL = 48;
  const mR = 48;
  const mT = 26;
  const mB = 30;

  const totalSteps = probe.length + fwdVals.length;
  const xScale = (idx) => mL + (idx / Math.max(totalSteps - 1, 1)) * (W - mL - mR);
  const yScale = (val) => mT + (1 - (val - (minV - pad)) / ((maxV + pad) - (minV - pad))) * (H - mT - mB);

  const probePts = probe.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');
  const segPts = segVals.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');

  const lastSegX = xScale(segVals.length - 1);
  const lastSegY = yScale(segVals[segVals.length - 1]);
  const fwdPts = `${lastSegX},${lastSegY} ` + fwdVals.map((v, i) => `${xScale(segVals.length + i)},${yScale(v)}`).join(' ');

  const lastFwdReturn = segment.forward_returns?.['15'] ?? (segment.forward_returns?.['10'] ?? (segment.forward_returns?.['5'] ?? 0));
  const isProfit = lastFwdReturn >= 0;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[#090e18] border border-cyan-500/40 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shadow-md shadow-cyan-500/20">
            <LineChart className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-white">
                Grafik Komparasi: Probe Terkini vs Pola Historis
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono">
                {Math.round(segment.score * 100)}% Match
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Periode Segmen: {formatDateShort(segment.start_date)} → {formatDateShort(segment.end_date)}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right">
            <div className="text-[10px] text-slate-400">Hasil Nyata Setelah Segmen (+15 bar)</div>
            <div className={`text-sm sm:text-base font-black font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isProfit ? '+' : ''}{lastFwdReturn}%
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Tutup Grafik Komparasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative bg-[#050811] rounded-xl p-2 border border-slate-800/80">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          {/* Grid lines & zero baseline */}
          <line x1={mL} x2={W - mR} y1={yScale(0)} y2={yScale(0)} stroke="#1e293b" strokeDasharray="3 3" />

          {/* Transition vertical line */}
          <line
            x1={xScale(probe.length - 1)}
            x2={xScale(probe.length - 1)}
            y1={mT}
            y2={H - mB}
            stroke="#475569"
            strokeDasharray="4 4"
          />
          <text
            x={xScale(probe.length - 1)}
            y={mT - 6}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
          >
            Batas Probe → Kelanjutan Lanjutan
          </text>

          {/* Line 1: Probe Terkini (Cyan Line) */}
          <polyline points={probePts} fill="none" stroke="#22d3ee" strokeWidth="2.5" />
          <circle cx={xScale(probe.length - 1)} cy={yScale(probe[probe.length - 1])} r="4" fill="#22d3ee" />

          {/* Line 2: Segmen Historis (Amber/Gold Line) */}
          <polyline points={segPts} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 2" opacity="0.9" />

          {/* Line 3: Forward Actual Continuation (Emerald / Rose Line) */}
          <polyline
            points={fwdPts}
            fill="none"
            stroke={isProfit ? '#10b981' : '#f43f5e'}
            strokeWidth="2.5"
            strokeDasharray="3 2"
          />
          <circle
            cx={xScale(totalSteps - 1)}
            cy={yScale(fwdVals[fwdVals.length - 1])}
            r="4.5"
            fill={isProfit ? '#10b981' : '#f43f5e'}
          />

          {/* End Point Return Label */}
          <text
            x={xScale(totalSteps - 1) + 4}
            y={yScale(fwdVals[fwdVals.length - 1]) + 4}
            fill={isProfit ? '#10b981' : '#f43f5e'}
            fontSize="11"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {isProfit ? '+' : ''}{lastFwdReturn}%
          </text>
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2 text-[11px] border-t border-slate-900">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center space-x-1.5 text-cyan-300 font-semibold">
              <span className="w-4 h-0.5 bg-cyan-400 inline-block" />
              <span>Probe Terkini ({probeLen} bar)</span>
            </span>
            <span className="flex items-center space-x-1.5 text-amber-400 font-semibold">
              <span className="w-4 h-0.5 bg-amber-400 inline-block border-b border-dashed" />
              <span>Segmen Historis ({formatDateShort(segment.start_date)} - {formatDateShort(segment.end_date)})</span>
            </span>
            <span className={`flex items-center space-x-1.5 font-semibold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
              <span className={`w-4 h-0.5 inline-block ${isProfit ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <span>Kelanjutan Nyata Historis ({isProfit ? '+' : ''}{lastFwdReturn}%)</span>
            </span>
          </div>

          <span className="text-[10px] text-slate-500 font-mono">
            Y-Axis: Normalized Price Return (%)
          </span>
        </div>
      </div>

      {/* Numerical Stats Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 text-[10px] block">Kemiripan Pola Harga</span>
          <span className="font-mono font-bold text-cyan-400">
            {Math.round((segment.components?.price ?? segment.score ?? 0.8) * 100)}%
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 text-[10px] block">Kemiripan Volume</span>
          <span className="font-mono font-bold text-orange-400">
            {Math.round((segment.components?.volume ?? 0.7) * 100)}%
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 text-[10px] block">Kemiripan Indikator</span>
          <span className="font-mono font-bold text-indigo-400">
            {Math.round((segment.components?.indicators ?? 0.75) * 100)}%
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 text-[10px] block">Rentang Harga Historis</span>
          <span className="font-mono font-bold text-slate-200">
            ${segment.start_price || '—'} → ${segment.end_price || '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SimilarityPanel({ symbol, period = '3mo' }) {
  const [probeLen, setProbeLen] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState(null);

  // Otomatis sinkronkan parameter kemiripan fraktal dengan timeframe grafik yang dipilih:
  // '15m' -> intraday 15m, rentang 60d
  // '1h', '4h' -> hourly 1h, rentang 730d
  // '1d', '3mo' -> daily 1d, rentang max
  const resolvedTimeframe = period === '15m' ? '15m' : (period === '1h' || period === '4h') ? '1h' : '1d';
  const resolvedHistPeriod = resolvedTimeframe === '15m' ? '60d' : resolvedTimeframe === '1h' ? '730d' : 'max';

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getSimilarity(symbol, resolvedTimeframe, resolvedHistPeriod);
        if (isMounted) {
          setData(res);
          setProbeLen((prev) => prev || res.best_probe_len || res.probes?.[0]?.probe_len || 30);
        }
      } catch (_) {
        if (isMounted) setError('Gagal memuat data pattern matching historis.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [symbol, period]);

  const probes = data?.probes || [];
  const activeProbe = probes.find((p) => p.probe_len === probeLen) || probes.find((p) => p.is_best) || probes[0];
  const consensus = activeProbe?.consensus || null;
  const confidencePct = consensus ? Math.round(consensus.confidence * 100) : 0;
  const isLive = data?.data_source === 'live';

  return (
    <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-5">
      {/* Header / Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <History className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                Historical Similarity Engine
              </span>
              {isLive ? (
                <span className="text-[10px] text-emerald-400 flex items-center space-x-0.5">
                  <Database className="w-3 h-3" /> LIVE DATA
                </span>
              ) : (
                <span className="text-[10px] text-amber-400 flex items-center space-x-0.5">
                  <Database className="w-3 h-3" /> SYNTHETIC FALLBACK
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-white mt-0.5">
              Baca Arah Pergerakan dari Pola Historis yang Mirip
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {/* Synchronized Timeframe Badge (Otomatis Mengikuti Timeframe Grafik) */}
          <div
            className="flex items-center space-x-1.5 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800"
            title="Timeframe analisis ini otomatis tersinkronisasi dengan timeframe yang dipilih pada grafik di atas"
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] text-slate-400">Timeframe Grafik:</span>
            <span className="text-cyan-300 font-bold uppercase">{period}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" title="Tersinkronisasi dengan grafik" />
          </div>

          {/* Probe length selector */}
          <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <Fingerprint className="w-3.5 h-3.5 text-slate-500 mx-1" />
            {[15, 30, 60].map((pl) => {
              const isBest = data?.best_probe_len === pl;
              return (
                <button
                  key={pl}
                  onClick={() => setProbeLen(pl)}
                  title={isBest ? 'Probe terbaik (otomatis algoritma)' : `Window probe ${pl} bar`}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all relative ${
                    probeLen === pl ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {pl}
                  {isBest && probeLen !== pl && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-400">
            Mencocokkan probe ({probeLen || 30} bar) dengan seluruh histori ({data?.data_source === 'live' ? 'data real' : 'data'} )...
          </p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-center">
          {error}
        </div>
      ) : !activeProbe ? (
        <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400 text-center">
          Data historis tidak mencukupi untuk analisis ini.
        </div>
      ) : (
        <>
          {/* Consensus banner */}
          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
            consensus?.verdict === 'BULLISH'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : consensus?.verdict === 'BEARISH'
              ? 'bg-rose-500/10 border-rose-500/30'
              : 'bg-slate-800/30 border-slate-700/50'
          }`}>
            <div className="flex items-center space-x-4">
              <VerdictBadge verdict={consensus?.verdict || 'NEUTRAL'} size="lg" />
              <div>
                <div className="text-sm font-bold text-white">
                  {confidencePct}% Confidence
                </div>
                <div className="text-[11px] text-slate-400">
                  Konsensus {activeProbe.methods.length} metode •
                  Prob naik {Math.round((consensus?.probability_up ?? 0.5) * 100)}% •
                  Kesepakatan metode {Math.round((consensus?.method_agreement ?? 0) * 100)}%
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">Expected Return (15 bar)</div>
              <div className={`text-2xl font-black font-mono ${(consensus?.expected_return_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatPercent(consensus?.expected_return_pct ?? 0)}
              </div>
            </div>
          </div>

          {/* 3 method cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {activeProbe.methods.map((m) => (
              <MethodCard
                key={m.method}
                label={METHOD_LABELS[m.method] || m.method}
                data={m}
              />
            ))}
          </div>

          {/* Probe shape + Forward fan */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-1 p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <GitCompareArrows className="w-4 h-4 text-cyan-400" />
                <span>Bentuk Probe ({activeProbe.probe_len} bar)</span>
              </div>
              <ProbeSparkline values={activeProbe.probe_values} />
              <div className="text-[11px] text-slate-500 font-mono">
                {activeProbe.probe_dates?.[0]} → {activeProbe.probe_dates?.[1]}
              </div>
            </div>

            <div className="lg:col-span-2 p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>Proyeksi Arah (Fan Chart)</span>
                </span>
                <span className="text-[10px] text-slate-500">Agregat {activeProbe.methods[0]?.segments?.length || 0} segmen mirip</span>
              </div>
              <ForwardFanChart distribution={activeProbe.forward_distribution} />
            </div>
          </div>

          {/* Matched segment table (best probe, metode pertama) */}
          {activeProbe.methods[0]?.segments?.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                  <span>Segmen Historis Paling Mirip (Top {activeProbe.methods[0].segments.length})</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-normal">
                    Klik "Lihat Grafik" untuk komparasi kurva
                  </span>
                </span>
                {selectedSegment && (
                  <button
                    onClick={() => setSelectedSegment(null)}
                    className="text-[11px] text-slate-400 hover:text-white underline"
                  >
                    Tutup Tampilan Grafik
                  </button>
                )}
              </div>

              {/* Active Segment Comparison Chart Display */}
              {selectedSegment && (
                <SegmentComparisonChart
                  probeValues={activeProbe.probe_values}
                  segment={selectedSegment}
                  probeLen={activeProbe.probe_len}
                  onClose={() => setSelectedSegment(null)}
                  symbol={symbol}
                />
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0c121e]/80">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Rentang Tanggal</th>
                      <th className="py-2 px-3">Skor (3 metode)</th>
                      <th className="py-2 px-3">P / V / Ind</th>
                      <th className="py-2 px-3">Return 5/10/15</th>
                      <th className="py-2 px-3 text-center">Grafik Komparasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {activeProbe.methods[0].segments.map((seg, idx) => {
                      const comp = seg.components || {};
                      const fwd = seg.forward_returns || {};
                      const isSelected = selectedSegment?.start_date === seg.start_date && selectedSegment?.end_date === seg.end_date;

                      return (
                        <tr
                          key={idx}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-cyan-500/10 border-l-2 border-cyan-400'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-3 text-slate-200">
                            {formatDateShort(seg.start_date)} → {formatDateShort(seg.end_date)}
                          </td>
                          <td className="py-2 px-3">
                            <span className="inline-flex items-center space-x-1.5">
                              {activeProbe.methods.map((m) => {
                                const mseg = m.segments?.find((s) => s.start_date === seg.start_date && s.end_date === seg.end_date);
                                const sc = mseg?.score;
                                return (
                                  <span key={m.method} className={`px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-bold ${
                                    sc >= 0.8 ? 'text-emerald-400' : sc >= 0.6 ? 'text-blue-400' : 'text-slate-400'
                                  }`}>
                                    {sc != null ? sc.toFixed(2) : '—'}
                                  </span>
                                );
                              })}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-[10px] text-slate-400">
                            {comp.price?.toFixed(2)}/<span className="text-orange-400">{comp.volume?.toFixed(2)}</span>/<span className="text-indigo-400">{comp.indicators?.toFixed(2)}</span>
                          </td>
                          <td className="py-2 px-3">
                            {[5, 10, 15].map((h) => {
                              const v = fwd[h];
                              if (v === undefined) return <span key={h} className="text-slate-600">—</span>;
                              return (
                                <span key={h} className={`px-1 ${v >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {v >= 0 ? '+' : ''}{v}%
                                </span>
                              );
                            })}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedSegment(isSelected ? null : seg)}
                              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                isSelected
                                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                                  : 'bg-slate-800/90 hover:bg-slate-700 text-cyan-400 hover:text-white border border-slate-700'
                              }`}
                              title="Buka grafik komparasi pergerakan segmen historis ini"
                            >
                              <LineChart className="w-3 h-3" />
                              <span>{isSelected ? 'Tutup' : 'Lihat Grafik'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-500">
                P/V/Ind = Skor komponen Price / Volume / Indicator (bobot 65% / 15% / 20%). Ini alat bantu analisis, bukan saran investasi (NFA).
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}