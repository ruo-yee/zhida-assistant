import { describe, expect, it } from 'vitest'
import { describeLiveSession, focusForHost, liveSession, PENDING_SESSION_ID } from './liveSession.ts'
import type { WeChatSession } from './WeChatBridge.ts'

const demo: WeChatSession = {
  id: 'seed-session',
  peerName: '张明',
  presence: 'online',
  chatType: 'private',
  composerText: '',
  messages: [{ id: 'm1', role: 'customer', text: '演示问题' }],
}

describe('liveSession', () => {
  it('keeps the desktop path off the demo chat until a real window exists', () => {
    expect(focusForHost(null, demo, true).id).toBe(PENDING_SESSION_ID)
    expect(focusForHost(null, demo, true).messages).toEqual([])
    expect(focusForHost(null, demo, false).peerName).toBe('张明')
  })

  it('uses the window title and visible lines when the local database has no match', () => {
    const session = liveSession({
      hasWindow: true,
      title: '李华',
      transcript: ['在吗', '明天下午把报价发我', '在吗'],
      composerText: '',
      db: null,
    })
    expect(session?.peerName).toBe('李华')
    expect(session?.id.startsWith('wechat-live:')).toBe(true)
    expect(session?.messages.map((message) => message.text)).toEqual(['在吗', '明天下午把报价发我'])
    expect(describeLiveSession(session!, false)).toContain('可见消息')
  })

  it('prefers database history, including who spoke, over the visible lines', () => {
    const session = liveSession({
      hasWindow: true,
      title: '项目群 (6)',
      transcript: ['窗口里的一行'],
      composerText: '草稿',
      db: {
        id: 'wechat:9',
        peerName: '项目群',
        chatType: 'group',
        messages: [
          { id: 'a', role: 'customer', text: '谁来跟进' },
          { id: 'b', role: 'agent', text: '我来' },
        ],
      },
    })
    expect(session?.chatType).toBe('group')
    expect(session?.messages.map((message) => message.role)).toEqual(['customer', 'agent'])
    expect(describeLiveSession(session!, true)).toContain('正在跟随')
  })

  it('returns nothing when the window itself is missing', () => {
    expect(liveSession({ hasWindow: false, title: '李华', transcript: ['你好'], composerText: '', db: null })).toBeNull()
  })
})
