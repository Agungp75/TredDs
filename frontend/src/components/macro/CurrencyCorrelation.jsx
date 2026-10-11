import React from 'react';
import { Grid, HelpCircle } from 'lucide-react';

export default function CurrencyCorrelation({ correlationData = {} }) {
  const { currencies = [], matrix = {} } = correlationData;

  const getCellColor = (val) => {
    if (val === 1.0) return 'bg-slate-800 text-slate-400';
    if (val > 0.6) return 'bg-emerald-600/30 text-emerald-300 font-bold';
    if (val > 0.2) return 'bg-emerald-500/15 text-emerald-400';
    if (val < -0.6) return 'bg-rose-600/30 text-rose-300 font-bold';
    if (val < -0.2) return 'bg-rose-500/15 text-rose-400';
    return 'bg-slate-800/30 text-slate-400';
  };

  return (
    <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Grid className="w-5 h-5 text-indigo-400" />
          <div>
            <h4 className="text-sm font-bold text-slate-100">Currency Correlation Matrix</h4>
            <p className="text-[11px] text-slate-400">Inter-market Forex Correlation Co-efficient (-1.0 to +1.0)</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-[11px] text-slate-400">
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500/40"></span>
            <span>Positive (+1)</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded bg-rose-500/40"></span>
            <span>Inverse (-1)</span>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-center border-collapse text-xs font-mono">
          <thead>
            <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400">
              <th className="py-2.5 px-3 text-left">CCY</th>
              {currencies.map((c) => (
                <th key={c} className="py-2.5 px-3 font-bold text-slate-200">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {currencies.map((rowCcy) => (
              <tr key={rowCcy} className="hover:bg-slate-800/20">
                <td className="py-2.5 px-3 text-left font-bold text-slate-300 bg-slate-950/40">
                  {rowCcy}
                </td>
                {currencies.map((colCcy) => {
                  const val = matrix[rowCcy] ? matrix[rowCcy][colCcy] : 0;
                  return (
                    <td
                      key={colCcy}
                      className={`py-2.5 px-3 transition-colors ${getCellColor(val)}`}
                    >
                      {val !== undefined ? (val > 0 && val !== 1 ? `+${val.toFixed(2)}` : val.toFixed(2)) : '0.00'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
