import React, { useEffect, useRef, memo } from 'react';

export function mapToTradingViewSymbol(symbol) {
  if (!symbol) return 'BINANCE:BTCUSDT';
  let clean = symbol.toUpperCase().trim();
  clean = clean.replace('/', '').replace('.P', '').replace('-PERP', '');

  const mapping = {
    // Gold
    'GC=F': 'OANDA:XAUUSD',
    'XAUUSD=X': 'OANDA:XAUUSD',
    'XAUUSD': 'OANDA:XAUUSD',
    'GOLD': 'OANDA:XAUUSD',
    'XAU': 'OANDA:XAUUSD',

    // Crypto
    'BTC-USD': 'BINANCE:BTCUSDT',
    'BTC': 'BINANCE:BTCUSDT',
    'BTCUSDT': 'BINANCE:BTCUSDT',
    'ETH-USD': 'BINANCE:ETHUSDT',
    'ETH': 'BINANCE:ETHUSDT',
    'ETHUSDT': 'BINANCE:ETHUSDT',
    'SOL-USD': 'BINANCE:SOLUSDT',
    'SOL': 'BINANCE:SOLUSDT',
    'SOLUSDT': 'BINANCE:SOLUSDT',
    'AVAX-USD': 'BINANCE:AVAXUSDT',
    'AVAX': 'BINANCE:AVAXUSDT',
    'AVAXUSDT': 'BINANCE:AVAXUSDT',
    'BNB-USD': 'BINANCE:BNBUSDT',
    'BNB': 'BINANCE:BNBUSDT',
    'BNBUSDT': 'BINANCE:BNBUSDT',
    'XRP-USD': 'BINANCE:XRPUSDT',
    'XRP': 'BINANCE:XRPUSDT',
    'XRPUSDT': 'BINANCE:XRPUSDT',
    'ADA-USD': 'BINANCE:ADAUSDT',
    'ADA': 'BINANCE:ADAUSDT',
    'ADAUSDT': 'BINANCE:ADAUSDT',
    'DOGE-USD': 'BINANCE:DOGEUSDT',
    'DOGE': 'BINANCE:DOGEUSDT',
    'DOGEUSDT': 'BINANCE:DOGEUSDT',
    'NEAR-USD': 'BINANCE:NEARUSDT',
    'NEAR': 'BINANCE:NEARUSDT',
    'NEARUSDT': 'BINANCE:NEARUSDT',
    'LINK-USD': 'BINANCE:LINKUSDT',
    'LINK': 'BINANCE:LINKUSDT',
    'LINKUSDT': 'BINANCE:LINKUSDT',

    // Forex
    'EURUSD=X': 'FX:EURUSD',
    'EURUSD': 'FX:EURUSD',
    'GBPUSD=X': 'FX:GBPUSD',
    'GBPUSD': 'FX:GBPUSD',
    'USDJPY=X': 'FX:USDJPY',
    'USDJPY': 'FX:USDJPY',
    'AUDUSD=X': 'FX:AUDUSD',
    'AUDUSD': 'FX:AUDUSD',
    'USDCHF=X': 'FX:USDCHF',
    'USDCHF': 'FX:USDCHF',
  };

  if (mapping[clean]) return mapping[clean];
  if (clean.endsWith('=X')) return `FX:${clean.replace('=X', '')}`;
  if (clean.includes('-USD')) return `BINANCE:${clean.replace('-USD', '')}USDT`;
  if (clean.endsWith('USDT')) return `BINANCE:${clean}`;
  if (clean.length <= 6) return `BINANCE:${clean}USDT`;
  return clean;
}

export function mapToTradingViewInterval(period) {
  if (!period) return '15';
  const p = period.toLowerCase();
  if (p === '1s' || p === '1m') return '1';
  if (p === '5m') return '5';
  if (p === '15m') return '15';
  if (p === '30m') return '30';
  if (p === '1h') return '60';
  if (p === '4h') return '240';
  if (p === '1d') return 'D';
  return '15';
}

const TradingViewEmbedWidget = memo(function TradingViewEmbedWidget({ symbol = 'BTC-USD', period = '15m', height = 480 }) {
  const containerRef = useRef(null);
  const tvSymbol = mapToTradingViewSymbol(symbol);
  const tvInterval = mapToTradingViewInterval(period);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Bersihkan isi sebelumnya
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container__widget';
    wrapper.style.height = `${height}px`;
    wrapper.style.width = '100%';
    container.appendChild(wrapper);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: tvInterval,
      timezone: 'Asia/Jakarta',
      theme: 'dark',
      style: '1',
      locale: 'id',
      enable_publishing: false,
      allow_symbol_change: true,
      hide_side_toolbar: false,
      save_image: false,
      calendar: false,
      support_host: 'https://www.tradingview.com',
      backgroundColor: '#090d16',
      gridColor: 'rgba(30, 41, 59, 0.3)',
    });

    container.appendChild(script);

    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [tvSymbol, tvInterval, height]);

  return (
    <div className="w-full relative rounded-xl overflow-hidden border border-slate-800 bg-[#090d16] shadow-xl">
      <div ref={containerRef} className="tradingview-widget-container" style={{ height: `${height}px`, width: '100%' }} />
    </div>
  );
});

export default TradingViewEmbedWidget;
