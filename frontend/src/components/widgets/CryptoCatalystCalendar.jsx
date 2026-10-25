import React, { useEffect, useState } from 'react';
import apiClient from '../../services/api';

export default function CryptoCatalystCalendar() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let mounted = true;
    apiClient
      .get('/screener/catalyst-calendar')
      .then((res) => {
        if (mounted) setData(res.data);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const events = data?.events || [];

  return (
    <div className="bg-surface-container-low rounded-xl border border-outline-variant/60 p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-outline-variant/40 pb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-cyan-400 text-[20px]">schedule</span>
          <div>
            <h3 className="text-sm font-headline font-bold text-on-surface uppercase tracking-wider">
              MEXC Funding Settlement & Crypto Catalysts
            </h3>
            <p className="text-[11px] text-on-surface-variant">
              Siklus Settlement Funding 8-Jam, Token Unlock & Jendela Volatilitas
            </p>
          </div>
        </div>
        {data?.next_funding_settlement && (
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Next: {data.next_funding_settlement}
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="p-3 rounded-lg bg-surface-container border border-outline-variant/40 space-y-1"
          >
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-cyan-400 font-bold">{ev.asset}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  ev.impact === 'HIGH'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                }`}
              >
                {ev.impact} IMPACT • {ev.time}
              </span>
            </div>
            <div className="text-xs font-semibold text-on-surface">{ev.event}</div>
            <p className="text-[11px] text-on-surface-variant leading-snug">{ev.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
