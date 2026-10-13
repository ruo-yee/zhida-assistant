export interface ChatTurn {
  role: 'customer' | 'agent'
  text: string
}

/** How many recent WeChat messages are sent as 上下文. Knowledge hits are separate. */
export const CHAT_CONTEXT_LIMIT = 12
const TURN_CHAR_LIMIT = 500

export function recentChatTurns(
  messages: Array<{ role: 'customer' | 'agent'; text: string }>,
  limit = CHAT_CONTEXT_LIMIT,
): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const message of messages) {
    const text = message.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    turns.push({
      role: message.role,
      text: text.length > TURN_CHAR_LIMIT ? `${text.slice(0, TURN_CHAR_LIMIT)}…` : text,
    })
  }
  return turns.slice(-limit)
}

export function formatChatContext(turns: ChatTurn[]) {
  if (turns.length === 0) return '（当前会话还没有消息）'
  return turns.map((turn) => `${turn.role === 'customer' ? '对方' : '我'}：${turn.text}`).join('\n')
}
