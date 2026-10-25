import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AIContext = createContext(null);

const STORAGE_KEY = 'atred_ai_config';

const DEFAULT_CONFIG = {
  provider: 'gemini', // default to gemini or openai
  apiKey: '',
  model: 'gemini-2.5-flash',
  baseUrl: '',
};

export function AIProvider({ children }) {
  const [aiConfig, setAiConfigState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.model && parsed.model.startsWith('gemini-3.')) {
          parsed.model = 'gemini-2.5-flash';
        }
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to read AI config from localStorage', e);
    }
    return DEFAULT_CONFIG;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [providersData, setProvidersData] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Load server providers data on mount
  useEffect(() => {
    async function fetchProviders() {
      try {
        const data = await api.getAIProviders();
        setProvidersData(data);
      } catch (e) {
        console.warn('Failed to fetch AI providers info from server', e);
      }
    }
    fetchProviders();
  }, []);

  const saveAiConfig = (newConfig) => {
    const updated = { ...aiConfig, ...newConfig };
    setAiConfigState(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save AI config to localStorage', e);
    }
    setTestResult(null);
  };

  const testConnection = async (overrideConfig = null) => {
    const target = overrideConfig || aiConfig;
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await api.testAIKey({
        provider: target.provider,
        apiKey: target.apiKey,
        model: target.model,
        baseUrl: target.baseUrl,
      });
      setTestResult(res);
      return res;
    } catch (err) {
      const failRes = {
        success: false,
        message: err.response?.data?.detail || err.message || 'Koneksi gagal.',
        latency_ms: 0,
      };
      setTestResult(failRes);
      return failRes;
    } finally {
      setTestingConnection(false);
    }
  };

  const isConfigured = Boolean(aiConfig.apiKey && aiConfig.apiKey.trim().length > 5);

  const value = {
    aiConfig,
    saveAiConfig,
    isConfigured,
    isSettingsOpen,
    openSettings: () => setIsSettingsOpen(true),
    closeSettings: () => setIsSettingsOpen(false),
    providersData,
    testConnection,
    testingConnection,
    testResult,
    setTestResult,
  };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
}
