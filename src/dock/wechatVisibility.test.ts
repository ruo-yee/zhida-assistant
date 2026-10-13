import { describe, expect, it } from 'vitest'
import { resolveWeChatVisibility } from './wechatVisibility.ts'
import type { FindOutcome } from './types.ts'

const blind: FindOutcome = { bounds: null, reason: 'screen-recording', needsAccessibility: false }
const frame = { x: 0, y: 111, width: 915, height: 693, title: '微信' }

describe('resolveWeChatVisibility', () => {
  it('docks a visible System Events frame when CoreGraphics is empty', () => {
    expect(
      resolveWeChatVisibility({
        fromList: blind,
        presence: { presence: 'visible', bounds: frame },
        hostTrusted: true,
        fallback: { bounds: null, reason: 'error' },
      }),
    ).toEqual({ bounds: frame, reason: 'ok' })
  })

  it('does not let a minimized window frame override an on-screen miss', () => {
    expect(
      resolveWeChatVisibility({
        fromList: { bounds: null, reason: 'hidden' },
        presence: { presence: 'visible', bounds: frame },
        hostTrusted: true,
        fallback: { bounds: null, reason: 'not-running' },
      }),
    ).toEqual({ bounds: null, reason: 'hidden' })
  })

  it('hides when WeChat is minimized or concealed, instead of docking a stale frame', () => {
    expect(
      resolveWeChatVisibility({
        fromList: blind,
        presence: { presence: 'hidden', bounds: null },
        hostTrusted: true,
        fallback: { bounds: null, reason: 'screen-recording' },
      }),
    ).toEqual({ bounds: null, reason: 'hidden' })
    expect(
      resolveWeChatVisibility({
        fromList: { bounds: null, reason: 'hidden' },
        presence: { presence: 'hidden', bounds: null },
        hostTrusted: true,
        fallback: { bounds: null, reason: 'not-running' },
      }).reason,
    ).toBe('hidden')
  })

  it('keeps an on-screen CoreGraphics window', () => {
    const listed: FindOutcome = { bounds: frame, reason: 'ok' }
    expect(
      resolveWeChatVisibility({
        fromList: listed,
        presence: { presence: 'hidden', bounds: null },
        hostTrusted: true,
        fallback: { bounds: null, reason: 'error' },
      }),
    ).toBe(listed)
  })
})
