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
    { path: '/', label: 'Scalping Screener' },
    { path: '/crypto', label: 'Crypto Scalp' },
    { path: '/forex', label: 'Forex & Gold' },
    { path: '/analysis/BTC-USD', label: 'Deep Scalp Analysis', matchPrefix: '/analysis' },
  ];

  const ribbonTickers = [
    { sym: 'GC=F', label: 'XAU/USD (Gold)', type: 'forex' },
    { sym: 'BTC-USD', label: 'BTC/USD', type: 'crypto' },
    { sym: 'ETH-USD', label: 'ETH/USD', type: 'crypto' },
    { sym: 'SOL-USD', label: 'SOL/USD', type: 'crypto' },
    { sym: 'EURUSD=X', label: 'EUR/USD', type: 'forex' },
    { sym: 'GBPUSD=X', label: 'GBP/USD', type: 'forex' },
    { sym: 'USDJPY=X', label: 'USD/JPY', type: 'forex' },
    { sym: 'AUDUSD=X', label: 'AUD/USD', type: 'forex' },
  ];

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      let q = searchQuery.trim().toUpperCase().replace('/', '').replace('.P', '');
      if (['BTC', 'ETH', 'SOL', 'AVAX', 'BNB', 'XRP', 'ADA', 'DOGE', 'NEAR', 'LINK', 'DOT', 'SUI', 'APT', 'PEPE'].includes(q)) {
        q = `${q}-USD`;
      } else if (q.endsWith('USDT')) {
        q = `${q.slice(0, -4)}-USD`;
      } else if (['GOLD', 'XAU', 'XAUUSD'].includes(q)) {
        q = 'GC=F';
      } else if (['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF'].includes(q)) {
        q = `${q}=X`;
      }
      navigate(`/analysis/${encodeURIComponent(q)}`);
      setSearchQuery('');
    }
  };

  return (
    <header className="fixed top-0 w-full z-50 bg-surface/90 backdrop-blur-xl border-b border-outline-variant/60 font-body">
      {/* 1. Live Continuous Marquee Ticker Tape */}
      <div className="w-full h-8 bg-surface-container-lowest border-b border-outline-variant/40 overflow-hidden flex items-center select-none">
        <div className="animate-marquee flex items-center gap-8 text-[11px] font-mono tracking-tight text-on-surface-variant">
          {/* First loop */}
          <div className="flex items-center gap-8">
            {ribbonTickers.map((t) => {
              const tick = liveTicks[t.sym];
              const price = tick ? formatCurrency(tick.price, t.type, t.sym) : '...';
              const change = tick ? tick.change_pct : 0.0;
              const isPos = change >= 0;
              return (
                <Link
                  key={`marq1-${t.sym}`}
                  to={`/analysis/${encodeURIComponent(t.sym)}`}
                  className="flex items-center gap-1.5 hover:text-on-surface transition-colors"
                >
                  <span className="text-on-surface font-semibold">{t.label}</span>
                  <span>{price}</span>
                  <span className={`font-medium ${isPos ? 'text-tertiary' : 'text-error'}`}>
                    {formatPercent(change)}
                  </span>
                  <span className="text-outline mx-1">|</span>
                </Link>
              );
            })}
          </div>

          {/* Duplicated loop for smooth infinite marquee */}
          <div className="flex items-center gap-8">
            {ribbonTickers.map((t) => {
              const tick = liveTicks[t.sym];
              const price = tick ? formatCurrency(tick.price, t.type, t.sym) : '...';
              const change = tick ? tick.change_pct : 0.0;
              const isPos = change >= 0;
              return (
                <Link
                  key={`marq2-${t.sym}`}
                  to={`/analysis/${encodeURIComponent(t.sym)}`}
                  className="flex items-center gap-1.5 hover:text-on-surface transition-colors"
                >
                  <span className="text-on-surface font-semibold">{t.label}</span>
                  <span>{price}</span>
                  <span className={`font-medium ${isPos ? 'text-tertiary' : 'text-error'}`}>
                    {formatPercent(change)}
                  </span>
                  <span className="text-outline mx-1">|</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <div className="h-16 max-w-[1720px] mx-auto px-6 xl:px-10 flex items-center justify-between gap-6">
        {/* Brand & Nav */}
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-3 group">
            <AtredLogo size={32} className="h-8 w-auto object-contain transition-transform group-hover:scale-105" />
            <div className="flex items-center gap-2">
              <span className="text-lg font-headline font-bold tracking-tight text-on-surface">
                ATRED
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wider uppercase rounded bg-surface-container-highest text-primary border border-outline-variant">
                SCALP QUANT v2.0
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
          {/* Live Status indicator */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded bg-surface-container border border-outline-variant/60 text-[11px] font-mono">
            <span
              className={`h-2 w-2 rounded-full ${
                wsConnected ? 'bg-tertiary animate-pulse' : 'bg-amber-400'
              }`}
            ></span>
            <span className="text-tertiary font-semibold uppercase tracking-wider">
              {wsConnected ? 'MARKET LIVE' : 'SYNCING'}
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
              placeholder="⌘K Search symbol..."
              className="w-44 lg:w-56 pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg bg-surface-container text-on-surface border border-outline-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-secondary transition-all"
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
                  <span className="font-bold text-on-surface">Market Volatility Alerts</span>
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
                    Belum ada lonjakan volatilitas ekstrem (&ge; 3% 24h) pada sesi ini.
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

          {/* User / 1-Click Deep Analysis */}
          <Link
            to="/analysis/BTC-USD"
            className="w-8 h-8 rounded-full bg-primary hover:bg-primary-container text-on-primary flex items-center justify-center transition-colors shadow-sm"
            title="Analisis Cepat BTC"
          >
            <span className="material-symbols-outlined text-[18px]">candlestick_chart</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
