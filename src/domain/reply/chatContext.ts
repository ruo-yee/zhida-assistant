export interface ChatTurn {
  role: 'customer' | 'agent'
  text: string
}

/** A reply the user inserted or sent, kept until the loaded history already contains it. */
export interface PendingOutbound {
  sessionId: string
  /** Last message id at insert/send time. Empty when that chat had no loaded messages yet. */
  anchorId: string
  text: string
}

/** How many recent WeChat messages are sent as 上下文. Knowledge hits are separate. */
export const CHAT_CONTEXT_LIMIT = 12
const TURN_CHAR_LIMIT = 500

function clipTurn(text: string) {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''
  return trimmed.length > TURN_CHAR_LIMIT ? `${trimmed.slice(0, TURN_CHAR_LIMIT)}…` : trimmed
}

export function recentChatTurns(
  messages: Array<{ role: 'customer' | 'agent'; text: string }>,
  limit = CHAT_CONTEXT_LIMIT,
): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const message of messages) {
    const text = clipTurn(message.text)
    if (!text) continue
    turns.push({ role: message.role, text })
  }
  return turns.slice(-limit)
}

/**
 * Remember one outbound line for the next generation.
 * A later insert or send on the same anchor replaces the previous draft.
 */
export function rememberOutbound(pending: PendingOutbound[], next: PendingOutbound): PendingOutbound[] {
  const text = clipTurn(next.text)
  if (!text || !next.sessionId) return pending
  const kept = pending.filter((item) => item.sessionId !== next.sessionId || item.anchorId !== next.anchorId)
  const bySession = new Map<string, PendingOutbound[]>()
  for (const item of [...kept, { sessionId: next.sessionId, anchorId: next.anchorId, text }]) {
    const list = bySession.get(item.sessionId) ?? []
    list.push(item)
    bySession.set(item.sessionId, list.slice(-CHAT_CONTEXT_LIMIT))
  }
  return [...bySession.values()].flat()
}

function alreadySpoken(messages: Array<{ role: 'customer' | 'agent'; text: string }>, text: string) {
  return messages.some((message) => message.role === 'agent' && clipTurn(message.text) === text)
}

/**
 * Place each pending reply after the message that was current when the user sent it.
 * Drop a pending line once a later agent message already has the same text.
 */
export function turnsWithOutbound(
  sessionId: string,
  messages: Array<{ id?: string; role: 'customer' | 'agent'; text: string }>,
  pending: PendingOutbound[],
  limit = CHAT_CONTEXT_LIMIT,
): { turns: ChatTurn[]; pending: PendingOutbound[] } {
  const spliced = messages.map((message) => ({ ...message }))
  const others = pending.filter((item) => item.sessionId !== sessionId)
  const still: PendingOutbound[] = []
  for (const item of pending) {
    if (item.sessionId !== sessionId) continue
    const text = clipTurn(item.text)
    if (!text) continue
    if (!item.anchorId) {
      if (alreadySpoken(spliced, text)) continue
      spliced.unshift({ id: 'outbound', role: 'agent', text })
      still.push({ ...item, text })
      continue
    }
    const anchorIndex = spliced.findIndex((message) => message.id === item.anchorId)
    if (anchorIndex < 0) continue
    if (alreadySpoken(spliced.slice(anchorIndex + 1), text)) continue
    spliced.splice(anchorIndex + 1, 0, { id: `outbound:${item.anchorId}`, role: 'agent', text })
    still.push({ ...item, text })
  }
  return { turns: recentChatTurns(spliced, limit), pending: [...others, ...still] }
}

export function formatChatContext(turns: ChatTurn[]) {
  if (turns.length === 0) return '（当前会话还没有消息）'
  return turns.map((turn) => `${turn.role === 'customer' ? '对方' : '我'}：${turn.text}`).join('\n')
}
