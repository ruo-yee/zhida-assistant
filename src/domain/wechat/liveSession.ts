import type { WeChatMessage, WeChatSession } from './WeChatBridge.ts'
import { usableTitle } from './matchChat.ts'

export const PENDING_SESSION_ID = 'wechat-pending'
export const LIVE_PEER_FALLBACK = '当前微信会话'

const GROUP_MARK = /[(（]\s*\d{1,5}/

export interface LiveDatabaseChat {
  id: string
  peerName: string
  chatType: 'private' | 'group'
  messages: WeChatMessage[]
}

/**
 * The desktop reply path uses this session. A missing title still leaves the
 * demo conversation behind, so 张明 never becomes the model context.
 */
export function liveSession(input: {
  hasWindow: boolean
  title: string
  transcript: string[]
  composerText: string
  db: LiveDatabaseChat | null
}): WeChatSession | null {
  if (!input.hasWindow) return null
  const titled = usableTitle(input.title)
  const peerName = input.db?.peerName || titled || LIVE_PEER_FALLBACK
  const chatType = input.db?.chatType ?? (GROUP_MARK.test(input.title) ? 'group' : 'private')
  const composerText = input.composerText.trim()
  const fromDatabase = Boolean(input.db && input.db.messages.length > 0)
  return {
    id: input.db?.id ?? `wechat-live:${peerName}`,
    peerName,
    presence: 'online',
    chatType,
    composerText,
    messages: fromDatabase ? input.db!.messages : visibleMessages(input.transcript, composerText, peerName),
  }
}

export function describeLiveSession(session: WeChatSession, fromDatabase: boolean) {
  if (fromDatabase) return `正在跟随微信会话「${session.peerName}」。`
  if (session.messages.length > 0) return `已读到微信会话「${session.peerName}」的可见消息。`
  if (session.peerName !== LIVE_PEER_FALLBACK) {
    return `已看到微信会话「${session.peerName}」。回复只用这个窗口里的内容。`
  }
  return '已连上微信窗口。标题还没读到，回复不会用演示对话。'
}

export function focusForHost(tracked: WeChatSession | null, demo: WeChatSession, desktop: boolean): WeChatSession {
  if (tracked) return tracked
  if (!desktop) return demo
  return {
    id: PENDING_SESSION_ID,
    peerName: '当前微信',
    presence: 'offline',
    chatType: 'private',
    composerText: '',
    messages: [],
  }
}

function visibleMessages(transcript: string[], composerText: string, peerName: string): WeChatMessage[] {
  const seen = new Set<string>()
  const messages: WeChatMessage[] = []
  for (const line of transcript) {
    const text = line.replace(/\s+/g, ' ').trim()
    if (!text || text === composerText || text === peerName || seen.has(text)) continue
    seen.add(text)
    messages.push({ id: `visible-${messages.length}-${text.slice(0, 12)}`, role: 'customer', text })
  }
  return messages.slice(-12)
}
