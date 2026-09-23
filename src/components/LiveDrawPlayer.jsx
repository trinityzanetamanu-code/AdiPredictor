import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Copy, ExternalLink, Play, Radio, RefreshCw } from 'lucide-react';
import {
  PLAYER_MODES,
  PLAYER_STATES,
  calculateLiveState,
  resolveMediaPresentation,
  scheduleBadgeLabel,
} from '../liveDrawConfig';
import {
  formatLiveDrawDiagnostics,
  getLiveDrawDiagnostics,
  LIVE_DRAW_DIAGNOSTIC_EVENTS,
  recordLiveDrawDiagnostic,
  subscribeLiveDrawDiagnostics,
} from '../liveDrawDiagnostics';
import { loadYouTubeIframeAPI, watchdogPlayerState, youtubeStateToPlayerState } from '../youtubePlayerService';
import { openLivePage } from '../liveDrawExternalNavigation';

export { openLivePage } from '../liveDrawExternalNavigation';

export class LiveDrawPlayerBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_ERROR, {
      phase: 'REACT_ERROR_BOUNDARY',
      error: error?.name || 'Error',
    });
  }

  componentDidUpdate(previousProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="rounded-2xl border border-amber-500/25 bg-slate-950/60 p-5 text-center" data-player-error-boundary>
        <p className="text-sm font-bold text-slate-100">Player video tidak dapat dirender.</p>
        <p className="mt-2 text-xs text-slate-400">Result board tetap tersedia. Gunakan halaman resmi untuk menonton.</p>
        <button type="button" onClick={this.props.onOpenOfficial} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200">
          <ExternalLink className="h-4 w-4" /> Buka Halaman Resmi
        </button>
      </section>
    );
  }
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
  [PLAYER_STATES.READY]: 'Player siap. Media playlist ini adalah rekaman draw terakhir.',
  [PLAYER_STATES.WAITING]: 'Player tersedia tetapi rekaman tidak sedang diputar.',
  [PLAYER_STATES.BLOCKED]: 'Player resmi diblokir atau tidak dapat dimuat oleh browser.',
  [PLAYER_STATES.ERROR]: 'Player resmi mengembalikan error. Result board tetap tersedia.',
  [PLAYER_STATES.TIMEOUT]: 'Playback tidak terkonfirmasi dalam batas waktu.',
  [PLAYER_STATES.UNAVAILABLE]: 'Media tidak tersedia di dalam aplikasi.',
};

function safeHost(url) {
  try { return url ? new URL(url).host : '-'; } catch { return 'invalid-url'; }
}

function playerDiagnosticEvent(code) {
  if (code === 0) return LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_ENDED;
  if (code === 1) return LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_PLAYING;
  if (code === 2) return LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_PAUSED;
  return null;
}

export default function LiveDrawPlayer({ source, lastChecked, lastResultRefresh }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [playerState, setPlayerState] = useState(PLAYER_STATES.LOADING);
  const [lastReload, setLastReload] = useState(null);
  const [errorState, setErrorState] = useState(null);
  const [diagnostics, setDiagnostics] = useState(() => getLiveDrawDiagnostics());
  const [copyState, setCopyState] = useState('');
  const playerRef = useRef(null);
  const mountRef = useRef(null);
  const playbackObservedRef = useRef(false);
  const apiReadyRef = useRef(false);
  const scheduleState = useMemo(() => calculateLiveState(source.schedule), [source, reloadKey, lastChecked]);
  const nativeSgpContainment = Capacitor.isNativePlatform() && source.market === 'SGP';
  const mediaPresentation = resolveMediaPresentation({
    scheduleStatus: scheduleState.status,
    hasPlaylist: Boolean(source.playlistId),
    verifiedLive: false,
  });

  useEffect(() => {
    const previouslyMounted = getLiveDrawDiagnostics().some((event) => (
      event.type === LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_MOUNT
      && event.details?.source === source.id
    ));
    recordLiveDrawDiagnostic(
      previouslyMounted
        ? LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_REMOUNTED
        : LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_MOUNT,
      {
      source: source.id,
      platform: Capacitor.getPlatform(),
      },
    );
    const unsubscribe = subscribeLiveDrawDiagnostics(setDiagnostics);
    const onVisibilityChange = () => recordLiveDrawDiagnostic(
      document.visibilityState === 'hidden'
        ? LIVE_DRAW_DIAGNOSTIC_EVENTS.TAB_HIDDEN
        : LIVE_DRAW_DIAGNOSTIC_EVENTS.TAB_VISIBLE,
      { source: source.id },
    );
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribe();
    };
  }, [source.id]);

  useEffect(() => {
    let cancelled = false;
    let watchdog;
    playbackObservedRef.current = false;
    apiReadyRef.current = false;
    setErrorState(null);

    if (nativeSgpContainment) {
      setPlayerState(PLAYER_STATES.UNAVAILABLE);
      recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.ANDROID_EMBED_CONTAINED, { source: source.id });
      return () => recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_DESTROYED, { source: source.id });
    }

    if (source.mode !== PLAYER_MODES.IFRAME) {
      setPlayerState(source.mode === PLAYER_MODES.OFFICIAL_PAGE ? PLAYER_STATES.BLOCKED : PLAYER_STATES.UNAVAILABLE);
      return () => recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_DESTROYED, { source: source.id });
    }

    setPlayerState(PLAYER_STATES.LOADING);
    recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.YOUTUBE_API_LOADING, { source: source.id });
    loadYouTubeIframeAPI().then((YT) => {
      if (cancelled || !mountRef.current) return;
      recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.YOUTUBE_API_READY, { source: source.id });
      playerRef.current = new YT.Player(mountRef.current, {
        width: '100%',
        height: '100%',
        playerVars: { listType: 'playlist', list: source.playlistId, playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            apiReadyRef.current = true;
            setPlayerState(PLAYER_STATES.READY);
            recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_READY, { source: source.id });
            event.target.cuePlaylist?.({ listType: 'playlist', list: source.playlistId });
          },
          onStateChange: (event) => {
            if (cancelled) return;
            const mapped = youtubeStateToPlayerState(event.data);
            if (mapped === PLAYER_STATES.PLAYING) playbackObservedRef.current = true;
            const diagnosticEvent = playerDiagnosticEvent(event.data);
            if (diagnosticEvent) recordLiveDrawDiagnostic(diagnosticEvent, { source: source.id });
            setPlayerState(mapped);
          },
          onError: (event) => {
            if (cancelled) return;
            setErrorState(`YOUTUBE_PLAYER_ERROR_${event.data}`);
            setPlayerState(PLAYER_STATES.ERROR);
            recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_ERROR, {
              source: source.id,
              code: event.data,
            });
          },
        },
      });
    }).catch((error) => {
      if (cancelled) return;
      setErrorState(error?.message || 'YOUTUBE_API_BLOCKED');
      setPlayerState(PLAYER_STATES.BLOCKED);
      recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_ERROR, {
        source: source.id,
        phase: 'YOUTUBE_API',
        error: error?.name || 'Error',
      });
    });

    watchdog = window.setTimeout(() => {
      if (cancelled || playbackObservedRef.current) return;
      const state = watchdogPlayerState({ playbackObserved: false, apiReady: apiReadyRef.current, error: false });
      setErrorState(state === PLAYER_STATES.TIMEOUT ? 'PLAYBACK_EVIDENCE_TIMEOUT' : 'YOUTUBE_API_BLOCKED');
      setPlayerState(state);
      recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.WATCHDOG_TIMEOUT, {
        source: source.id,
        apiReady: apiReadyRef.current,
      });
    }, 12_000);

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      try { playerRef.current?.destroy?.(); } catch { /* best-effort cleanup */ }
      playerRef.current = null;
      recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_DESTROYED, { source: source.id });
    };
  }, [source.id, source.mode, source.playlistId, reloadKey, nativeSgpContainment]);

  const reloadPlayer = () => {
    setLastReload(new Date().toISOString());
    setErrorState(null);
    recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_REMOUNTED, { source: source.id });
    setReloadKey((value) => value + 1);
  };

  const requestPlayback = () => {
    setPlayerState(PLAYER_STATES.LOADING);
    recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAY_REQUESTED, { source: source.id });
    try { playerRef.current?.playVideo?.(); }
    catch {
      setErrorState('PLAYBACK_REQUEST_FAILED');
      setPlayerState(PLAYER_STATES.ERROR);
      recordLiveDrawDiagnostic(LIVE_DRAW_DIAGNOSTIC_EVENTS.PLAYER_ERROR, {
        source: source.id,
        phase: 'PLAY_REQUEST',
      });
    }
  };

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(formatLiveDrawDiagnostics());
      setCopyState('Tersalin');
    } catch {
      setCopyState('Gagal menyalin');
    }
  };

  const isDrawWindow = scheduleState.status === 'LIVE_WINDOW';
  const showFallbackOverlay = nativeSgpContainment || playerState !== PLAYER_STATES.PLAYING;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 shadow-xl"
      data-sgp-player-state={playerState}
      data-sgp-android-embed-containment={nativeSgpContainment ? 'true' : 'false'}
      data-media-state={mediaPresentation.mediaState}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-slate-100">{source.title}</h4>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${isDrawWindow ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>{scheduleBadgeLabel(scheduleState.status)}</span>
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[9px] font-black text-violet-200">{mediaPresentation.label}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{source.sourceLabel} · {scheduleState.message}</p>
        </div>
        <Radio className={playerState === PLAYER_STATES.PLAYING ? 'h-5 w-5 text-rose-400' : 'h-5 w-5 text-slate-500'} />
      </div>

      <div className="relative aspect-video overflow-hidden bg-slate-950">
        {!nativeSgpContainment && source.mode === PLAYER_MODES.IFRAME && <div key={reloadKey} ref={mountRef} className="absolute inset-0 h-full w-full" data-youtube-player-api />}
        {showFallbackOverlay && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/95 p-6 text-center" data-player-failsafe>
          {!nativeSgpContainment && playerState === PLAYER_STATES.LOADING && <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-emerald-400" />}
          <div className={`rounded-full border px-3 py-1 text-[10px] font-bold ${stateStyles[playerState] || stateStyles[PLAYER_STATES.UNAVAILABLE]}`}>{nativeSgpContainment ? 'SGP_ANDROID_EMBED_CONTAINMENT' : playerState}</div>
          <p className="max-w-md text-xs leading-relaxed text-slate-300">
            {nativeSgpContainment
              ? 'Embed video dinonaktifkan di Android untuk menjaga kestabilan aplikasi. Halaman hasil resmi dapat dibuka di Browser; status tayangan live belum diverifikasi.'
              : playerMessages[playerState] || source.note}
          </p>
          {!nativeSgpContainment && [PLAYER_STATES.READY, PLAYER_STATES.WAITING].includes(playerState) && <button type="button" onClick={requestPlayback} className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300"><Play className="h-4 w-4" /> {mediaPresentation.playLabel}</button>}
          {(nativeSgpContainment || [PLAYER_STATES.TIMEOUT, PLAYER_STATES.BLOCKED, PLAYER_STATES.ERROR, PLAYER_STATES.UNAVAILABLE].includes(playerState)) && <button type="button" onClick={() => openLivePage(source.pageUrl)} className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200"><ExternalLink className="h-4 w-4" /> Buka Halaman Resmi</button>}
        </div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 p-3">
        <span className="text-[10px] text-slate-500">Dicek: {lastChecked || '-'}</span>
        <div className="flex gap-2">
          {!nativeSgpContainment && <button onClick={reloadPlayer} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-[10px] font-semibold text-slate-200"><RefreshCw className="h-3.5 w-3.5" /> Muat ulang</button>}
          <button onClick={() => openLivePage(source.pageUrl)} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-300"><ExternalLink className="h-3.5 w-3.5" /> Buka Halaman Resmi</button>
        </div>
      </div>
      <details className="border-t border-slate-800 bg-slate-950/40 px-4 py-3 text-[10px] text-slate-400">
        <summary className="cursor-pointer font-bold uppercase tracking-wider text-slate-300">LiveDraw Diagnostics</summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 break-all">
          <dt>Source mode</dt><dd className="text-slate-200">{source.mode}</dd>
          <dt>Embed policy</dt><dd className="text-slate-200">{nativeSgpContainment ? 'ANDROID_EXTERNAL_ONLY' : 'EMBED_OPTIONAL'}</dd>
          <dt>Embed host</dt><dd className="text-slate-200">{safeHost(source.embedUrl)}</dd>
          <dt>Schedule state</dt><dd className="text-slate-200">{scheduleState.status}</dd>
          <dt>Media state</dt><dd className="text-slate-200">{mediaPresentation.mediaState}</dd>
          <dt>Player state</dt><dd className="text-slate-200">{playerState}</dd>
          <dt>Playback evidence</dt><dd className="text-slate-200">{playbackObservedRef.current ? 'PLAYING_EVENT_RECEIVED' : 'NOT_VERIFIED'}</dd>
          <dt>Last result refresh</dt><dd className="text-slate-200">{lastResultRefresh || lastChecked || '-'}</dd>
          <dt>Last player reload</dt><dd className="text-slate-200">{lastReload || '-'}</dd>
          <dt>Error state</dt><dd className="text-slate-200">{errorState || '-'}</dd>
          <dt>Recent events</dt><dd className="text-slate-200">{diagnostics.length}</dd>
        </dl>
        <div className="mt-3 space-y-1 rounded-lg border border-slate-800 bg-slate-950/70 p-2 font-mono text-[9px]" data-live-draw-diagnostic-events>
          {diagnostics.slice(-12).map((event, index) => <div key={`${event.at}-${event.type}-${index}`}>{event.at} · {event.type}</div>)}
          {!diagnostics.length && <div>Belum ada event.</div>}
        </div>
        <button type="button" onClick={copyDiagnostics} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-[10px] font-semibold text-slate-200"><Copy className="h-3.5 w-3.5" /> Salin diagnostic{copyState ? ` · ${copyState}` : ''}</button>
      </details>
    </section>
  );
}
