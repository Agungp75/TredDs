import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Flame, ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';
import { useMarket } from '../../context/MarketContext';
import { formatCurrency, formatPercent } from '../../utils/formatters';

export default function ScreenerTable({
  items = [],
  isLoading = false,
  timeframe = '15m',
  onTimeframeChange = null,
  defaultType = 'crypto',
}) {
  const { liveTicks } = useMarket();
  const [activeType, setActiveType] = useState(defaultType);
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
    const matchesType = item.type?.toLowerCase() === activeType.toLowerCase();
    const matchesSearch =
      item.symbol.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.pattern && item.pattern.toLowerCase().includes(search.toLowerCase()));
    const matchesScore = (item.score || 0) >= minScore;
    return matchesType && matchesSearch && matchesScore;
  });

  return (
    <div className="space-y-3.5 font-body">
      {/* Filters Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 rounded-xl bg-surface-container border border-outline-variant/60 shadow-sm">
        {/* Category Tabs: Crypto, Forex & Gold */}
        <div className="flex items-center space-x-1 bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/50">
          {['crypto', 'forex'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveType(tab)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-mono font-medium capitalize transition-all ${
                activeType === tab
                  ? 'bg-primary text-on-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              {tab === 'crypto' ? 'Crypto' : 'Forex & Gold'}
            </button>
          ))}
        </div>

        {/* Right Controls: Scalping Timeframe, Search, Min Score */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Scalping Timeframe Selector */}
          <div className="flex items-center space-x-1.5 text-xs font-mono text-on-surface-variant">
            <span className="hidden sm:inline">Timeframe:</span>
            <select
              value={currentTimeframe}
              onChange={(e) => handleTfChange(e.target.value)}
              className="bg-surface-container-high border border-outline-variant/60 text-primary font-bold text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary cursor-pointer"
              title="Pilih timeframe scalping: 1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d"
            >
              <option value="1s">⚡ 1s (1 Detik)</option>
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
              placeholder="Cari kripto, forex, gold..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg bg-surface-container-high border border-outline-variant/60 text-on-surface placeholder:text-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-40 sm:w-56 transition-colors"
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
              <th className="py-3 px-4">Asset</th>
              <th className="py-3 px-4 text-right">Harga / 24h</th>
              <th className="py-3 px-4">Pola & Sinyal</th>
              <th className="py-3 px-4 text-center">Quant Score</th>
              <th className="py-3 px-4 text-center">Hist. Signal</th>
              <th className="py-3 px-4 text-right">Volume</th>
              <th className="py-3 px-4">Entry / TP / SL</th>
              <th className="py-3 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30 text-on-surface">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-on-surface-variant">
                  <div className="inline-flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>Memindai deret waktu pasar via engine kuantitatif Python...</span>
                  </div>
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-on-surface-variant">
                  Tidak ada instrumen yang cocok dengan filter pencarian.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const tick = liveTicks[item.symbol];
                const displayPrice = tick ? tick.price : item.price;
                const displayChangePct = tick ? tick.change_pct : item.change_pct;
                const isPos = (displayChangePct || 0) >= 0;

                const score = item.score || 0;
                const scoreColor =
                  score >= 80 ? 'text-tertiary bg-tertiary-container/30' : score >= 60 ? 'text-primary bg-primary-container/20' : 'text-on-surface-variant bg-surface-container-highest';

                const patternName = item.pattern || 'Breakout Testing';

                return (
                  <tr
                    key={item.symbol}
                    className="hover:bg-surface-container-high/60 transition-colors"
                  >
                    {/* Symbol & Name */}
                    <td className="py-3.5 px-4">
                      <Link
                        to={`/analysis/${encodeURIComponent(item.symbol)}`}
                        className="group block"
                      >
                        <div className="flex items-center gap-1.5 font-bold text-on-surface group-hover:text-primary transition-colors">
                          <span>{item.symbol}</span>
                          <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-surface-container-highest text-on-surface-variant">
                            {item.type}
                          </span>
                        </div>
                        <div className="text-[10px] text-on-surface-variant truncate max-w-[140px]">
                          {item.name}
                        </div>
                      </Link>
                    </td>

                    {/* Price & Change */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-on-surface">
                        {formatCurrency(displayPrice, item.type, item.symbol)}
                      </div>
                      <div className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 ${isPos ? 'text-tertiary' : 'text-error'}`}>
                        {isPos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        <span>{formatPercent(displayChangePct)}</span>
                      </div>
                    </td>

                    {/* Pattern & Signal */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-on-surface truncate max-w-[180px]">
                        {patternName}
                      </div>
                      <div
                        className={`text-[10px] font-medium mt-0.5 ${
                          item.signal === 'Bullish' || item.signal === 'Strong Bullish'
                            ? 'text-tertiary'
                            : item.signal === 'Bearish' || item.signal === 'Strong Bearish'
                            ? 'text-error'
                            : 'text-on-surface-variant'
                        }`}
                      >
                        {item.signal || 'Quant Signal'}
                      </div>
                    </td>

                    {/* Quant Score */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${scoreColor}`}>
                        {score}
                      </span>
                    </td>

                    {/* Hist Signal */}
                    <td className="py-3.5 px-4 text-center">
                      {item.historical_signal?.verdict ? (
                        <div className="flex flex-col items-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              item.historical_signal.verdict === 'BULLISH'
                                ? 'text-tertiary bg-tertiary-container/30 border border-tertiary/20'
                                : item.historical_signal.verdict === 'BEARISH'
                                ? 'text-error bg-error-container border border-error/20'
                                : 'text-on-surface-variant bg-surface-container-highest'
                            }`}
                          >
                            {item.historical_signal.verdict}
                          </span>
                          {item.historical_signal.confidence > 0 && (
                            <span className="text-[9px] text-on-surface-variant mt-0.5">
                              {Math.round(item.historical_signal.confidence * 100)}% conf
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-on-surface-variant">
                          {item.signal || 'NEUTRAL'}
                        </span>
                      )}
                    </td>

                    {/* Volume */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="text-on-surface">
                        {item.volume ? `$${(item.volume / 1e6).toFixed(1)}M` : '-'}
                      </div>
                      {item.volume_anomaly && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-tertiary font-bold">
                          <Flame className="w-2.5 h-2.5" /> Surge
                        </span>
                      )}
                    </td>

                    {/* Entry / TP / SL */}
                    <td className="py-3.5 px-4 text-[11px]">
                      <div className="text-tertiary">
                        TP: {item.tp ? formatCurrency(item.tp, item.type, item.symbol) : '-'}
                      </div>
                      <div className="text-error text-[10px]">
                        SL: {item.sl ? formatCurrency(item.sl, item.type, item.symbol) : '-'}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-center">
                      <Link
                        to={`/analysis/${encodeURIComponent(item.symbol)}?pattern=${encodeURIComponent(patternName)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-highest hover:bg-primary hover:text-on-primary text-on-surface text-[11px] font-medium transition-colors border border-outline-variant/40 shadow-sm"
                      >
                        <span>Analyze</span>
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
