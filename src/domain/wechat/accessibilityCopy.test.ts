import { describe, expect, it } from 'vitest'
import { NEED_AX } from './composerPolicy.ts'
import { accessibilityClientName, accessibilityDetail, needAccessibilityReason, STALE_ACCESS_COPY } from './accessibilityCopy.ts'

describe('accessibility copy', () => {
  it('names the packaged app and the dev Electron binary without the long menu path', () => {
    expect(accessibilityClientName(true)).toBe('智答助手')
    expect(accessibilityClientName(false)).toBe('Electron')
    expect(NEED_AX).toBe('需要辅助功能权限才能贴到微信')
    expect(needAccessibilityReason('智答助手')).toContain('「智答助手」')
    expect(NEED_AX).not.toContain('系统设置')
    expect(accessibilityDetail(true)).toBe(STALE_ACCESS_COPY)
    expect(accessibilityDetail(false)).toContain('Electron')
  })
})
