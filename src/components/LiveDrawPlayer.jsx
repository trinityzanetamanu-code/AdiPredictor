import React, { useEffect, useMemo, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { ExternalLink, Radio, RefreshCw } from 'lucide-react';
import { PLAYER_MODES, PLAYER_STATES, calculateLiveState } from '../liveDrawConfig';

export async function openLivePage(url) {
  if (!url) return false;
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url, presentationStyle: 'popover' });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return true;
}

const stateStyles = {
  LIVE: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
  WAITING: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  OFFLINE: 'border-slate-600 bg-slate-800/70 text-slate-300',
  BLOCKED_EMBED: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  ERROR: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  LOADING: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
};

export default function LiveDrawPlayer({ source, lastChecked }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [playerState, setPlayerState] = useState(PLAYER_STATES.LOADING);
  const scheduleState = useMemo(() => calculateLiveState(source.schedule), [source, reloadKey, lastChecked]);

  useEffect(() => {
    if (source.mode === PLAYER_MODES.IFRAME || source.mode === PLAYER_MODES.VIDEO) {
      setPlayerState(scheduleState.status === 'LIVE_WINDOW' ? PLAYER_STATES.LIVE : PLAYER_STATES.WAITING);
    } else if (source.mode === PLAYER_MODES.OFFICIAL_PAGE) {
      setPlayerState(PLAYER_STATES.BLOCKED_EMBED);
    } else {
      setPlayerState(PLAYER_STATES.OFFLINE);
    }
  }, [source, scheduleState.status, reloadKey]);

  const isLive = scheduleState.status === 'LIVE_WINDOW';
  const badge = isLive ? 'LIVE' : scheduleState.status.replace('_', ' ');

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-slate-100">{source.title}</h4>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${isLive ? 'animate-pulse border-rose-500 bg-rose-500/15 text-rose-300' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>
              {badge}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{source.sourceLabel} · {scheduleState.message}</p>
        </div>
        <Radio className={isLive ? 'h-5 w-5 text-rose-400' : 'h-5 w-5 text-slate-500'} />
      </div>

      <div className="relative aspect-video bg-slate-950">
        {source.mode === PLAYER_MODES.IFRAME && (
          <iframe
            key={reloadKey}
            src={source.embedUrl}
            title={source.title}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setPlayerState(isLive ? PLAYER_STATES.LIVE : PLAYER_STATES.WAITING)}
            onError={() => setPlayerState(PLAYER_STATES.ERROR)}
          />
        )}
        {source.mode === PLAYER_MODES.VIDEO && (
          <video key={reloadKey} src={source.mediaUrl} className="h-full w-full" controls playsInline muted preload="metadata" />
        )}
        {(source.mode === PLAYER_MODES.OFFICIAL_PAGE || source.mode === PLAYER_MODES.RESULT_ONLY) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className={`rounded-full border px-3 py-1 text-[10px] font-bold ${stateStyles[playerState]}`}>
              {playerState.replace('_', ' ')}
            </div>
            <p className="max-w-md text-xs leading-relaxed text-slate-400">
              {source.mode === PLAYER_MODES.OFFICIAL_PAGE
                ? 'Sumber ini tidak dapat diverifikasi aman untuk embed. Buka halaman live sumber di in-app browser.'
                : source.note}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 p-3">
        <span className="text-[10px] text-slate-500">Checked: {lastChecked || '-'}</span>
        <div className="flex gap-2">
          {(source.mode === PLAYER_MODES.IFRAME || source.mode === PLAYER_MODES.VIDEO) && (
            <button onClick={() => setReloadKey((value) => value + 1)} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-[10px] font-semibold text-slate-200">
              <RefreshCw className="h-3.5 w-3.5" /> Muat ulang
            </button>
          )}
          {source.pageUrl && (
            <button onClick={() => openLivePage(source.pageUrl)} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-300">
              <ExternalLink className="h-3.5 w-3.5" /> Buka halaman live
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

