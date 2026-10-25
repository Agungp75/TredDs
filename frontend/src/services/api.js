import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000/api/ws/ticks';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;

export const api = {
  // MEXC Two-Stage Full-Market Screener
  getScreener: async (assetType = 'crypto', minScore = 0, timeframe = '15m', strategy = 'all') => {
    const params = {};
    if (assetType) params.asset_type = assetType;
    if (minScore) params.min_score = minScore;
    if (timeframe) params.timeframe = timeframe;
    if (strategy && strategy !== 'all') params.strategy = strategy;
    const res = await apiClient.get('/screener', { params });
    return res.data;
  },

  // MEXC Crypto Explorer
  getCryptoTokens: async () => {
    const res = await apiClient.get('/crypto/tokens');
    return res.data;
  },

  // Layer 2: MEXC Derivatives & Orderflow Microstructure
  getDerivatives: async (symbol, timeframe = '15m') => {
    const res = await apiClient.get(`/derivatives/${encodeURIComponent(symbol)}`, {
      params: { timeframe },
    });
    return res.data;
  },

  // Crypto Correlation Matrix & Catalyst Calendar
  getCorrelationMatrix: async (timeframe = '1h') => {
    const res = await apiClient.get('/screener/correlation-matrix', { params: { timeframe } });
    return res.data;
  },
  getCatalystCalendar: async () => {
    const res = await apiClient.get('/screener/catalyst-calendar');
    return res.data;
  },

  // 3-Layer Deep Quant & MEXC Derivatives Analysis
  getDeepAnalysis: async (symbol, period = '15m') => {
    const res = await apiClient.get(`/analysis/${encodeURIComponent(symbol)}`, {
      params: { period },
    });
    return res.data;
  },

  // Layer 3: Historical Similarity Engine (K=30 & Wilcoxon p-value)
  getSimilarity: async (symbol, timeframe = '1h', period = 'max') => {
    const res = await apiClient.get(`/analysis/${encodeURIComponent(symbol)}/similarity`, {
      params: { timeframe, period },
    });
    return res.data;
  },

  // AI Integration & Multi-Option Analysis
  getAIProviders: async () => {
    const res = await apiClient.get('/analysis/ai/providers');
    return res.data;
  },
  testAIKey: async ({ provider, apiKey, model, baseUrl }) => {
    const res = await apiClient.post('/analysis/ai/test-key', {
      provider,
      api_key: apiKey,
      model,
      base_url: baseUrl,
    });
    return res.data;
  },
  getAIModels: async ({ provider, apiKey, baseUrl }) => {
    const res = await apiClient.post('/analysis/ai/models', {
      provider,
      api_key: apiKey,
      base_url: baseUrl,
    });
    return res.data;
  },
  queryAIAnalysis: async (symbol, payload = {}) => {
    const res = await apiClient.post(`/analysis/${encodeURIComponent(symbol)}/ai-query`, {
      mode: payload.mode || 'overview',
      custom_prompt: payload.customPrompt,
      provider: payload.provider,
      api_key: payload.apiKey,
      model: payload.model,
      base_url: payload.baseUrl,
      period: payload.period || '15m',
    });
    return res.data;
  },

  // Draw-to-Search Pattern Matching (Dynamic Top-40 MEXC Coins)
  searchDrawnPattern: async (points, topK = 12, timeframe = 'auto') => {
    const res = await apiClient.post(
      '/crypto/pattern-search',
      {
        points,
        top_k: topK,
        timeframe,
      },
      { timeout: 35000 }
    );
    return res.data;
  },
};

export function connectMarketWebSocket(onMessage, onError) {
  let ws = null;
  try {
    ws = new WebSocket(WS_BASE_URL);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        console.error('Error parsing WebSocket message', e);
      }
    };
    ws.onerror = (err) => {
      if (onError) onError(err);
    };
  } catch (err) {
    console.error('WebSocket connection error:', err);
  }
  return ws;
}
