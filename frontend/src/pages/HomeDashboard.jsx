import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Flame, Shield, TrendingUp, BarChart2, DollarSign, Sparkles, ChevronRight } from 'lucide-react';
import { api } from '../services/api';
import ScreenerTable from '../components/screener/ScreenerTable';

export default function HomeDashboard() {
  const [screenerData, setScreenerData] = useState({ total: 0, items: [] });
  const [timeframe, setTimeframe] = useState('15m');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await api.getScreener('', 0, timeframe);
        setScreenerData(res || { total: 0, items: [] });
      } catch (err) {
        console.error('Failed fetching screener', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [timeframe]);

  const anomalyCount = screenerData.items.filter((i) => i.volume_anomaly).length;
  const highScoreCount = screenerData.items.filter((i) => i.score >= 80).length;

  return (
    <div className="space-y-6 max-w-[1720px] w-full mx-auto font-body">
      {/* 1. Sleek Hero Banner */}
      <div className="relative overflow-hidden rounded-xl bg-surface-container border border-outline-variant/60 p-6 sm:p-7 shadow-lg">
        <div className="absolute right-0 top-0 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-3 max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-md bg-primary-container/20 border border-primary/30 text-primary text-xs font-mono font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>High-Frequency Scalping Engine • 1s to 1d Multi-Timeframe • SciPy Micro-Peaks</span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-headline font-bold text-on-surface tracking-tight leading-snug">
            Scalping Quantitative Intelligence
          </h1>

          <p className="text-on-surface-variant text-xs sm:text-sm leading-relaxed">
            Pemindai peluang scalping berkecepatan tinggi dengan timeframe <strong className="text-on-surface">1 Detik (1s) hingga 1 Hari (1d)</strong> (didukung menu utama <strong className="text-on-surface">1m, 5m, 15m, 30m, 1h, 4h</strong>), berbasis kalkulasi <strong className="text-on-surface">SciPy Signal Peaks</strong>, target dinamis <strong className="text-on-surface">ATR Scalper TP/SL</strong>, serta eksekusi presisi untuk <strong className="text-primary font-semibold">Kripto</strong> dan <strong className="text-tertiary font-semibold">Forex & Gold</strong>.
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-2 font-mono text-xs">
            <Link
              to="/analysis/BTC-USD"
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-semibold shadow-md transition-all"
            >
              <span>Deep Scalp Analysis</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>

            <Link
              to="/crypto"
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-medium border border-outline-variant/60 transition-all"
            >
              <BarChart2 className="w-3.5 h-3.5 text-primary" />
              <span>Crypto Scalp</span>
            </Link>

            <Link
              to="/forex"
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-medium border border-outline-variant/60 transition-all"
            >
              <DollarSign className="w-3.5 h-3.5 text-tertiary" />
              <span>Forex & Gold</span>
            </Link>

            <Link
              to="/analysis/GC=F"
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-yellow-400 font-medium border border-yellow-500/30 transition-all"
            >
              <span>🥇 Gold (XAU/USD)</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. 3 Minimalist Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/50 shadow-sm flex items-center space-x-3.5">
          <div className="p-2.5 rounded-lg bg-primary-container/20 text-primary border border-primary/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-headline font-bold font-mono text-on-surface">
              {screenerData.total} Assets
            </div>
            <div className="text-[11px] text-on-surface-variant font-mono">
              Scanned Across Multi-Markets
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/50 shadow-sm flex items-center space-x-3.5">
          <div className="p-2.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/20">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-headline font-bold font-mono text-amber-400">
              {anomalyCount} Surges
            </div>
            <div className="text-[11px] text-on-surface-variant font-mono">
              Volume &gt; 1.5x SMA 20
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/50 shadow-sm flex items-center space-x-3.5">
          <div className="p-2.5 rounded-lg bg-tertiary-container/30 text-tertiary border border-tertiary/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-headline font-bold font-mono text-tertiary">
              {highScoreCount} Prime
            </div>
            <div className="text-[11px] text-on-surface-variant font-mono">
              Score Rating &ge; 80 / 100
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Opportunity Screener Table */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-headline font-bold text-on-surface flex items-center space-x-2">
            <Activity className="w-4 h-4 text-primary" />
            <span>Market Opportunity Screener</span>
          </h2>
          <span className="text-xs font-mono text-on-surface-variant hidden sm:inline">
            Pola Geometri & Breakout Engine
          </span>
        </div>

        <ScreenerTable
          items={screenerData.items}
          isLoading={loading}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
        />
      </div>
    </div>
  );
}
