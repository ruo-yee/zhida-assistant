import type { ScoreBand } from '../types.ts'

/** ≥0.9 deep green, 0.7 inclusive up to 0.9 light green, otherwise neutral. */
export function scoreBand(score: number): ScoreBand {
  if (!Number.isFinite(score) || score < 0.7) return 'low'
  if (score >= 0.9) return 'high'
  return 'mid'
}

export function scoreBandToken(score: number): '--score-high' | '--score-mid' | '--score-low' {
  const band = scoreBand(score)
  if (band === 'high') return '--score-high'
  if (band === 'mid') return '--score-mid'
  return '--score-low'
}
