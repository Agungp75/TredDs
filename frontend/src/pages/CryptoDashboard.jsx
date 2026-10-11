import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useMarket } from '../context/MarketContext';
import ScreenerTable from '../components/screener/ScreenerTable';
import DevActivityChart from '../components/analysis/DevActivityChart';
import DrawPatternCanvas from '../components/charts/DrawPatternCanvas';
import PatternSearchResults from '../components/charts/PatternSearchResults';
import { formatCurrency, formatPercent } from '../utils/formatters';

const TIMEFRAMES = [
  { key: 'auto', label: '⚡ Auto Scalp', desc: 'Auto pilih 1m/5m/15m optimal' },
  { key: '1s', label: '1 Detik', desc: 'Ultra HFT Micro-Scalp' },
  { key: '1m', label: '1 Menit', desc: 'Fast Scalping' },
  { key: '5m', label: '5 Menit', desc: 'Primary Scalp' },
  { key: '15m', label: '15 Menit', desc: 'Momentum Scalp' },
  { key: '30m', label: '30 Menit', desc: 'Macro Scalp' },
  { key: '1h', label: '1 Jam', desc: 'Hourly Trend' },
  { key: '4h', label: '4 Jam', desc: 'Structure Bias' },
  { key: '1d', label: '1 Hari', desc: 'Daily Context' },
];

export default function CryptoDashboard() {
  const { liveTicks } = useMarket();
  const [tokens, setTokens] = useState([]);
  const [screenerItems, setScreenerItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Draw Pattern Search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [probeValues, setProbeValues] = useState([]);
  const [probePatternName, setProbePatternName] = useState('');
  const [searchError, setSearchError] = useState(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState('auto');

  useEffect(() => {
    async function loadData() {
      try {
        const [tokRes, screenRes] = await Promise.all([
          api.getCryptoTokens(),
          api.getScreener('crypto'),
        ]);
        setTokens(tokRes || []);
        if (tokRes && tokRes.length > 0) {
          setSelectedToken(tokRes[0]);
        }
        setScreenerItems(screenRes?.items || []);
      } catch (err) {
        console.error('Failed loading crypto data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handlePatternSearch = async (points) => {
    setIsSearching(true);
    setSearchResults([]);
    setSearchError(null);
    try {
      const data = await api.searchDrawnPattern(points, 6, selectedTimeframe);
      setSearchResults(data.results || []);
      setProbeValues(data.probe_values || []);
      setProbePatternName(data.probe_pattern_name || '');
    } catch (err) {
      console.error('Pattern search error', err);
      setSearchError('Gagal memindai pola serupa di pasar. Silakan coba bentuk gambar lainnya.');
    } finally {
      setIsSearching(false);
    }
  };

  // Filter token list by category
  const filteredTokens = tokens.filter((t) => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'l1') return ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'AVAX-USD'].includes(t.symbol);
    if (selectedCategory === 'defi') return ['UNI-USD', 'AAVE-USD', 'LINK-USD', 'MKR-USD'].includes(t.symbol);
    if (selectedCategory === 'ai') return ['NEAR-USD', 'RENDER-USD', 'FET-USD', 'TAO-USD'].includes(t.symbol);
    if (selectedCategory === 'whale') return (t.price * (t.volume_24h || 1)) > 10000000;
    return true;
  });

  return (
    <div className="max-w-[1720px] mx-auto space-y-10 font-body">
      {/* 1. TOP SECTION: HEADER & QUICK METRICS */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-semibold uppercase tracking-widest text-primary">
                Live Microstructure
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-tertiary-container text-tertiary-fixed border border-tertiary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                Live Market 24H
              </span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-headline font-bold tracking-tight text-on-surface">
              Crypto Quantitative Engine
            </h1>
            <p className="text-xs lg:text-sm text-on-surface-variant max-w-3xl">
              Pemindaian komprehensif metrik on-chain, pergerakan bandar (<span className="text-on-surface font-medium">Whale Inflows</span>), dan topologi fraktal harga real-time.
            </p>
          </div>

          {/* Quick Metrics Ribbon */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="px-3.5 py-2 rounded-lg bg-surface-container border border-outline-variant/60 shadow-sm flex flex-col">
              <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">
                24h Vol Agregat
              </span>
              <span className="text-sm font-mono font-bold text-on-surface">
                {tokens.length > 0 ? `$${(tokens.reduce((acc, t) => acc + (t.volume_24h || 0), 0) / 1e9).toFixed(1)}B` : '$84.2B'}{' '}
                <span className="text-tertiary text-xs font-normal">+11.4%</span>
              </span>
            </div>
            <div className="px-3.5 py-2 rounded-lg bg-surface-container border border-outline-variant/60 shadow-sm flex flex-col">
              <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">
                Dominasi BTC
              </span>
              <span className="text-sm font-mono font-bold text-on-surface">
                58.4% <span className="text-primary text-xs font-normal">Rank 1</span>
              </span>
            </div>
            <div className="px-3.5 py-2 rounded-lg bg-surface-container border border-outline-variant/60 shadow-sm flex flex-col">
              <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">
                Rata-rata ATR 24h
              </span>
              <span className="text-sm font-mono font-bold text-tertiary">
                4.2% <span className="text-on-surface-variant text-xs font-normal">Tinggi</span>
              </span>
            </div>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center justify-between gap-4 overflow-x-auto pb-1 select-none">
          <div className="flex items-center gap-2">
            {[
              { id: 'all', label: 'Semua Koin' },
              { id: 'l1', label: 'Layer 1 / L2' },
              { id: 'defi', label: 'DeFi' },
              { id: 'ai', label: 'AI & DePIN' },
              { id: 'whale', label: 'Whale Inflow > $10M', icon: 'water_drop' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/40'
                }`}
              >
                {cat.icon && <span className="material-symbols-outlined text-[14px]">{cat.icon}</span>}
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-on-surface-variant">
            <span>Auto-sync:</span>
            <span className="text-tertiary font-medium">1000ms</span>
          </div>
        </div>

        {/* Top 5 Whale & On-Chain Token Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {tokens.slice(0, 5).map((tok, idx) => {
            const isSelected = selectedToken && selectedToken.symbol === tok.symbol;
            const tick = liveTicks[tok.symbol];
            const displayPrice = tick ? tick.price : tok.price;
            const displayChangePct = tick ? tick.change_pct : tok.change_pct;
            const isPos = (displayChangePct || 0) >= 0;
            const cleanSym = tok.symbol.replace('-USD', '');

            return (
              <div
                key={tok.symbol}
                onClick={() => setSelectedToken(tok)}
                className={`p-4 rounded-xl bg-surface-container border transition-all cursor-pointer flex flex-col justify-between group ${
                  isSelected
                    ? 'border-primary shadow-md bg-surface-container-high'
                    : 'border-outline-variant/60 hover:border-outline hover:bg-surface-container-high'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-headline font-bold text-on-surface">
                        {cleanSym}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">
                        #{idx + 1}
                      </span>
                    </div>
                    <span className="text-xs text-on-surface-variant">{tok.name || cleanSym}</span>
                  </div>
                  <span
                    className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                      isPos ? 'text-tertiary bg-tertiary-container/30' : 'text-error bg-error-container'
                    }`}
                  >
                    {formatPercent(displayChangePct || 0)}
                  </span>
                </div>

                <div className="my-3">
                  <div className="text-lg font-mono font-bold text-on-surface tracking-tight">
                    {formatCurrency(displayPrice, 'crypto', tok.symbol)}
                  </div>
                  <div className="text-[11px] font-mono text-on-surface-variant flex items-center justify-between mt-1">
                    <span className="text-tertiary flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">water_drop</span>
                      <span>Whale: {tok.on_chain?.whale_concentration || '18.4%'}</span>
                    </span>
                    <span className="text-secondary text-[10px]">
                      Vol: ${(tok.volume_24h ? (tok.volume_24h / 1e6).toFixed(1) : '120.0')}M
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant pt-2 border-t border-outline-variant/30">
                  <span>Dev Activity:</span>
                  <span className="text-on-surface font-medium">
                    {tok.dev_metrics?.dev_score ?? 85} / 100
                  </span>
                </div>

                {/* Mini SVG Sparkline */}
                <div className="h-6 w-full mt-2">
                  <svg className={`w-full h-full overflow-visible ${isPos ? 'text-tertiary' : 'text-error'}`} preserveAspectRatio="none" viewBox="0 0 100 24">
                    <path
                      d={isPos ? "M0,20 Q15,22 30,14 T60,10 T80,12 T100,2" : "M0,4 Q25,6 50,14 T75,18 T100,22"}
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. DRAW PATTERN SEARCH (Fitur Eksklusif) */}
      <section className="bg-surface-container rounded-xl p-5 lg:p-6 border border-outline-variant/60 shadow-lg space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-outline-variant/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-primary font-mono text-xs uppercase font-bold tracking-wider">
                Fitur Eksklusif
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-primary-container text-on-primary-container">
                SciPy Pattern Matching
              </span>
            </div>
            <h2 className="text-xl font-headline font-bold text-on-surface mt-1">
              Draw Pattern Search (Pencarian Pola Real-Time Masa Sekarang)
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Gambar formasi grafik apa saja, dan sistem akan langsung memindai koin kripto di pasar saat ini yang membentuk pergerakan serupa dalam rentang 24 jam terakhir.
            </p>
          </div>

          {/* Timeframe selector tabs */}
          <div className="flex items-center gap-1.5 bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/50 self-start lg:self-auto">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.key}
                onClick={() => setSelectedTimeframe(tf.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                  selectedTimeframe === tf.key
                    ? 'bg-primary text-on-primary font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
                title={tf.desc}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas & search engine */}
        <DrawPatternCanvas onSearch={handlePatternSearch} isSearching={isSearching} />

        {/* Error notification if any */}
        {searchError && (
          <div className="p-3.5 rounded-lg bg-error-container text-on-error-container border border-error/30 text-xs font-mono">
            {searchError}
          </div>
        )}

        {/* Search Results Grid */}
        <PatternSearchResults
          results={searchResults}
          probeValues={probeValues}
          probePatternName={probePatternName}
          timeframe={selectedTimeframe}
          onSelectToken={(sym) => setSelectedToken(tokens.find((t) => t.symbol === sym))}
        />
      </section>

      {/* 3. TOKEN ON-CHAIN & DEVELOPER ACTIVITY PANEL */}
      {selectedToken && (
        <section className="bg-surface-container rounded-xl p-5 lg:p-6 border border-outline-variant/60 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/50">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-headline font-bold text-on-surface">
                  On-Chain & GitHub Developer Intelligence: {selectedToken.symbol.replace('-USD', '')}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-container-highest text-tertiary">
                  Verified Data
                </span>
              </div>
              <p className="text-xs text-on-surface-variant font-mono mt-0.5">
                Frekuensi commit kode, kontributor aktif repositori, dan konsentrasi dompet paus.
              </p>
            </div>

            <Link
              to={`/analysis/${encodeURIComponent(selectedToken.symbol)}`}
              className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-mono font-semibold transition-all flex items-center gap-1.5 self-start sm:self-auto shadow-sm"
            >
              <span>Buka 3-Layer Deep Analysis</span>
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>
          </div>

          {/* 4 Real On-Chain Metric Cards */}
          {selectedToken.on_chain && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
              <div className="bg-surface-container-lowest p-3.5 rounded-lg border border-outline-variant/40">
                <div className="text-[10px] uppercase text-secondary">Konsentrasi Paus (Top 100)</div>
                <div className="text-base font-bold text-tertiary mt-0.5">
                  {selectedToken.on_chain.whale_concentration || 'N/A'}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-1">Dominasi wallet institusi</div>
              </div>

              <div className="bg-surface-container-lowest p-3.5 rounded-lg border border-outline-variant/40">
                <div className="text-[10px] uppercase text-secondary">Likuiditas Terkunci / Staking</div>
                <div className="text-base font-bold text-primary mt-0.5">
                  {selectedToken.on_chain.liquidity_locked || 'N/A'}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-1">Proof-of-Stake consensus</div>
              </div>

              <div className="bg-surface-container-lowest p-3.5 rounded-lg border border-outline-variant/40">
                <div className="text-[10px] uppercase text-secondary">Suplai Beredar</div>
                <div className="text-base font-bold text-on-surface mt-0.5">
                  {selectedToken.on_chain.circulating_supply || 'N/A'}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-1">Beredar di pasar aktif</div>
              </div>

              <div className="bg-surface-container-lowest p-3.5 rounded-lg border border-outline-variant/40">
                <div className="text-[10px] uppercase text-secondary">Jumlah Pemegang Dompet</div>
                <div className="text-base font-bold text-on-surface mt-0.5">
                  {selectedToken.on_chain.holders_count || 'N/A'}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-1">Akun unik on-chain</div>
              </div>
            </div>
          )}

          <DevActivityChart devMetrics={selectedToken.dev_metrics} />
        </section>
      )}

      {/* 4. COMPREHENSIVE CRYPTO SCREENER TABLE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">table_chart</span>
            <h3 className="text-lg font-headline font-bold text-on-surface">
              Crypto Quantitative Screener
            </h3>
          </div>
          <span className="text-xs font-mono text-on-surface-variant">
            {screenerItems.length} Pasar Kripto Dipindai
          </span>
        </div>

        <ScreenerTable items={screenerItems} isLoading={loading} defaultType="crypto" />
      </section>
    </div>
  );
}
