import React from 'react';
import { ArrowLeft, History } from 'lucide-react';

const MARKET_OPTIONS = [
  ['HK', 'Pasaran HK Pool'],
  ['SDY', 'Pasaran SDY Pool'],
  ['SGP', 'Pasaran SGP Pool'],
];

function historyNumber(value) {
  return typeof value === 'object' && value !== null ? value.number : value;
}

function formatTime(value) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function permutationStatus(entry) {
  if (entry?.exact) return 'EXACT';
  if (entry?.permutation) return 'PERMUTATION';
  return 'MISS';
}

function reverseStatus(entry) {
  if (entry?.exact) return 'EXACT';
  if (entry?.reverse) return 'REVERSE';
  return 'MISS';
}

export default function PredictionHistoryPage({ marketCode, setMarketCode, history, onBack }) {
  const records = history?.records || [];

  return (
    <div className="space-y-5" data-page="prediction-history">
      <section className="overflow-hidden rounded-2xl border border-violet-500/25 bg-slate-900/95 shadow-xl">
        <div className="border-b border-slate-800 bg-gradient-to-r from-violet-500/10 to-emerald-500/5 p-5 sm:p-6">
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-emerald-500/30 hover:text-emerald-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </button>

          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-3 text-violet-300">
              <History className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-100">Histori Prediksi</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
                Arsip prediction asli yang dibuat sebelum hasil diketahui. Kandidat lama tidak dihitung ulang di aplikasi.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pasaran</label>
          <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-1.5 sm:max-w-md">
            {MARKET_OPTIONS.map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setMarketCode(code)}
                aria-label={label}
                className={`rounded-lg px-3 py-2 text-xs font-black transition ${
                  marketCode === code
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {records.map((record) => {
          const four = record.four_d || {};
          const three = record.three_d || {};
          const two = record.two_d || {};
          const actual = record.actual_result;
          const audit = record.outcome_audit;
          const summary = record.hit_miss_summary;
          const anyDirectHit = summary && (
            Object.values(summary['4d'] || {}).some(Boolean) ||
            summary['3d']?.front_exact || summary['3d']?.back_exact ||
            Object.values(summary['2d'] || {}).some((item) => item?.exact)
          );

          return (
            <details
              key={`${record.target_date}-${record.dataset_fingerprint || record.generated_at}`}
              className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg sm:p-5"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-100">
                      {record.target_date || '-'} · {record.target_period || '-'}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      basis {record.basis_latest_date || '-'} · {record.basis_latest_result || '----'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-bold text-emerald-400">
                      {actual?.number || 'MENUNGGU'}
                    </div>
                    <div className={`text-[9px] font-semibold ${
                      !actual ? 'text-amber-300' : anyDirectHit ? 'text-emerald-300' : 'text-slate-500'
                    }`}>
                      {!actual ? 'RESULT BELUM ADA' : anyDirectHit ? 'DIRECT HIT' : 'TIDAK ADA EXACT HIT'}
                    </div>
                  </div>
                </div>
              </summary>

              <div className="mt-4 space-y-4 border-t border-slate-800 pt-4 text-xs">
                <div className="grid grid-cols-1 gap-2 text-slate-400 sm:grid-cols-2">
                  <div>Dibuat: <span className="text-slate-200">{formatTime(record.generated_at)}</span></div>
                  <div>Engine: <span className="text-slate-200">{record.engine_version || '-'}</span></div>
                  <div>BBFS6: <span className="font-mono text-emerald-300">{record.bbfs6 || '-'}</span></div>
                  <div>BBFS5: <span className="font-mono text-emerald-300">{record.bbfs5 || '-'}</span></div>
                </div>

                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] uppercase text-slate-500">Quick View Arsip</div>
                  <div>4D <span className="font-mono text-slate-100">{[four.main, four.alternative, four.reserve, four.single_pair].map(historyNumber).filter(Boolean).join(' · ') || '-'}</span></div>
                  <div>3D depan <span className="font-mono text-slate-100">{(three.front || []).map(historyNumber).join(' · ') || '-'}</span></div>
                  <div>3D belakang <span className="font-mono text-slate-100">{(three.back || []).map(historyNumber).join(' · ') || '-'}</span></div>
                  <div>2D depan <span className="font-mono text-slate-100">{(two.front || []).map(historyNumber).join(' · ') || '-'}</span></div>
                  <div>2D tengah <span className="font-mono text-slate-100">{(two.middle || []).map(historyNumber).join(' · ') || '-'}</span></div>
                  <div>2D belakang <span className="font-mono text-slate-100">{(two.back || []).map(historyNumber).join(' · ') || '-'}</span></div>
                  <div>Kembar <span className="font-mono text-slate-100">{two.kembar?.main || '-'} · {two.kembar?.reserve || '-'}</span></div>
                </div>

                {actual && audit && (
                  <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-slate-400 sm:grid-cols-2">
                    <div>4D main: <span className="text-slate-200">{permutationStatus(audit.previous_4d_main)}</span></div>
                    <div>4D alternatif: <span className="text-slate-200">{permutationStatus(audit.previous_4d_alternative)}</span></div>
                    <div>4D cadangan: <span className="text-slate-200">{permutationStatus(audit.previous_4d_reserve)}</span></div>
                    <div>4D single pair: <span className="text-slate-200">{permutationStatus(audit.previous_4d_single_pair)}</span></div>
                    <div>3D depan: <span className="text-slate-200">{permutationStatus(audit['3d_front'])}</span></div>
                    <div>3D belakang: <span className="text-slate-200">{permutationStatus(audit['3d_back'])}</span></div>
                    {['front', 'middle', 'back'].map((slot) => (
                      <div key={slot}>2D {slot}: <span className="text-slate-200">{reverseStatus(audit[`2d_${slot}`])}</span></div>
                    ))}
                    <div>BBFS6: <span className="text-slate-200">{audit.bbfs6?.full_draw_coverage ? 'FULL' : `${audit.bbfs6?.occurrence_coverage?.captured ?? 0}/4`}</span></div>
                  </div>
                )}
              </div>
            </details>
          );
        })}

        {!records.length && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-10 text-center text-sm text-slate-500">
            Indeks histori untuk market ini belum tersedia.
          </div>
        )}
      </section>
    </div>
  );
}
