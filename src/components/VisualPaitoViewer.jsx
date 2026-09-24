import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import {
  archivedPatternPathProvenance,
  buildHistoricalPaitoDataset,
  PAITO_POSITIONS,
  patternDisplayStatus,
} from '../visualPaito';
import {
  panViewport,
  pinchViewport,
  resetViewport,
  zoomViewport,
} from '../visualViewport';

function PaitoBoard({ rows, pattern, fitViewport = false }) {
  const provenance = archivedPatternPathProvenance(rows, pattern);
  const path = provenance.path;
  const pathKeys = new Map(path.map((cell, index) => [
    `${cell.rowIndex}:${cell.columnIndex}`,
    index,
  ]));
  const markerId = useId().replaceAll(':', '');
  const headerHeight = 36;
  const rowHeight = 40;
  const totalHeight = headerHeight + rows.length * rowHeight;
  const point = (cell) => ({
    x: 44 + cell.columnIndex * 14 + 7,
    y: headerHeight + cell.rowIndex * rowHeight + rowHeight / 2,
  });

  return (
    <div className={`${fitViewport ? 'w-[calc(100vw-24px)] max-w-[620px]' : 'min-w-[620px]'} rounded-xl border border-slate-700 bg-slate-950 p-3`} data-pola-paito>
      <div className="relative" style={{ height: `${totalHeight}px` }}>
        <div className="grid h-9 grid-cols-[44%_14%_14%_14%_14%] items-center border-b border-slate-700 text-[10px] font-black uppercase tracking-wider text-slate-400">
          <span className="px-2">Tanggal / Periode</span>
          {PAITO_POSITIONS.map((position) => <span key={position} className="text-center">{position}</span>)}
        </div>
        {rows.map((row, rowIndex) => (
          <div key={row.date} className="grid h-10 grid-cols-[44%_14%_14%_14%_14%] items-center border-b border-slate-800/80 even:bg-slate-900/55">
            <span className="px-2 font-mono text-[10px] text-slate-400">{row.date} · {row.period}</span>
            {row.digits.map((digit, columnIndex) => {
              const pathIndex = pathKeys.get(`${rowIndex}:${columnIndex}`);
              const onPath = pathIndex != null;
              const endpoint = onPath && (pathIndex === 0 || pathIndex === path.length - 1);
              return (
                <span key={`${row.date}:${columnIndex}`} className="flex justify-center">
                  <span
                    className={`relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border font-mono text-sm font-black ${
                      onPath
                        ? 'border-amber-300 bg-emerald-600 text-white ring-2 ring-amber-400/70'
                        : 'border-slate-800 bg-slate-900 text-slate-200'
                    }`}
                    aria-label={`${PAITO_POSITIONS[columnIndex]} ${digit}${onPath ? ', bagian lintasan pola' : ''}`}
                  >
                    {digit}
                    {endpoint && (
                      <span className="absolute -right-1.5 -top-2 rounded bg-amber-300 px-1 text-[7px] font-black text-slate-950">
                        {pathIndex === 0 ? 'M' : 'A'}
                      </span>
                    )}
                  </span>
                </span>
              );
            })}
          </div>
        ))}
        {path.length > 1 && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 h-full w-full"
            viewBox={`0 0 100 ${totalHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#fbbf24" />
              </marker>
            </defs>
            {path.slice(1).map((cell, index) => {
              const from = point(path[index]);
              const to = point(cell);
              return (
                <line
                  key={`${cell.rowIndex}:${cell.columnIndex}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#fbbf24"
                  strokeWidth="0.65"
                  strokeDasharray="1.4 0.8"
                  markerEnd={`url(#${markerId})`}
                />
              );
            })}
          </svg>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-800 pt-3 text-[9px] text-slate-400">
        <span><strong className="text-amber-300">M</strong> titik mulai</span>
        <span><strong className="text-amber-300">A</strong> titik akhir</span>
        <span><strong className="text-emerald-300">Kotak + garis putus</strong> rekonstruksi ilustratif</span>
      </div>
      <p className={`mt-2 text-[9px] ${path.length ? 'text-slate-500' : 'text-amber-300'}`}>
        {patternDisplayStatus(pattern, provenance)}
      </p>
      {provenance.alternatives > 1 && <p className="mt-1 text-[9px] text-amber-300">Metadata cocok dengan {provenance.alternatives} lintasan; aplikasi hanya menggambar kombinasi pertama sebagai ilustrasi.</p>}
    </div>
  );
}

function FullscreenPaito({ rows, pattern, market, targetDate, onClose }) {
  const [viewport, setViewport] = useState(resetViewport);
  const pointers = useRef(new Map());
  const previousPointers = useRef([]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const pointerList = () => [...pointers.current.values()];
  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previousPointers.current = pointerList();
  };
  const onPointerMove = (event) => {
    if (!pointers.current.has(event.pointerId)) return;
    const before = previousPointers.current;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = pointerList();
    if (before.length === 2 && after.length === 2) {
      setViewport((current) => pinchViewport(current, before, after));
    } else if (before.length === 1 && after.length === 1) {
      setViewport((current) => panViewport(
        current,
        after[0].x - before[0].x,
        after[0].y - before[0].y,
      ));
    }
    previousPointers.current = after;
  };
  const onPointerUp = (event) => {
    pointers.current.delete(event.pointerId);
    previousPointers.current = pointerList();
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950/98" role="dialog" aria-modal="true" aria-label="Pola Paito ukuran penuh">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 p-3">
        <div>
          <div className="text-sm font-black text-slate-100">Pola Paito · {market} · target {targetDate}</div>
          <div className="text-[9px] text-amber-300">{pattern?.pattern_name?.replaceAll('_', ' ') || 'Tabel historis tanpa garis'}</div>
          <div className="text-[9px] text-slate-500">Cubit atau gunakan tombol zoom. Geser hanya saat diperbesar.</div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Perkecil" onClick={() => setViewport((value) => zoomViewport(value, 0.8, { x: window.innerWidth / 2, y: window.innerHeight / 2 }))} className="min-h-11 min-w-11 rounded-lg border border-slate-700 p-2"><Minus className="mx-auto h-4 w-4" /></button>
          <button type="button" aria-label="Perbesar" onClick={() => setViewport((value) => zoomViewport(value, 1.25, { x: window.innerWidth / 2, y: window.innerHeight / 2 }))} className="min-h-11 min-w-11 rounded-lg border border-slate-700 p-2"><Plus className="mx-auto h-4 w-4" /></button>
          <button type="button" onClick={() => setViewport(resetViewport())} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-2 text-[10px]"><RotateCcw className="h-4 w-4" /> Reset</button>
          <button type="button" aria-label="Tutup" onClick={onClose} className="rounded-lg border border-rose-500/30 p-2 text-rose-300"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="absolute left-1/2 top-6 origin-top transition-transform duration-75"
          style={{ transform: `translateX(-50%) translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
        >
          <PaitoBoard rows={rows} pattern={pattern} fitViewport />
        </div>
      </div>
    </div>
  );
}

export default function VisualPaitoViewer({ marketRows, prediction, patterns = [] }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState('');
  useEffect(() => setSelectedPattern(''), [prediction.target_date, prediction.dataset_fingerprint]);
  const pattern = selectedPattern === '' ? null : patterns[Number(selectedPattern)] || null;
  const dataset = useMemo(
    () => buildHistoricalPaitoDataset(marketRows, prediction),
    [marketRows, prediction],
  );
  const { rows, boundary, diagnostics } = dataset;
  const sourceLabels = [...new Set(rows.flatMap((row) => row.sources))];
  if (!rows.length) {
    return <div className="rounded-lg border border-amber-500/20 p-3 text-[10px] text-amber-300">Data canonical dalam batas arsip tidak tersedia untuk visualisasi turunan.</div>;
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/45 p-3 text-[10px] text-slate-400 sm:grid-cols-2">
        <div><strong className="text-slate-200">Pasaran / target:</strong> {prediction.market} · {prediction.target_date} · {prediction.target_period}</div>
        <div><strong className="text-slate-200">Batas data arsip:</strong> {boundary.firstDate || '?'} s.d. {boundary.basisDate || '?'}</div>
        <div><strong className="text-slate-200">Sumber:</strong> {sourceLabels.length ? sourceLabels.join(', ') : 'metadata sumber tidak tersedia pada baris arsip'}; dataset canonical aplikasi dibatasi metadata prediksi</div>
        <div><strong className="text-slate-200">Dibuat:</strong> {boundary.generatedAt || 'tidak tersedia pada arsip asli'}</div>
        <div className="sm:col-span-2 text-amber-200">Arsip menyimpan fingerprint, jumlah, dan batas tanggal—bukan snapshot setiap baris. Koreksi historis setelah prediksi tidak dapat dibuktikan hanya dari arsip ini.</div>
        {(diagnostics.invalidNumberRows > 0 || diagnostics.collectedAfterPredictionRows > 0 || diagnostics.conflictDates.length > 0) && (
          <div className="sm:col-span-2 text-rose-300">Dikecualikan: {diagnostics.invalidNumberRows} angka kosong/tidak valid · {diagnostics.collectedAfterPredictionRows} baris dikumpulkan setelah prediksi · {diagnostics.conflictDates.length} tanggal konflik.</div>
        )}
      </div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Garis pembelajaran
        <select value={selectedPattern} onChange={(event) => setSelectedPattern(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100">
          <option value="">Tanpa garis — hasil historis saja</option>
          {patterns.map((item, index) => <option key={`${item.pattern_name}-${index}`} value={index}>{item.pattern_name?.replaceAll('_', ' ')}</option>)}
        </select>
      </label>
      {pattern && <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-[10px] text-amber-200"><strong>REKONSTRUKSI ILUSTRATIF.</strong> Metadata arsip tidak menyimpan koordinat sel; garis ini bukan lintasan prediksi asli dan tidak menambah vote P5.</div>}
      <div className="overflow-x-auto pb-2"><PaitoBoard rows={rows} pattern={pattern} /></div>
      <button type="button" onClick={() => setFullscreen(true)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[10px] font-bold text-emerald-300">
        <Maximize2 className="h-4 w-4" /> Buka Pola Paito layar penuh
      </button>
      {fullscreen && <FullscreenPaito rows={rows} pattern={pattern} market={prediction.market} targetDate={prediction.target_date} onClose={() => setFullscreen(false)} />}
    </div>
  );
}
