import React from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';

function DigitNumber({ value, compact = false }) {
  const digits = /^\d{6}$/.test(String(value || '')) ? String(value) : '------';
  return (
    <div className="flex justify-center gap-1 sm:gap-1.5" aria-label={digits}>
      {digits.split('').map((digit, index) => (
        <span
          key={`${digit}-${index}`}
          className={`flex items-center justify-center rounded-lg border font-mono font-black ${
            compact
              ? 'h-8 min-w-7 border-slate-700 bg-slate-900 text-sm text-slate-100'
              : 'h-11 min-w-9 border-emerald-500/25 bg-emerald-500/10 text-lg text-emerald-300 sm:h-12 sm:min-w-10 sm:text-xl'
          }`}
        >
          {digit}
        </span>
      ))}
    </div>
  );
}

function PrizeRow({ label, number, featured = false }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3 text-center">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <DigitNumber value={number} compact={!featured} />
    </div>
  );
}

function NumberGrid({ title, numbers }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</div>
      {numbers?.length ? (
        <div className="grid gap-2">
          {numbers.map((number) => <DigitNumber key={number} value={number} compact />)}
        </div>
      ) : (
        <div className="text-center text-xs text-slate-600">Belum dipublikasikan sumber</div>
      )}
    </div>
  );
}

export default function LiveDrawSixDigitBoard({
  market,
  board,
  sourceLabel,
  sourceUrl,
  fetchMode,
  status,
  error,
  lastRefresh,
  onRefresh,
  onOpenSource,
  onVerifySource,
  verificationState,
}) {
  const title = market === 'HK' ? 'HONGKONG POOLS MARKET LIVE' : 'SYDNEY MARKET LIVE';
  const match = board?.matches_dataset;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl" data-live-board={market}>
      <div className="border-b border-slate-800 bg-gradient-to-r from-emerald-500/10 to-slate-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-black tracking-wide text-slate-100">{title}</h4>
            <p className="mt-1 text-[11px] text-slate-400">{sourceLabel}</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${
            status === 'ready'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : status === 'checking'
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}>
            {status === 'ready' ? 'PAPAN NATIVE' : status === 'checking' ? 'MEMERIKSA' : 'CACHE / CADANGAN'}
          </span>
        </div>
      </div>

      {!board && status === 'checking' && (
        <div className="animate-pulse space-y-3 p-5">
          <div className="h-24 rounded-xl bg-slate-800/70" />
          <div className="grid grid-cols-2 gap-3"><div className="h-20 rounded-xl bg-slate-800/70" /><div className="h-20 rounded-xl bg-slate-800/70" /></div>
        </div>
      )}

      {!board && status !== 'checking' && (
        <div className="p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-300" />
          <h5 className="mt-3 font-bold text-slate-200">Live board belum dapat diambil</h5>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-400">
            Sumber mungkin sedang offline atau melindungi halaman dengan challenge. Aplikasi tidak mencoba bypass; gunakan snapshot berikutnya atau buka sumber.
          </p>
          {market === 'HK' && onVerifySource && <button type="button" onClick={onVerifySource} className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-black text-amber-200">VERIFIKASI SUMBER HK</button>}
          {verificationState && <p className="mt-2 text-[10px] text-slate-500">Status verifikasi: {verificationState.replaceAll('_', ' ')}</p>}
        </div>
      )}

      {board && (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-500">Tanggal undian</span>
            <span className="font-semibold text-slate-200">{board.draw_date || '-'}</span>
          </div>
          <div className="grid gap-1 rounded-lg border border-slate-800 bg-slate-950/35 p-2 text-[9px] text-slate-500 sm:grid-cols-3"><span>SOURCE_DRAW_DATE: {board.draw_date || '-'}</span><span>DATASET_LATEST_DATE: {board.dataset_latest_date || '-'}</span><span>FETCHED_AT: {board.retrieved_at || lastRefresh || '-'}</span></div>
          {board.dataset_latest_date && board.draw_date < board.dataset_latest_date && <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-center text-[10px] font-black text-amber-300">DATA LAMA / MENUNGGU UPDATE</div>}
          <PrizeRow label="Hadiah 1" number={board.first} featured />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PrizeRow label="Hadiah 2" number={board.second} />
            <PrizeRow label="Hadiah 3" number={board.third} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberGrid title="Starter" numbers={board.starter} />
            <NumberGrid title="Consolation" numbers={board.consolation} />
          </div>

          <div className={`rounded-xl border p-4 ${
            match === true
              ? 'border-emerald-500/25 bg-emerald-500/5'
              : match === false
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-slate-800 bg-slate-950/40'
          }`}>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><div className="text-[9px] uppercase text-slate-500">Derived last-four</div><div className="mt-1 font-mono text-lg font-black text-emerald-300">{board.derived_4d || '----'}</div></div>
              <div><div className="text-[9px] uppercase text-slate-500">Prediction dataset 4D</div><div className="mt-1 font-mono text-lg font-black text-slate-200">{board.dataset_4d || '----'}</div></div>
            </div>
            <div className={`mt-3 flex items-center gap-2 text-[10px] font-bold ${
              match === true ? 'text-emerald-300' : match === false ? 'text-amber-300' : 'text-slate-500'
            }`}>
              {match === true ? <CheckCircle2 className="h-4 w-4" /> : match === false ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {match === true ? 'COCOK DENGAN DATASET PREDIKSI' : match === false ? 'SUMBER / DATASET TIDAK COCOK' : 'MENUNGGU TANGGAL DRAW YANG DAPAT DIBANDINGKAN'}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 p-3">
        <span className="text-[10px] text-slate-500">Dicek: {lastRefresh || '-'}</span>
        <div className="flex gap-2">
          {market === 'HK' && onVerifySource && verificationState === 'CHALLENGE_REQUIRED' && <button type="button" onClick={onVerifySource} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[10px] font-black text-amber-200">Verifikasi Sumber HK</button>}
          <button type="button" onClick={onRefresh} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-[10px] font-semibold text-slate-200">
            <RefreshCw className="h-3.5 w-3.5" /> Perbarui data
          </button>
          <button type="button" onClick={onOpenSource} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-300">
            <ExternalLink className="h-3.5 w-3.5" /> Buka sumber
          </button>
        </div>
      </div>

      <details className="border-t border-slate-800 bg-slate-950/40 px-4 py-3 text-[10px] text-slate-400">
        <summary className="cursor-pointer font-bold uppercase tracking-wider text-slate-300">Live board diagnostics</summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 break-all">
          <dt>Source URL</dt><dd className="text-slate-200">{sourceUrl}</dd>
          <dt>Fetch mode</dt><dd className="text-slate-200">{fetchMode || 'cached_snapshot'}</dd>
          <dt>Board status</dt><dd className="text-slate-200">{status}</dd>
          <dt>Last refresh</dt><dd className="text-slate-200">{lastRefresh || '-'}</dd>
          <dt>Error</dt><dd className="text-slate-200">{error || '-'}</dd>
        </dl>
      </details>
    </section>
  );
}
