import { describe, expect, it } from 'vitest'
import { scoreBand, scoreBandToken } from './scoreBand.ts'

describe('scoreBand', () => {
  it('uses deep green at and above 0.9', () => {
    expect(scoreBand(0.9)).toBe('high')
    expect(scoreBand(0.92)).toBe('high')
    expect(scoreBandToken(0.92)).toBe('--score-high')
  })

  it('uses light green from 0.7 up to but not including 0.9', () => {
    expect(scoreBand(0.7)).toBe('mid')
    expect(scoreBand(0.87)).toBe('mid')
    expect(scoreBand(0.899)).toBe('mid')
    expect(scoreBandToken(0.87)).toBe('--score-mid')
  })

  it('keeps weaker and invalid scores neutral', () => {
    expect(scoreBand(0.64)).toBe('low')
    expect(scoreBand(0.699)).toBe('low')
    expect(scoreBand(Number.NaN)).toBe('low')
    expect(scoreBandToken(0.2)).toBe('--score-low')
  })
})
