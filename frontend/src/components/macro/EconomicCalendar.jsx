import React from 'react';
import { Calendar, AlertCircle, Clock, Globe } from 'lucide-react';

export default function EconomicCalendar({ events = [] }) {
  return (
    <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-blue-400" />
          <div>
            <h4 className="text-sm font-bold text-slate-100">Macro Economic Calendar</h4>
            <p className="text-[11px] text-slate-400">High Impact News & Central Bank Releases</p>
          </div>
        </div>
        <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
          Live Sync
        </span>
      </div>

      <div className="space-y-2.5">
        {events.map((evt) => {
          const isHigh = evt.impact === 'HIGH';
          return (
            <div
              key={evt.id}
              className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-800/60 transition-colors"
            >
              <div className="flex items-start space-x-3">
                <span className="w-12 text-center py-1 rounded bg-slate-800 border border-slate-700 font-mono font-bold text-[11px] text-slate-300">
                  {evt.currency}
                </span>
                <div>
                  <div className="font-semibold text-slate-100">{evt.event}</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{evt.description}</p>
                </div>
              </div>

              <div className="flex items-center space-x-4 sm:flex-shrink-0 self-end sm:self-auto font-mono text-[11px]">
                <div className="text-right">
                  <span className="text-slate-400 text-[10px] block">Forecast</span>
                  <span className="font-bold text-slate-200">{evt.forecast}</span>
                </div>

                <div className="text-right">
                  <span className="text-slate-400 text-[10px] block">Previous</span>
                  <span className="text-slate-400">{evt.previous}</span>
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    isHigh
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {evt.impact}
                </span>

                <div className="flex items-center space-x-1 text-slate-400">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>{evt.time}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
