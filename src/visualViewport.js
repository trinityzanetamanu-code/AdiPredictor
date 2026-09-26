export const DEFAULT_VIEWPORT = Object.freeze({ scale: 1, x: 0, y: 0 });

export function clampScale(value) {
  return Math.min(4, Math.max(1, Number(value) || 1));
}

export function resetViewport() {
  return { ...DEFAULT_VIEWPORT };
}

export function zoomViewport(viewport, factor, origin = { x: 0, y: 0 }) {
  const previous = clampScale(viewport?.scale);
  const scale = clampScale(previous * factor);
  if (scale === 1) return resetViewport();
  const ratio = scale / previous;
  return {
    scale,
    x: origin.x - (origin.x - (viewport?.x || 0)) * ratio,
    y: origin.y - (origin.y - (viewport?.y || 0)) * ratio,
  };
}

export function panViewport(viewport, dx, dy) {
  if (clampScale(viewport?.scale) === 1) return resetViewport();
  return { ...viewport, x: (viewport.x || 0) + dx, y: (viewport.y || 0) + dy };
}

export function pinchViewport(viewport, previousPoints, nextPoints) {
  if (previousPoints.length !== 2 || nextPoints.length !== 2) return viewport;
  const distance = (points) => Math.hypot(
    points[1].x - points[0].x,
    points[1].y - points[0].y,
  );
  const before = distance(previousPoints);
  const after = distance(nextPoints);
  if (!before || !after) return viewport;
  const midpoint = {
    x: (nextPoints[0].x + nextPoints[1].x) / 2,
    y: (nextPoints[0].y + nextPoints[1].y) / 2,
  };
  return zoomViewport(viewport, after / before, midpoint);
}

/** Keep the draw cell below the user's fingers stationary while scaling a
 * scrollable, transform-scaled board. The anchor is local to the viewport. */
export function scaledScrollOffset(scroll, previousScale, nextScale, anchor) {
  const ratio = clampScale(nextScale) / clampScale(previousScale);
  return {
    left: Math.max(0, (scroll.left + anchor.x) * ratio - anchor.x),
    top: Math.max(0, (scroll.top + anchor.y) * ratio - anchor.y),
  };
}
