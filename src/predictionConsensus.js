function candidateNumber(candidate) {
  return typeof candidate === 'string' ? candidate : candidate?.number;
}

export function analyzeFourDConsensusTie({ rankings = [], models = {} } = {}) {
  const leader = rankings[0];
  if (!leader || typeof leader === 'string') return null;

  const score = Number(leader.reliability_weighted_score);
  const supportCount = Number(leader.raw_support_count ?? leader.supported_by?.length ?? 0);
  if (!Number.isFinite(score)) return null;

  const tied = rankings.filter((candidate) => (
    candidate
    && typeof candidate !== 'string'
    && Number(candidate.reliability_weighted_score) === score
    && Number(candidate.raw_support_count ?? candidate.supported_by?.length ?? 0) === supportCount
  ));
  if (tied.length < 2) return null;

  const candidates = tied.map((candidate) => {
    const number = candidateNumber(candidate);
    const modelRanks = Object.fromEntries((candidate.supported_by || []).map((modelName) => {
      const position = models?.[modelName]?.['4d_top3']?.indexOf(number) ?? -1;
      return [modelName, position >= 0 ? position + 1 : null];
    }));
    return { number, modelRanks };
  });

  return {
    score,
    supportCount,
    candidates,
    selected: candidateNumber(leader),
    tieBreakRule: 'NUMBER_ASCENDING',
    modelRankAffectsScore: false,
  };
}
