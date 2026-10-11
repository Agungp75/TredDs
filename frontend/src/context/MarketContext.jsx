import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { connectMarketWebSocket } from '../services/api';

const MarketContext = createContext();

export function MarketProvider({ children }) {
  const [activeAsset, setActiveAsset] = useState('BTC-USD');
  const [liveTicks, setLiveTicks] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [lastTick, setLastTick] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const isUnmountingRef = useRef(false);

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
