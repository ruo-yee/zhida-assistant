import { describe, expect, it } from 'vitest'
import { isAssistivePermissionError, parseBoundsLine, parseBoundsReport } from './parse.ts'
import { describeDock } from './status.ts'

describe('parseBoundsReport', () => {
  it('parses a host window line and keeps a title that contains commas', () => {
    expect(parseBoundsLine('12,34,800,600,张明, 私聊')).toEqual({
      x: 12,
      y: 34,
      width: 800,
      height: 600,
      title: '张明, 私聊',
    })
  })

  it('picks the largest window from a multi-line report', () => {
    const report = ['10,10,300,300,small', '20,30,900,700,微信', ''].join('\n')
    expect(parseBoundsReport(report)?.title).toBe('微信')
    expect(parseBoundsReport('')).toBeNull()
    expect(parseBoundsReport('not-a-window')).toBeNull()
  })

  it('recognizes an assistive-access failure', () => {
    expect(isAssistivePermissionError('osascript: not authorized to send Apple events (-1743)')).toBe(true)
    expect(isAssistivePermissionError('System Events got an error: 不允许辅助功能')).toBe(true)
    expect(isAssistivePermissionError('')).toBe(false)
  })
})

describe('describeDock', () => {
  it('describes a right-side dock and the floating fallbacks', () => {
    expect(describeDock({ platform: 'darwin', reason: 'ok', side: 'right' }).detail).toBe('已贴在微信右侧')
    expect(describeDock({ platform: 'darwin', reason: 'ok', side: 'left' }).mode).toBe('docked')
    expect(describeDock({ platform: 'win32', reason: 'not-running' }).mode).toBe('floating')
    expect(describeDock({ platform: 'linux', reason: 'unsupported-platform' }).detail).toContain('悬浮窗')
    expect(describeDock({ platform: 'darwin', reason: 'permission' }).detail).toContain('辅助功能')
  })
})
