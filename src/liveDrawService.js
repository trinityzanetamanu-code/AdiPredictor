export const LIVE_BOARD_URLS = Object.freeze({
  HK: {
    pageUrl: 'https://www.hongkongpools.com/live',
    fallbackUrl: 'https://www.hongkongpools.com/live.html',
    source: 'HongkongPools Market Source',
  },
  SDY: {
    pageUrl: 'https://www.sydneypoolstoday.com/live.html',
    dataUrl: 'https://www.sydneypoolstoday.com/getLiveContent',
    source: 'SydneyPoolsToday Market Source',
  },
});

const MONTHS = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9,
  oct: 10, nov: 11, dec: 12,
});

function decodeText(value) {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDate(year, month, day) {
  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    candidate.getUTCFullYear() !== Number(year) ||
    candidate.getUTCMonth() !== Number(month) - 1 ||
    candidate.getUTCDate() !== Number(day)
  ) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseLiveBoardDate(html) {
  const text = decodeText(html);
  let match = text.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*,?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*,?\s+(\d{4})/i);
  if (match) return isoDate(match[3], MONTHS[match[1].toLowerCase()], match[2]);
  match = text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*,?\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
  if (match) return isoDate(match[3], MONTHS[match[2].slice(0, 3).toLowerCase()], match[1]);
  match = text.match(/(?<!\d)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/);
  if (match) return isoDate(match[1], match[2], match[3]);
  match = text.match(/(?<!\d)(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?!\d)/);
  return match ? isoDate(match[3], match[2], match[1]) : null;
}

function imageDigit(tag) {
  const attribute = (name) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '';
  for (const candidate of [attribute('data-digit'), attribute('alt'), attribute('title')]) {
    if (/^\d$/.test(candidate.trim())) return candidate.trim();
  }
  const src = attribute('src').split('/').pop() || '';
  return src.match(/(?:^|[_-])(\d)(?:\.[a-z0-9]+)(?:\?.*)?$/i)?.[1] || '';
}

function numbersFromHtml(fragment) {
  const output = [];
  const text = decodeText(fragment);
  output.push(...(text.match(/(?<!\d)\d{6}(?!\d)/g) || []));
  const digits = [...String(fragment || '').matchAll(/<img\b[^>]*>/gi)]
    .map((match) => imageDigit(match[0]))
    .filter(Boolean);
  for (let index = 0; index + 5 < digits.length; index += 6) {
    output.push(digits.slice(index, index + 6).join(''));
  }
  return [...new Set(output.filter((number) => /^\d{6}$/.test(number)))];
}

const LABELS = Object.freeze({
  first: /\b(?:1st|first)\s*prize\b/i,
  second: /\b(?:2nd|second)\s*prize\b/i,
  third: /\b(?:3rd|third)\s*prize\b/i,
  starter: /\bstarter\s*(?:prize)?\b/i,
  consolation: /\bconsolation\s*(?:prize)?\b/i,
});

function extractPrizeRows(html) {
  const buckets = { first: [], second: [], third: [], starter: [], consolation: [] };
  const rows = [...String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  for (const row of rows) {
    const labelText = decodeText(row);
    const matchedKeys = Object.entries(LABELS).filter(([, pattern]) => pattern.test(labelText));
    if (matchedKeys.length !== 1) continue;
    const [key] = matchedKeys[0];
    buckets[key].push(...numbersFromHtml(row));
  }

  // Some simple source pages do not use table rows. Keep a bounded fallback
  // around each label while still accepting only exact six-digit values.
  for (const [key, pattern] of Object.entries(LABELS)) {
    if (buckets[key].length) continue;
    const match = String(html || '').match(new RegExp(`${pattern.source}([\\s\\S]{0,1200})`, 'i'));
    if (match) buckets[key].push(...numbersFromHtml(match[1]));
  }
  return Object.fromEntries(Object.entries(buckets).map(([key, values]) => [key, [...new Set(values)]]));
}

export function validateSixDigitBoard(board) {
  if (!board || !['HK', 'SDY'].includes(board.market)) throw new Error('Market live board tidak valid');
  for (const field of ['first', 'second', 'third']) {
    if (!/^\d{6}$/.test(String(board[field] || ''))) throw new Error(`${field} harus exact 6 digit`);
  }
  for (const field of ['starter', 'consolation']) {
    if (!Array.isArray(board[field]) || board[field].some((number) => !/^\d{6}$/.test(String(number)))) {
      throw new Error(`${field} berisi nomor malformed`);
    }
  }
  if (!/^\d{4}$/.test(String(board.derived_4d || '')) || board.derived_4d !== board.first.slice(-4)) {
    throw new Error('derived_4d tidak sesuai last-four Prize 1');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(board.draw_date || ''))) throw new Error('Draw date tidak valid');
  return board;
}

export function parseSixDigitBoard(html, market, sourceUrl = LIVE_BOARD_URLS[market]?.pageUrl) {
  if (!String(html || '').trim()) throw new Error('HTML live board kosong');
  if (/cf-mitigated|challenge-platform|<title>\s*Just a moment/i.test(html)) {
    throw new Error('Source dilindungi challenge; tidak mencoba bypass');
  }
  const rows = extractPrizeRows(html);
  const first = rows.first[0] || '';
  const board = {
    market,
    source: LIVE_BOARD_URLS[market]?.source || `${market} Market Source`,
    source_url: sourceUrl,
    draw_date: parseLiveBoardDate(html),
    first,
    second: rows.second[0] || '',
    third: rows.third[0] || '',
    starter: rows.starter,
    consolation: rows.consolation,
    full_first_prize_6d: first,
    derived_4d: first.slice(-4),
  };
  return validateSixDigitBoard(board);
}

export function attachDatasetValidation(board, datasetRow) {
  if (!board) return null;
  const dataset4d = String(datasetRow?.nomor || '').padStart(4, '0');
  const datasetDate = datasetRow?.result_date || null;
  const sameDate = !datasetDate || datasetDate === board.draw_date;
  const comparable = /^\d{4}$/.test(dataset4d) && sameDate;
  return {
    ...board,
    dataset_4d: /^\d{4}$/.test(dataset4d) ? dataset4d : null,
    matches_dataset: comparable ? board.derived_4d === dataset4d : null,
    verification: !sameDate
      ? 'dataset_date_mismatch'
      : !comparable
        ? 'dataset_unavailable'
        : board.derived_4d === dataset4d
          ? 'matches_prediction_dataset'
          : 'source_dataset_mismatch',
  };
}

function responseText(response) {
  if (typeof response?.data === 'string') return response.data;
  if (response?.data == null) return '';
  return JSON.stringify(response.data);
}

async function nativeGet(CapacitorHttp, url, headers = {}) {
  const response = await CapacitorHttp.get({
    url,
    headers: {
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      ...headers,
    },
    responseType: 'text',
    connectTimeout: 12000,
    readTimeout: 15000,
  });
  if (Number(response?.status) !== 200) throw new Error(`HTTP ${response?.status || 'unknown'} dari ${url}`);
  return responseText(response);
}

export async function fetchNativeLiveBoard(market) {
  if (!['HK', 'SDY'].includes(market)) throw new Error(`Native live board tidak tersedia untuk ${market}`);
  const { Capacitor, CapacitorHttp } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return { available: false, reason: 'web_platform', board: null };

  if (market === 'HK') {
    let lastError;
    for (const url of [LIVE_BOARD_URLS.HK.pageUrl, LIVE_BOARD_URLS.HK.fallbackUrl]) {
      try {
        const html = await nativeGet(CapacitorHttp, url);
        return { available: true, reason: 'native_http', board: parseSixDigitBoard(html, 'HK', url) };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('HK source tidak tersedia');
  }

  await nativeGet(CapacitorHttp, LIVE_BOARD_URLS.SDY.pageUrl);
  const html = await nativeGet(CapacitorHttp, LIVE_BOARD_URLS.SDY.dataUrl, {
    Referer: LIVE_BOARD_URLS.SDY.pageUrl,
    'X-Requested-With': 'XMLHttpRequest',
  });
  return {
    available: true,
    reason: 'native_http',
    board: parseSixDigitBoard(html, 'SDY', LIVE_BOARD_URLS.SDY.pageUrl),
  };
}

export function liveBoardRefreshMs(source) {
  if (!source?.schedule) return 60000;
  return source.scheduleState === 'LIVE_WINDOW' ? 20000 : 90000;
}
