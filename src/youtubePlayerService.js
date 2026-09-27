import { PLAYER_STATES } from './liveDrawConfig.js';

let apiPromise;

export function createPlaybackWatchdog({ setTimer, clearTimer, onTimeout, timeoutMs = 12000 }) {
  let timer = null;
  let requested = false;
  let failed = false;
  const cancel = () => { if (timer !== null) clearTimer(timer); timer = null; };
  return {
    request() {
      cancel();
      requested = true;
      failed = false;
      timer = setTimer(() => { timer = null; if (requested && !failed) { failed = true; onTimeout(); } }, timeoutMs);
    },
    ready() { return !failed; },
    playing() { cancel(); requested = false; return !failed; },
    error() { cancel(); failed = true; },
    cancel,
  };
}

export function youtubeStateToPlayerState(code) {
  if (code === 1) return PLAYER_STATES.PLAYING;
  if (code === 3) return PLAYER_STATES.LOADING;
  if (code === -1 || code === 5) return PLAYER_STATES.READY;
  if (code === 0 || code === 2) return PLAYER_STATES.WAITING;
  return PLAYER_STATES.UNAVAILABLE;
}

export function watchdogPlayerState({ playbackObserved, apiReady, error }) {
  if (error) return PLAYER_STATES.ERROR;
  if (playbackObserved) return PLAYER_STATES.PLAYING;
  // API onReady and raw iframe onLoad only prove that a frame/API loaded.
  // Neither one proves that Android WebView can render playable video.
  return apiReady ? PLAYER_STATES.TIMEOUT : PLAYER_STATES.BLOCKED;
}

export function loadYouTubeIframeAPI(windowLike = window, documentLike = document) {
  if (windowLike.YT?.Player) return Promise.resolve(windowLike.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = windowLike.onYouTubeIframeAPIReady;
    let script = documentLike.querySelector('script[data-adipredictor-youtube-api]');
    let timeout;
    const fail = (reason) => {
      windowLike.clearTimeout(timeout);
      if (windowLike.onYouTubeIframeAPIReady === ready) windowLike.onYouTubeIframeAPIReady = previous;
      script?.remove?.();
      reject(new Error(reason));
    };
    const ready = () => {
      windowLike.clearTimeout(timeout);
      windowLike.onYouTubeIframeAPIReady = previous;
      try { previous?.(); } catch { /* another listener cannot block player initialization */ }
      if (!windowLike.YT?.Player) { fail('YOUTUBE_API_INVALID'); return; }
      resolve(windowLike.YT);
    };
    timeout = windowLike.setTimeout(() => fail('YOUTUBE_API_TIMEOUT'), 12_000);
    windowLike.onYouTubeIframeAPIReady = ready;
    if (script) { script.addEventListener?.('error', () => fail('YOUTUBE_API_BLOCKED'), { once: true }); return; }
    script = documentLike.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.adipredictorYoutubeApi = 'true';
    script.onerror = () => fail('YOUTUBE_API_BLOCKED');
    documentLike.head.appendChild(script);
  }).catch((error) => {
    apiPromise = undefined;
    throw error;
  });
  return apiPromise;
}
