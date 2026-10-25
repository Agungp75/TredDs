import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Flame, Shield, BarChart2, Sparkles, ChevronRight, Zap } from 'lucide-react';
import { api } from '../services/api';
import ScreenerTable from '../components/screener/ScreenerTable';
import CryptoCorrelationMatrix from '../components/widgets/CryptoCorrelationMatrix';
import CryptoCatalystCalendar from '../components/widgets/CryptoCatalystCalendar';

export default function HomeDashboard() {
  const [screenerData, setScreenerData] = useState({ total: 0, items: [] });
  const [timeframe, setTimeframe] = useState('15m');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await api.getScreener('crypto', 0, timeframe);
        setScreenerData(res || { total: 0, items: [] });
      } catch (err) {
        console.error('Failed fetching MEXC screener', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [timeframe]);

  const sfpOrSurgeCount = screenerData.items.filter(
    (i) => i.sfp_detected !== 'NONE' || i.volume_anomaly
  ).length;
  const highEvCount = screenerData.items.filter(
    (i) => i.trade_validity === 'EXECUTABLE_HIGH_EDGE' || i.score >= 78
  ).length;
  const squeezeCount = screenerData.items.filter((i) => i.strategy_tags?.is_squeeze).length;

  return (
    <div className="space-y-6 max-w-[1720px] w-full mx-auto font-body">
      {/* 1. ATRED v3.0 MEXC Hero Banner */}
      <div className="relative overflow-hidden rounded-xl bg-surface-container border border-outline-variant/60 p-6 sm:p-7 shadow-lg">
        <div className="absolute right-0 top-0 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-3 max-w-4xl">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              ATRED v3.0 • 100% MEXC Crypto USDT-M & Spot • 0% Maker Fee • Fair Price SL • RANSAC & SFP Engine
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-headline font-bold text-on-surface tracking-tight leading-snug">
            MEXC Quantitative & Derivatives Intelligence
          </h1>

          <p className="text-on-surface-variant text-xs sm:text-sm leading-relaxed">
            Mesin pemindai pasar dua tahap (<strong className="text-on-surface">Two-Stage MEXC Full-Market Screener</strong>) dengan arsitektur 3-Layer: <strong className="text-on-surface">Layer 1</strong> (Regresi Trendline Robust RANSAC/Huber tahan Scam Wick, Detektor Swing Failure Pattern / SFP Stop-Hunt, Rezim ADX+Hurst, &amp; BTC Gate), <strong className="text-on-surface">Layer 2</strong> (Open Interest Matrix, Funding Squeeze, 20-Level Orderbook Imbalance, &amp; CVD), serta <strong className="text-cyan-400">Layer 3 &amp; Eksekusi 0% Maker Fee MEXC</strong>.
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-2 font-mono text-xs">
            <Link
              to="/analysis/BTC_USDT"
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-semibold shadow-md transition-all"
            >
              <span>3-Layer Quant Terminal (BTC_USDT)</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>

            <Link
              to="/crypto"
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-medium border border-outline-variant/60 transition-all"
            >
              <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Top-40 Pattern Search &amp; Explorer</span>
            </Link>

            <Link
              to="/analysis/SOL_USDT"
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-emerald-400 font-medium border border-emerald-500/30 transition-all"
            >
              <span>⚡ SOL_USDT Perp</span>
            </Link>

            <Link
              to="/analysis/PEPE_USDT"
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-amber-400 font-medium border border-amber-500/30 transition-all"
            >
              <span>🐸 PEPE_USDT Perp</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. 4 Telemetry Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/50 shadow-sm flex items-center space-x-3.5">
          <div className="p-2.5 rounded-lg bg-primary-container/20 text-primary border border-primary/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-headline font-bold font-mono text-on-surface">
              {screenerData.total} USDT-M Pairs
            </div>
            <div className="text-[11px] text-on-surface-variant font-mono">
              Stage-1 Funnel &rarr; Stage-2 Deep Scan
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/50 shadow-sm flex items-center space-x-3.5">
          <div className="p-2.5 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-headline font-bold font-mono text-cyan-400">
              {squeezeCount} Squeeze Setups
            </div>
            <div className="text-[11px] text-on-surface-variant font-mono">
              Funding &amp; OI Imbalance Fuel
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/50 shadow-sm flex items-center space-x-3.5">
          <div className="p-2.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/20">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-headline font-bold font-mono text-amber-400">
              {sfpOrSurgeCount} SFP / Surges
            </div>
            <div className="text-[11px] text-on-surface-variant font-mono">
              Stop-Hunt Sweep &amp; Vol &gt; 1.5x SMA
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/50 shadow-sm flex items-center space-x-3.5">
          <div className="p-2.5 rounded-lg bg-tertiary-container/30 text-tertiary border border-tertiary/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-headline font-bold font-mono text-tertiary">
              {highEvCount} High Net-EV
            </div>
            <div className="text-[11px] text-on-surface-variant font-mono">
              EV Net &gt; +0.15% (0% Maker Fee)
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Two-Stage MEXC Opportunity Screener Table */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-headline font-bold text-on-surface flex items-center space-x-2">
            <Activity className="w-4 h-4 text-primary" />
            <span>Two-Stage MEXC Opportunity Screener</span>
          </h2>
          <span className="text-xs font-mono text-on-surface-variant hidden sm:inline">
            0.30 Tech + 0.30 Orderflow/OI + 0.25 Stat EV + 0.15 BTC RS
          </span>
        </div>

        <ScreenerTable
          items={screenerData.items}
          isLoading={loading}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
        />
      </div>

      {/* 4. Bottom Intelligence Widgets: BTC Correlation/RS Matrix & MEXC Funding Settlement Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        <CryptoCorrelationMatrix />
        <CryptoCatalystCalendar />
      </div>
    </div>
  );
}
