import React from 'react';
import { Layers, Zap } from 'lucide-react';

export default function IndicatorsPanel({ technicalData = {} }) {
  const {
    rsi = 50,
    atr = 0,
    macd = {},
    pattern = 'Analyzing',
    type = 'Neutral',
    confidence = 50,
    candlestick_patterns = [],
    volume_anomaly = false,
    stochastic = null,
    fibonacci = null,
    targets = [],
    confluence = null,
    tp_sl = null,
  } = technicalData;

  const isBullish = type.includes('Bullish');
  const isBearish = type.includes('Bearish');

  // RSI categorization
  const rsiStatus = rsi < 30 ? 'Oversold (Rebound Potential)' : rsi > 70 ? 'Overbought (Pullback Risk)' : 'Neutral Momentum';
  const rsiColor = rsi < 30 ? 'text-tertiary' : rsi > 70 ? 'text-error' : 'text-primary';

  const stochColor = !stochastic
    ? 'text-on-surface'
    : stochastic.zone === 'Oversold'
    ? 'text-tertiary'
    : stochastic.zone === 'Overbought'
    ? 'text-error'
    : 'text-primary';

  const fmt = (v) => {
    const n = Number(v);
    if (!isFinite(n)) return '-';
    const dec = Math.abs(n) < 10 ? 4 : 2;
    return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  const isShort = tp_sl?.direction === 'SHORT';
  const FIB_DOT = { '0': 'bg-slate-400', '0.5': 'bg-slate-300', '0.618': 'bg-slate-200', '1': 'bg-slate-400', '1.272': 'bg-slate-500', '1.618': 'bg-slate-500' };

  return (
    <div className="space-y-4 font-body">
      {/* Pattern Badge & Confidence */}
      <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/60 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-semibold text-on-surface-variant uppercase tracking-wider flex items-center space-x-1.5">
            <Layers className="w-4 h-4 text-primary" />
            <span>Layer 1: Chart Pattern Geometry</span>
          </span>
          <span className="text-xs font-mono text-secondary">SciPy Peak Fit</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-headline font-bold text-on-surface">{pattern}</h3>
            <span
              className={`inline-block mt-1 px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase tracking-wider border ${
                isBullish
                  ? 'bg-tertiary-container/30 text-tertiary border-tertiary/30'
                  : isBearish
                  ? 'bg-error-container text-error border-error/30'
                  : 'bg-surface-container-highest text-on-surface-variant border-outline-variant'
              }`}
            >
              {type} Signal
            </span>
          </div>

          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-primary">{confidence}%</div>
            <div className="text-[11px] text-on-surface-variant font-mono">Confidence Level</div>
          </div>
        </div>
      </div>

      {/* Technical Grid (RSI, ATR, MACD, Volume) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono">
        {/* RSI */}
        <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/50 space-y-1">
          <div className="text-xs text-on-surface-variant">RSI (14)</div>
          <div className={`text-xl font-bold ${rsiColor}`}>{rsi}</div>
          <div className="text-[10px] text-secondary truncate">{rsiStatus}</div>
        </div>

        {/* ATR */}
        <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/50 space-y-1">
          <div className="text-xs text-on-surface-variant">ATR Volatility (14)</div>
          <div className="text-xl font-bold text-primary">{atr}</div>
          <div className="text-[10px] text-secondary">Dynamic Risk Band</div>
        </div>

        {/* MACD */}
        <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/50 space-y-1">
          <div className="text-xs text-on-surface-variant">MACD Histogram</div>
          <div
            className={`text-xl font-bold ${
              macd.histogram >= 0 ? 'text-tertiary' : 'text-error'
            }`}
          >
            {macd.histogram !== undefined ? (macd.histogram > 0 ? `+${macd.histogram}` : macd.histogram) : '0.00'}
          </div>
          <div className="text-[10px] text-secondary truncate">
            Sig: {macd.signal ?? '0'}
          </div>
        </div>

        {/* Volume Anomaly */}
        <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/50 space-y-1">
          <div className="text-xs text-on-surface-variant">Volume Breakout</div>
          <div className="text-xl font-bold">
            {volume_anomaly ? (
              <span className="text-amber-400 flex items-center space-x-1">
                <Zap className="w-4 h-4 fill-amber-400" />
                <span>&gt;1.5x Surge</span>
              </span>
            ) : (
              <span className="text-on-surface">Normal</span>
            )}
          </div>
          <div className="text-[10px] text-secondary">vs 20-Day SMA</div>
        </div>

        {/* Stochastic (Inputs: %K Length 14, %K Smoothing 3, %D Smoothing 3) */}
        <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/50 space-y-1">
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span>Stoch ({stochastic?.settings || '14 3 3'})</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-surface-container-highest text-secondary">
              {stochastic?.k_length || 14}/{stochastic?.k_smoothing || 3}/{stochastic?.d_smoothing || 3}
            </span>
          </div>
          <div className={`text-xl font-bold ${stochColor}`}>
            {stochastic ? (
              <>
                <span className="text-[#2962FF]" title="%K (Length 14, Smoothing 3)">{stochastic.k}</span>
                <span className="text-xs text-on-surface-variant font-medium"> / </span>
                <span className="text-[#FF6D00] text-base" title="%D (Smoothing 3)">{stochastic.d}</span>
              </>
            ) : (
              '-'
            )}
          </div>
          <div className="text-[10px] text-secondary truncate" title="%K Length: 14 | %K Smoothing: 3 | %D Smoothing: 3">
            {stochastic ? `${stochastic.zone}${stochastic.cross ? ` · ${stochastic.cross}` : ''}` : '%K (14,3) / %D (3)'}
          </div>
        </div>
      </div>

      {/* Target Zones + Fibonacci */}
      {(targets?.length > 0 || fibonacci?.levels) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Technical Targets */}
          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-on-surface-variant uppercase tracking-wider">
                🎯 Target Teknikal ({isShort ? 'Short' : 'Long'})
              </span>
              <span className="text-[10px] font-mono text-secondary">Fibo + S/R Konfluensi</span>
            </div>
            {targets?.length ? (
              targets.map((t) => (
                <div key={t.label} className="p-2.5 rounded-lg bg-surface-container-high border border-outline-variant/40 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">{t.label}</span>
                      <strong className="text-on-surface">{fmt(t.price)}</strong>
                    </span>
                    <span className={t.distance_pct >= 0 ? 'text-tertiary' : 'text-error'}>
                      {t.distance_pct >= 0 ? '+' : ''}
                      {t.distance_pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-on-surface-variant truncate">{t.sources.join(' · ')}</span>
                    <span className="text-[10px] text-secondary shrink-0">Kekuatan {t.strength}%</span>
                  </div>
                  <div className="mt-1 h-1 rounded bg-surface-container-highest overflow-hidden">
                    <div className="h-full bg-emerald-400" style={{ width: `${t.strength}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-on-surface-variant">Belum ada level target signifikan searah posisi.</p>
            )}
          </div>

          {/* Fibonacci */}
          {fibonacci?.levels && (
            <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-on-surface-variant uppercase tracking-wider">
                  Fibonacci Retracement
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    fibonacci.trend === 'up' ? 'bg-tertiary-container/30 text-tertiary' : 'bg-error-container text-error'
                  }`}
                >
                  {fibonacci.trend === 'up' ? 'Swing Low → High' : 'Swing High → Low'}
                </span>
              </div>
              <div className="space-y-1 text-xs font-mono">
                {[...fibonacci.levels, ...(fibonacci.extensions || []).map((e) => ({ ...e, ext: true }))]
                  .sort((a, b) => b.price - a.price)
                  .map((lv) => (
                    <div
                      key={`${lv.ext ? 'e' : 'r'}-${lv.label}`}
                      className={`flex items-center justify-between px-2 py-1 rounded ${
                        lv.label === '0.618' || lv.label === '0.5' ? 'bg-yellow-500/10' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2 text-on-surface-variant">
                        <span className={`w-2 h-2 rounded-full ${FIB_DOT[lv.label] || 'bg-slate-400'}`} />
                        {lv.ext ? `Ext ${lv.label}` : lv.label}
                        {lv.label === '0.618' && !lv.ext && <span className="text-[9px] text-yellow-400">GOLDEN</span>}
                      </span>
                      <strong className="text-on-surface">{fmt(lv.price)}</strong>
                    </div>
                  ))}
              </div>
              <div className="pt-2 border-t border-outline-variant/40 text-[11px] font-mono text-on-surface-variant space-y-0.5">
                <div>
                  Golden Pocket: <span className="text-yellow-400">{fmt(fibonacci.golden_pocket?.bottom)} – {fmt(fibonacci.golden_pocket?.top)}</span>
                </div>
                <div>
                  Posisi harga: <span className="text-on-surface">{fibonacci.position}</span> ({(fibonacci.retracement * 100).toFixed(1)}%)
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Multi-Indicator Confluence */}
      {confluence?.signals && (
        <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-on-surface-variant uppercase tracking-wider">
              Konfluensi Multi-Indikator
            </span>
            <span className="text-xs font-mono">
              <span
                className={`font-bold ${
                  confluence.score > 0 ? 'text-tertiary' : confluence.score < 0 ? 'text-error' : 'text-on-surface'
                }`}
              >
                {confluence.verdict} ({confluence.score > 0 ? '+' : ''}
                {confluence.score})
              </span>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {confluence.signals.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-surface-container-high border border-outline-variant/40 text-[11px] font-mono"
              >
                <div className="min-w-0">
                  <div className="text-on-surface font-semibold">{s.name}</div>
                  <div className="text-on-surface-variant truncate">{s.detail}</div>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    s.vote > 0
                      ? 'bg-tertiary-container/30 text-tertiary'
                      : s.vote < 0
                      ? 'bg-error-container text-error'
                      : 'bg-surface-container-highest text-on-surface-variant'
                  }`}
                >
                  {s.vote > 0 ? 'BULL' : s.vote < 0 ? 'BEAR' : 'NETRAL'}
                </span>
              </div>
            ))}
          </div>
          <div className="text-[11px] font-mono text-on-surface-variant">
            Kesesuaian dengan posisi {isShort ? 'SHORT' : 'LONG'}:{' '}
            <strong className={confluence.alignment_pct >= 50 ? 'text-tertiary' : 'text-amber-400'}>
              {confluence.agree_count}/{confluence.total} indikator ({confluence.alignment_pct}%)
            </strong>
            {confluence.alignment_pct < 50 && ' — setup lemah, tunggu konfirmasi tambahan.'}
          </div>
        </div>
      )}

      {/* Candlestick Patterns Detected */}
      {candlestick_patterns.length > 0 && (
        <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/50 space-y-2">
          <span className="text-xs font-mono font-semibold text-on-surface-variant uppercase tracking-wider">
            Candlestick Formations
          </span>
          <div className="space-y-2">
            {candlestick_patterns.map((cp, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between p-2.5 rounded-lg bg-surface-container-high border border-outline-variant/40 text-xs"
              >
                <div>
                  <span className="font-bold text-on-surface font-mono">{cp.name}</span>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">{cp.desc}</p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                    cp.bias === 'Bullish'
                      ? 'bg-tertiary-container/30 text-tertiary'
                      : cp.bias === 'Bearish'
                      ? 'bg-error-container text-error'
                      : 'bg-surface-container-highest text-on-surface-variant'
                  }`}
                >
                  {cp.bias}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
