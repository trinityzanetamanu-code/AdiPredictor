import React from 'react';

function Field({ label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-bold text-slate-100 ${mono ? 'font-mono tracking-wider' : ''}`}>{value || '-'}</div>
    </div>
  );
}

export default function LiveDrawResultBoard({ title, badge, result, type = 'MARKET', note }) {
  const is4D = type === 'SGP_4D';
  const isToto = type === 'SGP_TOTO';
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-slate-100">{title}</h4>
          {note && <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-400">{note}</p>}
        </div>
        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-bold text-emerald-300">{badge}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Draw date" value={result?.draw_date || result?.result_date || result?.tanggal} />
        <Field label="Draw no / period" value={result?.draw_no || result?.periode} mono />
        {is4D && <><Field label="Prize 1" value={result?.first} mono /><Field label="Prize 2" value={result?.second} mono /><Field label="Prize 3" value={result?.third} mono /></>}
        {isToto && <><Field label="Winning numbers" value={(result?.winning_numbers || []).join(' · ')} mono /><Field label="Additional" value={result?.additional_number} mono /></>}
        {!is4D && !isToto && <><Field label="Latest result" value={result?.nomor} mono /><Field label="Verification" value={result?.verification || 'Menunggu'} /></>}
      </div>

      {is4D && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field label="Starter" value={(result?.starter || []).join(' · ')} mono />
          <Field label="Consolation" value={(result?.consolation || []).join(' · ')} mono />
        </div>
      )}
    </section>
  );
}

