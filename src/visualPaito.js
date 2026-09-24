export const PAITO_POSITIONS = ['AS', 'KOP', 'KEPALA', 'EKOR'];

function resultNumber(row) {
  return String(row?.nomor || row?.number || '').padStart(4, '0');
}

export function buildHistoricalPaitoRows(marketRows, targetDate, limit = 18) {
  return (marketRows || [])
    .filter((row) => (
      /^\d{4}-\d{2}-\d{2}$/.test(String(row?.result_date || ''))
      && row.result_date < targetDate
      && /^\d{4}$/.test(resultNumber(row))
    ))
    .sort((a, b) => a.result_date.localeCompare(b.result_date))
    .slice(-limit)
    .map((row) => ({
      date: row.result_date,
      period: row.periode || row.period || '-',
      number: resultNumber(row),
      digits: resultNumber(row).split(''),
    }));
}

function combinations(options, index = 0, current = [], output = []) {
  if (index >= options.length) {
    output.push(current);
    return output;
  }
  for (const value of options[index]) combinations(options, index + 1, [...current, value], output);
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

export function deriveArchivedPatternPath(rows, pattern) {
  const inRange = rows
    .map((row, rowIndex) => ({ ...row, rowIndex }))
    .filter((row) => row.date >= pattern?.start_point && row.date <= pattern?.end_point);
  const digits = new Set((pattern?.digits_used || []).map(String));
  if (inRange.length < 2 || !digits.size) return [];

  const choices = inRange.map((row) => row.digits
    .map((digit, columnIndex) => ({ rowIndex: row.rowIndex, columnIndex, digit }))
    .filter((cell) => digits.has(cell.digit)));
  if (choices.some((group) => !group.length)) return [];

  const valid = combinations(choices).find((cells) => (
    matchesRule(pattern.pattern_name, cells.map((cell) => cell.columnIndex))
  ));
  return valid || [];
}

export function patternDisplayStatus(pattern, path) {
  if (!pattern) return 'Metadata pola tidak tersedia pada arsip asli.';
  if (!path?.length) return 'Lintasan tidak dapat direkonstruksi dari metadata arsip tanpa mengarang sel.';
  return 'Lintasan diturunkan dari draw sebelum target dan metadata pola yang dibekukan.';
}
