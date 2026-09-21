import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { ExternalLink, Play, Radio, RefreshCw } from 'lucide-react';
import { PLAYER_MODES, PLAYER_STATES, calculateLiveState, scheduleBadgeLabel } from '../liveDrawConfig';
import { loadYouTubeIframeAPI, watchdogPlayerState, youtubeStateToPlayerState } from '../youtubePlayerService';

export async function openLivePage(url) {
  if (!url) return false;
  if (Capacitor.isNativePlatform()) await Browser.open({ url, presentationStyle: 'popover' });
  else window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

const stateStyles = {
  [PLAYER_STATES.READY]: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  [PLAYER_STATES.PLAYING]: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
  [PLAYER_STATES.WAITING]: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  [PLAYER_STATES.UNAVAILABLE]: 'border-slate-600 bg-slate-800/70 text-slate-300',
  [PLAYER_STATES.BLOCKED]: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  [PLAYER_STATES.ERROR]: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  [PLAYER_STATES.LOADING]: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  [PLAYER_STATES.TIMEOUT]: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
};

const playerMessages = {
  [PLAYER_STATES.LOADING]: 'Menghubungkan player resmi…',
  [PLAYER_STATES.READY]: 'Player siap. Tekan Putar untuk membuktikan playback pada perangkat ini.',
  [PLAYER_STATES.WAITING]: 'Player tersedia tetapi siaran belum sedang diputar.',
  [PLAYER_STATES.BLOCKED]: 'Player resmi diblokir atau tidak dapat dimuat oleh Android WebView.',
  [PLAYER_STATES.ERROR]: 'Player resmi mengembalikan error. Result board tetap tersedia di bawah.',
  [PLAYER_STATES.TIMEOUT]: 'Playback tidak terkonfirmasi dalam batas waktu.',
  [PLAYER_STATES.UNAVAILABLE]: 'Siaran langsung tidak tersedia di dalam aplikasi.',
};

function safeHost(url) {
  try { return url ? new URL(url).host : '-'; } catch { return 'invalid-url'; }
}

export default function LiveDrawPlayer({ source, lastChecked, lastResultRefresh }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [playerState, setPlayerState] = useState(PLAYER_STATES.LOADING);
  const [lastReload, setLastReload] = useState(null);
  const [errorState, setErrorState] = useState(null);
  const playerRef = useRef(null);
  const mountRef = useRef(null);
  const playbackObservedRef = useRef(false);
  const apiReadyRef = useRef(false);
  const scheduleState = useMemo(() => calculateLiveState(source.schedule), [source, reloadKey, lastChecked]);

  useEffect(() => {
    let cancelled = false;
    let watchdog;
    playbackObservedRef.current = false;
    apiReadyRef.current = false;
    setErrorState(null);

    if (source.mode !== PLAYER_MODES.IFRAME) {
      setPlayerState(source.mode === PLAYER_MODES.OFFICIAL_PAGE ? PLAYER_STATES.BLOCKED : PLAYER_STATES.UNAVAILABLE);
      return undefined;
    }

    setPlayerState(PLAYER_STATES.LOADING);
    loadYouTubeIframeAPI().then((YT) => {
      if (cancelled || !mountRef.current) return;
      playerRef.current = new YT.Player(mountRef.current, {
        width: '100%',
        height: '100%',
        playerVars: { listType: 'playlist', list: source.playlistId, playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            apiReadyRef.current = true;
            setPlayerState(PLAYER_STATES.READY);
            event.target.cuePlaylist?.({ listType: 'playlist', list: source.playlistId });
          },
          onStateChange: (event) => {
            if (cancelled) return;
            const mapped = youtubeStateToPlayerState(event.data);
            if (mapped === PLAYER_STATES.PLAYING) playbackObservedRef.current = true;
            setPlayerState(mapped);
          },
          onError: (event) => {
            if (cancelled) return;
            setErrorState(`YOUTUBE_PLAYER_ERROR_${event.data}`);
            setPlayerState(PLAYER_STATES.ERROR);
          },
        },
      });
    }).catch((error) => {
      if (cancelled) return;
      setErrorState(error?.message || 'YOUTUBE_API_BLOCKED');
      setPlayerState(PLAYER_STATES.BLOCKED);
    });

    watchdog = window.setTimeout(() => {
      if (cancelled || playbackObservedRef.current) return;
      const state = watchdogPlayerState({ playbackObserved: false, apiReady: apiReadyRef.current, error: false });
      setErrorState(state === PLAYER_STATES.TIMEOUT ? 'PLAYBACK_EVIDENCE_TIMEOUT' : 'YOUTUBE_API_BLOCKED');
      setPlayerState(state);
    }, 12_000);

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      try { playerRef.current?.destroy?.(); } catch { /* best-effort cleanup */ }
      playerRef.current = null;
    };
  }, [source.id, source.mode, source.playlistId, reloadKey]);

  const reloadPlayer = () => {
    setLastReload(new Date().toISOString());
    setErrorState(null);
    setReloadKey((value) => value + 1);
  };
  const requestPlayback = () => {
    setPlayerState(PLAYER_STATES.LOADING);
    try { playerRef.current?.playVideo?.(); }
    catch {
      setErrorState('PLAYBACK_REQUEST_FAILED');
      setPlayerState(PLAYER_STATES.ERROR);
    }
  };

  const isDrawWindow = scheduleState.status === 'LIVE_WINDOW';
  const showFallbackOverlay = playerState !== PLAYER_STATES.PLAYING;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 shadow-xl" data-sgp-player-state={playerState}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
        <div><div className="flex flex-wrap items-center gap-2"><h4 className="font-bold text-slate-100">{source.title}</h4><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${isDrawWindow ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>{scheduleBadgeLabel(scheduleState.status)}</span></div><p className="mt-1 text-[11px] text-slate-400">{source.sourceLabel} · {scheduleState.message}</p></div>
        <Radio className={playerState === PLAYER_STATES.PLAYING ? 'h-5 w-5 text-rose-400' : 'h-5 w-5 text-slate-500'} />
      </div>

      <div className="relative aspect-video overflow-hidden bg-slate-950">
        {source.mode === PLAYER_MODES.IFRAME && <div key={reloadKey} ref={mountRef} className="absolute inset-0 h-full w-full" data-youtube-player-api />}
        {showFallbackOverlay && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/95 p-6 text-center" data-player-failsafe>
          {playerState === PLAYER_STATES.LOADING && <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-emerald-400" />}
          <div className={`rounded-full border px-3 py-1 text-[10px] font-bold ${stateStyles[playerState] || stateStyles[PLAYER_STATES.UNAVAILABLE]}`}>{playerState}</div>
          <p className="max-w-md text-xs leading-relaxed text-slate-300">{playerMessages[playerState] || source.note}</p>
          {[PLAYER_STATES.READY, PLAYER_STATES.WAITING].includes(playerState) && <button type="button" onClick={requestPlayback} className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300"><Play className="h-4 w-4" /> Putar siaran resmi</button>}
          {[PLAYER_STATES.TIMEOUT, PLAYER_STATES.BLOCKED, PLAYER_STATES.ERROR, PLAYER_STATES.UNAVAILABLE].includes(playerState) && <button type="button" onClick={() => openLivePage(source.pageUrl)} className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200"><ExternalLink className="h-4 w-4" /> Buka Live Resmi</button>}
        </div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 p-3"><span className="text-[10px] text-slate-500">Dicek: {lastChecked || '-'}</span><div className="flex gap-2"><button onClick={reloadPlayer} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-[10px] font-semibold text-slate-200"><RefreshCw className="h-3.5 w-3.5" /> Muat ulang</button><button onClick={() => openLivePage(source.pageUrl)} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-300"><ExternalLink className="h-3.5 w-3.5" /> Buka Live Resmi</button></div></div>
      <details className="border-t border-slate-800 bg-slate-950/40 px-4 py-3 text-[10px] text-slate-400"><summary className="cursor-pointer font-bold uppercase tracking-wider text-slate-300">LiveDraw Diagnostics</summary><dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 break-all"><dt>Source mode</dt><dd className="text-slate-200">{source.mode}</dd><dt>Source URL</dt><dd className="text-slate-200">{source.pageUrl || '-'}</dd><dt>Embed host</dt><dd className="text-slate-200">{safeHost(source.embedUrl)}</dd><dt>Schedule state</dt><dd className="text-slate-200">{scheduleState.status}</dd><dt>Player state</dt><dd className="text-slate-200">{playerState}</dd><dt>Playback evidence</dt><dd className="text-slate-200">{playbackObservedRef.current ? 'PLAYING_EVENT_RECEIVED' : 'NOT_VERIFIED'}</dd><dt>Last result refresh</dt><dd className="text-slate-200">{lastResultRefresh || lastChecked || '-'}</dd><dt>Last player reload</dt><dd className="text-slate-200">{lastReload || '-'}</dd><dt>Error state</dt><dd className="text-slate-200">{errorState || '-'}</dd></dl></details>
    </section>
  );
}
