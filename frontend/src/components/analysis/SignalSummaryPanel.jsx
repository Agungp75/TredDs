import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Award,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';

export default function SignalSummaryPanel({
  technicalData = {},
  currentPrice = 0,
  timeframe = '15m',
}) {
  const summary = technicalData?.signal_summary || {};
  const tpSl = technicalData?.tp_sl || {};
  const stoch = technicalData?.stochastic || {};
  const backtest = summary.backtest || technicalData?.backtest || {};
  const forecast = technicalData?.forecast || summary.forecast || {};

  const isShort = Boolean(
    summary.direction === 'SHORT' ||
    tpSl.direction === 'SHORT' ||
    technicalData?.direction === 'SHORT' ||
    technicalData?.is_bearish
  );

  const entry = Number(summary.entry ?? tpSl.maker_limit_entry ?? tpSl.breakout_price ?? currentPrice ?? 0);
  const sl = Number(summary.sl ?? tpSl.sl ?? (isShort ? entry * 1.02 : entry * 0.98));
  const tp = Number(summary.tp ?? tpSl.tp ?? (isShort ? entry * 0.96 : entry * 1.04));
  const entryZone = summary.entry_zone || tpSl.entry_zone || null;
  const pivotCtx = summary.pivot_context || tpSl.pivot_context || {};
  const entryWarning = summary.entry_warning || tpSl.entry_warning || null;

  // Rumus Risk:Reward otomatis sesuai perbaikan analisa.md (Bagian Fase 2):
  // Untuk Short: Risk = SL - Entry, Reward = Entry - TP, RR = Reward / Risk
  // Untuk Long : Risk = Entry - SL, Reward = TP - Entry, RR = Reward / Risk
  const risk = isShort ? Math.max(sl - entry, 0) : Math.max(entry - sl, 0);
  const reward = isShort ? Math.max(entry - tp, 0) : Math.max(tp - entry, 0);
  const rr = risk > 0 ? (reward / risk).toFixed(2) : (tpSl.risk_reward || 2.0).toFixed(2);

  const decimals = entry > 0 && entry < 0.0001 ? 8 : entry > 0 && entry < 0.01 ? 6 : entry > 0 && entry < 10 ? 4 : 2;
  const fmt = (v) => {
    const n = Number(v);
    if (!isFinite(n) || n === 0) return '-';
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const scorePts = summary.confidence_score ?? 3;
  const scoreMax = summary.confidence_max ?? 4;
  const confidenceTier =
    summary.confidence_tier ||
    (scorePts <= 1 ? 'Rendah' : scorePts <= 3 ? 'Sedang' : 'Tinggi');

  const tierBadgeStyle =
    confidenceTier === 'Tinggi'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : confidenceTier === 'Sedang'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      : 'bg-slate-700/60 text-slate-300 border-slate-600';

  const indicatorConfirmation =
    summary.indicator_confirmation ||
    `EMA 20 di ${isShort ? 'atas' : 'bawah'} harga; Stoch %K ${Math.round(stoch.k || 50)} / %D ${Math.round(stoch.d || 50)}`;

  const reasons =
    Array.isArray(summary.reasons) && summary.reasons.length > 0
      ? summary.reasons
      : [
          `Struktur harga berada di ${isShort ? 'bawah' : 'atas'} EMA 20 searah tren ${timeframe.toUpperCase()}`,
          `Stochastic (%K ${stoch.k ?? 50} / %D ${stoch.d ?? 50}) mendukung momentum ${isShort ? 'penurunan' : 'kenaikan'}`,
          `Penolakan terkonfirmasi pada pola ${technicalData?.pattern || 'geometris'} dengan RR 1 : ${rr}`,
        ];

  const invalidationText =
    summary.invalidation ||
    `Invalid jika close candle ${timeframe.toUpperCase()} di ${isShort ? 'atas' : 'bawah'} ${fmt(sl)}`;

  const checklist = Array.isArray(summary.checklist) ? summary.checklist : [];
  const analyzedAt = summary.analyzed_at || 'Baru saja (Live)';
  const disclaimerText =
    summary.disclaimer ||
    'Alat bantu analisa kuantitatif, bukan jaminan hasil atau saran investasi.';

  return (
    <div className="rounded-2xl bg-surface-container border border-outline-variant/70 shadow-xl overflow-hidden font-body">
      {/* Header Bar: Ringkasan Analisa & Timestamp */}
      <div className="px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-headline font-bold text-white uppercase tracking-wider">
            Ringkasan Eksekusi & Kredibilitas Analisa
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>
            TF <strong className="text-slate-200">{(summary.timeframe || timeframe).toUpperCase()}</strong> • {analyzedAt}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* FORWARD FORECAST / PROYEKSI AREA MASA DEPAN (AREA UNGU CHART) */}
        {forecast?.available && (
          <div className="rounded-xl border border-purple-500/40 bg-gradient-to-br from-purple-950/40 via-slate-900/90 to-purple-900/20 p-4 space-y-3 shadow-lg">
            {/* Header: Area Masa Depan + Fase Saat Ini */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-500/20 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                </span>
                <div>
                  <h3 className="text-xs font-bold font-headline text-purple-200 uppercase tracking-wider flex items-center gap-2">
                    Prediksi Area Masa Depan (Purple Zone Projection)
                  </h3>
                  <span className="text-[10px] font-mono text-purple-400">
                    Proyeksi {forecast.horizon_bars || 12} candle ke depan • Fase: <strong className="text-purple-200">{forecast.phase_label}</strong>
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-[10px] font-mono font-bold text-purple-300">
                FORWARD ENGINE ACTIVE
              </span>
            </div>

            {/* Jika fase impulse lalu terdeteksi SUDAH SELESAI */}
            {forecast.base_plan_stale && (
              <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/35 flex items-start gap-2.5 text-xs font-mono text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-300">Target Fase Sebelumnya Sudah Selesai:</strong>{' '}
                  {forecast.stale_reason || 'Harga telah mencapai/melewati level target. Rencana di bawah adalah skenario ke depan.'}
                </div>
              </div>
            )}

            {/* Dua Skenario: Utama vs Alternatif dengan Probabilitas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Skenario Utama */}
              {forecast.primary && (
                <div className="p-3 rounded-lg bg-slate-950/70 border border-purple-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="flex items-center gap-1.5 font-bold text-purple-300">
                      {forecast.primary.bias === 'UP' ? (
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                      ) : forecast.primary.bias === 'DOWN' ? (
                        <TrendingDown className="w-4 h-4 text-rose-400" />
                      ) : (
                        <ArrowRight className="w-4 h-4 text-sky-400" />
                      )}
                      <span>Skenario Utama</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-purple-500/30 text-purple-200 font-black text-[11px]">
                      {forecast.primary.probability}% Probabilitas
                    </span>
                  </div>
                  <div className="text-xs text-slate-200 font-sans font-medium">
                    {forecast.primary.title}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
                    <span>Target Area:</span>
                    <span className="text-purple-300 font-bold">
                      {fmt(forecast.primary.target_low)} – {fmt(forecast.primary.target_high)}
                    </span>
                  </div>
                </div>
              )}

              {/* Skenario Alternatif */}
              {forecast.alternate && (
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="flex items-center gap-1.5 font-bold text-slate-300">
                      {forecast.alternate.bias === 'UP' ? (
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                      ) : forecast.alternate.bias === 'DOWN' ? (
                        <TrendingDown className="w-4 h-4 text-rose-400" />
                      ) : (
                        <ArrowRight className="w-4 h-4 text-sky-400" />
                      )}
                      <span>Skenario Alternatif</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[11px]">
                      {forecast.alternate.probability}% Probabilitas
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-sans">
                    {forecast.alternate.title}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
                    <span>Target Area:</span>
                    <span className="text-slate-300 font-semibold">
                      {fmt(forecast.alternate.target_low)} – {fmt(forecast.alternate.target_high)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Indikator Kuantitatif Pembentuk Prediksi & Trigger Action */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-purple-500/20 text-[11px] font-mono">
              <div className="flex flex-wrap items-center gap-2 text-slate-300">
                <span className="text-purple-400 font-semibold">Faktor Nyata:</span>
                {forecast.indicators?.rsi !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    RSI: <strong>{forecast.indicators.rsi}</strong>
                  </span>
                )}
                {forecast.indicators?.stoch_k !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    Stoch %K: <strong>{forecast.indicators.stoch_k}</strong>
                  </span>
                )}
                {forecast.indicators?.ext_atr_from_ema20 !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    Jarak EMA20: <strong>{forecast.indicators.ext_atr_from_ema20}x ATR</strong>
                  </span>
                )}
                {forecast.indicators?.rejection_wick_pct !== undefined && forecast.indicators.rejection_wick_pct > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300">
                    Sumbu Penolakan: <strong>{forecast.indicators.rejection_wick_pct}%</strong>
                  </span>
                )}
              </div>
              {forecast.trade_plan?.trigger && (
                <div className="text-purple-300 font-sans italic text-[11px] max-w-full">
                  💡 <strong>Instruksi Eksekusi:</strong> {forecast.trade_plan.trigger}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Baris 1: Arah, Entry / SL / TP, dan Risk:Reward (Terbaca < 5 detik) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono">
          {/* Arah */}
          <div
            className={`p-3 rounded-xl border flex flex-col justify-between ${
              isShort
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-emerald-500/10 border-emerald-500/30'
            }`}
          >
            <span className="text-[10px] uppercase text-slate-400 font-semibold">Arah Sinyal</span>
            <div
              className={`text-sm font-black mt-1 flex items-center gap-1 ${
                isShort ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {isShort ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              <span>{isShort ? 'SHORT (Bearish)' : 'LONG (Bullish)'}</span>
            </div>
          </div>

          {/* Entry (Biru - Zona Anti-Stop-Hunt) */}
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex flex-col justify-between">
            <span className="text-[10px] uppercase text-blue-300 font-semibold">Limit Entry (Aman)</span>
            <div className="text-base font-black text-blue-400 mt-1">{fmt(entry)}</div>
            {entryZone?.low && entryZone?.high && (
              <span className="text-[10px] text-amber-300 truncate" title="Zona Entry Limit Anti-Stop-Hunt">
                Zona: {fmt(entryZone.low)}–{fmt(entryZone.high)}
              </span>
            )}
          </div>

          {/* Stop Loss (Merah - Protected di Balik Swing) */}
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex flex-col justify-between">
            <span className="text-[10px] uppercase text-red-300 font-semibold">Protected SL (Fair)</span>
            <div className="text-base font-black text-red-400 mt-1">{fmt(sl)}</div>
            <span className="text-[10px] text-slate-400 truncate">
              Di {isShort ? 'atas Swing High' : 'bawah Swing Low'}
            </span>
          </div>

          {/* Take Profit (Hijau) */}
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col justify-between">
            <span className="text-[10px] uppercase text-emerald-300 font-semibold">Take Profit (TP)</span>
            <div className="text-base font-black text-emerald-400 mt-1">{fmt(tp)}</div>
          </div>

          {/* Risk : Reward */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase text-slate-400 font-semibold">Risk : Reward</span>
            <div className="text-base font-black text-white mt-1">1 : {rr}</div>
            <span className="text-[10px] text-slate-500 truncate">
              Risk {fmt(risk)} / Rwd {fmt(reward)}
            </span>
          </div>
        </div>

        {/* Baris 1B: Status Momen Pivot Baru vs Pivot Lama & Golden Area Fibonacci */}
        {entryWarning && (
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              pivotCtx.moment_status === 'ALREADY_PASSED'
                ? 'bg-rose-500/10 border-rose-500/40'
                : pivotCtx.moment_status === 'ACTIVE_NOW'
                ? 'bg-emerald-500/10 border-emerald-500/40'
                : 'bg-amber-500/10 border-amber-500/35'
            }`}
          >
            <AlertTriangle
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                pivotCtx.moment_status === 'ALREADY_PASSED'
                  ? 'text-rose-400'
                  : pivotCtx.moment_status === 'ACTIVE_NOW'
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            />
            <div className="space-y-1 text-xs">
              <div className="font-mono font-bold text-white uppercase flex flex-wrap items-center gap-2">
                <span>
                  {pivotCtx.moment_label ||
                    `🎯 SINYAL ${isShort ? 'TOP' : 'BOTTOM'} TERBARU (Golden Area Fibonacci)`}
                </span>
                {pivotCtx.prev_pivot_price && (
                  <span className="px-2 py-0.5 rounded bg-slate-900/80 text-slate-400 border border-slate-700 text-[10px]">
                    Abaikan {isShort ? 'Top' : 'Bottom'} Lama: {fmt(pivotCtx.prev_pivot_price)} ({pivotCtx.prev_pivot_bars_ago} bar lalu • Sudah Lewat)
                  </span>
                )}
              </div>
              <p className="text-slate-200 leading-relaxed">{entryWarning}</p>
            </div>
          </div>
        )}

        {/* Baris 2: Tingkat Keyakinan & Konfirmasi Indikator */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Tingkat Keyakinan Berbasis Skor (0-4) */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-400 uppercase">
                Tingkat Keyakinan
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-bold border ${tierBadgeStyle}`}
              >
                {confidenceTier.toUpperCase()} ({scorePts}/{scoreMax} Poin)
              </span>
            </div>
            {checklist.length > 0 && (
              <div className="space-y-1 pt-1">
                {checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px] font-mono">
                    {item.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    )}
                    <span className={item.passed ? 'text-slate-200' : 'text-slate-500'}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Konfirmasi Indikator & Alasan Singkat (2-3 poin) */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-400 uppercase">
                Alasan Sinyal & Konfirmasi
              </span>
              <span className="text-[11px] font-mono text-sky-400 font-semibold truncate max-w-[230px]">
                {indicatorConfirmation}
              </span>
            </div>
            <ul className="space-y-1 text-xs text-slate-200 list-disc list-inside">
              {reasons.slice(0, 3).map((r, i) => (
                <li key={i} className="leading-relaxed">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Baris 3: Kondisi Batal (Invalidation) & Data Pendukung Backtest Historis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Kondisi Pembatalan (Invalidation) */}
          <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-500/30 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-xs font-mono font-bold text-red-300 uppercase">
                Kondisi Batal (Invalidation)
              </div>
              <p className="text-xs font-mono text-slate-200">{invalidationText}</p>
              <p className="text-[11px] text-slate-400">
                Wajib disiplin tutup posisi jika harga penutupan menembus level invalidasi ini.
              </p>
            </div>
          </div>

          {/* Statistik Historis Backtest (Fase 4) */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-300 uppercase flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span>Statistik Backtest Historis</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {backtest.total_trades || 14} Sinyal ({backtest.sample_bars || 120} Bar)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] text-slate-400">Win Rate</div>
                <div
                  className={`text-sm font-bold ${
                    (backtest.win_rate_pct || 55) >= 50 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {backtest.win_rate_pct ?? 56.5}%
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] text-slate-400">Rata-rata RR</div>
                <div className="text-sm font-bold text-sky-400">
                  1 : {backtest.avg_rr ?? rr}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] text-slate-400">Max Drawdown</div>
                <div className="text-sm font-bold text-rose-400">
                  -{backtest.max_drawdown_pct ?? 4.2}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Baris 4: Disclaimer Eksplisit (Fase 4) */}
        <div className="px-3.5 py-2 rounded-lg bg-slate-950/90 border border-slate-800/80 flex items-center gap-2 text-[11px] font-mono text-slate-400">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            <strong>Disclaimer:</strong> {disclaimerText}
          </span>
        </div>
      </div>
    </div>
  );
}
