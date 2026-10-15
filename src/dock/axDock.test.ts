import { describe, expect, it } from 'vitest'
import { parseBoundsReport } from './parse.ts'
import { dockOutcomeWithAx } from './axDock.ts'
import type { FindOutcome } from './types.ts'

const blind: FindOutcome = {
  bounds: null,
  reason: 'screen-recording',
  needsAccessibility: true,
}

describe('dockOutcomeWithAx', () => {
  it('docks from System Events bounds when the window list cannot see WeChat', () => {
    for (const report of ['0,111,915,693,微信\n', '0,111,915,693']) {
      const found = dockOutcomeWithAx(blind, parseBoundsReport(report), true)
      expect(found).toEqual({
        bounds: { x: 0, y: 111, width: 915, height: 693, title: '微信' },
        reason: 'ok',
      })
      expect(found?.reason).not.toBe('screen-recording')
    }
  })

  it('keeps a CoreGraphics hit and does not ask for both permissions when AppleScript misses', () => {
    const listed: FindOutcome = {
      bounds: { x: 12, y: 40, width: 800, height: 600, title: '微信' },
      reason: 'ok',
    }
    expect(dockOutcomeWithAx(listed, null)).toBe(listed)
    expect(dockOutcomeWithAx(blind, null)).toEqual({
      bounds: null,
      reason: 'permission',
      needsAccessibility: true,
    })
    expect(
      dockOutcomeWithAx({ bounds: null, reason: 'screen-recording', needsAccessibility: false }, null, true)?.reason,
    ).toBe('screen-recording')
    expect(
      dockOutcomeWithAx({ bounds: null, reason: 'screen-recording', needsAccessibility: false }, null, false)?.reason,
    ).toBe('permission')
  })
})
