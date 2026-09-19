import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_DRAW_SOURCES,
  PLAYER_MODES,
  SGP_COMPOSITE_SOURCE_LABEL,
  calculateLiveState,
  selectSingaporeMode,
} from '../src/liveDrawConfig.js';

test('Singapore sources use exact official labels and HTTPS fallbacks', () => {
  for (const key of ['SGP_4D', 'SGP_TOTO']) {
    const source = LIVE_DRAW_SOURCES[key];
    assert.equal(source.official, true);
    assert.equal(source.sourceLabel, 'Official · Singapore Pools');
    assert.match(source.pageUrl, /^https:\/\/www\.singaporepools\.com\.sg\//);
    assert.match(source.embedUrl, /^https:\/\/www\.youtube-nocookie\.com\/embed\/videoseries/);
    assert.equal(source.mode, PLAYER_MODES.IFRAME);
  }
});

test('HK feed is never labelled official Hong Kong lottery', () => {
  const source = LIVE_DRAW_SOURCES.HK;
  assert.equal(source.official, false);
  assert.equal(source.sourceLabel, 'HongkongPools Market Source');
  assert.doesNotMatch(source.sourceLabel, /official hong kong lottery/i);
  assert.equal(source.pageUrl, 'https://www.hongkongpools.com/live');
  assert.equal(source.mode, PLAYER_MODES.OFFICIAL_PAGE);
});

test('SGP composite market remains explicitly non-official', () => {
  assert.equal(SGP_COMPOSITE_SOURCE_LABEL, 'Third-party cross-checked market result');
  assert.doesNotMatch(SGP_COMPOSITE_SOURCE_LABEL, /^official/i);
});

test('unverified SDY source remains result-only', () => {
  assert.equal(LIVE_DRAW_SOURCES.SDY.official, false);
  assert.equal(LIVE_DRAW_SOURCES.SDY.mode, PLAYER_MODES.RESULT_ONLY);
});

test('schedule distinguishes upcoming live and posted states', () => {
  const schedule = LIVE_DRAW_SOURCES.SGP_4D.schedule;
  assert.equal(calculateLiveState(schedule, new Date('2026-09-19T10:00:00Z')).status, 'UPCOMING');
  assert.equal(calculateLiveState(schedule, new Date('2026-09-19T10:20:00Z')).status, 'LIVE_WINDOW');
  assert.equal(calculateLiveState(schedule, new Date('2026-09-19T12:00:00Z')).status, 'RESULT_POSTED');
});

test('Singapore mode chooses official draw for the active day', () => {
  assert.equal(selectSingaporeMode(new Date('2026-09-19T10:20:00Z')), 'SGP_4D');
  assert.equal(selectSingaporeMode(new Date('2026-09-17T10:20:00Z')), 'SGP_TOTO');
});
