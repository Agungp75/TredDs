import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Flame, ArrowUpRight, ArrowDownRight, ArrowRight, Zap, Shield } from 'lucide-react';
import { useMarket } from '../../context/MarketContext';
import { formatCurrency, formatPercent, formatCompactNumber } from '../../utils/formatters';

const STRATEGY_TABS = [
  { id: 'all', label: 'All Opportunities' },
  { id: 'squeeze', label: 'Short/Long Squeeze' },
  { id: 'sfp', label: 'SFP Stop-Hunt' },
  { id: 'high_ev', label: 'High Net-EV' },
];

export default function ScreenerTable({
  items = [],
  isLoading = false,
  timeframe = '15m',
  onTimeframeChange = null,
}) {
  const { liveTicks } = useMarket();
  const [activeStrategy, setActiveStrategy] = useState('all');
  const [search, setSearch] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [currentTimeframe, setCurrentTimeframe] = useState(timeframe);

  const handleTfChange = (newTf) => {
    setCurrentTimeframe(newTf);
    if (onTimeframeChange) {
      onTimeframeChange(newTf);
    }
  };

  const filteredItems = items.filter((item) => {
    const tags = item.strategy_tags || {};
    let matchesStrategy = true;
    if (activeStrategy === 'squeeze') {
      matchesStrategy = Boolean(tags.is_squeeze);
    } else if (activeStrategy === 'sfp') {
      matchesStrategy = Boolean(tags.is_sfp || (item.sfp_detected && item.sfp_detected !== 'NONE'));
    } else if (activeStrategy === 'high_ev') {
      matchesStrategy = Boolean(tags.is_high_ev || item.trade_validity === 'EXECUTABLE_HIGH_EDGE');
    }

    const matchesSearch =
      item.symbol.toLowerCase().includes(search.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.pattern && item.pattern.toLowerCase().includes(search.toLowerCase()));
    const matchesScore = (item.score || 0) >= minScore;
    return matchesStrategy && matchesSearch && matchesScore;
  });

  return (
    <div className="space-y-3.5 font-body">
      {/* Filters Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 p-3.5 rounded-xl bg-surface-container border border-outline-variant/60 shadow-sm">
        {/* 4 Strategy Tabs (ATRED v3.0 MEXC) */}
        <div className="flex flex-wrap items-center gap-1 bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/50">
          {STRATEGY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveStrategy(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all cursor-pointer ${
                activeStrategy === tab.id
                  ? 'bg-primary text-on-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Controls: MEXC Timeframe, Search, Min Score */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-1.5 text-xs font-mono text-on-surface-variant">
            <span className="hidden sm:inline">Timeframe:</span>
            <select
              value={currentTimeframe}
              onChange={(e) => handleTfChange(e.target.value)}
              className="bg-surface-container-high border border-outline-variant/60 text-primary font-bold text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="1m">1m (1 Menit)</option>
              <option value="5m">5m (5 Menit)</option>
              <option value="15m">15m (15 Menit)</option>
              <option value="30m">30m (30 Menit)</option>
              <option value="1h">1h (1 Jam)</option>
              <option value="4h">4h (4 Jam)</option>
              <option value="1d">1d (1 Hari)</option>
            </select>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari koin MEXC (SOL, PEPE, SUI)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg bg-surface-container-high border border-outline-variant/60 text-on-surface placeholder:text-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-44 sm:w-56 transition-colors"
            />
          </div>

          <div className="flex items-center space-x-1.5 text-xs font-mono text-on-surface-variant">
            <span className="hidden sm:inline">Score:</span>
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="bg-surface-container-high border border-outline-variant/60 text-on-surface text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value={0}>Semua (0+)</option>
              <option value={60}>Moderate (60+)</option>
              <option value={75}>High (75+)</option>
              <option value={85}>Prime (85+)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-outline-variant/60 bg-surface-container shadow-sm">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-outline-variant/50 bg-surface-container-high text-on-surface-variant uppercase tracking-wider text-[10px] select-none">
              <th className="py-3 px-4">MEXC Pair</th>
              <th className="py-3 px-4 text-right">Last / Fair Price</th>
              <th className="py-3 px-4">Layer 1: Pola, SFP &amp; Rezim</th>
              <th className="py-3 px-4">Layer 2: OI &amp; Funding</th>
              <th className="py-3 px-4 text-center">Opp. Score</th>
              <th className="py-3 px-4 text-center">Net EV% (0% Maker)</th>
              <th className="py-3 px-4">Maker Entry / TP1-TP2 / Fair SL</th>
              <th className="py-3 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30 text-on-surface">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-on-surface-variant">
                  <div className="inline-flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>Memindai deret waktu pasar MEXC via Two-Stage Quant Engine...</span>
                  </div>
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-on-surface-variant">
                  Tidak ada kontrak USDT-M yang cocok dengan filter strategi saat ini.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const tick = liveTicks[item.symbol];
                const displayPrice = tick ? tick.price : item.price;
                const displayFair = tick?.fairPrice || item.fair_price || displayPrice;
                const displayChangePct = tick ? tick.change_pct : item.change_pct;
                const isPos = (displayChangePct || 0) >= 0;

                const score = item.score || 0;
                const scoreColor =
                  score >= 80
                    ? 'text-tertiary bg-tertiary-container/30 border border-tertiary/30'
                    : score >= 65
                    ? 'text-primary bg-primary-container/20 border border-primary/30'
                    : 'text-on-surface-variant bg-surface-container-highest';

                const patternName = item.pattern || 'Breakout Testing';
                const deriv = item.mexc_derivatives || {};
                const evPct = Number(item.net_ev_pct ?? 0);
                const isHighEdge = item.trade_validity === 'EXECUTABLE_HIGH_EDGE';

                return (
                  <tr
                    key={item.symbol}
                    className="hover:bg-surface-container-high/60 transition-colors"
                  >
                    {/* 1. Symbol & Name */}
                    <td className="py-3.5 px-4">
                      <Link
                        to={`/analysis/${encodeURIComponent(item.symbol)}`}
                        className="group block"
                      >
                        <div className="flex items-center gap-1.5 font-bold text-on-surface group-hover:text-primary transition-colors">
                          <span>{item.symbol}</span>
                          <span
                            className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded font-bold ${
                              item.direction === 'SHORT'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {item.direction || 'LONG'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-on-surface-variant mt-0.5">
                          <span className="truncate max-w-[110px]">{item.name}</span>
                          <span>• Vol ${formatCompactNumber(item.volume || 0)}</span>
                        </div>
                      </Link>
                    </td>

                    {/* 2. Price & Fair Price */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-on-surface">
                        {formatCurrency(displayPrice, 'crypto', item.symbol)}
                      </div>
                      <div
                        className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 ${
                          isPos ? 'text-tertiary' : 'text-error'
                        }`}
                      >
                        {isPos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        <span>{formatPercent(displayChangePct)}</span>
                      </div>
                      <div className="text-[9px] text-on-surface-variant">
                        Fair: {formatCurrency(displayFair, 'crypto', item.symbol)}
                      </div>
                    </td>

                    {/* 3. Layer 1: Pattern, SFP & Regime */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-on-surface truncate max-w-[180px]">
                        {patternName}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className="px-1.5 py-0.5 text-[9px] rounded bg-surface-container-highest text-on-surface-variant">
                          {item.market_regime || 'TRANSITIONAL'} (ADX {item.adx_14 ?? 20})
                        </span>
                        {item.sfp_detected && item.sfp_detected !== 'NONE' && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                            {item.sfp_detected.replace('_', ' ')}
                          </span>
                        )}
                        {item.volume_anomaly && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-tertiary font-bold">
                            <Flame className="w-2.5 h-2.5" /> Vol Surge
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 4. Layer 2: OI & Funding */}
                    <td className="py-3.5 px-4">
                      <div className="text-[10px] font-bold text-cyan-400">
                        {(deriv.oi_regime || 'NEW_LONG_BUILDUP').replace(/_/g, ' ')}
                      </div>
                      <div className="text-[10px] text-on-surface-variant mt-0.5">
                        Funding:{' '}
                        <strong
                          className={
                            Number(deriv.funding_rate_pct || 0) < 0
                              ? 'text-emerald-400'
                              : Number(deriv.funding_rate_pct || 0) > 0.04
                              ? 'text-rose-400'
                              : 'text-on-surface'
                          }
                        >
                          {Number(deriv.funding_rate_pct || 0) >= 0 ? '+' : ''}
                          {Number(deriv.funding_rate_pct || 0).toFixed(4)}%
                        </strong>
                      </div>
                      <div className="text-[9px] text-on-surface-variant">
                        CVD: {(deriv.cvd_trend || 'NEUTRAL').replace(/_/g, ' ')}
                      </div>
                    </td>

                    {/* 5. Opportunity Score */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded text-xs font-bold ${scoreColor}`}>
                        {score}
                      </span>
                      <div className="text-[9px] text-on-surface-variant mt-0.5">
                        RS BTC: {Number(item.alt_rs_vs_btc_pct || 0) >= 0 ? '+' : ''}
                        {Number(item.alt_rs_vs_btc_pct || 0).toFixed(1)}%
                      </div>
                    </td>

                    {/* 6. Net EV% & Trade Validity */}
                    <td className="py-3.5 px-4 text-center">
                      <div
                        className={`text-xs font-bold ${
                          evPct > 0.15 ? 'text-emerald-400' : evPct > 0 ? 'text-amber-400' : 'text-rose-400'
                        }`}
                      >
                        {evPct >= 0 ? `+${evPct.toFixed(2)}%` : `${evPct.toFixed(2)}%`}
                      </div>
                      <span
                        className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          isHighEdge
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-surface-container-highest text-on-surface-variant'
                        }`}
                      >
                        {isHighEdge ? 'HIGH EDGE' : 'LOW EV'}
                      </span>
                      <div className="text-[9px] text-cyan-400 mt-0.5">
                        Max Lev: {item.safe_max_leverage || '5x'}
                      </div>
                    </td>

                    {/* 7. Maker Limit Entry / Split TP / Fair Price SL */}
                    <td className="py-3.5 px-4 text-[10px] space-y-0.5">
                      <div className="text-cyan-400 font-semibold">
                        Maker (0%): {formatCurrency(item.maker_limit_entry || item.entry, 'crypto', item.symbol)}
                      </div>
                      <div className="text-tertiary">
                        TP1/TP2: {formatCurrency(item.tp1 || item.tp, 'crypto', item.symbol)} /{' '}
                        {formatCurrency(item.tp2 || item.tp, 'crypto', item.symbol)}
                      </div>
                      <div className="text-error">
                        SL (Fair): {formatCurrency(item.sl, 'crypto', item.symbol)} ({item.risk_reward})
                      </div>
                    </td>

                    {/* 8. Action */}
                    <td className="py-3.5 px-4 text-center">
                      <Link
                        to={`/analysis/${encodeURIComponent(item.symbol)}?pattern=${encodeURIComponent(patternName)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-surface-container-highest hover:bg-primary hover:text-on-primary text-on-surface text-[11px] font-medium transition-colors border border-outline-variant/40 shadow-sm"
                      >
                        <span>Terminal</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
