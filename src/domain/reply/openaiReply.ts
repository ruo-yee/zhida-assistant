import { formatChatContext, type ChatTurn } from './chatContext.ts'
import type { ReplyInput } from './ReplyGenerator.ts'
import { parseReplyBatch } from './parseReplies.ts'
import { TONE_HINT } from './personas.ts'

export interface ModelConfig {
  mode: 'local' | 'openai'
  apiKey: string
  baseUrl: string
  model: string
}

export function chatTurnsForPrompt(input: Pick<ReplyInput, 'customerText' | 'turns'>): ChatTurn[] {
  if (input.turns && input.turns.length > 0) return input.turns
  const text = input.customerText.trim()
  return text ? [{ role: 'customer', text }] : []
}

/** Model messages. 上下文 is the current WeChat conversation; 知识摘录 is optional and is not 上下文. */
export function buildModelMessages(input: ReplyInput) {
  const grounded = input.grounding === 'grounded'
  const turns = chatTurnsForPrompt(input)
  const system = grounded
    ? '你是微信旁边的回复起草助手。上下文指当前微信会话里的最近消息，不是知识库。先读上下文，再按人设写出三条可直接发送的中文回复。知识摘录只作可选补充；摘录没有的数字、价格、时限和承诺不要写。三条之间用单独一行的 --- 分隔。不要标题，不要解释。'
    : '你是微信旁边的回复起草助手。上下文指当前微信会话里的最近消息，不是知识库。先读上下文，再按人设写出三条短回复，每条一两到三句，可直接发送。没有知识摘录时不要编造产品事实、价格、额度或政策。三条之间用单独一行的 --- 分隔。不要标题，不要解释。'
  const user = [
    `人设：${input.personaText}`,
    `语气：${TONE_HINT[input.persona]}`,
    `意图：${input.intent}`,
    '上下文（当前微信会话的最近消息，不是知识库）：',
    formatChatContext(turns),
    grounded ? '知识摘录（可选补充）：' : '知识摘录：没有。不要编造产品事实、价格、额度或政策。',
    ...(grounded
      ? input.hits.map(
          (hit, index) => `${index + 1}. ${hit.title} (${hit.version}) 相关度 ${hit.score.toFixed(2)}：${hit.excerpt}`,
        )
      : []),
  ].join('\n')
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]
}

export async function completeOpenAI(config: ModelConfig, input: ReplyInput): Promise<string[]> {
  const base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  const grounded = input.grounding === 'grounded'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        temperature: grounded ? 0.4 : 0.7,
        messages: buildModelMessages(input),
      }),
    })
    if (!response.ok) throw new Error(`model ${response.status}`)
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const text = payload.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) throw new Error('empty completion')
    const replies = parseReplyBatch(text)
    if (replies.length === 0) throw new Error('empty completion')
    return replies
  } finally {
    clearTimeout(timer)
  }
}
