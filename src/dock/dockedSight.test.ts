import { describe, expect, it, beforeEach } from 'vitest'
import { liveSession } from '../domain/wechat/liveSession.ts'
import { adoptDockedWindow, dockedWeChat, noteWeChatSight, resetWeChatSight } from './dockedSight.ts'

const frame = { x: 0, y: 111, width: 915, height: 693, title: '迈腾7连-3班 (322)' }

describe('docked sight', () => {
  beforeEach(() => resetWeChatSight())

  it('treats a docked visible window as the main window and keeps the group name', () => {
    noteWeChatSight({ bounds: frame, reason: 'ok' }, 1_000)
    expect(dockedWeChat(2_000)?.title).toBe('迈腾7连-3班 (322)')
    const view = adoptDockedWindow(
      { hasWindow: false, title: '', reason: 'no-window', transcript: [] as string[] },
      dockedWeChat(2_000)?.title ?? null,
    )
    expect(view.hasWindow).toBe(true)
    expect(view.reason).toBe('')
    expect(view.title).toBe('迈腾7连-3班 (322)')
    const session = liveSession({
      hasWindow: view.hasWindow,
      title: view.title,
      transcript: ['宋哥，感觉我能给多少钱'],
      composerText: '',
      db: null,
    })
    expect(session?.peerName).toBe('迈腾7连-3班')
    expect(session?.chatType).toBe('group')
  })

  it('does not keep a minimized or quit WeChat window', () => {
    noteWeChatSight({ bounds: frame, reason: 'ok' }, 1_000)
    noteWeChatSight({ bounds: null, reason: 'hidden' }, 1_100)
    expect(dockedWeChat(1_200)).toBeNull()
    expect(adoptDockedWindow({ hasWindow: false, title: '', reason: 'no-window' }, null).hasWindow).toBe(false)
    noteWeChatSight({ bounds: frame, reason: 'ok' }, 0)
    expect(dockedWeChat(5_001)).toBeNull()
  })

  it('does not let an app-name Accessibility title replace the docked group', () => {
    const view = adoptDockedWindow(
      { hasWindow: false, title: '微信', reason: 'no-window' },
      '迈腾7连-3班 (322)',
    )
    expect(view.title).toBe('迈腾7连-3班 (322)')
    expect(view.reason).toBe('')
  })
})