import React from 'react';
import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

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

function SpinnerDigits({ count = 6 }) {
  return (
    <div className="flex justify-center gap-2" aria-label="Menunggu digit hasil LiveDraw" data-spinner-digits={count}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="h-9 w-9 rounded-full border-4 border-slate-700 border-t-emerald-400 bg-slate-950/50 animate-spin" aria-hidden="true" />
      ))}
    </div>
  );
}

function WaitingPrizeRows() {
  return (
    <div className="space-y-3 p-4 sm:p-5" data-hk-live-waiting="true">
      <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3 text-center text-xs font-bold text-sky-300">Menunggu hasil LiveDraw…</div>
      {['Hadiah 1', 'Hadiah 2', 'Hadiah 3'].map((label) => (
        <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/45 p-4 text-center">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
          <SpinnerDigits />
        </div>
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
  liveState,
  fastResult,
  predictionReady,
}) {
  const title = market === 'HK' ? 'HONGKONG POOLS MARKET LIVE' : 'SYDNEY MARKET LIVE';

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

      {market === 'HK' && fastResult && (
        <div className="border-b border-slate-800 p-4 sm:p-5" data-hk-fast-result="true">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-center">
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Hasil HK terbaru</div>
            <div className="mt-2 font-mono text-4xl font-black text-emerald-400">{fastResult.nomor}</div>
            <div className="mt-1 text-[10px] text-slate-500">{fastResult.result_date} · {fastResult.periode || '-'}</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2"><span className="text-slate-500">STATUS HASIL</span><div className="mt-1 font-bold text-emerald-300">DATA LIVE TERSEDIA</div></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2"><span className="text-slate-500">STATUS PREDIKSI</span><div className={`mt-1 font-bold ${predictionReady ? 'text-emerald-300' : 'text-amber-300'}`}>{predictionReady ? 'TARGET BARU SIAP' : 'MENGHITUNG…'}</div></div>
          </div>
          {!board && <div className="mt-3 text-center text-xs text-amber-300">Menunggu tabel 6D lengkap</div>}
        </div>
      )}

      {!board && liveState === 'LIVE_WAITING' && <WaitingPrizeRows />}

      {!board && status === 'checking' && liveState !== 'LIVE_WAITING' && <div className="animate-pulse space-y-3 p-5"><div className="h-24 rounded-xl bg-slate-800/70" /><div className="grid grid-cols-2 gap-3"><div className="h-20 rounded-xl bg-slate-800/70" /><div className="h-20 rounded-xl bg-slate-800/70" /></div></div>}

      {!board && status !== 'checking' && liveState !== 'LIVE_WAITING' && (
        <div className="p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-300" />
          <h5 className="mt-3 font-bold text-slate-200">Live board belum dapat diambil</h5>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-400">
            Sumber mungkin sedang offline atau melindungi halaman dengan pemeriksaan keamanan. Aplikasi tidak mencoba bypass; gunakan snapshot berikutnya atau buka sumber secara manual.
          </p>
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

          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-center">
            <div className="text-[9px] uppercase text-slate-500">Derived last-four</div>
            <div className="mt-1 font-mono text-2xl font-black text-emerald-300">{board.derived_4d || '----'}</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 p-3">
        <span className="text-[10px] text-slate-500">Dicek: {lastRefresh || '-'}</span>
        <div className="flex gap-2">
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
          <dt>Source draw date</dt><dd className="text-slate-200">{board?.draw_date || '-'}</dd>
          <dt>Live derived 4D</dt><dd className="text-slate-200">{board?.derived_4d || '-'}</dd>
          <dt>Dataset latest date</dt><dd className="text-slate-200">{board?.dataset_latest_date || '-'}</dd>
          <dt>Dataset 4D</dt><dd className="text-slate-200">{board?.dataset_4d || '-'}</dd>
          <dt>Sync state</dt><dd className="text-slate-200">{board?.verification || 'not_compared'}</dd>
          <dt>Error</dt><dd className="text-slate-200">{error || '-'}</dd>
        </dl>
      </details>
    </section>
  );
}
