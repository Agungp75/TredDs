import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../services/api';

export default function CryptoCorrelationMatrix() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiClient
      .get('/screener/correlation-matrix?timeframe=1h')
      .then((res) => {
        if (mounted) {
          setData(res.data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const rsList = data?.relative_strength || [];

  return (
    <div className="bg-surface-container-low rounded-xl border border-outline-variant/60 p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-outline-variant/40 pb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">hub</span>
          <div>
            <h3 className="text-sm font-headline font-bold text-on-surface uppercase tracking-wider">
              BTC Gate & Relative Strength (RS Alt/BTC)
            </h3>
            <p className="text-[11px] text-on-surface-variant">
              Korelasi Pearson 1H & Deteksi Koin Decoupled Leader vs BTC_USDT
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-surface-container-highest text-cyan-400 border border-cyan-500/30">
          LIVE 1H MATRIX
        </span>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs font-mono text-on-surface-variant animate-pulse">
          Menghitung matriks korelasi & Relative Strength MEXC...
        </div>
      ) : (
        <div className="space-y-2.5">
          {rsList.map((item) => {
            const rs = Number(item.rs_vs_btc_pct || 0);
            const corr = Number(item.corr_with_btc ?? 1.0);
            const isLeader = item.status === 'DECOUPLED_STRONG_LEADER' || item.status === 'OUTPERFORMING_BTC';
            return (
              <Link
                key={item.symbol}
                to={`/analysis/${encodeURIComponent(item.symbol)}`}
                className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-xs text-on-surface">
                    {item.symbol.replace('_USDT', '/USDT')}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded ${
                      item.status === 'DECOUPLED_STRONG_LEADER'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : isLeader
                        ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                        : item.status === 'LAGGING_WEAK'
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        : 'bg-surface-container-highest text-on-surface-variant'
                    }`}
                  >
                    {item.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-on-surface-variant text-[11px]">
                    Corr: <strong className="text-on-surface">{corr.toFixed(2)}</strong>
                  </span>
                  <span className={`font-bold ${rs >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    RS: {rs >= 0 ? `+${rs.toFixed(2)}%` : `${rs.toFixed(2)}%`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
