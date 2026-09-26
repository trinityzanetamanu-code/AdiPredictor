export const PAITO_POSITIONS = ['AS', 'KOP', 'KEPALA', 'EKOR'];
export const PAITO_LAGS = [4, 3, 2, 1, 0];
export const PAITO_GEOMETRY = Object.freeze({ labelWidth: 210, cellWidth: 38, rowHeight: 52, headerHeight: 68 });

/** Each cell is an actual digit from the dated canonical draw at D-lag.
 * The wide layout is an educational comparison, not a published formula. */
export function buildPaitoGrid(rows, { count = 60, endDate = null } = {}) {
  const eligible = (rows || []).filter((row) => !endDate || row.date <= endDate);
  const start = Math.max(0, eligible.length - count);
  return eligible.slice(start).map((row, visibleIndex) => {
    const absoluteIndex = start + visibleIndex;
    const cells = PAITO_LAGS.flatMap((lag, groupIndex) => {
      const source = eligible[absoluteIndex - lag] || null;
      return PAITO_POSITIONS.map((position, positionIndex) => ({
        rowIndex: visibleIndex,
        columnIndex: groupIndex * 4 + positionIndex,
        lag,
        position,
        digit: source?.digits[positionIndex] ?? null,
        sourceDate: source?.date || null,
        sourcePeriod: source?.period || null,
        sourceNumber: source?.number || null,
        sourceSources: source?.sources || [],
        sourceVerification: source?.verification || null,
        sourceCollectedAt: source?.collectedAt || null,
      }));
    });
    const lastPair = row.number.slice(-2);
    const repeatedPairColumns = new Set();
    for (let groupIndex = 0; groupIndex < PAITO_LAGS.length - 1; groupIndex += 1) {
      const candidate = cells.slice(groupIndex * 4 + 2, groupIndex * 4 + 4);
      if (candidate.every((cell) => cell.digit !== null) && candidate.map((cell) => cell.digit).join('') === lastPair) {
        repeatedPairColumns.add(groupIndex * 4 + 2);
        repeatedPairColumns.add(groupIndex * 4 + 3);
        repeatedPairColumns.add(18);
        repeatedPairColumns.add(19);
      }
    }
    return { ...row, cells, repeatedPairColumns };
  });
}

export function paitoCellCenter(rowIndex, columnIndex) {
  const { labelWidth, cellWidth, rowHeight, headerHeight } = PAITO_GEOMETRY;
  return { x: labelWidth + (columnIndex + 0.5) * cellWidth, y: headerHeight + (rowIndex + 0.5) * rowHeight };
}

export function normalizePaitoNumber(row) {
  const raw = row?.nomor ?? row?.number;
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!/^\d{1,4}$/.test(value)) return null;
  return value.padStart(4, '0');
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function collectedAfter(row, generatedAt) {
  if (!row?.collected_at || !generatedAt) return false;
  const collected = Date.parse(row.collected_at);
  const generated = Date.parse(generatedAt);
  return Number.isFinite(collected) && Number.isFinite(generated) && collected > generated;
}

export function paitoArchiveBoundary(prediction = {}) {
  const targetDate = prediction.target_date || null;
  const basisDate = prediction.dataset?.last_date
    || prediction.prediction_basis_date
    || prediction.latest_result?.date
    || null;
  return {
    targetDate,
    basisDate,
    generatedAt: prediction.generated_at || null,
    datasetCount: prediction.dataset?.count ?? null,
    firstDate: prediction.dataset?.first_date || null,
    fingerprint: prediction.dataset_fingerprint || null,
  };
}

export function buildHistoricalPaitoDataset(marketRows, prediction = {}, limit = 60) {
  const boundary = paitoArchiveBoundary(
    typeof prediction === 'string' ? { target_date: prediction } : prediction,
  );
  const diagnostics = {
    invalidNumberRows: 0,
    outsideArchiveBoundaryRows: 0,
    collectedAfterPredictionRows: 0,
    conflictDates: [],
  };
  const bounded = [];

  for (const row of marketRows || []) {
    const date = row?.result_date;
    const number = normalizePaitoNumber(row);
    if (!validDate(date)) continue;
    if (!number) {
      diagnostics.invalidNumberRows += 1;
      continue;
    }
    const outsideBasis = boundary.basisDate ? date > boundary.basisDate : false;
    const atOrAfterTarget = boundary.targetDate ? date >= boundary.targetDate : false;
    if (outsideBasis || atOrAfterTarget) {
      diagnostics.outsideArchiveBoundaryRows += 1;
      continue;
    }
    if (collectedAfter(row, boundary.generatedAt)) {
      diagnostics.collectedAfterPredictionRows += 1;
      continue;
    }
    bounded.push({ row, date, number });
  }

  const byDate = new Map();
  for (const candidate of bounded) {
    if (!byDate.has(candidate.date)) byDate.set(candidate.date, []);
    byDate.get(candidate.date).push(candidate);
  }

  const safe = [];
  for (const [date, candidates] of byDate) {
    const numbers = new Set(candidates.map((candidate) => candidate.number));
    if (numbers.size > 1) {
      diagnostics.conflictDates.push(date);
      continue;
    }
    safe.push(candidates.at(-1));
  }

  const rows = safe
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)
    .map(({ row, date, number }) => ({
      date,
      period: row.periode || row.period || '-',
      number,
      digits: number.split(''),
      verification: row.verification || null,
      sources: (row.source_ids || row.sources || (row.source_id ? [row.source_id] : [])).map((source) => (
        typeof source === 'string' ? source : source?.source_id || source?.name
      )).filter(Boolean),
      collectedAt: row.collected_at || null,
    }));

  return {
    rows,
    boundary,
    diagnostics,
    exactSnapshotProven: false,
  };
}

export function buildHistoricalPaitoRows(marketRows, prediction, limit = 60) {
  return buildHistoricalPaitoDataset(marketRows, prediction, limit).rows;
}

function combinations(options, index = 0, current = [], output = [], limit = 100) {
  if (output.length >= limit) return output;
  if (index >= options.length) {
    output.push(current);
    return output;
  }
  for (const value of options[index]) {
    combinations(options, index + 1, [...current, value], output, limit);
    if (output.length >= limit) break;
  }
  return output;
}

function matchesRule(name, columns) {
  if (columns.length < 2) return false;
  const deltas = columns.slice(1).map((column, index) => column - columns[index]);
  if (name === 'DIAGONAL_TURUN') return deltas.every((delta) => delta === 1);
  if (name === 'DIAGONAL_NAIK') return deltas.every((delta) => delta === -1);
  if (name === 'REPEAT_PATH') return deltas.every((delta) => delta === 0);
  if (name === 'BOUNCE_PANTULAN') {
    return columns.length >= 3 && columns[0] === columns.at(-1)
      && columns.slice(1, -1).some((column) => column !== columns[0]);
  }
  if (name === 'ZIG_ZAG') {
    return deltas.length >= 2
      && deltas.every((delta) => delta !== 0)
      && deltas.slice(1).every((delta, index) => Math.sign(delta) !== Math.sign(deltas[index]));
  }
  if (name === 'SAME_DIGIT_TRAVELLING') return new Set(columns).size > 1;
  return false;
}

export function deriveArchivedPatternPaths(rows, pattern, limit = 25) {
  const inRange = rows
    .map((row, rowIndex) => ({ ...row, rowIndex }))
    .filter((row) => row.date >= pattern?.start_point && row.date <= pattern?.end_point);
  const digits = new Set((pattern?.digits_used || []).map(String));
  if (inRange.length < 2 || !digits.size) return [];

  const choices = inRange.map((row) => row.digits
    .map((digit, columnIndex) => ({ rowIndex: row.rowIndex, columnIndex, digit }))
    .filter((cell) => digits.has(cell.digit)));
  if (choices.some((group) => !group.length)) return [];

  return combinations(choices, 0, [], [], 100)
    .filter((cells) => matchesRule(pattern.pattern_name, cells.map((cell) => cell.columnIndex)))
    .slice(0, limit);
}

export function deriveArchivedPatternPath(rows, pattern) {
  return deriveArchivedPatternPaths(rows, pattern, 1)[0] || [];
}

export function archivedPatternPathProvenance(rows, pattern) {
  const paths = deriveArchivedPatternPaths(rows, pattern);
  const hasFrozenCells = Array.isArray(pattern?.highlighted_cells) && pattern.highlighted_cells.length > 1;
  return {
    path: paths[0] || [],
    alternatives: paths.length,
    exact: hasFrozenCells,
    status: hasFrozenCells ? 'FROZEN_ARCHIVE_CELLS' : 'ILLUSTRATIVE_RECONSTRUCTION',
    reason: hasFrozenCells
      ? 'Koordinat sel tersedia pada arsip asli.'
      : 'Arsip ini tidak menyimpan koordinat sel lintasan. Garis memilih satu kombinasi yang memenuhi metadata dan bukan bukti lintasan prediksi asli.',
  };
}

export function patternDisplayStatus(pattern, provenance) {
  if (!pattern) return 'Tidak ada pola arsip yang dipilih; tabel hanya menampilkan hasil historis.';
  if (!provenance?.path?.length) return 'Lintasan tidak dapat direkonstruksi dari metadata arsip tanpa mengarang sel.';
  return provenance.reason;
}
