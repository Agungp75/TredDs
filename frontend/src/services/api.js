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

export const api = {
  // Scalping Screener (1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d)
  getScreener: async (assetType = '', minScore = 0, timeframe = '15m') => {
    const params = {};
    if (assetType) params.asset_type = assetType;
    if (minScore) params.min_score = minScore;
    if (timeframe) params.timeframe = timeframe;
    const res = await apiClient.get('/screener', { params });
    return res.data;
  },

  // Crypto
  getCryptoTokens: async () => {
    const res = await apiClient.get('/crypto/tokens');
    return res.data;
  },

  // Forex & Gold
  getForexPairs: async () => {
    const res = await apiClient.get('/forex/pairs');
    return res.data;
  },
  getForexCorrelation: async () => {
    const res = await apiClient.get('/forex/correlation');
    return res.data;
  },
  getForexCalendar: async () => {
    const res = await apiClient.get('/forex/calendar');
    return res.data;
  },

  // 3-Layer Deep Scalp Analysis
  getDeepAnalysis: async (symbol, period = '15m') => {
    const res = await apiClient.get(`/analysis/${encodeURIComponent(symbol)}`, {
      params: { period }
    });
    return res.data;
  },

  // Historical Similarity Engine
  getSimilarity: async (symbol, timeframe = '1d', period = 'max') => {
    const res = await apiClient.get(`/analysis/${encodeURIComponent(symbol)}/similarity`, {
      params: { timeframe, period }
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
      period: payload.period || '3mo',
    });
    return res.data;
  },

  // Draw-to-Search Pattern Matching (Crypto Only)
  searchDrawnPattern: async (points, topK = 5, timeframe = 'auto') => {
    const res = await apiClient.post('/crypto/pattern-search', {
      points,
      top_k: topK,
      timeframe,
    }, { timeout: 30000 }); // timeout 30s karena scan 10 koin secara paralel
    return res.data;
  },

};


// WebSocket Streaming Connector
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
