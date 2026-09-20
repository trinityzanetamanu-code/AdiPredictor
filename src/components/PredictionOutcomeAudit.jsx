import React from 'react';

const STATUS_LABELS = Object.freeze({
  EXACT: 'TEMBUS TEPAT',
  MISS: 'TIDAK TEMBUS',
  PERMUTATION: 'TEMBUS PERMUTASI',
  REVERSE: 'TEMBUS BALIK',
  FULL: 'CAKUP PENUH',
  PARTIAL: 'CAKUP SEBAGIAN',
  DIGIT_APPEARED: 'DIGIT MUNCUL',
  VISUAL_ONLY_NO_TARGET: 'POLA VISUAL SAJA — TIDAK MEMILIKI SINYAL TARGET',
});

export function auditStatusLabel(entry) {
  if (!entry) return 'DATA AUDIT TIDAK TERSEDIA';
  const status = entry.status || (entry.exact ? 'EXACT' : entry.reverse ? 'REVERSE' : entry.permutation ? 'PERMUTATION' : 'MISS');
  if (status === 'PARTIAL' && entry.occurrence_coverage) {
    return `CAKUP ${entry.occurrence_coverage.captured}/${entry.occurrence_coverage.total}`;
  }
  return STATUS_LABELS[status] || String(status).replaceAll('_', ' ');
}

function Tone({ entry }) {
  const status = entry?.status || (entry?.exact ? 'EXACT' : entry?.reverse ? 'REVERSE' : entry?.permutation ? 'PERMUTATION' : 'MISS');
  const good = ['EXACT', 'FULL', 'DIGIT_APPEARED'].includes(status);
  const partial = ['REVERSE', 'PERMUTATION', 'PARTIAL'].includes(status);
  return <span className={good ? 'text-emerald-300' : partial ? 'text-amber-300' : 'text-slate-500'}>{auditStatusLabel(entry)}</span>;
}

function AuditRow({ label, entry, candidate }) {
  const value = candidate || entry?.candidate || entry?.exact_candidates?.[0] || entry?.reverse_candidates?.[0] || entry?.permutation_candidates?.[0];
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-800/60 py-2 last:border-0">
      <span className="text-slate-400">{label}{value ? <span className="ml-1 font-mono text-slate-200">{value}</span> : null}</span>
      <span className="shrink-0 text-right font-semibold"><Tone entry={entry} /></span>
    </div>
  );
}

function BbfsRow({ label, entry }) {
  if (!entry) return <AuditRow label={label} />;
  const missed = (entry.distinct_digits_missed || []).join('') || '-';
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-3 text-[11px]">
      <div className="flex justify-between gap-3"><span className="font-bold text-slate-200">{label}</span><Tone entry={entry} /></div>
      <div className="mt-1 text-slate-500">Digit tertangkap {(entry.distinct_digits_captured || []).join('') || '-'} · terlewat {missed} · occurrence {entry.occurrence_coverage?.captured ?? 0}/{entry.occurrence_coverage?.total ?? 4}</div>
    </div>
  );
}

function KembarRow({ label, entry }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-3 text-[11px]"><div className="flex justify-between"><span className="font-bold text-slate-200">{label} <span className="font-mono">{entry?.candidate || '-'}</span></span><Tone entry={entry} /></div><div className="mt-1 text-slate-500">Depan={entry?.front ? 'TEMBUS TEPAT' : 'TIDAK'} · Tengah={entry?.middle ? 'TEMBUS TEPAT' : 'TIDAK'} · Belakang={entry?.back ? 'TEMBUS TEPAT' : 'TIDAK'} · Posisi mana pun={entry?.any_position ? 'YA' : 'TIDAK'}</div></div>;
}

function FinalAudit({ audit }) {
  return (
    <div className="space-y-1">
      <AuditRow label="4D Main" entry={audit.previous_4d_main} />
      <AuditRow label="4D Alternatif" entry={audit.previous_4d_alternative} />
      <AuditRow label="4D Cadangan" entry={audit.previous_4d_reserve} />
      <AuditRow label="4D Single Pair" entry={audit.previous_4d_single_pair} />
      <AuditRow label="3D Depan Top 5" entry={audit['3d_front']} />
      <AuditRow label="3D Belakang Top 5" entry={audit['3d_back']} />
      <AuditRow label="2D Depan Top 5" entry={audit['2d_front']} />
      <AuditRow label="2D Tengah Top 5" entry={audit['2d_middle']} />
      <AuditRow label="2D Belakang Top 5" entry={audit['2d_back']} />
      <div className="mt-3 grid gap-2 sm:grid-cols-2"><BbfsRow label="BBFS6" entry={audit.bbfs6} /><BbfsRow label="BBFS5" entry={audit.bbfs5} /></div>
    </div>
  );
}

function ModelAudit({ name, model }) {
  if (!model?.available) return <p className="text-xs text-amber-300">{model?.reason || 'AUDIT MODEL RINCI TIDAK TERSEDIA PADA ARSIP LAMA'}</p>;
  return (
    <div className="space-y-1">
      <div className="grid gap-2 sm:grid-cols-2"><BbfsRow label="BBFS6" entry={model.bbfs6} /><BbfsRow label="BBFS5" entry={model.bbfs5} /></div>
      {[
        ['4D Top 3', '4d_top3'], ['3D Depan Top 5', '3d_front_top5'], ['3D Belakang Top 5', '3d_back_top5'],
        ['2D Depan Top 5', '2d_front_top5'], ['2D Tengah Top 5', '2d_middle_top5'], ['2D Belakang Top 5', '2d_back_top5'],
      ].map(([label, field]) => <AuditRow key={field} label={label} entry={model[field]} />)}
      <div className="pt-2 text-[10px] text-slate-500">
        {model.model_summary?.direct_number_hits?.length
          ? `Tembus: ${model.model_summary.direct_number_hits.map((item) => `${item.field.replaceAll('_', ' ')} ${item.candidate || ''}`).join(' · ')}`
          : `${name}: TIDAK ADA TEMBUS LANGSUNG`}
      </div>
    </div>
  );
}

export function AuditSummary({ audit }) {
  const direct = audit?.summary?.direct_number_hits || [];
  const coverage = audit?.summary?.support_coverage_hits || [];
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
      <div className="font-bold text-slate-100">RINGKASAN HASIL AUDIT</div>
      <div className="mt-2 text-slate-400">Aktual: <span className="font-mono font-bold text-slate-100">{audit?.actual || '-'}</span></div>
      <div className="mt-2 text-emerald-300">{direct.length ? `Tembus nomor: ${direct.map((item) => `${item.category} ${item.candidate || ''} (${auditStatusLabel({ status: item.status })})`).join(' · ')}` : 'Tidak ada kandidat nomor yang tembus'}</div>
      <div className="mt-1 text-sky-300">{coverage.length ? `Cakupan pendukung: ${coverage.join(' · ')}` : 'Tidak ada cakupan BBFS penuh'}</div>
    </div>
  );
}

export default function PredictionOutcomeAudit({ audit }) {
  if (!audit) return <p className="text-xs text-slate-500">MENUNGGU HASIL</p>;
  return (
    <div className="space-y-3" data-testid="prediction-outcome-audit">
      <AuditSummary audit={audit} />
      <details open className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><summary className="cursor-pointer font-bold text-slate-200">AUDIT KANDIDAT FINAL</summary><div className="mt-3"><FinalAudit audit={audit} /></div></details>
      <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><summary className="cursor-pointer font-bold text-slate-200">AUDIT MODEL P1–P7</summary><div className="mt-3 space-y-2">{Object.entries(audit.models || {}).map(([name, model]) => <details key={name} className="rounded-lg border border-slate-800 p-3"><summary className="cursor-pointer font-semibold text-emerald-300">{name}</summary><div className="mt-3"><ModelAudit name={name} model={model} /></div></details>)}{!Object.keys(audit.models || {}).length && <p className="text-xs text-amber-300">AUDIT MODEL RINCI TIDAK TERSEDIA PADA ARSIP LAMA</p>}</div></details>
      <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><summary className="cursor-pointer font-bold text-slate-200">AUDIT KEMBAR & REPEAT</summary><div className="mt-3 space-y-2"><KembarRow label="Kembar Main" entry={audit.kembar?.main} /><KembarRow label="Kembar Cadangan" entry={audit.kembar?.reserve} /><AuditRow label={`Repeat Data (${audit.repeat_signals?.data_model?.digit || '-'}) · muncul ${audit.repeat_signals?.data_model?.actual_occurrences ?? 0}x`} entry={audit.repeat_signals?.data_model} /><AuditRow label={`Repeat P8 (${audit.repeat_signals?.p8?.digit || '-'}) · muncul ${audit.repeat_signals?.p8?.actual_occurrences ?? 0}x`} entry={audit.repeat_signals?.p8} /></div></details>
      <details className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3"><summary className="cursor-pointer font-bold text-violet-200">AUDIT P8 AI INSTINCT</summary><div className="mt-3">{audit.p8?.available ? <><div className="grid gap-2 sm:grid-cols-2"><BbfsRow label="P8 BBFS6" entry={audit.p8.bbfs6} /><BbfsRow label="P8 BBFS5" entry={audit.p8.bbfs5} /></div>{[['4D Main','4d_main'],['4D Cadangan','4d_reserve'],['3D Depan','3d_front'],['3D Belakang','3d_back'],['2D Depan','2d_front'],['2D Tengah','2d_middle'],['2D Belakang','2d_back']].map(([label, field]) => <AuditRow key={field} label={label} entry={audit.p8[field]} />)}<AuditRow label="Repeat digit P8" entry={audit.p8.repeat_digit} /></> : <p className="text-xs text-amber-300">{audit.p8?.reason || 'AUDIT P8 TIDAK TERSEDIA PADA ARSIP LAMA'}</p>}</div></details>
      <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><summary className="cursor-pointer font-bold text-slate-200">AUDIT POLA VISUAL P5</summary><div className="mt-3 space-y-2">{(audit.visual_patterns || []).map((item, index) => <div key={`${item.pattern_name}-${index}`} className="rounded-lg border border-slate-800 p-3 text-xs"><div className="font-bold text-slate-200">{item.pattern_name?.replaceAll('_',' ') || 'Pola visual'}</div><div className="mt-1"><Tone entry={item} /></div>{item.reason && <div className="mt-1 text-slate-500">{item.reason}</div>}</div>)}{!(audit.visual_patterns || []).length && <p className="text-xs text-amber-300">SINYAL TARGET POLA VISUAL TIDAK TERSIMPAN PADA VERSI INI</p>}</div></details>
    </div>
  );
}
