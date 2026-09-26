import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import {
  buildHistoricalPaitoDataset,
  buildPaitoGrid,
  PAITO_GEOMETRY,
  PAITO_LAGS,
  PAITO_POSITIONS,
  paitoCellCenter,
} from '../visualPaito';
import { resetViewport, scaledScrollOffset, zoomViewport } from '../visualViewport';

const BOARD_WIDTH = PAITO_GEOMETRY.labelWidth + PAITO_LAGS.length * PAITO_POSITIONS.length * PAITO_GEOMETRY.cellWidth;
const COLUMNS = `${PAITO_GEOMETRY.labelWidth}px repeat(${PAITO_LAGS.length * PAITO_POSITIONS.length}, ${PAITO_GEOMETRY.cellWidth}px)`;
const cellKey = (cell) => `${cell.rowIndex}:${cell.columnIndex}`;

function PaitoBoard({ grid, selected, onSelect }) {
  const height = PAITO_GEOMETRY.headerHeight + grid.length * PAITO_GEOMETRY.rowHeight;
  const points = selected.map((cell) => paitoCellCenter(cell.rowIndex, cell.columnIndex));
  return (
    <div className="relative bg-slate-950 text-slate-200" style={{ width: BOARD_WIDTH, height }} data-pola-paito>
      <div className="grid border-b border-slate-600 bg-slate-900" style={{ gridTemplateColumns: COLUMNS, height: PAITO_GEOMETRY.headerHeight }}>
        <div className="sticky left-0 z-30 border-r border-slate-600 bg-slate-900 px-2 py-3 text-[11px] font-bold">Tanggal · periode<div className="mt-1 text-[9px] font-normal">Sumber · verifikasi</div></div>
        {PAITO_LAGS.map((lag) => (
          <div key={lag} className="col-span-4 border-r border-slate-600 text-center">
            <div className="border-b border-slate-700 py-1 text-[11px] font-bold">D−{lag}</div>
            <div className="grid grid-cols-4 text-[9px]">{PAITO_POSITIONS.map((position) => <span key={position}>{position === 'KEPALA' ? 'KEP' : position === 'EKOR' ? 'EKR' : position}</span>)}</div>
          </div>
        ))}
      </div>
      {grid.map((row, rowIndex) => (
        <div key={row.date} className="grid border-b border-slate-800 even:bg-slate-900/55" style={{ gridTemplateColumns: COLUMNS, height: PAITO_GEOMETRY.rowHeight }}>
          <div className="sticky left-0 z-30 border-r border-slate-700 bg-slate-900 px-2 py-1 leading-tight" title={`Dikoleksi: ${row.collectedAt || 'tidak tersedia'} · Sumber: ${row.sources.join(', ') || 'tidak tersedia'}`}>
            <div className="font-mono text-[11px] font-bold">{row.date} · {row.period}</div>
            <div className="text-[9px] leading-3 text-slate-400 break-words">{row.verification || 'verifikasi tidak tercatat'} · {row.sources.join(', ') || 'sumber tidak tercatat'}</div>
            <div className="text-[9px] text-emerald-300">Draw {row.number}</div>
          </div>
          {row.cells.map((cell) => {
            const active = selected.find((item) => cellKey(item) === cellKey(cell));
            const repeated = row.repeatedPairColumns.has(cell.columnIndex);
            return (
              <button
                key={cell.columnIndex}
                type="button"
                disabled={cell.digit === null}
                onClick={() => onSelect(cell)}
                aria-pressed={Boolean(active)}
                aria-label={cell.digit === null
                  ? `D−${cell.lag} belum tersedia untuk ${row.date}`
                  : `Baris ${row.date}; D−${cell.lag} ${cell.sourceDate}, ${cell.position} digit ${cell.digit}`}
                title={cell.digit === null ? 'Draw sebelumnya tidak tersedia' : `${cell.sourceDate} · ${cell.sourcePeriod} · ${cell.position}=${cell.digit}`}
                className={`relative border-r border-slate-800 font-mono text-sm font-bold focus-visible:z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${active
                  ? active === selected[0] ? 'z-10 bg-sky-600 text-white ring-2 ring-inset ring-sky-300' : 'z-10 bg-fuchsia-600 text-white ring-2 ring-inset ring-fuchsia-300'
                  : repeated ? 'bg-amber-500/45 text-amber-100' : cell.digit === null ? 'text-slate-700' : 'text-slate-200'}`}
              >
                {cell.digit ?? '·'}
              </button>
            );
          })}
        </div>
      ))}
      {points.length === 2 && (
        <svg className="pointer-events-none absolute left-0 top-0 z-20" width={BOARD_WIDTH} height={height} viewBox={`0 0 ${BOARD_WIDTH} ${height}`} aria-hidden="true">
          <rect x={Math.min(points[0].x, points[1].x) - PAITO_GEOMETRY.cellWidth / 2} y={Math.min(points[0].y, points[1].y) - PAITO_GEOMETRY.rowHeight / 2} width={Math.abs(points[0].x - points[1].x) + PAITO_GEOMETRY.cellWidth} height={Math.abs(points[0].y - points[1].y) + PAITO_GEOMETRY.rowHeight} fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="5 4" />
          <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke="#f8fafc" strokeWidth="3" strokeDasharray="7 4" />
          {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="5" fill={index ? '#d946ef' : '#0284c7'} stroke="white" strokeWidth="2" />)}
        </svg>
      )}
    </div>
  );
}

function SelectionExplanation({ selected }) {
  if (!selected.length) return <p className="text-[11px] text-slate-400">Pilih dua sel untuk menggambar garis yang menempel pada pusat sel dan membaca asal setiap digit.</p>;
  return (
    <div className="rounded-lg border border-sky-500/20 bg-slate-950/70 p-3 text-[11px] text-slate-300" aria-live="polite">
      {selected.map((cell, index) => <p key={index}>{index + 1}. Baris {cell.rowDate}, D−{cell.lag}: draw {cell.sourceDate} ({cell.sourcePeriod}) bernomor {cell.sourceNumber}; posisi {cell.position} = <strong>{cell.digit}</strong>. Sumber {cell.sourceSources?.join(', ') || 'tidak tercatat'}; {cell.sourceVerification || 'verifikasi tidak tercatat'}; dikoleksi {cell.sourceCollectedAt || 'waktu tidak tersedia'}.</p>)}
      {selected.length === 2 && <p className="mt-1 text-amber-200">Keduanya {selected[0].digit === selected[1].digit ? 'memiliki digit sama' : 'memiliki digit berbeda'}. Kotak dan garis adalah pilihan pembaca untuk belajar histori, bukan rumus atau prediksi hasil berikutnya.</p>}
    </div>
  );
}

function FullscreenPaito({ grid, selected, onSelect, market, onClose }) {
  const [viewport, setViewport] = useState(resetViewport);
  const scaleRef = useRef(1);
  const scroller = useRef(null);
  const pointers = useRef(new Map());
  const previousPointers = useRef([]);
  const height = PAITO_GEOMETRY.headerHeight + grid.length * PAITO_GEOMETRY.rowHeight;

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

  const zoom = (factor, anchor) => {
    const el = scroller.current;
    if (!el) return;
    const point = anchor || { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    const next = zoomViewport({ scale: scaleRef.current }, factor);
    const scroll = scaledScrollOffset({ left: el.scrollLeft, top: el.scrollTop }, scaleRef.current, next.scale, point);
    scaleRef.current = next.scale;
    setViewport({ scale: next.scale, x: 0, y: 0 });
    window.requestAnimationFrame(() => el.scrollTo(scroll.left, scroll.top));
  };
  const onPointerDown = (event) => {
    // Synthetic browser pointer events may have no active browser pointer to
    // capture; a real touchscreen event still captures normally.
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* synthetic event */ }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previousPointers.current = [...pointers.current.values()];
  };
  const onPointerMove = (event) => {
    if (!pointers.current.has(event.pointerId)) return;
    const before = previousPointers.current;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.current.values()];
    if (before.length === 2 && after.length === 2) {
      const beforeDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
      const afterDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
      if (beforeDistance && afterDistance && scroller.current) {
        const rect = scroller.current.getBoundingClientRect();
        zoom(afterDistance / beforeDistance, {
          x: (after[0].x + after[1].x) / 2 - rect.left,
          y: (after[0].y + after[1].y) / 2 - rect.top,
        });
      }
    } else if (before.length === 1 && after.length === 1 && scroller.current) {
      scroller.current.scrollLeft -= after[0].x - before[0].x;
      scroller.current.scrollTop -= after[0].y - before[0].y;
    }
    previousPointers.current = after;
  };
  const onPointerUp = (event) => {
    pointers.current.delete(event.pointerId);
    previousPointers.current = [...pointers.current.values()];
  };
  const reset = () => {
    scaleRef.current = 1;
    setViewport(resetViewport());
    if (scroller.current) { scroller.current.scrollLeft = 0; scroller.current.scrollTop = 0; }
  };
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950" role="dialog" aria-modal="true" aria-label={`Pola Paito ${market} ukuran penuh`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 p-2">
        <div className="text-xs font-bold">Pola Paito · {market} · {Math.round(viewport.scale * 100)}%</div>
        <div className="flex gap-1">
          <button type="button" aria-label="Perkecil" onClick={() => zoom(0.8)} className="min-h-11 min-w-11 rounded-lg border border-slate-700 p-2"><Minus className="mx-auto h-4 w-4" /></button>
          <button type="button" aria-label="Perbesar" onClick={() => zoom(1.25)} className="min-h-11 min-w-11 rounded-lg border border-slate-700 p-2"><Plus className="mx-auto h-4 w-4" /></button>
          <button type="button" onClick={reset} className="min-h-11 rounded-lg border border-slate-700 px-2 text-xs"><RotateCcw className="inline h-4 w-4" /> Reset</button>
          <button type="button" aria-label="Tutup" onClick={onClose} className="min-h-11 min-w-11 rounded-lg border border-rose-500/30 p-2"><X className="mx-auto h-4 w-4" /></button>
        </div>
      </div>
      <div ref={scroller} tabIndex={0} className="flex-1 overflow-auto" style={{ touchAction: 'none' }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div style={{ width: BOARD_WIDTH * viewport.scale, height: height * viewport.scale }}>
          <div style={{ transformOrigin: 'top left', transform: `scale(${viewport.scale})` }}><PaitoBoard grid={grid} selected={selected} onSelect={onSelect} /></div>
        </div>
      </div>
      <div className="border-t border-slate-800 p-2"><SelectionExplanation selected={selected} /></div>
    </div>
  );
}

export default function VisualPaitoViewer({ marketRows, prediction, patterns = [] }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [count, setCount] = useState(60);
  const [endDate, setEndDate] = useState('');
  const [selected, setSelected] = useState([]);
  const dataset = useMemo(
    () => buildHistoricalPaitoDataset(marketRows, prediction, Number.MAX_SAFE_INTEGER),
    [marketRows, prediction],
  );
  const { rows, boundary, diagnostics } = dataset;
  const grid = useMemo(() => buildPaitoGrid(rows, { count, endDate }), [rows, count, endDate]);
  useEffect(() => setSelected([]), [count, endDate, prediction.target_date, prediction.dataset_fingerprint, rows]);
  const sourceLabels = [...new Set(rows.flatMap((row) => row.sources))];
  const selectCell = (cell) => {
    const withRow = { ...cell, rowDate: grid[cell.rowIndex]?.date };
    setSelected((current) => current.some((item) => cellKey(item) === cellKey(withRow))
      ? current.filter((item) => cellKey(item) !== cellKey(withRow))
      : current.length === 2 ? [withRow] : [...current, withRow]);
  };
  if (!rows.length) return <div className="rounded-lg border border-amber-500/20 p-3 text-xs text-amber-300">Data canonical dalam batas arsip tidak tersedia untuk Pola Paito.</div>;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3 text-[11px] text-slate-300">
        <div><strong>Pasar / target:</strong> {prediction.market} · {prediction.target_date} · {prediction.target_period}</div>
        <div><strong>Batas histori:</strong> {boundary.firstDate || rows[0].date} s.d. {boundary.basisDate || rows.at(-1).date} · dibuat {boundary.generatedAt || 'waktu tidak tersimpan'}</div>
        <div><strong>Sumber baris:</strong> {sourceLabels.join(', ') || 'metadata tidak tersedia'}</div>
        <div className="mt-2 text-amber-200">Arsip lama menyimpan fingerprint dan batas tanggal, bukan snapshot setiap baris. Koreksi yang diketahui setelah arsip dibuat tidak dapat dibuktikan sebagai input prediksi lama.</div>
        {diagnostics.collectedAfterPredictionRows > 0 && <div>{diagnostics.collectedAfterPredictionRows} baris dengan waktu koleksi sesudah prediksi dikecualikan.</div>}
        {diagnostics.conflictDates.length > 0 && <div>Konflik tanggal dikecualikan: {diagnostics.conflictDates.join(', ')}.</div>}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <label>Jumlah draw
          <select value={count} onChange={(event) => setCount(Number(event.target.value))} className="ml-2 rounded border border-slate-700 bg-slate-900 p-2">
            {[30, 60, 120].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>Akhir rentang
          <input type="date" value={endDate} min={rows[0].date} max={rows.at(-1).date} onChange={(event) => setEndDate(event.target.value)} className="ml-2 rounded border border-slate-700 bg-slate-900 p-2" />
        </label>
      </div>
      <div className="text-[11px] text-slate-400">Setiap baris mempunyai delapan kelompok D−7 hingga D−0, masing-masing AS, KOP, KEPALA, EKOR dari draw canonical pada tanggal itu atau tujuh draw sebelumnya. Kelompok ini adalah pilihan tata letak untuk menelusuri histori, bukan kolom atau rumus yang dibuktikan dari foto contoh.</div>
      <div className="flex flex-wrap gap-3 text-[10px] text-slate-300">
        <span className="text-amber-200">■ Kuning: pasangan KEPALA+EKOR muncul pada dua atau lebih draw di delapan kelompok baris itu.</span>
        <span className="text-sky-300">■ Biru: sel pilihan pertama.</span>
        <span className="text-fuchsia-300">■ Ungu: sel pilihan kedua.</span>
        <span>Garis putih dan kotak pilihan = ILUSTRASI interaktif.</span>
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-700" tabIndex={0}><PaitoBoard grid={grid} selected={selected} onSelect={selectCell} /></div>
      <SelectionExplanation selected={selected} />
      <p className="text-[11px] text-amber-200">Pola Visual P5 dan SVG arsip asli tetap berada di bagian tersendiri. Metadata pola arsip tidak menyimpan koordinat sel: REKONSTRUKSI ILUSTRATIF tidak digambar sebagai lintasan asli. {patterns.length} pola arsip tersedia untuk audit pada bagian Pola Visual.</p>
      <button type="button" onClick={() => setFullscreen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300"><Maximize2 className="h-4 w-4" /> Buka Pola Paito layar penuh</button>
      {fullscreen && <FullscreenPaito grid={grid} selected={selected} onSelect={selectCell} market={prediction.market} onClose={() => setFullscreen(false)} />}
    </div>
  );
}
