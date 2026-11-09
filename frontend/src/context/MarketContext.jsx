import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { connectMarketWebSocket } from '../services/api';

const MarketContext = createContext();

export function MarketProvider({ children }) {
  const [activeAsset, setActiveAsset] = useState('BTC_USDT');
  const [marketType, setMarketTypeState] = useState(() => {
    try {
      const saved = localStorage.getItem('atred_market_type');
      return saved === 'spot' || saved === 'future' ? saved : 'future';
    } catch {
      return 'future';
    }
  });
  const [liveTicks, setLiveTicks] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [lastTick, setLastTick] = useState(null);

  const setMarketType = useCallback((type) => {
    const normalized = type === 'spot' ? 'spot' : 'future';
    setMarketTypeState(normalized);
    try {
      localStorage.setItem('atred_market_type', normalized);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const wsRef = useRef(null);
  const activeAssetRef = useRef(activeAsset);
  const reconnectTimeoutRef = useRef(null);
  const isUnmountingRef = useRef(false);

  useEffect(() => {
    activeAssetRef.current = activeAsset;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && activeAsset) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'SUBSCRIBE', symbol: activeAsset }));
      } catch {
        // Ignore send errors if socket is closing
      }
    }
  }, [activeAsset]);

  const setupWebSocket = useCallback(() => {
    if (isUnmountingRef.current) return;

    try {
      if (wsRef.current) {
        wsRef.current.close();
      }

      const ws = connectMarketWebSocket(
        (data) => {
          if (data.type === 'CONNECTION_ESTABLISHED') {
            setWsConnected(true);
            if (ws.readyState === WebSocket.OPEN && activeAssetRef.current) {
              try {
                ws.send(JSON.stringify({ type: 'SUBSCRIBE', symbol: activeAssetRef.current }));
              } catch {
                // Ignore
              }
            }
            // Inisialisasi snapshot jika ada
            if (data.snapshot) {
              setLiveTicks((prev) => ({
                ...prev,
                ...data.snapshot,
              }));
            }
          } else if (data.type === 'TICK') {
            setLiveTicks((prev) => {
              const prevItem = prev[data.symbol];
              const prevPrice = prevItem?.price;
              let direction = 'none';
              if (prevPrice !== undefined) {
                if (data.price > prevPrice) direction = 'up';
                else if (data.price < prevPrice) direction = 'down';
                else direction = prevItem.direction || 'none';
              }

              return {
                ...prev,
                [data.symbol]: {
                  price: data.price,
                  change: data.change !== undefined ? data.change : prevItem?.change || 0,
                  change_pct: data.change_pct !== undefined ? data.change_pct : prevItem?.change_pct || 0,
                  high_24h: data.high_24h || prevItem?.high_24h,
                  low_24h: data.low_24h || prevItem?.low_24h,
                  volume: data.volume || prevItem?.volume,
                  timestamp: data.timestamp || Date.now() / 1000,
                  direction,
                  lastUpdate: Date.now(),
                },
              };
            });
            setLastTick(data);
          } else if (data.type === 'ALERT') {
            setAlerts((prev) => [data, ...prev.slice(0, 9)]);
          }
        },
        () => {
          setWsConnected(false);
          // Auto reconnect setelah 2 detik
          if (!isUnmountingRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
              setupWebSocket();
            }, 2000);
          }
        }
      );

      wsRef.current = ws;
    } catch (e) {
      console.warn('WS could not connect, will reconnect in 3s:', e);
      if (!isUnmountingRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          setupWebSocket();
        }, 3000);
      }
    }
  }, []);

  useEffect(() => {
    isUnmountingRef.current = false;
    setupWebSocket();

    return () => {
      isUnmountingRef.current = true;
      clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [setupWebSocket]);

  return (
    <MarketContext.Provider
      value={{
        activeAsset,
        setActiveAsset,
        marketType,
        setMarketType,
        liveTicks,
        wsConnected,
        alerts,
        lastTick,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error('useMarket must be used within a MarketProvider');
  }
  return context;
}
