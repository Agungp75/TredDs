import React from 'react';

export default function DisclaimerFooter() {
  return (
    <footer className="w-full bg-surface-container-lowest border-t border-outline-variant/60 mt-auto select-none">
      <div className="max-w-[1720px] mx-auto px-6 xl:px-10 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Col 1 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-headline font-bold tracking-tight text-on-surface uppercase">
                ATRED Quantitative Terminal
              </span>
              <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-surface-container-highest text-primary font-medium border border-outline-variant">
                PRO v2.4
              </span>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Ultra low-latency institutional market micro-structure scanner and stochastic algorithmic modeling engine untuk Saham, Kripto, dan Forex.
            </p>
          </div>

          {/* Col 2 */}
          <div>
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-on-surface mb-3">
              Engine & Runtimes
            </div>
            <div className="space-y-1.5 text-xs font-mono text-on-surface-variant">
              <div className="flex items-center justify-between">
                <span>Kernel Status:</span>
                <span className="text-tertiary">ONLINE (FastAPI / Cython)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Model Stack:</span>
                <span className="text-on-surface">NumPy / SciPy / PyTorch</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Pattern Matcher:</span>
                <span className="text-primary">SciPy Peaks & L2 Distance</span>
              </div>
            </div>
          </div>

          {/* Col 3 */}
          <div>
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-on-surface mb-3">
              Telemetry & Feeds
            </div>
            <div className="space-y-1.5 text-xs font-mono text-on-surface-variant">
              <div className="flex items-center justify-between">
                <span>Ingress Latency:</span>
                <span className="text-tertiary">4.2ms (Equinix NY4)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>WebSocket Stream:</span>
                <span className="text-tertiary flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
                  Active Sync
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Tick Buffer:</span>
                <span className="text-on-surface">2.4M msgs/sec</span>
              </div>
            </div>
          </div>

          {/* Col 4 */}
          <div>
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-on-surface mb-3">
              Regulatory & Compliance
            </div>
            <p className="text-[11px] text-on-surface-variant leading-normal">
              Seluruh sinyal kuantitatif, analisis fraktal, dan sintesis AI bersifat edukatif serta analitik probabilitas. Keputusan investasi dan eksekusi risiko sepenuhnya di tangan pengguna.
            </p>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="pt-6 border-t border-outline-variant/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-secondary">
          <div className="flex items-center gap-4">
            <span>© 2026 ATRED Quantitative Labs. All rights reserved.</span>
            <span className="hidden sm:inline">SEC / FINRA Algorithmic Disclosure Form BD-8</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-on-surface-variant">API Spec v2.4</span>
            <span className="text-on-surface-variant">Risk Framework</span>
            <span className="text-tertiary">Status: All Systems Normal</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
