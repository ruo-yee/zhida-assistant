import { describe, expect, it } from 'vitest'
import { dockWhenWindowLookupFails, parseWeChatLiveness, reconcileAxView, wechatLivenessScript } from './hostTrust.ts'

const blank = {
  trusted: false,
  running: false,
  hasWindow: false,
  windowId: '',
  title: '',
  hasTextArea: false,
  composer: null,
  reason: '辅助功能调用失败',
}

describe('reconcileAxView', () => {
  it('keeps WeChat running when AX failed but NSWorkspace sees the process', () => {
    const view = reconcileAxView(blank, true, true)
    expect(view.trusted).toBe(true)
    expect(view.running).toBe(true)
    expect(view.reason).toBe('辅助功能调用失败')
  })

  it('does not treat an osascript trust failure as the app being untrusted', () => {
    const view = reconcileAxView({ ...blank, reason: 'need-ax', running: true }, true, true)
    expect(view.trusted).toBe(true)
    expect(view.running).toBe(true)
    expect(view.reason).not.toBe('need-ax')
  })

  it('still asks for Accessibility when the Electron app itself is untrusted', () => {
    const view = reconcileAxView({ ...blank, running: true }, false, true)
    expect(view.trusted).toBe(false)
    expect(view.running).toBe(true)
    expect(view.reason).toBe('need-ax')
  })

  it('says WeChat is not running only when the process is absent', () => {
    const view = reconcileAxView(blank, true, false)
    expect(view.running).toBe(false)
    expect(view.reason).toBe('not-running')
  })
})

describe('dockWhenWindowLookupFails', () => {
  it('does not turn an osascript permission error into an app Accessibility failure', () => {
    expect(dockWhenWindowLookupFails({ hostTrusted: true, wechatRunning: true, commandMissing: false })).toEqual({
      bounds: null,
      reason: 'screen-recording',
      needsAccessibility: false,
    })
  })

  it('asks for Accessibility only when the app is untrusted, and not-running only when WeChat is gone', () => {
    expect(dockWhenWindowLookupFails({ hostTrusted: false, wechatRunning: true, commandMissing: false }).reason).toBe(
      'permission',
    )
    expect(dockWhenWindowLookupFails({ hostTrusted: true, wechatRunning: false, commandMissing: false }).reason).toBe(
      'not-running',
    )
    expect(dockWhenWindowLookupFails({ hostTrusted: false, wechatRunning: false, commandMissing: true }).reason).toBe(
      'error',
    )
  })
})

describe('wechat liveness script', () => {
  it('uses NSWorkspace bundle ids and does not call Accessibility', () => {
    const script = wechatLivenessScript()
    expect(script).toContain('com.tencent.xinWeChat')
    expect(script).toContain('NSWorkspace')
    expect(script).not.toContain('AXIsProcessTrusted')
    expect(parseWeChatLiveness('{"running":true,"pids":[42]}')).toEqual({ running: true, pids: [42] })
    expect(parseWeChatLiveness('')).toBeNull()
  })
})
