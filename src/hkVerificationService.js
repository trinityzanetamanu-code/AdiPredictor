import { Capacitor, registerPlugin } from '@capacitor/core';
import { parseSixDigitBoard } from './liveDrawService';

const HKVerification = registerPlugin('HKVerification');
export const HK_BOARD_CACHE_KEY = 'HK_LAST_VERIFIED_BOARD';

export const HK_VERIFICATION_STATES = Object.freeze({
  DIRECT_FETCH_OK: 'DIRECT_FETCH_OK',
  CHALLENGE_REQUIRED: 'CHALLENGE_REQUIRED',
  MANUAL_VERIFICATION_OPEN: 'MANUAL_VERIFICATION_OPEN',
  RESULT_PAGE_READY: 'RESULT_PAGE_READY',
  NORMALIZED_BOARD_READY: 'NORMALIZED_BOARD_READY',
  VERIFICATION_CANCELLED: 'VERIFICATION_CANCELLED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
});

export function loadLocalHKBoard() {
  try {
    const value = JSON.parse(localStorage.getItem(HK_BOARD_CACHE_KEY) || 'null');
    return value?.first && /^\d{6}$/.test(value.first) ? value : null;
  } catch { return null; }
}

export function storeLocalHKBoard(board) {
  const normalized = {
    market: 'HK', source: board.source, source_url: board.source_url,
    draw_date: board.draw_date, first: board.first, second: board.second, third: board.third,
    starter: board.starter, consolation: board.consolation,
    full_first_prize_6d: board.first, derived_4d: board.derived_4d,
    retrieved_at: new Date().toISOString(), verification: 'manual_source_session',
  };
  localStorage.setItem(HK_BOARD_CACHE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function openHKManualVerification() {
  if (!Capacitor.isNativePlatform()) return { state: HK_VERIFICATION_STATES.VERIFICATION_FAILED, error: 'Verifikasi WebView hanya tersedia di aplikasi Android.' };
  try {
    const response = await HKVerification.open();
    if (response?.status === HK_VERIFICATION_STATES.VERIFICATION_CANCELLED) return { state: response.status };
    if (response?.status !== HK_VERIFICATION_STATES.RESULT_PAGE_READY || !response.html) throw new Error('Halaman hasil belum siap');
    const board = parseSixDigitBoard(response.html, 'HK', response.url);
    return { state: HK_VERIFICATION_STATES.NORMALIZED_BOARD_READY, board: storeLocalHKBoard(board) };
  } catch (error) {
    return { state: HK_VERIFICATION_STATES.VERIFICATION_FAILED, error: error?.message || 'Verifikasi sumber HK gagal' };
  }
}
