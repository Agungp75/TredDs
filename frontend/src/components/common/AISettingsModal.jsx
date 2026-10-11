import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Key,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Zap,
  Server,
  Eye,
  EyeOff,
  Cpu,
  RefreshCw,
  Edit3,
  List,
} from 'lucide-react';
import { useAI } from '../../context/AIContext';
import { api } from '../../services/api';

const PROVIDER_INFO = {
  gemini: {
    name: 'Google Gemini',
    badge: 'Disarankan (Cepat, Akurat & Kuota Besar)',
    badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    helpUrl: 'https://aistudio.google.com/app/apikey',
    helpText: 'Dapatkan API Key gratis di Google AI Studio',
    defaultModel: 'gemini-3.8-flash',
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Generasi Terbaru - Super Cepat & Cerdas)', badge: 'Terkini' },
      { id: 'gemini-3.8-pro', label: 'Gemini 3.8 Pro (Generasi Terbaru - Flagship Reasoning & Analisis)', badge: 'Terkini' },
      { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (Generasi 3 - Kecepatan & Akurasi Tinggi)', badge: 'Terkini' },
      { id: 'gemini-3.6-pro', label: 'Gemini 3.6 Pro (Generasi 3 - Penalaran Kuantitatif Kompleks)', badge: 'Terkini' },
      { id: 'gemini-3.0-flash', label: 'Gemini 3.0 Flash (Generasi 3)', badge: 'Terkini' },
      { id: 'gemini-3.0-pro', label: 'Gemini 3.0 Pro (Generasi 3)', badge: 'Terkini' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Generasi 2.5 - Multimodal)', badge: 'Stabil' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Generasi 2.5)', badge: 'Stabil' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Stabil & Cepat)', badge: 'Stabil' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite (Ultra Ringan)', badge: 'Cepat' },
      { id: 'gemini-2.0-flash-thinking-exp-01-21', label: 'Gemini 2.0 Flash Thinking Exp (Deep Reasoning)', badge: 'Reasoning' },
      { id: 'gemini-2.0-pro-exp-02-05', label: 'Gemini 2.0 Pro Experimental', badge: 'Reasoning' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Standar 1.5)', badge: 'Legacy' },
      { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B', badge: 'Legacy' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Long Context)', badge: 'Legacy' },
      { id: 'gemini-1.0-pro', label: 'Gemini 1.0 Pro', badge: 'Legacy' },
    ],
    placeholder: 'AIzaSy...',
  },
  openai: {
    name: 'OpenAI',
    badge: 'Industry Standard',
    badgeColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    helpUrl: 'https://platform.openai.com/api-keys',
    helpText: 'Buat Secret Key di OpenAI Platform',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-5', label: 'GPT-5 (Generasi Terbaru Flagship)', badge: 'Terkini' },
      { id: 'gpt-5-mini', label: 'GPT-5 Mini (Generasi Terbaru Ringan)', badge: 'Terkini' },
      { id: 'gpt-4.5-preview', label: 'GPT-4.5 Preview (Next-Gen Flagship OpenAI)', badge: 'Terkini' },
      { id: 'gpt-4o', label: 'GPT-4o (Flagship Multimodal Omnichannel)', badge: 'Flagship' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Rekomendasi - Ringan & Hemat)', badge: 'Rekomendasi' },
      { id: 'o3-mini', label: 'o3-mini (High-Speed Reasoning Model)', badge: 'Reasoning' },
      { id: 'o1', label: 'o1 (Full Reasoning Penalaran Tingkat Tinggi)', badge: 'Reasoning' },
      { id: 'o1-mini', label: 'o1-mini (Reasoning Ringkas & Cepat)', badge: 'Reasoning' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo (High Context 128k)', badge: 'Standar' },
      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Legacy)', badge: 'Legacy' },
    ],
    placeholder: 'sk-proj-...',
  },
  deepseek: {
    name: 'DeepSeek',
    badge: 'High Reasoning & Hemat',
    badgeColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    helpUrl: 'https://platform.deepseek.com',
    helpText: 'Dapatkan API Key di DeepSeek Open Platform',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek-V3 Chat (Cepat, Akurat & Super Hemat)', badge: 'Rekomendasi' },
      { id: 'deepseek-reasoner', label: 'DeepSeek-R1 (Penalaran Kuantitatif / Reasoning)', badge: 'Reasoning' },
    ],
    placeholder: 'sk-...',
  },
  groq: {
    name: 'Groq',
    badge: 'Ultra Fast Latency (<300ms)',
    badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    helpUrl: 'https://console.groq.com/keys',
    helpText: 'Dapatkan API Key di Groq Console',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Rekomendasi Groq)', badge: 'Rekomendasi' },
      { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B (LPU Ultra-Fast Reasoning)', badge: 'Reasoning' },
      { id: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B Versatile', badge: 'Standar' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Ultra Cepat <150ms)', badge: 'Cepat' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (32k Context)', badge: 'Standar' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B IT (Google on Groq)', badge: 'Standar' },
    ],
    placeholder: 'gsk_...',
  },
  custom: {
    name: 'Custom (Ollama / vLLM)',
    badge: 'Self-Hosted / Local',
    badgeColor: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    helpUrl: 'https://ollama.com',
    helpText: 'Gunakan endpoint OpenAI-compatible lokal/remote',
    defaultModel: 'custom-model',
    models: [
      { id: 'custom-model', label: 'Custom Model (Ollama / vLLM / Local)', badge: 'Custom' }
    ],
    placeholder: 'Opsional jika tidak butuh token',
  },
};

export default function AISettingsModal() {
  const {
    isSettingsOpen,
    closeSettings,
    aiConfig,
    saveAiConfig,
    testConnection,
    testingConnection,
    testResult,
    setTestResult,
  } = useAI();

  const [provider, setProvider] = useState(aiConfig.provider || 'gemini');
  const [apiKey, setApiKey] = useState(aiConfig.apiKey || '');
  const [model, setModel] = useState(aiConfig.model || 'gemini-3.8-flash');
  const [baseUrl, setBaseUrl] = useState(aiConfig.baseUrl || '');
  const [showKey, setShowKey] = useState(false);
  const [savedAlert, setSavedAlert] = useState(false);

  // Live model fetching from remote API
  const [liveModels, setLiveModels] = useState({});
  const [fetchingLiveModels, setFetchingLiveModels] = useState(false);
  const [isCustomModelMode, setIsCustomModelMode] = useState(false);

  if (!isSettingsOpen) return null;

  const currentProviderInfo = PROVIDER_INFO[provider] || PROVIDER_INFO.gemini;
  const activeModelList = liveModels[provider] || currentProviderInfo.models;

  const handleProviderChange = (newProv) => {
    setProvider(newProv);
    const info = PROVIDER_INFO[newProv];
    if (info) {
      setModel(info.defaultModel);
    }
    setTestResult(null);
  };

  const handleSave = () => {
    saveAiConfig({
      provider,
      apiKey: apiKey.trim(),
      model: model.trim(),
      baseUrl: baseUrl.trim(),
    });
    setSavedAlert(true);
    setTimeout(() => setSavedAlert(false), 2500);
  };

  const handleTest = async () => {
    const res = await testConnection({
      provider,
      apiKey: apiKey.trim(),
      model: model.trim(),
      baseUrl: baseUrl.trim(),
    });
    if (res?.available_models && res.available_models.length > 0) {
      setLiveModels((prev) => ({ ...prev, [provider]: res.available_models }));
    }
  };

  const handleFetchLiveModels = async () => {
    if (!apiKey.trim()) {
      alert('Masukkan API Key terlebih dahulu untuk mengambil daftar model live.');
      return;
    }
    setFetchingLiveModels(true);
    try {
      const data = await api.getAIModels({
        provider,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
      });
      if (data?.models && data.models.length > 0) {
        setLiveModels((prev) => ({ ...prev, [provider]: data.models }));
      }
    } catch (e) {
      console.warn('Gagal memuat model live dari API', e);
    } finally {
      setFetchingLiveModels(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden glass-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Konfigurasi API AI Analyst</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 font-mono">
                  Multi-Provider & Model Terkini
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Pilih provider dan model AI terbaru (Gemini 2.5 / 2.0, GPT-4o, DeepSeek, Groq)
              </p>
            </div>
          </div>
          <button
            onClick={closeSettings}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* Fallback Notice Banner */}
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-start space-x-3 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="text-blue-300">Intelligent Heuristic Fallback:</strong> Sistem siap pakai secara
              instan. Saat Anda memasukkan API Key, sistem langsung beralih ke analisis penalaran neural real-time.
            </div>
          </div>

          {/* Provider Selection Tabs */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Pilih Penyedia AI (Provider)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {Object.entries(PROVIDER_INFO).map(([key, info]) => {
                const isSelected = provider === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleProviderChange(key)}
                    className={`p-2.5 rounded-xl border text-left transition-all relative ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-md shadow-blue-500/20'
                        : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="text-xs font-bold truncate">{info.name}</div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">{info.defaultModel}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Provider Badge & Link */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800/70 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Penyedia Terpilih:</span>
              <span className="font-bold text-white">{currentProviderInfo.name}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] border ${currentProviderInfo.badgeColor}`}>
                {currentProviderInfo.badge}
              </span>
            </div>
            <a
              href={currentProviderInfo.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 font-semibold text-xs"
            >
              <span>{currentProviderInfo.helpText}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-cyan-400" />
                <span>API Key {currentProviderInfo.name}</span>
              </label>
              <span className="text-[11px] text-slate-500">Tersimpan aman di browser Anda</span>
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder={currentProviderInfo.placeholder}
                className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-600 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Model Selection Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Model AI ({activeModelList.length} Pilihan Tersedia)</span>
              </label>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleFetchLiveModels}
                  disabled={fetchingLiveModels || !apiKey.trim()}
                  className="flex items-center space-x-1 text-[11px] text-cyan-400 hover:text-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                  title="Tarik daftar model live langsung dari Google / OpenAI API"
                >
                  <RefreshCw className={`w-3 h-3 ${fetchingLiveModels ? 'animate-spin' : ''}`} />
                  <span>{fetchingLiveModels ? 'Mengambil...' : 'Perbarui dari API'}</span>
                </button>

                <span className="text-slate-600">•</span>

                <button
                  type="button"
                  onClick={() => setIsCustomModelMode(!isCustomModelMode)}
                  className="flex items-center space-x-1 text-[11px] text-slate-400 hover:text-white transition-colors"
                >
                  {isCustomModelMode ? (
                    <>
                      <List className="w-3 h-3 text-cyan-400" />
                      <span>Pilih dari List</span>
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-3 h-3 text-cyan-400" />
                      <span>Ketik Kustom</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {isCustomModelMode ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="Contoh: gemini-2.5-flash atau gemini-2.0-flash-thinking-exp-01-21"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500 placeholder-slate-600"
                />
                <p className="text-[11px] text-slate-500">
                  Anda dapat mengetik ID model baru apa pun yang dirilis oleh penyedia.
                </p>
              </div>
            ) : (
              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  setTestResult(null);
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              >
                {activeModelList.map((m) => {
                  const mId = typeof m === 'string' ? m : m.id;
                  const mLabel = typeof m === 'string' ? m : m.label;
                  const mBadge = typeof m === 'object' && m.badge ? `[${m.badge}] ` : '';
                  const isRec = mId === currentProviderInfo.defaultModel;
                  return (
                    <option key={mId} value={mId}>
                      {mBadge}
                      {mLabel} {isRec ? '★ Rekomendasi' : ''}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {/* Custom Base URL (if custom or remote proxy) */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              <span>Custom Base URL (Opsional)</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://generativelanguage.googleapis.com/v1beta atau https://api.openai.com/v1"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500 placeholder-slate-600"
            />
          </div>

          {/* Test Connection Result Alert */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-start space-x-3 text-xs animate-in fade-in duration-200 ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-semibold">{testResult.message}</div>
                {testResult.latency_ms > 0 && (
                  <div className="font-mono text-[11px] opacity-80">
                    Ping Latensi: {testResult.latency_ms} ms
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Success Save Feedback */}
          {savedAlert && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Pengaturan API AI berhasil disimpan!</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/80 bg-slate-950/60">
          <button
            type="button"
            onClick={handleTest}
            disabled={testingConnection || !apiKey.trim()}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testingConnection ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Menguji...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Test Koneksi AI</span>
              </>
            )}
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={closeSettings}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Simpan Konfigurasi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
