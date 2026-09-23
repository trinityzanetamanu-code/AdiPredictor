import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeFourDConsensusTie } from '../src/predictionConsensus.js';

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
