import { describe, expect, it } from 'vitest'
import { NEED_AX } from './composerPolicy.ts'
import {
  accessibilityClientName,
  accessibilityDetail,
  accessibilityGrantGuide,
  needAccessibilityReason,
  redockAfterGrant,
  STALE_ACCESS_COPY,
} from './accessibilityCopy.ts'

describe('accessibility copy', () => {
  it('names the packaged app and the dev Electron binary without the long menu path', () => {
    expect(accessibilityClientName(true)).toBe('智答助手')
    expect(accessibilityClientName(false)).toBe('Electron')
    expect(NEED_AX).toBe('需要辅助功能权限才能贴到微信')
    expect(needAccessibilityReason('智答助手')).toContain('「智答助手」')
    expect(NEED_AX).not.toContain('系统设置')
    expect(accessibilityDetail(true)).toContain(STALE_ACCESS_COPY)
    expect(accessibilityDetail(false)).toContain('Electron')
  })

  it('says macOS cannot grant Accessibility, and tells the user to drag the app in', () => {
    const guide = accessibilityGrantGuide('智答助手')
    expect(guide.title).toBe('macOS 不能自动授权')
    expect(guide.hint).toContain('拖进辅助功能列表')
    expect(guide.hint).toContain('打开开关')
    expect(guide.hint).toContain('自动贴回')
    expect(guide.hint).not.toContain('自动授权')
  })

  it('redocks only when Accessibility flips from denied to granted', () => {
    expect(redockAfterGrant(false, true)).toBe(true)
    expect(redockAfterGrant(true, true)).toBe(false)
    expect(redockAfterGrant(false, false)).toBe(false)
    expect(redockAfterGrant(true, false)).toBe(false)
  })
})
