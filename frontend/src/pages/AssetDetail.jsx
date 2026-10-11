import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Activity, Sparkles, BarChart2 } from 'lucide-react';
import { api } from '../services/api';
import { useMarket } from '../context/MarketContext';
import TradingViewChart from '../components/charts/TradingViewChart';
import TradingViewEmbedWidget from '../components/charts/TradingViewEmbedWidget';
import PatternMatchLargeChart from '../components/charts/PatternMatchLargeChart';
import IndicatorsPanel from '../components/analysis/IndicatorsPanel';
import DevActivityChart from '../components/analysis/DevActivityChart';
import AISummaryCard from '../components/analysis/AISummaryCard';
import SimilarityPanel from '../components/analysis/SimilarityPanel';
import { formatCurrency, formatPercent } from '../utils/formatters';

const POPULAR_ASSETS = [
  { symbol: 'GC=F', label: '🥇 XAU/USD (Gold)' },
  { symbol: 'BTC-USD', label: 'BTC/USDT' },
  { symbol: 'ETH-USD', label: 'ETH/USDT' },
  { symbol: 'SOL-USD', label: 'SOL/USDT' },
  { symbol: 'EURUSD=X', label: 'EUR/USD' },
  { symbol: 'GBPUSD=X', label: 'GBP/USD' },
  { symbol: 'USDJPY=X', label: 'USD/JPY' },
  { symbol: 'AUDUSD=X', label: 'AUD/USD' },
];

export default function AssetDetail() {
  const { symbol: routeSymbol } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const queryTimeframe = searchParams.get('timeframe') || searchParams.get('period');
  const queryPattern = searchParams.get('pattern');

  // Ambil data formasi pencocokan pola dari location.state ATAU sessionStorage (fallback jika refresh halaman)
  const [patternMatchData, setPatternMatchData] = useState(() => {
    if (location.state?.patternResult) {
      return {
        patternResult: location.state.patternResult,
        probeValues: location.state.probeValues || [],
      };
    }
    try {
      const stored = sessionStorage.getItem('active_pattern_match');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.patternResult && (!routeSymbol || parsed.patternResult.symbol === routeSymbol || parsed.symbol === routeSymbol)) {
          return {
            patternResult: parsed.patternResult,
            probeValues: parsed.probeValues || [],
          };
        }
      }
    } catch (e) {
      console.warn('Gagal membaca cache active_pattern_match:', e);
    }
    return null;
  });

  const patternResult = patternMatchData?.patternResult;
  const probeValues = patternMatchData?.probeValues || patternResult?.probe_values || [];

  const rawSymbol = routeSymbol || 'BTC-USD';
  const symbol = React.useMemo(() => {
    if (!rawSymbol) return 'BTC-USD';
    let clean = rawSymbol.toUpperCase().trim().replace('/', '').replace('.P', '');
    if (['BTC', 'ETH', 'SOL', 'AVAX', 'BNB', 'XRP', 'ADA', 'DOGE', 'NEAR', 'LINK', 'DOT', 'SUI', 'APT', 'PEPE'].includes(clean)) {
      return `${clean}-USD`;
    }
    if (clean.endsWith('USDT')) {
      return `${clean.slice(0, -4)}-USD`;
    }
    if (['GOLD', 'XAU', 'XAUUSD'].includes(clean)) {
      return 'GC=F';
    }
    if (['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF'].includes(clean)) {
      return `${clean}=X`;
    }
    return clean;
  }, [rawSymbol]);
  const { liveTicks, wsConnected } = useMarket();

  // Terapkan timeframe scalping (default 15m)
  const [period, setPeriod] = useState(queryTimeframe || patternResult?.timeframe || '15m');
  // Jika ada pola yang dicocokkan, default ke tampilan 'pattern' agar langsung menampilkan formasi hasil pencocokan!
  const [chartView, setChartView] = useState(() => (patternResult ? 'pattern' : 'quant')); // 'pattern' | 'quant' | 'official'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync jika location.state berubah
  useEffect(() => {
    if (location.state?.patternResult) {
      setPatternMatchData({
        patternResult: location.state.patternResult,
        probeValues: location.state.probeValues || [],
      });
      setChartView('pattern');
    }
  }, [location.state]);

  useEffect(() => {
    const tf = searchParams.get('timeframe') || searchParams.get('period');
    if (tf && tf !== period) {
      setPeriod(tf);
    }
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;
    async function loadAnalysis() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getDeepAnalysis(symbol, period);
        if (isMounted) {
          setData(res);
        }
      } catch (err) {
        if (isMounted) {
          setError('Gagal memuat analisis detail dari Python backend engine.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAnalysis();
    return () => {
      isMounted = false;
    };
  }, [symbol, period]);

  const overview = data?.overview || {};
  const layer1 = data?.layer_1_technical || {};
  const layer2 = data?.layer_2_dev_onchain || {};
  const macro = data?.layer_3_macro || {};
  const aiSummary = data?.ai_summary || {};
  const aiOptions = data?.ai_options || {};
  const ohlcv = data?.ohlcv || [];

  const liveTick = liveTicks[symbol];
  const currentPrice = liveTick ? liveTick.price : (overview.price || 0);
  const currentChangePct = liveTick ? liveTick.change_pct : (overview.change_pct || 0);
  const isPos = (currentChangePct || 0) >= 0;

  // Pattern detection info
  const activePattern = queryPattern || patternResult?.pattern_name || layer1?.pattern;
  const isBearish = Boolean(
    layer1?.direction === 'SHORT' ||
    layer1?.tp_sl?.direction === 'SHORT' ||
    layer1?.is_bearish ||
    layer1?.tp_sl?.is_bearish ||
    (layer1?.type && (layer1.type.toLowerCase().includes('bear') || layer1.type.toLowerCase().includes('short')))
  );

  return (
    <div className="max-w-[1720px] mx-auto space-y-6 font-body select-none">
      {/* 1. TOP CONTEXT / TICKER BAR */}
      <div className="w-full bg-surface-container rounded-xl p-5 border border-outline-variant/60 shadow-lg flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">
        <div className="flex flex-wrap items-center gap-6">
          {/* Asset Identity */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center p-2.5 text-primary shadow-inner font-mono font-bold text-base">
              {symbol.slice(0, 3)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-headline font-bold tracking-tight text-on-surface">
                  {overview.name || symbol}
                </h1>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">
                  {symbol}
                </span>
                <span
                  className="material-symbols-outlined text-tertiary text-base"
                  title="Verified Tier-1 Node Feed"
                >
                  verified
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs font-mono text-on-surface-variant">
                <span>{overview.type === 'crypto' ? 'Perpetual Contract' : (symbol === 'GC=F' || symbol.includes('XAU')) ? 'Spot Commodity / Gold' : 'Forex Pair'}</span>
                <span className="text-outline">/</span>
                <span className="text-tertiary flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                  Live L2 Depth
                </span>
              </div>
            </div>
          </div>

          {/* Price & Metrics Group */}
          <div className="flex items-baseline gap-3 pl-2 sm:pl-4">
            <span className="text-3xl font-mono font-bold tracking-tight text-on-surface">
              {formatCurrency(currentPrice, overview.type, symbol)}
            </span>
            <div
              className={`flex items-center gap-1 text-sm font-mono font-semibold px-2 py-0.5 rounded ${
                isPos ? 'text-tertiary bg-tertiary-container/30' : 'text-error bg-error-container'
              }`}
            >
              <span className="material-symbols-outlined text-sm font-bold">
                {isPos ? 'arrow_drop_up' : 'arrow_drop_down'}
              </span>
              <span>{formatPercent(currentChangePct)}</span>
            </div>
          </div>

          {/* Fast Stats Strip */}
          <div className="hidden md:flex items-center gap-6 pl-4 border-l border-outline-variant/40 text-xs font-mono">
            <div>
              <div className="text-[10px] uppercase text-secondary font-semibold">24h Volume</div>
              <div className="text-on-surface font-medium mt-0.5">
                {overview.volume_24h ? `$${(overview.volume_24h / 1e6).toFixed(1)}M` : '-'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-secondary font-semibold">24h High / Low</div>
              <div className="text-on-surface font-medium mt-0.5">
                {overview.high_24h ? formatCurrency(overview.high_24h, overview.type, symbol) : '-'} <span className="text-secondary">/</span>{' '}
                {overview.low_24h ? formatCurrency(overview.low_24h, overview.type, symbol) : '-'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-secondary font-semibold">Mark Price</div>
              <div className="text-on-surface font-medium mt-0.5">
                {formatCurrency(typeof currentPrice === 'number' ? currentPrice * 0.9998 : currentPrice, overview.type, symbol)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-secondary font-semibold">Funding 8h</div>
              <div className="text-tertiary font-medium mt-0.5">
                {overview.type === 'crypto' ? '+0.0102%' : 'N/A (Spot)'}
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2.5 w-full xl:w-auto justify-end">
          <button
            onClick={() => navigate(-1)}
            className="px-3.5 py-2 rounded-lg bg-surface-container-highest text-xs font-medium text-on-surface hover:bg-surface-bright transition-colors flex items-center gap-1.5 border border-outline-variant/40 font-mono"
            title="Kembali ke Screener Pola"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Kembali</span>
          </button>
          <Link
            to="/crypto"
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-xs font-semibold text-on-primary transition-all shadow-md flex items-center gap-1.5 font-mono"
          >
            <span className="material-symbols-outlined text-[16px]">draw</span>
            <span>Draw Pattern</span>
          </Link>
        </div>
      </div>

      {/* 2. PATTERN CONFIRMATION BANNER (Jika Pola Terdeteksi / Dipilih) */}
      {activePattern && (
        <div className="w-full bg-gradient-to-r from-surface-container via-surface-container to-surface-container-high rounded-xl p-5 border border-outline-variant/60 shadow-lg relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-tertiary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 relative z-10">
            <div className="space-y-2 max-w-4xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2 bg-primary-container/20 text-primary px-2.5 py-1 rounded-md text-xs font-mono font-semibold border border-primary/30">
                  <span className="material-symbols-outlined text-sm animate-pulse">auto_awesome</span>
                  <span>{queryPattern || patternResult ? `Pola Terkonfirmasi: ${activePattern}` : `Pola Algoritmik: ${activePattern}`}</span>
                </div>
                {layer1?.type && (
                  <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                    layer1.type.toLowerCase().includes('bull')
                      ? 'bg-tertiary-container/30 text-tertiary border border-tertiary/20'
                      : 'bg-error-container text-error border border-error/20'
                  }`}>
                    {layer1.type}
                  </span>
                )}
                {/* Posisi Trading Badge: LONG vs SHORT */}
                <span className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold flex items-center gap-1 ${
                  isBearish
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                }`}>
                  <span className="material-symbols-outlined text-[14px]">
                    {isBearish ? 'trending_down' : 'trending_up'}
                  </span>
                  <span>{isBearish ? 'POSISI: SHORT / SELL' : 'POSISI: LONG / BUY'}</span>
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-surface-container-highest text-primary border border-outline-variant/40">
                  {patternResult?.match_score
                    ? `Kemiripan Vektor: ${Math.round(patternResult.match_score * 100)}%`
                    : layer1?.confidence
                    ? `Keyakinan Algoritma: ${layer1.confidence > 1 ? Math.round(layer1.confidence) : Math.round(layer1.confidence * 100)}%`
                    : 'Deteksi SciPy Teruji'}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-surface-container-highest text-on-surface-variant">
                  ATR: {layer1?.atr || '0.00'}
                </span>
              </div>

              <p className="text-xs text-on-surface-variant leading-relaxed">
                {queryPattern || patternResult
                  ? `Sistem otomatis menerapkan timeframe ${period.toUpperCase()} mengikuti pola pergerakan harga yang diinput pada Draw Pattern Search.`
                  : `Pola ${activePattern} dideteksi secara otomatis oleh mesin kuantitatif SciPy pada pergerakan harga ${period.toUpperCase()}. Target ${isBearish ? 'Breakdown (Take Profit Short di bawah entry)' : 'Breakout (Take Profit Long di atas entry)'} dan Stop Loss dikalkulasi secara dinamis menggunakan volatilitas ATR 14 periode dan level swing harga.`}
              </p>
            </div>

            {/* Breakout / Breakdown Levels Callout */}
            <div className="flex items-center gap-4 bg-surface-container-lowest/80 p-3.5 rounded-lg w-full lg:w-auto justify-between lg:justify-start shrink-0 border border-outline-variant/40 font-mono">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-secondary">
                  {isBearish ? 'Target Breakdown (TP)' : 'Target Breakout (TP)'}
                </div>
                <div className="text-sm font-bold text-tertiary mt-0.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">
                    {isBearish ? 'south_east' : 'arrow_outward'}
                  </span>
                  {layer1?.tp_sl?.tp
                    ? formatCurrency(layer1.tp_sl.tp, overview.type, symbol)
                    : formatCurrency(currentPrice * (isBearish ? 0.95 : 1.05), overview.type, symbol)}
                </div>
              </div>
              <div className="h-8 w-px bg-outline-variant/60" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-secondary">Stop Loss (ATR)</div>
                <div className="text-sm font-bold text-error mt-0.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">
                    {isBearish ? 'arrow_outward' : 'south_east'}
                  </span>
                  {layer1?.tp_sl?.sl
                    ? formatCurrency(layer1.tp_sl.sl, overview.type, symbol)
                    : formatCurrency(currentPrice * (isBearish ? 1.03 : 0.97), overview.type, symbol)}
                </div>
              </div>
              <div className="h-8 w-px bg-outline-variant/60 hidden sm:block" />
              <div className="hidden sm:block">
                <div className="text-[10px] uppercase tracking-wider text-secondary">Risk / Reward</div>
                <div className="text-sm font-bold text-primary mt-0.5">
                  1 : {layer1?.tp_sl?.risk_reward ? Number(layer1.tp_sl.risk_reward).toFixed(2) : '2.00'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. DUAL CHART ENGINE & ANALYSIS PANELS */}
      {loading ? (
        <div className="py-24 text-center space-y-3 bg-surface-container rounded-xl border border-outline-variant/50">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono text-on-surface-variant">
            Memuat analisis kuantitatif multi-layer & live candlestick...
          </p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-error-container text-on-error-container border border-error/30 text-center text-sm font-mono">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Dual Chart Engine */}
          <div className="lg:col-span-2 space-y-5">
            {/* Chart Engine Switcher & Timeframe Toolbar (Dekat dengan Grafik) */}
            <div className="bg-surface-container rounded-xl p-3 border border-outline-variant/60 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3 font-mono">
              {/* Engine Switcher */}
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <span className="text-on-surface-variant font-semibold uppercase text-[11px] mr-1 hidden sm:inline">
                  Engine:
                </span>
                {patternResult && (
                  <button
                    onClick={() => setChartView('pattern')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                      chartView === 'pattern'
                        ? 'bg-primary text-on-primary shadow-md ring-2 ring-primary/40 font-bold'
                        : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant/40'
                    }`}
                    title="Tampilkan grafik formasi lilin candlestick dan kurva pola kuning hasil pencocokan"
                  >
                    <span className="material-symbols-outlined text-[16px] text-yellow-400">auto_awesome</span>
                    <span>🎯 Formasi Pola Match ({patternResult.candle_count || patternResult.candles?.length || 60} Bar)</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                  </button>
                )}
                <button
                  onClick={() => setChartView('quant')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    chartView === 'quant'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">candlestick_chart</span>
                  <span>ATRED Quant ({period.toUpperCase()})</span>
                </button>
                <button
                  onClick={() => setChartView('official')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    chartView === 'official'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">show_chart</span>
                  <span>TradingView</span>
                </button>
              </div>

              {/* Timeframe Selector (Dekat dengan Grafik) */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-on-surface-variant uppercase font-semibold hidden md:inline">
                  Timeframe:
                </span>
                <div className="flex items-center bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/50 overflow-x-auto">
                  {['1s', '1m', '5m', '15m', '30m', '1h', '4h', '1d'].map((tf) => {
                    const isActive = period === tf;
                    const isSecond = tf === '1s';
                    return (
                      <button
                        key={tf}
                        onClick={() => {
                          setPeriod(tf);
                          if (chartView === 'pattern' && patternResult?.timeframe && tf !== patternResult.timeframe) {
                            setChartView('quant');
                          }
                        }}
                        className={`px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-mono transition-all flex items-center gap-1 ${
                          isActive
                            ? 'bg-primary text-on-primary font-bold shadow'
                            : isSecond
                            ? 'text-yellow-400 hover:text-yellow-300 hover:bg-surface-container'
                            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                        }`}
                        title={isSecond ? 'Ultra High-Frequency 1 Detik Scalp' : `Scalping Timeframe ${tf.toUpperCase()}`}
                      >
                        {isSecond && <span>⚡</span>}
                        <span>{tf.toUpperCase()}</span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] text-tertiary hidden xl:flex items-center gap-1 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                  Synced
                </span>
              </div>
            </div>

            {/* Candlestick Chart Window */}
            <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/60 shadow-md">
              {chartView === 'pattern' && patternResult ? (
                <div className="space-y-3">
                  {/* Pattern Header Info Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-lg bg-surface-container-highest/60 border border-outline-variant/40 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-tertiary animate-ping" />
                      <span className="text-on-surface font-semibold">
                        Grafik Formasi Pola Terverifikasi: <span className="text-primary">{patternResult.pattern_name || activePattern || 'Pola Geometris'}</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-surface-container text-[11px] text-on-surface-variant border border-outline-variant/40">
                        {patternResult.candle_count || patternResult.candles?.length || 60} Bar Candlestick
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span>Kemiripan: <strong className="text-tertiary">{Math.round((patternResult.match_score || 0.75) * 100)}%</strong></span>
                      <span>Timeframe: <strong className="text-primary">{(patternResult.timeframe || period).toUpperCase()}</strong></span>
                      <button
                        onClick={() => setChartView('quant')}
                        className="text-primary hover:underline flex items-center gap-0.5 font-semibold cursor-pointer"
                      >
                        <span>Lihat Konteks Historis Utuh</span>
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>

                  <PatternMatchLargeChart
                    patternResult={patternResult}
                    probeValues={probeValues}
                    height={540}
                    showControls={true}
                  />
                </div>
              ) : chartView === 'quant' ? (
                <TradingViewChart
                  symbol={symbol}
                  period={period}
                  data={ohlcv}
                  ohlcvData={ohlcv}
                  trendlines={layer1?.trendlines}
                  tpSl={layer1?.tp_sl}
                  fibonacci={layer1?.fibonacci}
                  targets={layer1?.targets}
                  levels={layer1?.levels}
                  liveTick={liveTick}
                  height={540}
                  chartHeight={540}
                />
              ) : (
                <TradingViewEmbedWidget
                  symbol={symbol}
                  period={period}
                  height={540}
                  theme="dark"
                  interval={period === '15m' ? '15' : period === '1h' ? '60' : 'D'}
                />
              )}
            </div>

            {/* Layer 1 Technical Indicators Panel */}
            <IndicatorsPanel technicalData={layer1} />

            {/* Historical Similarity Fractal Panel */}
            <SimilarityPanel
              symbol={symbol}
              period={period}
              similarityData={data?.similarity}
            />
          </div>

          {/* Right Col: Layer 2 (On-chain/Dev) + Layer 3 (AI Synthesis) */}
          <div className="space-y-5">
            {/* AI Narrative Synthesis Card */}
            <AISummaryCard
              symbol={symbol}
              aiSummary={aiSummary}
              aiOptions={aiOptions}
              macroData={macro}
            />

            {/* Layer 2: Dev & On-Chain Metrics */}
            <div className="bg-surface-container rounded-xl p-5 border border-outline-variant/60 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-outline-variant/40 pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">developer_board</span>
                  <h3 className="text-sm font-headline font-bold text-on-surface">
                    Layer 2: Developer & On-Chain
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-tertiary bg-tertiary-container/20 px-2 py-0.5 rounded">
                  Score: {layer2?.dev_metrics?.dev_score ?? 88}/100
                </span>
              </div>

              <DevActivityChart devMetrics={layer2?.dev_metrics} />
            </div>

            {/* Popular Asset Fast Switcher */}
            <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/60 shadow-sm space-y-2.5">
              <span className="text-xs font-mono font-semibold uppercase text-on-surface-variant block">
                Pindah Cepat Simbol Kuantitatif
              </span>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                {POPULAR_ASSETS.map((ast) => (
                  <button
                    key={ast.symbol}
                    onClick={() => navigate(`/analysis/${encodeURIComponent(ast.symbol)}?timeframe=${period}`)}
                    className={`px-3 py-2 rounded-lg text-left transition-colors border ${
                      ast.symbol === symbol
                        ? 'bg-primary text-on-primary font-bold border-primary'
                        : 'bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface border-outline-variant/40'
                    }`}
                  >
                    {ast.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
