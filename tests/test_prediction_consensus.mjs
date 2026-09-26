import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeFourDConsensusTie, previousPublishedMain } from '../src/predictionConsensus.js';
import { readFileSync } from 'node:fs';

const rankings = [
  { number: '0094', supported_by: ['P1', 'P4'], raw_support_count: 2, reliability_weighted_score: 1.704213 },
  { number: '9094', supported_by: ['P1', 'P4'], raw_support_count: 2, reliability_weighted_score: 1.704213 },
  { number: '0971', supported_by: ['P3'], raw_support_count: 1, reliability_weighted_score: 1 },
];
const models = {
  P1: { '4d_top3': ['9094', '9064', '0094'] },
  P4: { '4d_top3': ['9094', '0094', '9004'] },
};

test('4D consensus audit exposes an exact score tie and source-model ranks', () => {
  assert.deepEqual(analyzeFourDConsensusTie({ rankings, models }), {
    score: 1.704213,
    supportCount: 2,
    selected: '0094',
    tieBreakRule: 'NUMBER_ASCENDING',
    modelRankAffectsScore: false,
    candidates: [
      { number: '0094', modelRanks: { P1: 3, P4: 2 } },
      { number: '9094', modelRanks: { P1: 1, P4: 1 } },
    ],
  });
});

test('4D consensus audit returns null when the leader is not tied', () => {
  const unique = rankings.map((candidate, index) => ({ ...candidate, reliability_weighted_score: 2 - index }));
  assert.equal(analyzeFourDConsensusTie({ rankings: unique, models }), null);
});

test('published HK archive keeps the actual 25 September Main and 26 September tie', () => {
  const latest = JSON.parse(readFileSync(new URL('../public/predictions/hk/latest.json', import.meta.url)));
  const history = JSON.parse(readFileSync(new URL('../public/predictions/hk/history.json', import.meta.url)));
  assert.deepEqual(previousPublishedMain(history, '2026-09-26'), { targetDate: '2026-09-25', number: '9064' });
  const tie = analyzeFourDConsensusTie({ rankings: latest.weighted_consensus.candidate_rankings['4d_top3'], models: latest.models });
  assert.equal(tie.selected, '0094');
  assert.deepEqual(tie.candidates.map((item) => item.number), ['0094', '9094']);
  assert.equal(tie.score, 1.706275);
});
