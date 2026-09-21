import { PLAYER_STATES } from './liveDrawConfig.js';

let apiPromise;

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
    const timeout = windowLike.setTimeout(() => reject(new Error('YOUTUBE_API_TIMEOUT')), 12_000);
    windowLike.onYouTubeIframeAPIReady = () => {
      windowLike.clearTimeout(timeout);
      previous?.();
      resolve(windowLike.YT);
    };
    const existing = documentLike.querySelector('script[data-adipredictor-youtube-api]');
    if (existing) return;
    const script = documentLike.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.adipredictorYoutubeApi = 'true';
    script.onerror = () => {
      windowLike.clearTimeout(timeout);
      reject(new Error('YOUTUBE_API_BLOCKED'));
    };
    documentLike.head.appendChild(script);
  }).catch((error) => {
    apiPromise = undefined;
    throw error;
  });
  return apiPromise;
}
