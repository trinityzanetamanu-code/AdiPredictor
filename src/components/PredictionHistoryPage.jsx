import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, History, Loader2, RotateCcw } from 'lucide-react';
import { loadPredictionArchive, predictionAssetUrl } from '../dataClient';
import { archiveResultState, createArchiveRequestCoordinator, publishedHistoryRecords } from '../predictionArchive';
import { analyzeFourDConsensusTie } from '../predictionConsensus';
import PredictionOutcomeAudit from './PredictionOutcomeAudit';
import VisualPaitoViewer from './VisualPaitoViewer';

const MARKET_OPTIONS = [['HK', 'HK'], ['SDY', 'SDY'], ['SGP', 'SGP']];
const unavailable = 'tidak tersedia pada arsip asli';

function numberOf(value) {
  return typeof value === 'object' && value !== null ? value.number : value;
}

function formatTime(value) {
  if (!value) return unavailable;
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function Field({ label, children }) {
  return <div><span className="text-slate-500">{label}: </span><span className="text-slate-200">{children || unavailable}</span></div>;
}

function CandidateList({ items }) {
  if (!Array.isArray(items) || !items.length) return <span className="text-amber-300">{unavailable}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => {
        const number = numberOf(item);
        return (
          <span key={`${number}-${index}`} className="rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 font-mono text-[10px] text-slate-100">
            <strong className="text-emerald-300">{number}</strong>
            {item?.supported_by?.length ? ` · ${item.supported_by.join('/')}` : ''}
            {item?.raw_support_count != null ? ` · raw ${item.raw_support_count}` : ''}
            {item?.reliability_weighted_score != null ? ` · w ${Number(item.reliability_weighted_score).toFixed(6)}` : ''}
            {item?.star_label ? ` · ${item.star_label}` : ''}
          </span>
        );
      })}
    </div>
  );
}

function CandidateRow({ label, items }) {
  return <div className="grid gap-1 sm:grid-cols-[120px_1fr]"><span className="text-slate-500">{label}</span><CandidateList items={items} /></div>;
}

function QuickView({ archive }) {
  const quick = archive.quick_view || {};
  const bbfs = quick.bbfs || {};
  const four = quick.four_d || {};
  const three = quick.three_d || {};
  const two = quick.two_d || {};
  const p8 = archive.p8_ai_instinct || quick.p8_ai_instinct || null;
  return (
    <details open className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <summary className="cursor-pointer text-xs font-black text-emerald-300">QUICK VIEW — ANGKA KANDIDAT</summary>
      <div className="mt-3 space-y-3 text-[10px]">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="BBFS6 utama / cadangan">{bbfs.main6 ? `${bbfs.main6} / ${bbfs.reserve6 || '-'}` : null}</Field>
          <Field label="BBFS5 utama / cadangan">{bbfs.main5 ? `${bbfs.main5} / ${bbfs.reserve5 || '-'}` : null}</Field>
        </div>
        <CandidateRow label="4D Main" items={four.main ? [four.main] : []} />
        <CandidateRow label="4D Alternatif" items={four.alternative ? [four.alternative] : []} />
        <CandidateRow label="4D Cadangan" items={four.reserve ? [four.reserve] : []} />
        <CandidateRow label="4D Single Pair" items={four.single_pair ? [four.single_pair] : []} />
        <CandidateRow label="3D depan Top 5" items={three.front} />
        <CandidateRow label="3D belakang Top 5" items={three.back} />
        <CandidateRow label="2D depan Top 5" items={two.front} />
        <CandidateRow label="2D tengah Top 5" items={two.middle} />
        <CandidateRow label="2D belakang Top 5" items={two.back} />
        <Field label="Kembar utama / cadangan">{two.kembar ? `${two.kembar.main || '-'} / ${two.kembar.reserve || '-'}` : null}</Field>
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
          <div className="font-bold text-violet-300">P8 — dipisahkan dari konsensus statistik</div>
          {p8 ? (
            <div className="mt-1 space-y-1 font-mono text-slate-300">
              <div>BBFS6 {p8.bbfs6 || '-'} · BBFS5 {p8.bbfs5 || '-'}</div>
              <div>4D {p8.four_d_main || '-'} · {p8.four_d_reserve || '-'}</div>
              <div>3D {p8.three_d_front || '-'} · {p8.three_d_back || '-'}</div>
              <div>2D {p8.two_d_front || '-'} · {p8.two_d_middle || '-'} · {p8.two_d_back || '-'}</div>
            </div>
          ) : <div className="mt-1 text-amber-300">{unavailable}</div>}
        </div>
      </div>
    </details>
  );
}

function ConsensusDetails({ archive }) {
  const raw = archive.raw_consensus || {};
  const weighted = archive.weighted_consensus || {};
  const tie = analyzeFourDConsensusTie({ rankings: weighted.candidate_rankings?.['4d_top3'] || [], models: archive.models || {} });
  return (
    <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <summary className="cursor-pointer text-xs font-bold text-slate-200">Konsensus raw / weighted, skor, dukungan, dan seri</summary>
      <div className="mt-3 space-y-4 text-[10px]">
        {tie && <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-amber-100" data-history-consensus-tie><strong>Skor seri:</strong> {tie.candidates.map((item) => item.number).join(' = ')} ({tie.score.toFixed(6)}). Posisi Top3 model tidak masuk ke skor; Main memakai tie-break angka menaik. Skor dan bintang adalah dukungan relatif, bukan probabilitas tembus 4D.</div>}
        <div><div className="mb-2 font-bold text-slate-300">Raw 4D</div><CandidateList items={raw.candidate_rankings?.['4d_top3']} /></div>
        <div><div className="mb-2 font-bold text-slate-300">Weighted 4D</div><CandidateList items={weighted.candidate_rankings?.['4d_top3']} /></div>
        <Field label="Raw digit ranking">{raw.digit_ranking?.join(' > ')}</Field>
        <Field label="Weighted digit ranking">{weighted.digit_ranking?.join(' > ')}</Field>
      </div>
    </details>
  );
}

function ModelDetails({ archive }) {
  const models = archive.models || {};
  return (
    <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <summary className="cursor-pointer text-xs font-bold text-slate-200">Detail P1–P7 dan Top-K asli</summary>
      <div className="mt-3 space-y-2">
        {Array.from({ length: 7 }, (_, index) => `P${index + 1}`).map((name) => {
          const model = models[name];
          return (
            <details key={name} className="rounded-lg border border-slate-800 p-3">
              <summary className="cursor-pointer text-[11px] font-bold text-emerald-300">{name}</summary>
              {!model ? <p className="mt-2 text-[10px] text-amber-300">{unavailable}</p> : (
                <div className="mt-2 space-y-2 text-[10px]">
                  <Field label="BBFS6 / BBFS5">{model.bbfs6 ? `${model.bbfs6} / ${model.bbfs5 || '-'}` : null}</Field>
                  <CandidateRow label="4D Top3" items={model['4d_top3']} />
                  <CandidateRow label="3D depan Top5" items={model['3d_front_top5']} />
                  <CandidateRow label="3D belakang Top5" items={model['3d_back_top5']} />
                  <CandidateRow label="2D depan Top5" items={model['2d_front_top5']} />
                  <CandidateRow label="2D tengah Top5" items={model['2d_middle_top5']} />
                  <CandidateRow label="2D belakang Top5" items={model['2d_back_top5']} />
                </div>
              )}
            </details>
          );
        })}
      </div>
    </details>
  );
}

function VisualPatterns({ archive, marketRows, outcomeAudit }) {
  const patterns = archive.visual_patterns;
  if (!Array.isArray(patterns) || !patterns.length) return <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300">Pola Visual: {unavailable}. Tidak ada gambar atau sinyal yang dibuat setelah fakta.</div>;
  return (
    <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <summary className="cursor-pointer text-xs font-bold text-slate-200">Pola Visual — paito canonical sebelum target</summary>
      <div className="mt-3 space-y-4">
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-200">P5_VISUAL_EDGE_CONFIRMED=FALSE. Penyajian paito ini tidak menambah vote P5 dan tidak mengganti SVG historis yang dibekukan.</div>
        {patterns.map((pattern, index) => {
          const audit = outcomeAudit?.visual_patterns?.find((item) => item.pattern_name === pattern.pattern_name);
          return (
          <details key={`${pattern.pattern_name}-${index}`} className="rounded-xl border border-slate-800 p-3">
            <summary className="cursor-pointer text-[11px] font-bold text-emerald-300">{pattern.pattern_name?.replaceAll('_', ' ')}</summary>
            <div className="mt-3 space-y-3 text-[10px] text-slate-400">
              <div className="grid gap-1 sm:grid-cols-2"><Field label="Sumber periode">{pattern.source_period}</Field><Field label="Aturan pola">{pattern.backtest_definition}</Field><Field label="Baseline">{pattern.baseline != null ? Number(pattern.baseline).toFixed(6) : null}</Field><Field label="Aturan audit">{pattern.target_signal?.evaluation_rule || 'belum tersedia'}</Field><Field label="Hasil audit">{audit ? `${audit.status} · aktual ${audit.actual}${audit.matched_positions?.length ? ` · posisi ${audit.matched_positions.join(', ')}` : ''}` : 'Menunggu hasil / tidak tersedia pada arsip asli'}</Field></div>
              <VisualPaitoViewer marketRows={marketRows} prediction={archive} pattern={pattern} />
              {pattern.image_path ? <details className="rounded-lg border border-slate-800 p-3"><summary className="cursor-pointer text-slate-300">SVG historis asli (tetap dibekukan)</summary><img className="mt-3 w-full rounded-lg border border-slate-800" loading="lazy" src={predictionAssetUrl(pattern.image_path, archive.dataset_fingerprint)} alt={`SVG historis ${pattern.pattern_name}`} /></details> : <div className="text-amber-300">SVG historis {unavailable}.</div>}
            </div>
          </details>
          );
        })}
      </div>
    </details>
  );
}

function ArchiveDetails({ archive, record, marketRows }) {
  const actual = record.actual_result;
  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg sm:p-5" data-loaded-prediction-archive>
      <details open className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><summary className="cursor-pointer text-xs font-bold text-slate-200">Identitas arsip</summary><div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2"><Field label="Pasaran / target">{archive.market} · {archive.target_date} · {archive.target_period}</Field><Field label="Dibuat">{formatTime(archive.generated_at)}</Field><Field label="Versi engine">{archive.engine_version || archive.engine}</Field><Field label="Basis hasil">{(archive.prediction_basis_date || archive.latest_result?.date) ? `${archive.prediction_basis_date || archive.latest_result?.date} · ${archive.prediction_basis_result || archive.latest_result?.number}` : null}</Field><Field label="Fingerprint">{archive.dataset_fingerprint}</Field><Field label="Hasil aktual">{actual ? `${actual.date} · ${actual.period} · ${actual.number}` : 'Menunggu hasil'}</Field></div></details>
      {actual && record.outcome_audit ? <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><summary className="cursor-pointer text-xs font-bold">Audit prediksi tanggal ini</summary><div className="mt-3"><PredictionOutcomeAudit audit={record.outcome_audit} /></div></details> : null}
      {!actual && <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-300">Menunggu hasil. Audit tembus belum dibuat.</div>}
      {archive.prior_prediction_audit && <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><summary className="cursor-pointer text-xs font-bold">Audit prediksi sebelumnya yang tersimpan</summary><div className="mt-3"><PredictionOutcomeAudit audit={archive.prior_prediction_audit} /></div></details>}
      <QuickView archive={archive} /><ConsensusDetails archive={archive} /><ModelDetails archive={archive} /><VisualPatterns archive={archive} marketRows={marketRows} outcomeAudit={record.outcome_audit} />
    </section>
  );
}

export default function PredictionHistoryPage({ marketCode, setMarketCode, history, marketRows, onBack }) {
  const records = useMemo(() => publishedHistoryRecords(history), [history]);
  const [selectedKey, setSelectedKey] = useState('');
  const [archive, setArchive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const coordinatorRef = useRef(createArchiveRequestCoordinator());
  const selectedRecord = records.find((record) => `${record.target_date}|${record.target_period}` === selectedKey) || records[0] || null;

  useEffect(() => { setSelectedKey(records[0] ? `${records[0].target_date}|${records[0].target_period}` : ''); }, [marketCode, history]);
  useEffect(() => {
    if (!selectedRecord) { setArchive(null); return undefined; }
    const requestId = coordinatorRef.current.begin();
    const controller = new AbortController();
    setLoading(true); setArchive(null); setError('');
    loadPredictionArchive(marketCode, selectedRecord, { signal: controller.signal })
      .then((payload) => { if (coordinatorRef.current.isLatest(requestId)) setArchive(payload); })
      .catch((reason) => { if (!controller.signal.aborted && coordinatorRef.current.isLatest(requestId)) setError(reason?.message || 'Arsip gagal dimuat.'); })
      .finally(() => { if (coordinatorRef.current.isLatest(requestId)) setLoading(false); });
    return () => controller.abort();
  }, [marketCode, selectedKey, retry, selectedRecord?.archive_path]);

  return (
    <div className="space-y-5" data-page="prediction-history">
      <section className="overflow-hidden rounded-2xl border border-violet-500/25 bg-slate-900/95 shadow-xl">
        <div className="border-b border-slate-800 bg-gradient-to-r from-violet-500/10 to-emerald-500/5 p-5 sm:p-6"><button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs font-semibold text-slate-300"><ArrowLeft className="h-4 w-4" /> Kembali</button><div className="flex items-start gap-3"><div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-3 text-violet-300"><History className="h-6 w-6" /></div><div><h2 className="text-xl font-black">Histori Prediksi Terbit</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">Berbeda dari histori hasil undian. Detail kandidat dimuat satu arsip pada satu waktu dan tidak dihitung ulang di aplikasi.</p></div></div></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pasaran<select value={marketCode} onChange={(event) => setMarketCode(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3 text-xs text-slate-100">{MARKET_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tanggal / periode prediksi<select value={selectedRecord ? `${selectedRecord.target_date}|${selectedRecord.target_period}` : ''} onChange={(event) => setSelectedKey(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3 text-xs text-slate-100">{records.map((record) => <option key={`${record.target_date}|${record.target_period}`} value={`${record.target_date}|${record.target_period}`}>{record.target_date} · {record.target_period} · {archiveResultState(record).label}</option>)}</select></label>
          <div className="text-[10px] text-emerald-400 sm:col-span-2">Prediksi pernah diterbitkan: {records.length} · termasuk arsip yang masih menunggu hasil.</div>
        </div>
      </section>
      {loading && <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-10 text-sm text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Memuat satu arsip terpilih…</div>}
      {error && <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-5 text-sm text-rose-200"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> {error}</div><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-bold"><RotateCcw className="h-4 w-4" /> Coba lagi</button></div>}
      {archive && selectedRecord && <ArchiveDetails archive={archive} record={selectedRecord} marketRows={marketRows || []} />}
      {!records.length && !loading && <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-10 text-center text-sm text-slate-500">Belum ada arsip prediksi yang pernah diterbitkan untuk pasaran ini.</div>}
    </div>
  );
}
