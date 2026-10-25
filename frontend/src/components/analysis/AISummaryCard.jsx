import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Target,
  ArrowRight,
  Compass,
  RefreshCw,
  Zap,
  TrendingUp,
  BarChart3,
  Flame,
  Layers,
  Calculator,
  MessageSquare,
  Send,
  AlertTriangle,
  Info,
  DollarSign,
  Percent,
} from 'lucide-react';
import { useAI } from '../../context/AIContext';
import { api } from '../../services/api';
import { formatCurrency, formatPercent } from '../../utils/formatters';

export default function AISummaryCard({
  aiSummary = {},
  aiOptions = {},
  symbol = '',
  currentPrice = 0,
  executionPlan = null,
}) {
  const { isConfigured, aiConfig, openSettings } = useAI();

  // Active Tab: 'overview' | 'scalping' | 'swing' | 'investing' | 'scenarios' | 'calculator' | 'chat'
  const [activeTab, setActiveTab] = useState('overview');
  const [entryMode, setEntryMode] = useState('maker'); // 'maker' (0% Fee) | 'taker' (0.02% Fee)

  // Option-specific data states
  const [optionsData, setOptionsData] = useState({
    overview: aiSummary,
    scalping: aiOptions.scalping || null,
    swing: aiOptions.swing || null,
    investing: aiOptions.investing || null,
    scenarios: aiOptions.scenarios || null,
  });

  const [loadingMode, setLoadingMode] = useState(false);
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Position Sizing Calculator state
  const [accountCapital, setAccountCapital] = useState(10000);
  const [riskTolerancePct, setRiskTolerancePct] = useState(1.5);

  // Synchronize optionsData when props update
  useEffect(() => {
    setOptionsData((prev) => ({
      ...prev,
      overview: aiSummary,
      scalping: aiOptions.scalping || prev.scalping,
      swing: aiOptions.swing || prev.swing,
      investing: aiOptions.investing || prev.investing,
      scenarios: aiOptions.scenarios || prev.scenarios,
    }));
  }, [aiSummary, aiOptions]);

  // Request fresh analysis for a specific mode from backend / AI
  const fetchAnalysisForMode = async (mode, customPrompt = null) => {
    if (!symbol) return;
    setLoadingMode(true);
    try {
      const res = await api.queryAIAnalysis(symbol, {
        mode,
        customPrompt,
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        baseUrl: aiConfig.baseUrl,
      });

      if (mode === 'chat') {
        setChatHistory((prev) => [
          ...prev,
          { role: 'user', content: customPrompt },
          { role: 'ai', content: res.answer, isLive: res.is_live_ai, model: res.model },
        ]);
      } else {
        setOptionsData((prev) => ({ ...prev, [mode]: res }));
      }
    } catch (err) {
      console.error(`Failed to fetch AI analysis for mode ${mode}`, err);
    } finally {
      setLoadingMode(false);
    }
  };

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    // If data not yet cached for this tab, fetch it
    if (
      tabKey !== 'calculator' &&
      tabKey !== 'chat' &&
      !optionsData[tabKey] &&
      symbol
    ) {
      fetchAnalysisForMode(tabKey);
    }
  };

  const handleRefreshCurrent = () => {
    if (activeTab === 'calculator' || activeTab === 'chat') {
      fetchAnalysisForMode('overview');
    } else {
      fetchAnalysisForMode(activeTab);
    }
  };

  const handleSendChat = async (promptToSend) => {
    const text = promptToSend || chatPrompt;
    if (!text.trim()) return;
    setChatPrompt('');
    setChatLoading(true);
    try {
      const res = await api.queryAIAnalysis(symbol, {
        mode: 'chat',
        customPrompt: text,
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        baseUrl: aiConfig.baseUrl,
      });
      setChatHistory((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'ai', content: res.answer, isLive: res.is_live_ai, model: res.model },
      ]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'ai', content: 'Gagal memproses pertanyaan. Pastikan backend aktif.' },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Helper values for active data
  const currentOverview = optionsData.overview || {};
  const isBullish = currentOverview.verdict === 'BULLISH';
  const isBearish = currentOverview.verdict === 'BEARISH';
  const activeParams = currentOverview.parameters || {};
  const entryRef = activeParams.entry || currentPrice || 100;
  const tpRef = activeParams.tp || entryRef * 1.05;
  const slRef = activeParams.sl || entryRef * 0.95;

  // Position Sizing Calculation
  const riskDollar = accountCapital * (riskTolerancePct / 100);
  const slDistance = Math.abs(entryRef - slRef);
  const positionUnits = slDistance > 0 ? riskDollar / slDistance : 0;
  const positionValueDollar = positionUnits * entryRef;
  const tpDistance = Math.abs(tpRef - entryRef);
  const potentialProfitDollar = positionUnits * tpDistance;
  const effectiveRR = slDistance > 0 ? (tpDistance / slDistance).toFixed(2) : '2.0';

  const tabs = [
    { key: 'overview', label: 'Ikhtisar & Sinyal', icon: Zap },
    { key: 'scalping', label: 'Scalping (1m-15m)', icon: Flame },
    { key: 'swing', label: 'Swing Trade', icon: TrendingUp },
    { key: 'investing', label: 'Investasi & Makro', icon: Layers },
    { key: 'scenarios', label: 'Multi-Skenario', icon: BarChart3 },
    { key: 'calculator', label: 'Kalkulator Risiko', icon: Calculator },
    { key: 'chat', label: 'Tanya AI Analyst', icon: MessageSquare },
  ];

  return (
    <div
      className={`rounded-2xl glass-panel border space-y-5 transition-all overflow-hidden ${
        isBullish
          ? 'border-emerald-500/30 glow-bullish'
          : isBearish
          ? 'border-rose-500/30 glow-bearish'
          : 'border-blue-500/30'
      }`}
    >
      {/* Top Bar: Header, AI Status Badge & Actions */}
      <div className="p-5 pb-0 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
                  AI Quantitative Command Center
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs font-mono text-slate-400">{symbol}</span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                {currentOverview.headline || 'Quantitative Multi-Asset Trading Intelligence'}
              </h3>
            </div>
          </div>

          {/* Right AI Status Pill & Config Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {isConfigured ? (
              <button
                type="button"
                onClick={openSettings}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 text-xs font-semibold transition-colors cursor-pointer"
                title={`Model: ${aiConfig.model} (${aiConfig.provider.toUpperCase()}) — Klik untuk ubah`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>
                  {aiConfig.provider.toUpperCase()} ({aiConfig.model})
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={openSettings}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 text-blue-300 text-xs font-semibold transition-colors cursor-pointer"
                title="Klik untuk menghubungkan API Key AI (Gemini, OpenAI, DeepSeek, Groq)"
              >
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <span>Engine Kuantitatif Lokal • Set AI Key</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleRefreshCurrent}
              disabled={loadingMode}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all disabled:opacity-50 cursor-pointer"
              title="Perbarui Analisis"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMode ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Navigation Menu */}
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isTabActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isTabActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 border border-blue-400/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 bg-slate-900/40 border border-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content Area */}
      <div className="p-5 pt-0">
        {loadingMode ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-7 h-7 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-slate-400 font-medium font-mono">
              AI Quantitative Engine sedang menghitung & menyintesis data pasar...
            </p>
          </div>
        ) : (
          <>
            {/* ==================== TAB 1: IKHTISAR & SINYAL ==================== */}
            {activeTab === 'overview' && (
              <div className="space-y-5">
                {/* Verdict Header */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-400">Keputusan Sinyal:</span>
                    <span
                      className={`px-3 py-1 rounded-lg text-xs font-black tracking-widest uppercase shadow-md ${
                        isBullish
                          ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/30'
                          : isBearish
                          ? 'bg-rose-500 text-white shadow-rose-500/30'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      {currentOverview.verdict || 'NEUTRAL'} VERDICT
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Confidence: <strong className="text-cyan-400 font-mono">{currentOverview.confidence || 75}%</strong>
                  </div>
                </div>

                {/* Main Narrative */}
                <div className="text-sm text-slate-300 leading-relaxed bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
                  {currentOverview.summary_text}
                </div>

                {/* Key Findings */}
                {currentOverview.key_points && currentOverview.key_points.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Temuan Kunci Kuantitatif
                    </h4>
                    <div className="grid gap-2 text-xs">
                      {currentOverview.key_points.map((pt, i) => (
                        <div
                          key={i}
                          className="flex items-start space-x-2.5 p-2.5 rounded-lg bg-slate-800/30 border border-slate-800 text-slate-300"
                        >
                          <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                          <span
                            dangerouslySetInnerHTML={{
                              __html: pt.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* MEXC Execution Plan & 0% Maker Fee Optimizer */}
                {activeParams && (
                  <div className="pt-3 border-t border-slate-800 space-y-3">
                    {/* Entry Mode Toggle & Trade Validity */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-xs font-mono">
                        <button
                          type="button"
                          onClick={() => setEntryMode('maker')}
                          className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                            entryMode === 'maker'
                              ? 'bg-cyan-500 text-slate-950 shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Maker Limit (0.00% Fee)
                        </button>
                        <button
                          type="button"
                          onClick={() => setEntryMode('taker')}
                          className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                            entryMode === 'taker'
                              ? 'bg-amber-500 text-slate-950 shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Taker Breakout (0.02% Fee)
                        </button>
                      </div>

                      {executionPlan && (
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                          <span
                            className={`px-2.5 py-1 rounded-md font-bold border ${
                              executionPlan.trade_validity === 'EXECUTABLE_HIGH_EDGE'
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            }`}
                          >
                            {executionPlan.trade_validity || 'EXECUTABLE_HIGH_EDGE'} • Net EV:{' '}
                            {Number(executionPlan.net_expected_value_pct || 0) >= 0 ? '+' : ''}
                            {Number(executionPlan.net_expected_value_pct || 0).toFixed(2)}%
                          </span>
                          <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-cyan-400 font-bold">
                            Safe Lev: {executionPlan.position_sizing?.safe_max_leverage || '5x'} • Half-Kelly:{' '}
                            {executionPlan.position_sizing?.half_kelly_capital_fraction_pct ?? 10}%
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-cyan-500/30">
                        <div className="text-[11px] text-cyan-300 font-semibold">
                          {entryMode === 'maker' ? 'Maker Limit (0% Fee)' : 'Taker Market (0.02%)'}
                        </div>
                        <div className="text-sm font-bold font-mono text-slate-100 mt-1">
                          {formatCurrency(
                            entryMode === 'maker'
                              ? executionPlan?.maker_limit_entry || activeParams.entry
                              : executionPlan?.aggressive_market_entry || activeParams.entry,
                            'crypto',
                            symbol
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                        <div className="text-[11px] text-emerald-300 font-semibold flex items-center justify-center space-x-1">
                          <Target className="w-3.5 h-3.5" />
                          <span>Split TP1 (50%) / TP2</span>
                        </div>
                        <div className="text-xs font-black font-mono text-emerald-400 mt-1">
                          {formatCurrency(executionPlan?.tp1 || activeParams.tp, 'crypto', symbol)} /{' '}
                          {formatCurrency(executionPlan?.tp2 || activeParams.tp, 'crypto', symbol)}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                        <div className="text-[11px] text-rose-300 font-semibold flex items-center justify-center space-x-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>SL (MEXC Fair Price)</span>
                        </div>
                        <div className="text-sm font-black font-mono text-rose-400 mt-1">
                          {formatCurrency(executionPlan?.sl || activeParams.sl, 'crypto', symbol)}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                        <div className="text-[11px] text-cyan-300 font-semibold flex items-center justify-center space-x-1">
                          <Compass className="w-3.5 h-3.5" />
                          <span>Net R:R (After Fee)</span>
                        </div>
                        <div className="text-sm font-black font-mono text-cyan-300 mt-1">
                          1:{executionPlan?.net_rr_after_mexc_fees || activeParams.risk_reward?.replace('1:', '') || '2.0'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== TAB 2: SCALPING (1M-15M) ==================== */}
            {activeTab === 'scalping' && (
              <div className="space-y-4">
                {optionsData.scalping ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-amber-500/30">
                      <div>
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                          Intraday Scalp Momentum Setup
                        </span>
                        <h4 className="text-sm font-bold text-white mt-0.5">
                          {optionsData.scalping.headline}
                        </h4>
                      </div>
                      <span className="px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-amber-500 text-slate-950 self-start sm:self-auto">
                        BIAS: {optionsData.scalping.scalp_bias}
                      </span>
                    </div>

                    {/* Execution Trigger Box */}
                    <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1">
                      <div className="text-amber-400 font-semibold flex items-center space-x-1.5">
                        <Flame className="w-3.5 h-3.5" />
                        <span>Kondisi Pemicu Eksekusi (Trigger)</span>
                      </div>
                      <p className="text-slate-200 leading-relaxed font-medium">
                        {optionsData.scalping.execution_trigger}
                      </p>
                    </div>

                    {/* Quick Scalp Price Targets */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <div className="text-[11px] text-slate-400">Rentang Entry</div>
                        <div className="text-xs font-bold font-mono text-slate-200 mt-1">
                          ${optionsData.scalping.entry_zone?.min?.toLocaleString()} - $
                          {optionsData.scalping.entry_zone?.max?.toLocaleString()}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                        <div className="text-[11px] text-emerald-300 font-semibold">Scalp TP1 (Cepat)</div>
                        <div className="text-sm font-black font-mono text-emerald-400 mt-1">
                          ${optionsData.scalping.take_profit_1?.toLocaleString()}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                        <div className="text-[11px] text-emerald-300 font-semibold">Scalp TP2 (Runner)</div>
                        <div className="text-sm font-black font-mono text-emerald-400 mt-1">
                          ${optionsData.scalping.take_profit_2?.toLocaleString()}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                        <div className="text-[11px] text-rose-300 font-semibold">Tight Stop Loss</div>
                        <div className="text-sm font-black font-mono text-rose-400 mt-1">
                          ${optionsData.scalping.stop_loss_tight?.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Volume & Invalidation */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-cyan-400 font-bold block mb-1">Analisis Volume & Orderflow</span>
                        <p className="text-slate-300">{optionsData.scalping.volume_verdict}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <span className="text-rose-400 font-bold block mb-1 flex items-center space-x-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Aturan Pembatalan (Invalidation)</span>
                        </span>
                        <p className="text-slate-300">{optionsData.scalping.invalidation_condition}</p>
                      </div>
                    </div>

                    {/* Pro Tips */}
                    {optionsData.scalping.tips && (
                      <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 text-xs space-y-1">
                        <span className="text-slate-400 font-semibold">Tips Eksekusi Cepat:</span>
                        <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                          {optionsData.scalping.tips.map((t, idx) => (
                            <li key={idx}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Klik tab ini atau tombol refresh untuk memuat strategi scalping.
                  </div>
                )}
              </div>
            )}

            {/* ==================== TAB 3: SWING TRADING ==================== */}
            {activeTab === 'swing' && (
              <div className="space-y-4">
                {optionsData.swing ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/30">
                      <div>
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                          Multi-Day / Weekly Swing Framework
                        </span>
                        <h4 className="text-sm font-bold text-white mt-0.5">
                          {optionsData.swing.headline}
                        </h4>
                      </div>
                      <span className="px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-blue-600 text-white self-start sm:self-auto">
                        BIAS: {optionsData.swing.swing_bias}
                      </span>
                    </div>

                    {/* Fibonacci Levels Card */}
                    {optionsData.swing.fibonacci_levels && (
                      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-200">Level Fibonacci Retracement</span>
                          <span className="text-slate-400 text-[11px]">Berdasarkan Swing High & Low</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                          <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
                            <span className="text-slate-400 text-[10px] block">Fib 0.382</span>
                            <span className="font-mono font-bold text-slate-200">
                              ${optionsData.swing.fibonacci_levels.fib_0382?.toLocaleString()}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
                            <span className="text-slate-400 text-[10px] block">Fib 0.500 (Ekuilibrium)</span>
                            <span className="font-mono font-bold text-slate-200">
                              ${optionsData.swing.fibonacci_levels.fib_0500?.toLocaleString()}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <span className="text-amber-400 text-[10px] font-bold block">
                              Fib 0.618 (Golden Pocket)
                            </span>
                            <span className="font-mono font-bold text-amber-300">
                              ${optionsData.swing.fibonacci_levels.fib_0618?.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Key Zones & Strategy */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                        <span className="font-bold text-emerald-400 block">Zona Support Kunci</span>
                        <div className="text-slate-300 font-mono text-[11px]">
                          Level 1: ${optionsData.swing.key_support_zone?.level1?.toLocaleString()} | Level 2: $
                          {optionsData.swing.key_support_zone?.level2?.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                        <span className="font-bold text-rose-400 block">Zona Resisten Kunci</span>
                        <div className="text-slate-300 font-mono text-[11px]">
                          Level 1: ${optionsData.swing.key_resistance_zone?.level1?.toLocaleString()} | Level 2: $
                          {optionsData.swing.key_resistance_zone?.level2?.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1">
                      <span className="text-cyan-400 font-bold block">Strategi Entri & Akumulasi</span>
                      <p className="text-slate-300 leading-relaxed">
                        {optionsData.swing.entry_strategy}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1">
                      <span className="text-amber-400 font-bold block">Aturan Trailing Stop</span>
                      <p className="text-slate-300 leading-relaxed">
                        {optionsData.swing.trailing_stop_rule}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Memuat data swing trade...
                  </div>
                )}
              </div>
            )}

            {/* ==================== TAB 4: INVESTASI & MAKRO ==================== */}
            {activeTab === 'investing' && (
              <div className="space-y-4">
                {optionsData.investing ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30">
                      <div>
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                          Thesis Investasi Fundamental & Makro
                        </span>
                        <h4 className="text-sm font-bold text-white mt-0.5">
                          {optionsData.investing.headline}
                        </h4>
                      </div>
                      <span className="px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-emerald-500 text-slate-950 self-start sm:self-auto">
                        {optionsData.investing.verdict}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-xs space-y-2">
                      <span className="font-bold text-cyan-400 block">Dampak Makro (Fed Rate & Inflasi CPI)</span>
                      <p className="text-slate-300 leading-relaxed">
                        {optionsData.investing.macro_impact_analysis}
                      </p>
                    </div>

                    {/* DCA Accumulation Tiers */}
                    {optionsData.investing.dca_accumulation_tiers && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Layer Akumulasi Dollar-Cost Averaging (DCA)
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                          {optionsData.investing.dca_accumulation_tiers.map((tier, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1 text-center"
                            >
                              <div className="text-[11px] text-slate-400">{tier.tier}</div>
                              <div className="text-sm font-black font-mono text-cyan-400">
                                ${tier.price_target?.toLocaleString()}
                              </div>
                              <div className="text-[10px] text-slate-500 font-semibold">
                                Alokasi: {tier.allocation_pct}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
                      <span className="font-bold text-slate-200">Kesehatan Ekosistem & Developer</span>
                      <p className="text-slate-300">{optionsData.investing.dev_ecosystem_health}</p>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Memuat analisis investasi...
                  </div>
                )}
              </div>
            )}

            {/* ==================== TAB 5: MULTI-SKENARIO ==================== */}
            {activeTab === 'scenarios' && (
              <div className="space-y-4">
                {optionsData.scenarios ? (
                  <>
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs flex items-center justify-between">
                      <span className="font-bold text-white">Simulasi Probabilitas Pasar:</span>
                      <span className="text-slate-400">{optionsData.scenarios.recommended_overall_posture}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Bull Case */}
                      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                            Bullish Case
                          </span>
                          <span className="text-xs font-black font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            {optionsData.scenarios.bull_case?.probability_pct}%
                          </span>
                        </div>
                        <div className="text-base font-black font-mono text-white">
                          Target: ${optionsData.scenarios.bull_case?.target_price?.toLocaleString()}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          <strong>Katalis:</strong> {optionsData.scenarios.bull_case?.catalyst}
                        </p>
                        <div className="text-[11px] text-emerald-300 font-medium pt-1 border-t border-emerald-500/20">
                          <strong>Aksi:</strong> {optionsData.scenarios.bull_case?.action}
                        </div>
                      </div>

                      {/* Base Case */}
                      <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-300 uppercase tracking-wider">
                            Base Case (Konsolidasi)
                          </span>
                          <span className="text-xs font-black font-mono px-2 py-0.5 rounded bg-slate-700/50 text-slate-200">
                            {optionsData.scenarios.base_case?.probability_pct}%
                          </span>
                        </div>
                        <div className="text-base font-black font-mono text-white">
                          Range: {optionsData.scenarios.base_case?.target_range}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          <strong>Katalis:</strong> {optionsData.scenarios.base_case?.catalyst}
                        </p>
                        <div className="text-[11px] text-slate-300 font-medium pt-1 border-t border-slate-700/60">
                          <strong>Aksi:</strong> {optionsData.scenarios.base_case?.action}
                        </div>
                      </div>

                      {/* Bear Case */}
                      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-rose-400 uppercase tracking-wider">
                            Bearish Case
                          </span>
                          <span className="text-xs font-black font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                            {optionsData.scenarios.bear_case?.probability_pct}%
                          </span>
                        </div>
                        <div className="text-base font-black font-mono text-white">
                          Target: ${optionsData.scenarios.bear_case?.target_price?.toLocaleString()}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          <strong>Katalis:</strong> {optionsData.scenarios.bear_case?.catalyst}
                        </p>
                        <div className="text-[11px] text-rose-300 font-medium pt-1 border-t border-rose-500/20">
                          <strong>Aksi:</strong> {optionsData.scenarios.bear_case?.action}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Memuat simulasi skenario...
                  </div>
                )}
              </div>
            )}

            {/* ==================== TAB 6: KALKULATOR RISIKO & UKURAN POSISI ==================== */}
            {activeTab === 'calculator' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                      <Calculator className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Parameter Manajemen Risiko Akun</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Entry: ${entryRef.toLocaleString()} | SL: ${slRef.toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-medium flex items-center space-x-1">
                        <DollarSign className="w-3 h-3 text-cyan-400" />
                        <span>Total Modal Akun Trading ($)</span>
                      </label>
                      <input
                        type="number"
                        value={accountCapital}
                        onChange={(e) => setAccountCapital(Number(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-medium flex items-center space-x-1">
                        <Percent className="w-3 h-3 text-cyan-400" />
                        <span>Toleransi Risiko per Posisi (%)</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="10"
                          value={riskTolerancePct}
                          onChange={(e) => setRiskTolerancePct(Number(e.target.value) || 1)}
                          className="w-24 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                        />
                        <div className="flex items-center space-x-1">
                          {[1.0, 1.5, 2.0].map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setRiskTolerancePct(r)}
                              className={`px-2 py-1 rounded text-xs font-mono font-bold ${
                                riskTolerancePct === r
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {r}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Calculation Outputs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30">
                    <div className="text-[11px] text-rose-300 font-medium">Maksimal Risiko Dollar</div>
                    <div className="text-base font-black font-mono text-rose-400 mt-1">
                      ${riskDollar.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-500">Bila Stop Loss tersentuh</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                    <div className="text-[11px] text-cyan-300 font-medium">Ukuran Posisi Ideal</div>
                    <div className="text-base font-black font-mono text-cyan-400 mt-1">
                      {positionUnits.toFixed(positionUnits > 10 ? 2 : 4)} Unit
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Nilai: ${positionValueDollar.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <div className="text-[11px] text-emerald-300 font-medium">Proyeksi Profit TP</div>
                    <div className="text-base font-black font-mono text-emerald-400 mt-1">
                      +${potentialProfitDollar.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-emerald-400/80">
                      ROI: +{((potentialProfitDollar / (positionValueDollar || 1)) * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="text-[11px] text-slate-400 font-medium">Rasio Risk / Reward</div>
                    <div className="text-base font-black font-mono text-white mt-1">
                      1 : {effectiveRR}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-semibold">
                      {Number(effectiveRR) >= 1.5 ? '✓ Memenuhi Standar' : '⚠ R:R Rendah'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== TAB 7: TANYA AI CO-PILOT ==================== */}
            {activeTab === 'chat' && (
              <div className="space-y-4">
                {/* Chat History Container */}
                <div className="min-h-[220px] max-h-[340px] overflow-y-auto space-y-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs custom-scrollbar">
                  {chatHistory.length === 0 ? (
                    <div className="py-8 text-center space-y-2 text-slate-400">
                      <MessageSquare className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="font-semibold text-slate-300">Tanya AI Analyst mengenai {symbol}</p>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        AI membaca seluruh indikator teknikal, pola chart, dev metrics, dan data makro secara real-time.
                      </p>
                    </div>
                  ) : (
                    chatHistory.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl ${
                          msg.role === 'user'
                            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100 ml-8'
                            : 'bg-slate-900/90 border border-slate-800 text-slate-200 mr-4'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1 text-[10px] text-slate-400">
                          <span className="font-bold uppercase tracking-wider">
                            {msg.role === 'user' ? 'Anda' : `AI Analyst (${msg.model || 'Quantitative'})`}
                          </span>
                        </div>
                        <div
                          className="leading-relaxed whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{
                            __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
                          }}
                        />
                      </div>
                    ))
                  )}

                  {chatLoading && (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center space-x-2">
                      <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                      <span>AI sedang menyusun analisis...</span>
                    </div>
                  )}
                </div>

                {/* Quick Prompt Chips */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    Pertanyaan Cepat:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Apakah sekarang waktu yang tepat untuk entry?',
                      'Di mana level breakout terkuat?',
                      'Bagaimana konfirmasi pola chart saat ini?',
                      'Hitung rasio Risk / Reward optimal',
                      'Bagaimana dampak sentimen makro ke aset ini?',
                    ].map((chip) => (
                      <button
                        key={chip}
                        onClick={() => handleSendChat(chip)}
                        disabled={chatLoading}
                        className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-700/60 transition-colors text-left"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Input Bar */}
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={chatPrompt}
                    onChange={(e) => setChatPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChat(chatPrompt);
                      }
                    }}
                    placeholder={`Tanyakan strategi spesifik untuk ${symbol}...`}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 placeholder-slate-600"
                  />
                  <button
                    onClick={() => handleSendChat(chatPrompt)}
                    disabled={chatLoading || !chatPrompt.trim()}
                    className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
