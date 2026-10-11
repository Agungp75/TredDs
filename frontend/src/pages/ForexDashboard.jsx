import React, { useEffect, useState } from 'react';
import { DollarSign, ArrowUpRight, ArrowDownRight, Globe } from 'lucide-react';
import { api } from '../services/api';
import { useMarket } from '../context/MarketContext';
import ScreenerTable from '../components/screener/ScreenerTable';
import CurrencyCorrelation from '../components/macro/CurrencyCorrelation';
import EconomicCalendar from '../components/macro/EconomicCalendar';
import { formatPercent } from '../utils/formatters';

export default function ForexDashboard() {
  const { liveTicks } = useMarket();
  const [pairs, setPairs] = useState([]);
  const [correlation, setCorrelation] = useState({});
  const [calendar, setCalendar] = useState([]);
  const [screenerItems, setScreenerItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [pRes, cRes, calRes, sRes] = await Promise.all([
          api.getForexPairs(),
          api.getForexCorrelation(),
          api.getForexCalendar(),
          api.getScreener('forex'),
        ]);
        setPairs(pRes || []);
        setCorrelation(cRes || {});
        setCalendar(calRes || []);
        setScreenerItems(sRes?.items || []);
      } catch (err) {
        console.error('Failed loading forex data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-6 max-w-[1720px] w-full mx-auto font-body">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-outline-variant/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-widest text-primary">
              FX Microstructure
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-tertiary-container text-tertiary-fixed">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
              Institutional Interbank Feed
            </span>
          </div>
          <h1 className="text-2xl font-headline font-bold text-on-surface tracking-tight mt-1">
            Forex & Gold Scalping Intelligence
          </h1>
          <p className="text-xs text-on-surface-variant font-mono mt-0.5">
            Grid Pasangan Mata Uang Utama & Gold (XAU/USD), Matriks Korelasi Institusional, dan Kalender Makro.
          </p>
        </div>
      </div>

      {/* Forex & Gold Major Pairs Grid (6 Columns) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {pairs.map((p) => {
          const tick = liveTicks[p.symbol];
          const displayPrice = tick ? tick.price : p.price;
          const displayChangePct = tick ? tick.change_pct : p.change_pct;
          const isPos = (displayChangePct || 0) >= 0;
          const isGold = p.symbol === 'GC=F' || p.symbol.includes('XAU');
          const formattedPrice = isGold
            ? `$${Number(displayPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : (typeof displayPrice === 'number' ? displayPrice.toFixed(4) : displayPrice);

          return (
            <a
              key={p.symbol}
              href={`/analysis/${encodeURIComponent(p.symbol)}`}
              className={`p-4 rounded-xl bg-surface-container border space-y-1.5 shadow-sm transition-all block ${
                isGold
                  ? 'border-yellow-500/40 hover:border-yellow-400/80 bg-gradient-to-b from-yellow-500/5 to-surface-container'
                  : 'border-outline-variant/60 hover:border-outline'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
                <span className={`font-bold ${isGold ? 'text-yellow-400' : 'text-on-surface'}`}>
                  {isGold ? '🥇 ' : ''}{p.name}
                </span>
                <span className="text-[10px] font-mono text-primary bg-primary-container/20 border border-primary/20 px-1.5 py-0.2 rounded">
                  {p.spread_pips}p
                </span>
              </div>

              <div
                className={`text-xl font-bold font-mono tracking-tight transition-colors duration-300 ${
                  tick?.direction === 'up'
                    ? 'text-tertiary'
                    : tick?.direction === 'down'
                    ? 'text-error'
                    : (isGold ? 'text-yellow-400' : 'text-on-surface')
                }`}
              >
                {formattedPrice}
              </div>

              <div
                className={`text-xs font-mono font-semibold flex items-center space-x-1 ${
                  isPos ? 'text-tertiary' : 'text-error'
                }`}
              >
                {isPos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                <span>{formatPercent(displayChangePct)}</span>
              </div>
            </a>
          );
        })}
      </div>

      {/* 2-Column: Correlation Matrix & Economic Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/60 shadow-sm">
          <CurrencyCorrelation correlationData={correlation} />
        </div>
        <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/60 shadow-sm">
          <EconomicCalendar events={calendar} />
        </div>
      </div>

      {/* Forex Screener Table */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-headline font-bold text-on-surface flex items-center space-x-2">
            <Globe className="w-4 h-4 text-primary" />
            <span>Forex Opportunity Screener</span>
          </h2>
          <span className="text-xs font-mono text-on-surface-variant">
            {screenerItems.length} Pasangan Mata Uang
          </span>
        </div>

        <ScreenerTable items={screenerItems} isLoading={loading} defaultType="forex" />
      </div>
    </div>
  );
}
