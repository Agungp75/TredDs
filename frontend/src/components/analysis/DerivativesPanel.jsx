import React from 'react';
import { formatCurrency, formatCompactNumber } from '../../utils/formatters';

export default function DerivativesPanel({ derivatives, executionPlan, regimeContext, symbol }) {
  if (!derivatives) return null;

  const fundingPct = Number(derivatives.funding_rate_pct ?? 0);
  const fundingRegime = derivatives.funding_regime || 'NEUTRAL_FUNDING';
  const squeezeStatus = derivatives.squeeze_status || 'LOW_SQUEEZE_RISK';

  const oiVal = Number(derivatives.open_interest ?? 0);
  const oiDelta = Number(derivatives.oi_change_4h_pct ?? 0);
  const oiRegime = derivatives.oi_regime || 'NEW_LONG_BUILDUP';
  const oiDesc = derivatives.oi_description || '';

  const obi = Number(derivatives.obi_20_level ?? 0); // -1.0 .. +1.0
  const obiPct = Math.round(obi * 100);
  const obiStatus = derivatives.obi_status || 'BALANCED_BOOK';
  const bidRatioPct = Math.min(95, Math.max(5, Math.round(((obi + 1) / 2) * 100)));

  const cvdTrend = derivatives.cvd_trend || 'NEUTRAL';
  const cvdDiv = derivatives.cvd_divergence || 'NONE';

  const fairPrice = derivatives.fair_price ?? derivatives.last_price;
  const lastPrice = derivatives.last_price ?? fairPrice;
  const fairSpreadPct = Number(derivatives.fair_last_spread_pct ?? 0);
  const wickWarn = Boolean(derivatives.wick_manipulation_warning);

  const maxZeroSlippageUsdt = Number(
    derivatives.max_zero_slippage_position_usdt ??
      executionPlan?.position_sizing?.max_zero_slippage_position_usdt ??
      25000
  );
  const top5DepthUsdt = Number(derivatives.top5_depth_usdt ?? maxZeroSlippageUsdt * 5);

  const oiBadgeStyle =
    oiRegime === 'NEW_LONG_BUILDUP'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : oiRegime === 'NEW_SHORT_BUILDUP'
      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      : oiRegime === 'SHORT_COVERING_RALLY'
      ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
      : 'bg-amber-500/15 text-amber-400 border-amber-500/30';

  const fundingBadgeStyle =
    fundingRegime === 'SHORT_SQUEEZE_FUEL'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : fundingRegime === 'OVERCROWDED_LONG_RISK'
      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      : 'bg-surface-container-highest text-on-surface-variant border-outline-variant/50';

  return (
    <div className="bg-surface-container-low rounded-xl border border-outline-variant/60 p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/40 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <span className="material-symbols-outlined text-[18px]">stacked_bar_chart</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-headline font-bold text-on-surface uppercase tracking-wider">
                Layer 2: MEXC Derivatives & Orderflow Microstructure
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                USDT-M PERP
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              20-Level Orderbook Imbalance (OBI), Open Interest Matrix, Funding Squeeze & Fair Price Guard
            </p>
          </div>
        </div>

        {/* Fair Price vs Last Price Basis Guard */}
        <div
          className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-2 ${
            wickWarn
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              : 'bg-surface-container border-outline-variant/50 text-on-surface-variant'
          }`}
        >
          <span className="material-symbols-outlined text-[15px] text-cyan-400">shield</span>
          <span>
            Fair Price: <strong className="text-on-surface">{formatCurrency(fairPrice, 'crypto', symbol)}</strong>
          </span>
          <span className="text-outline">|</span>
          <span>
            Basis Dev: <strong className={wickWarn ? 'text-rose-400' : 'text-emerald-400'}>{fairSpreadPct.toFixed(3)}%</strong>
          </span>
        </div>
      </div>

      {/* 4 Main Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* 1. Open Interest & Price Action Matrix */}
        <div className="bg-surface-container rounded-lg p-3.5 border border-outline-variant/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
            <span>OPEN INTEREST (HOLDVOL)</span>
            <span className={oiDelta >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {oiDelta >= 0 ? '+' : ''}
              {oiDelta.toFixed(2)}% (4H)
            </span>
          </div>
          <div className="my-2">
            <div className="text-base font-mono font-bold text-on-surface">
              ${formatCompactNumber(oiVal)} USDT
            </div>
            <span className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${oiBadgeStyle}`}>
              {oiRegime.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-[11px] text-on-surface-variant leading-snug">{oiDesc}</p>
        </div>

        {/* 2. Funding Rate & Squeeze Detector */}
        <div className="bg-surface-container rounded-lg p-3.5 border border-outline-variant/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
            <span>FUNDING RATE (8H)</span>
            <span className="text-cyan-400 font-semibold">{squeezeStatus.replace(/_/g, ' ')}</span>
          </div>
          <div className="my-2">
            <div
              className={`text-base font-mono font-bold ${
                fundingPct < 0 ? 'text-emerald-400' : fundingPct > 0.05 ? 'text-rose-400' : 'text-on-surface'
              }`}
            >
              {fundingPct >= 0 ? '+' : ''}
              {fundingPct.toFixed(4)}%
            </div>
            <span className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${fundingBadgeStyle}`}>
              {fundingRegime.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-[11px] text-on-surface-variant leading-snug">
            {fundingPct < -0.02
              ? 'Short membayar Long — Bahan bakar potensial untuk Short Squeeze.'
              : fundingPct > 0.05
              ? 'Long terlalu padat (Overcrowded) — Waspada risiko Long Flush.'
              : 'Funding rate seimbang, tidak ada biaya tahan posisi ekstrem.'}
          </p>
        </div>

        {/* 3. 20-Level Orderbook Imbalance (OBI) & Walls */}
        <div className="bg-surface-container rounded-lg p-3.5 border border-outline-variant/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
            <span>20-LEVEL L2 OBI</span>
            <span
              className={`font-bold ${
                obi > 0.15 ? 'text-emerald-400' : obi < -0.15 ? 'text-rose-400' : 'text-on-surface'
              }`}
            >
              {obiPct >= 0 ? `+${obiPct}%` : `${obiPct}%`} ({obiStatus.replace(/_/g, ' ')})
            </span>
          </div>

          {/* Horizontal Bid vs Ask Wall Progress Bar */}
          <div className="my-2.5 space-y-1.5">
            <div className="w-full h-3 rounded-full bg-rose-500/35 overflow-hidden flex border border-outline-variant/50">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${bidRatioPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-emerald-400 font-semibold">BID {bidRatioPct}%</span>
              <span className="text-rose-400 font-semibold">ASK {100 - bidRatioPct}%</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-on-surface-variant pt-1 border-t border-outline-variant/30">
            <span>
              Bid Wall:{' '}
              <strong className="text-emerald-400">
                {derivatives.strongest_bid_wall
                  ? formatCurrency(derivatives.strongest_bid_wall.price, 'crypto', symbol)
                  : '—'}
              </strong>
            </span>
            <span>
              Ask Wall:{' '}
              <strong className="text-rose-400">
                {derivatives.strongest_ask_wall
                  ? formatCurrency(derivatives.strongest_ask_wall.price, 'crypto', symbol)
                  : '—'}
              </strong>
            </span>
          </div>
        </div>

        {/* 4. CVD & Liquidity Slippage Guard */}
        <div className="bg-surface-container rounded-lg p-3.5 border border-outline-variant/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
            <span>CVD & SLIPPAGE GUARD</span>
            <span
              className={`font-bold ${
                cvdTrend.includes('BULLISH')
                  ? 'text-emerald-400'
                  : cvdTrend.includes('BEARISH')
                  ? 'text-rose-400'
                  : 'text-on-surface-variant'
              }`}
            >
              {cvdTrend.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="my-2">
            <div className="text-xs font-mono text-on-surface-variant">Max Zero-Slippage Order (20% Depth 5L):</div>
            <div className="text-base font-mono font-bold text-cyan-400">
              ${Number(maxZeroSlippageUsdt).toLocaleString('en-US', { maximumFractionDigits: 0 })} USDT
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-on-surface-variant pt-1 border-t border-outline-variant/30">
            <span>Top-5 Depth: ${formatCompactNumber(top5DepthUsdt)}</span>
            <span className={cvdDiv !== 'NONE' ? 'text-amber-400 font-bold' : ''}>
              {cvdDiv !== 'NONE' ? cvdDiv.replace(/_/g, ' ') : 'No CVD Divergence'}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Regime & BTC Gate Context Strip */}
      {regimeContext && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-lg bg-surface-container border border-outline-variant/40 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-on-surface-variant">
              Market Regime:{' '}
              <strong className="text-primary">{regimeContext.market_regime || 'TRANSITIONAL'}</strong>
            </span>
            <span className="text-outline">•</span>
            <span className="text-on-surface-variant">
              ADX(14): <strong className="text-on-surface">{regimeContext.adx_14 ?? 20}</strong>
            </span>
            <span className="text-outline">•</span>
            <span className="text-on-surface-variant">
              Hurst (H): <strong className="text-on-surface">{regimeContext.hurst_exponent ?? 0.5}</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-on-surface-variant">
              RS Alt/BTC (12B):{' '}
              <strong
                className={
                  Number(regimeContext.alt_rs_vs_btc_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }
              >
                {Number(regimeContext.alt_rs_vs_btc_pct ?? 0) >= 0 ? '+' : ''}
                {Number(regimeContext.alt_rs_vs_btc_pct ?? 0).toFixed(2)}%
              </strong>
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                regimeContext.btc_gate_status === 'BLOCKED_BY_BTC_DUMP'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              BTC GATE: {regimeContext.btc_gate_status || 'PASS'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
