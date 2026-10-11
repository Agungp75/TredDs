import React from 'react';
import { Link } from 'react-router-dom';

export default function StockDetailModal({ stock, isOpen, onClose }) {
  if (!isOpen || !stock) return null;

  const symbol = stock.symbol || 'NVDA';
  const name = stock.name || 'NVIDIA Corporation';
  const price = stock.price ?? 128.50;
  const changePct = stock.change_pct ?? 3.42;
  const isPos = changePct >= 0;
  const marketCap = stock.market_cap || '$3.15T';
  const rvol = stock.rvol || '3.42x';
  const pe = stock.pe || '32.4x';
  const cluster = stock.cluster || 'AI Compute & Accelerators · Blackwell Ultra';
  const darkPool = stock.dark_pool || '+$842.6M';
  const score = stock.score ?? 96;
  const setup = stock.setup || 'Stage 2 Pocket Pivot';
  const target = stock.target || (price * 1.105).toFixed(2);
  const stop = stock.stop || (price * 0.968).toFixed(2);
  const rr = stock.rr || '3.28 : 1';
  const thesis = stock.thesis || `Algorithmic trigger: High-conviction dark pool accumulation (${darkPool} net buy prints) concurrent with an RSI 66.8 volatility compression breakout above the 20-day upper Bollinger band. Relative volume is running at ${rvol} 30-day baseline with accelerating call-implied skew.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xl animate-fade-in overflow-y-auto font-body">
      <div className="relative w-full max-w-3xl bg-surface-container rounded-xl border border-outline-variant/60 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-surface-container-high px-6 py-4 border-b border-outline-variant/50 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-primary/10 text-primary border border-primary/20">
              {cluster}
            </span>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-tertiary">
              <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
              <span>LIVE FEED · SYNCED (186 ops/s)</span>
            </div>
          </div>
          <button
            aria-label="Tutup Modal"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Identity & Price Bar */}
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 border-b border-outline-variant/40 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-headline font-bold text-on-surface tracking-tight">
                  {symbol}
                </h3>
                <span className="text-sm font-headline text-on-surface-variant font-medium">
                  {name}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary text-on-primary">
                  RANK #1
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-on-surface-variant mt-1.5">
                <span>
                  Market Cap: <strong className="text-on-surface">{marketCap}</strong>
                </span>
                <span>·</span>
                <span>
                  Volume: <strong className="text-on-surface">{rvol} RVol</strong>
                </span>
                <span>·</span>
                <span>
                  PE (Fwd): <strong className="text-on-surface">{pe}</strong>
                </span>
                {stock.pbv && (
                  <>
                    <span>·</span>
                    <span>PBV: <strong className="text-on-surface">{stock.pbv}</strong></span>
                  </>
                )}
                {stock.roe && (
                  <>
                    <span>·</span>
                    <span>ROE: <strong className="text-tertiary">{stock.roe}</strong></span>
                  </>
                )}
                {stock.div_yield && (
                  <>
                    <span>·</span>
                    <span>Div Yield: <strong className="text-on-surface">{stock.div_yield}</strong></span>
                  </>
                )}
              </div>
            </div>

            <div className="flex sm:flex-col items-baseline sm:items-end gap-2 sm:gap-0 font-mono">
              <div className="text-2xl font-bold text-tertiary">
                ${typeof price === 'number' ? price.toFixed(2) : price}
              </div>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${isPos ? 'bg-tertiary-container text-on-tertiary' : 'bg-error-container text-on-error-container'}`}>
                <span className="material-symbols-outlined text-[14px]">
                  {isPos ? 'arrow_upward' : 'arrow_downward'}
                </span>
                {isPos ? `+${changePct}% Today` : `${changePct}% Today`}
              </span>
            </div>
          </div>

          {/* Intraday Price & Stochastic Volatility Compression */}
          <div className="bg-surface-container-lowest p-4 rounded-lg border border-outline-variant/40 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-primary">show_chart</span>
                Intraday Price & Stochastic Volatility Compression
              </span>
              <span className="text-tertiary font-semibold">
                Session Range: ${(price * 0.98).toFixed(2)} - ${(price * 1.02).toFixed(2)}
              </span>
            </div>

            <div className="h-20 w-full flex items-end">
              <svg className="w-full h-full text-tertiary" fill="none" preserveAspectRatio="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 400 80">
                <line stroke="#52525b" strokeDasharray="3 3" strokeWidth="1" x1="0" x2="400" y1="65" />
                <line stroke="#7c3aed" strokeDasharray="3 3" strokeWidth="1" x1="0" x2="400" y1="15" />
                <polyline points="0,70 40,62 80,68 120,50 160,54 200,38 240,42 280,26 320,30 360,18 400,12" />
              </svg>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-on-surface-variant pt-1 border-t border-outline-variant/30">
              <span>Dynamic Stop ATR: <strong className="text-error">${stop}</strong></span>
              <span>EMA 20 Support: <strong className="text-on-surface">${(price * 0.985).toFixed(2)}</strong></span>
              <span>Live: <strong className="text-tertiary">${price}</strong></span>
              <span>Breakout Target: <strong className="text-primary">${target}</strong></span>
            </div>
          </div>

          {/* 4 Quick Stat Boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
            <div className="bg-surface-container-high p-3 rounded-lg border border-outline-variant/40">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                Dark Pool Net Flow
              </div>
              <div className="text-base font-bold text-tertiary mt-1">{darkPool}</div>
              <div className="text-[11px] text-on-surface mt-0.5">78% Buy Ratio</div>
              <div className="text-[10px] text-on-surface-variant">1,420 Prints &gt; $5M</div>
            </div>

            <div className="bg-surface-container-high p-3 rounded-lg border border-outline-variant/40">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                Quant Alpha Score
              </div>
              <div className="text-base font-bold text-primary mt-1">{score} / 100</div>
              <div className="text-[11px] text-on-surface mt-0.5">Stochastic 96.4%</div>
              <div className="text-[10px] text-tertiary">Z-Score: +1.84σ</div>
            </div>

            <div className="bg-surface-container-high p-3 rounded-lg border border-outline-variant/40">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                Setup Archetype
              </div>
              <div className="text-sm font-bold text-on-surface mt-1 truncate">{setup}</div>
              <div className="text-[11px] text-tertiary mt-0.5">RSI: 66.8</div>
              <div className="text-[10px] text-on-surface-variant">MACD Bull Crossover</div>
            </div>

            <div className="bg-surface-container-high p-3 rounded-lg border border-outline-variant/40">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                Target & Risk/Reward
              </div>
              <div className="text-base font-bold text-tertiary mt-1">${target}</div>
              <div className="text-[11px] text-error mt-0.5">Stop: ${stop}</div>
              <div className="text-[10px] text-primary font-bold">R/R: {rr}</div>
            </div>
          </div>

          {/* Thesis */}
          <div className="bg-surface-container-low p-3.5 rounded-lg border border-outline-variant/40 flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] text-primary shrink-0 mt-0.5">
              smart_toy
            </span>
            <div className="space-y-1 text-xs">
              <div className="font-mono font-semibold text-on-surface">
                Algorithmic Quantitative Thesis
              </div>
              <p className="text-on-surface-variant leading-relaxed">{thesis}</p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-surface-container-high px-6 py-4 border-t border-outline-variant/50 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-xs">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-highest transition-colors border border-outline-variant/60"
          >
            Tutup Modal
          </button>
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            <Link
              to={`/analysis/${encodeURIComponent(symbol)}`}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
            >
              <span>Buka Deep Analysis {symbol}</span>
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
