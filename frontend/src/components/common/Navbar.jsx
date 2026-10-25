import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMarket } from '../../context/MarketContext';
import { useAI } from '../../context/AIContext';
import { formatCurrency, formatPercent } from '../../utils/formatters';
import AtredLogo from './AtredLogo';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { wsConnected, liveTicks, alerts } = useMarket();
  const { openSettings, isConfigured, aiConfig } = useAI();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const navLinks = [
    { path: '/', label: 'MEXC Opportunity Screener' },
    { path: '/crypto', label: 'Pattern Search & Market Explorer' },
    { path: '/analysis/BTC_USDT', label: '3-Layer Quant & Derivatives Terminal', matchPrefix: '/analysis' },
  ];

  const ribbonTickers = [
    { sym: 'BTC_USDT', label: 'BTC/USDT.P', type: 'crypto' },
    { sym: 'ETH_USDT', label: 'ETH/USDT.P', type: 'crypto' },
    { sym: 'SOL_USDT', label: 'SOL/USDT.P', type: 'crypto' },
    { sym: 'BNB_USDT', label: 'BNB/USDT.P', type: 'crypto' },
    { sym: 'XRP_USDT', label: 'XRP/USDT.P', type: 'crypto' },
    { sym: 'DOGE_USDT', label: 'DOGE/USDT.P', type: 'crypto' },
    { sym: 'SUI_USDT', label: 'SUI/USDT.P', type: 'crypto' },
    { sym: 'PEPE_USDT', label: 'PEPE/USDT.P', type: 'crypto' },
  ];

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      let q = searchQuery.trim().toUpperCase().replace('/', '_').replace('-', '_').replace('.P', '');
      if (q.endsWith('USDT') && !q.endsWith('_USDT')) {
        q = `${q.slice(0, -4)}_USDT`;
      } else if (!q.includes('_')) {
        q = `${q}_USDT`;
      }
      navigate(`/analysis/${encodeURIComponent(q)}`);
      setSearchQuery('');
    }
  };

  return (
    <header className="fixed top-0 w-full z-50 bg-surface/90 backdrop-blur-xl border-b border-outline-variant/60 font-body">
      {/* 1. Live Continuous MEXC USDT-M Marquee Ticker Tape */}
      <div className="w-full h-8 bg-surface-container-lowest border-b border-outline-variant/40 overflow-hidden flex items-center select-none">
        <div className="animate-marquee flex items-center gap-8 text-[11px] font-mono tracking-tight text-on-surface-variant">
          {[1, 2].map((loopIdx) => (
            <div key={loopIdx} className="flex items-center gap-8">
              {ribbonTickers.map((t) => {
                const tick = liveTicks[t.sym];
                const price = tick ? formatCurrency(tick.price, t.type, t.sym) : '...';
                const change = tick ? tick.change_pct : 0.0;
                const funding = tick && tick.fundingRate !== undefined ? `${(tick.fundingRate * 100).toFixed(3)}%` : null;
                const isPos = change >= 0;
                return (
                  <Link
                    key={`marq-${loopIdx}-${t.sym}`}
                    to={`/analysis/${encodeURIComponent(t.sym)}`}
                    className="flex items-center gap-1.5 hover:text-on-surface transition-colors"
                  >
                    <span className="text-on-surface font-semibold">{t.label}</span>
                    <span>{price}</span>
                    <span className={`font-medium ${isPos ? 'text-tertiary' : 'text-error'}`}>
                      {formatPercent(change)}
                    </span>
                    {funding && (
                      <span className="text-[10px] text-cyan-400/80">F:{funding}</span>
                    )}
                    <span className="text-outline mx-1">|</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <div className="h-16 max-w-[1720px] mx-auto px-6 xl:px-10 flex items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-3 group">
            <AtredLogo size={32} className="h-8 w-auto object-contain transition-transform group-hover:scale-105" />
            <div className="flex items-center gap-2">
              <span className="text-lg font-headline font-bold tracking-tight text-on-surface">
                ATRED
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wider uppercase rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                MEXC QUANT v3.0
              </span>
            </div>
          </Link>

          <nav className="hidden xl:flex items-center gap-1 h-16">
            {navLinks.map((link) => {
              const isActive = link.matchPrefix
                ? location.pathname.startsWith(link.matchPrefix)
                : location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-3.5 py-2 rounded text-sm transition-all flex items-center ${
                    isActive
                      ? 'bg-surface-container-high text-primary font-semibold border-b-2 border-primary'
                      : 'font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Status Telemetry & Controls */}
        <div className="flex items-center gap-3">
          {/* MEXC WebSocket Edge & 0% Maker Fee Badge */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded bg-surface-container border border-outline-variant/60 text-[11px] font-mono">
            <span
              className={`h-2 w-2 rounded-full ${
                wsConnected ? 'bg-tertiary animate-pulse' : 'bg-amber-400'
              }`}
            ></span>
            <span className="text-tertiary font-semibold uppercase tracking-wider">
              {wsConnected ? 'MEXC WS EDGE • 0% MAKER' : 'SYNCING MEXC'}
            </span>
          </div>

          {/* Quick Search */}
          <form onSubmit={handleSearchSubmit} className="relative hidden sm:flex items-center">
            <span className="material-symbols-outlined absolute left-2.5 text-[18px] text-on-surface-variant pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="⌘K Cari koin MEXC (mis. SOL, PEPE, SUI)..."
              className="w-48 lg:w-60 pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg bg-surface-container text-on-surface border border-outline-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-secondary transition-all"
            />
          </form>

          {/* AI Engine Configuration Button */}
          <button
            type="button"
            onClick={openSettings}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isConfigured
                ? 'bg-tertiary-container/25 border-tertiary/40 text-tertiary hover:bg-tertiary-container/40'
                : 'bg-surface-container border-outline-variant/60 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
            title="Konfigurasi AI Provider & API Key (Gemini, OpenAI, DeepSeek, Groq)"
          >
            <span className="material-symbols-outlined text-[17px] text-primary">auto_awesome</span>
            <span className="hidden md:inline">
              {isConfigured ? aiConfig.provider.toUpperCase() : 'AI Setup'}
            </span>
          </button>

          {/* Quick Notifications Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              aria-label="Notifications"
              className="relative p-2 rounded-lg bg-surface-container border border-outline-variant/60 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">notifications</span>
              {alerts.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl bg-surface-container-high border border-outline-variant/80 shadow-2xl p-3 z-50 font-mono text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
                  <span className="font-bold text-on-surface">MEXC Volatility & Squeeze Alerts</span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="text-on-surface-variant hover:text-on-surface text-[11px]"
                  >
                    Tutup
                  </button>
                </div>
                {alerts.length === 0 ? (
                  <div className="py-4 text-center text-on-surface-variant text-[11px]">
                    Belum ada lonjakan volatilitas ekstrem (&ge; 4% 24h) pada sesi ini.
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-1.5">
                    {alerts.map((al, i) => (
                      <Link
                        key={i}
                        to={`/analysis/${encodeURIComponent(al.symbol)}`}
                        onClick={() => setNotifOpen(false)}
                        className="block p-2 rounded-lg bg-surface-container hover:bg-surface-bright border border-outline-variant/40 transition-colors"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <strong className="text-primary">{al.symbol}</strong>
                          <span className="text-tertiary">Score {al.score}</span>
                        </div>
                        <div className="text-[11px] text-on-surface mt-0.5">{al.message}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Link
            to="/analysis/BTC_USDT"
            className="w-8 h-8 rounded-full bg-primary hover:bg-primary-container text-on-primary flex items-center justify-center transition-colors shadow-sm"
            title="Terminal Kuantitatif BTC_USDT"
          >
            <span className="material-symbols-outlined text-[18px]">candlestick_chart</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
