export function createLatestRefreshCoordinator() {
  let latestStarted = 0;

  return Object.freeze({
    begin() {
      latestStarted += 1;
      return latestStarted;
    },
    isLatest(requestId) {
      return requestId === latestStarted;
    },
    applyIfLatest(requestId, apply) {
      if (requestId !== latestStarted) return false;
      apply();
      return true;
    },
  });
}
