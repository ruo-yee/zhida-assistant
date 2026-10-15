import { describe, expect, it } from 'vitest'
import { applyHideMemory, resolveWeChatVisibility } from './wechatVisibility.ts'
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

  it('hides after Cmd+H once WeChat has been seen unhidden, even if a frame remains', () => {
    const docked: FindOutcome = { bounds: frame, reason: 'ok' }
    const first = applyHideMemory({ seenUnhidden: false }, false, docked)
    expect(first.outcome).toEqual(docked)
    expect(first.memory.seenUnhidden).toBe(true)
    const hidden = applyHideMemory(first.memory, true, docked)
    expect(hidden.outcome).toEqual({ bounds: null, reason: 'hidden' })
  })

  it('does not undock when isHidden is stuck true before a visible spell', () => {
    const docked: FindOutcome = { bounds: frame, reason: 'ok' }
    const stuck = applyHideMemory({ seenUnhidden: false }, true, docked)
    expect(stuck.outcome).toEqual(docked)
    expect(stuck.memory.seenUnhidden).toBe(false)
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
