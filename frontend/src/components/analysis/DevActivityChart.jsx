import React from 'react';
import { GitCommit, GitPullRequest, Users, Cpu } from 'lucide-react';

export default function DevActivityChart({ devData = null, devMetrics = null, onChainData = null, onChain = null }) {
  const resolvedDev = (devData && Object.keys(devData).length > 0) ? devData : (devMetrics || {});
  const resolvedOnChain = (onChainData && Object.keys(onChainData).length > 0) ? onChainData : onChain;
  const {
    repo = 'ecosystem/core',
    dev_score = 70,
    commits_30d = 85,
    active_contributors = 24,
    merged_prs = 18,
    monthly_trend = [],
  } = resolvedDev;

  const maxCommits = Math.max(...monthly_trend.map((m) => m.commits), 100);

  return (
    <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Cpu className="w-5 h-5 text-indigo-400" />
          <div>
            <h4 className="text-sm font-bold text-slate-100">Layer 2: Developer & On-Chain Health</h4>
            <p className="text-[11px] text-slate-400 font-mono">{repo}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-lg">
          <span className="text-xs text-indigo-300 font-medium">Dev Score:</span>
          <span className="text-lg font-black font-mono text-indigo-400">{dev_score}/100</span>
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 flex items-center space-x-3">
          <div className="p-2 rounded-md bg-blue-500/20 text-blue-400">
            <GitCommit className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">30d Commits</div>
            <div className="text-base font-bold font-mono text-slate-100">{commits_30d}</div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 flex items-center space-x-3">
          <div className="p-2 rounded-md bg-emerald-500/20 text-emerald-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Contributors</div>
            <div className="text-base font-bold font-mono text-slate-100">{active_contributors}</div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 flex items-center space-x-3">
          <div className="p-2 rounded-md bg-purple-500/20 text-purple-400">
            <GitPullRequest className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Merged PRs</div>
            <div className="text-base font-bold font-mono text-slate-100">{merged_prs}</div>
          </div>
        </div>
      </div>

      {/* Monthly Commit Trend Bar Chart */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Commit Activity Trend (Last 6 Months)
        </div>
        <div className="h-28 flex items-end justify-between gap-2 pt-4 px-2 bg-slate-950/40 rounded-lg border border-slate-800/50">
          {monthly_trend.map((m, idx) => {
            const heightPct = Math.round((m.commits / maxCommits) * 100);
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="text-[10px] font-mono text-slate-400 group-hover:text-indigo-300 transition-colors">
                  {m.commits}
                </div>
                <div className="w-full bg-slate-800/80 rounded-t h-20 flex items-end overflow-hidden">
                  <div
                    className="w-full bg-gradient-to-t from-indigo-600 to-cyan-400 rounded-t group-hover:brightness-110 transition-all duration-300"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-medium">{m.month}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* On-Chain Metrics */}
      {resolvedOnChain && Object.keys(resolvedOnChain).length > 0 && (
        <div className="pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-800/30">
            <span className="text-slate-400 text-[11px]">Whale Concentration</span>
            <div className="font-bold text-slate-200 mt-0.5">{resolvedOnChain.whale_concentration || '24.5%'}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-800/30">
            <span className="text-slate-400 text-[11px]">Liquidity Lock</span>
            <div className="font-bold text-emerald-400 mt-0.5">{resolvedOnChain.liquidity_locked || resolvedOnChain.liquidity_health || 'Verified Lock'}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-800/30 col-span-2 sm:col-span-1">
            <span className="text-slate-400 text-[11px]">Network Supply / Base</span>
            <div className="font-bold text-slate-200 mt-0.5">{resolvedOnChain.circulating_supply || resolvedOnChain.top_10_holders || 'Distributed'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
